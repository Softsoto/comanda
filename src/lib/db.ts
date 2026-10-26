import "server-only";

import fs from "node:fs";
import path from "node:path";
import { parseDatabaseUrl } from "./database-url";
import { findLockOwner, holdLock } from "./lock";
import { SCHEMA_SQL } from "./schema";

/**
 * Capa de base de datos.
 *
 * - Sin DATABASE_URL: usa PGlite, un PostgreSQL que corre dentro de la propia
 *   app y guarda los datos en la carpeta ./data. No hay que instalar nada.
 * - Con DATABASE_URL: se conecta a un PostgreSQL real (Supabase, Neon, etc.).
 *
 * El resto de la app solo usa `query`, `queryOne` y `transaction`, así que el
 * mismo SQL funciona en los dos modos.
 */

export type Row = Record<string, unknown>;
export type QueryFn = <T = Row>(text: string, params?: unknown[]) => Promise<T[]>;

interface Driver {
  kind: "pglite" | "postgres";
  query: QueryFn;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (query: QueryFn) => Promise<T>): Promise<T>;
}

export const isLocalDatabase = () => !process.env.DATABASE_URL;

// Se guarda en globalThis para que el modo desarrollo (que recarga módulos)
// no abra la base de datos dos veces.
const globalStore = globalThis as unknown as { __comandaDb?: Promise<Driver>; __comandaDriver?: Driver };

function getDriver(): Promise<Driver> {
  if (!globalStore.__comandaDb) {
    globalStore.__comandaDb = init().catch((error) => {
      globalStore.__comandaDb = undefined; // permite reintentar en la siguiente petición
      throw error;
    });
  }
  return globalStore.__comandaDb;
}

async function init(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  // La conexión se crea una sola vez; si un paso posterior falla y se
  // reintenta, se reutiliza en lugar de abrir la base por segunda vez.
  globalStore.__comandaDriver ??= url ? await createPostgresDriver(url) : await createPgliteDriver();
  const driver = globalStore.__comandaDriver;
  await migrate(driver);

  // Carpeta de la base local; con una base en la nube no hay.
  const dataDir = driver.kind === "pglite" ? localDataDir() : null;
  const { newDemoPassword, secureDemoAccount, writeDemoPasswordFile } = await import("./demo-account");

  const seedSetting = process.env.SEED_DEMO;
  const shouldSeed = seedSetting ? seedSetting === "1" : driver.kind === "pglite";
  if (shouldSeed) {
    const { seedDemo } = await import("./seed");
    // Con la base local, la cuenta de ejemplo recibe una contraseña propia de esta
    // instalación. En la nube se crea sin contraseña: el menú se ve, pero nadie entra.
    const demoPassword = dataDir ? newDemoPassword() : null;
    const created = await seedDemo(driver.query, driver.transaction, {
      demoPassword,
      // Sin SEED_DEMO (lo normal en el computador) solo se crea en una base vacía.
      onlyIfEmpty: !seedSetting,
    });
    if (created && demoPassword && dataDir) writeDemoPasswordFile(dataDir, demoPassword);
  }

  // Una cuenta de ejemplo que venga con la contraseña de versiones anteriores
  // (la misma en todas las instalaciones) no se deja así ni un arranque.
  const check = await secureDemoAccount(driver.query, dataDir);
  if (check === "renovada") {
    console.warn("[seguridad] La cuenta de ejemplo tenía la contraseña conocida de versiones anteriores. Se le puso una nueva: está en el archivo cuenta-de-ejemplo.txt de la carpeta de datos.");
  } else if (check === "desactivada") {
    console.warn("[seguridad] La cuenta de ejemplo tenía la contraseña conocida de versiones anteriores y quedó sin contraseña. Ponle una desde la administración si la necesitas.");
  }
  return driver;
}

/** Carpeta donde vive la base local (y sus archivos de apoyo). */
export function localDataDir(): string {
  return process.env.DATA_DIR
    ? path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR)
    : path.join(/* turbopackIgnore: true */ process.cwd(), "data");
}

async function migrate(driver: Driver) {
  try {
    await driver.exec(SCHEMA_SQL);
  } catch (error) {
    // Dos arranques simultáneos pueden chocar creando la misma tabla; el
    // segundo intento encuentra todo creado y pasa sin tocar nada.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await driver.exec(SCHEMA_SQL).catch(() => {
      throw error;
    });
  }
}

/* ---------- PGlite (local) ---------- */

async function createPgliteDriver(): Promise<Driver> {
  if (process.env.VERCEL) {
    throw new Error(
      "Falta la variable DATABASE_URL. En la nube la app necesita una base de datos PostgreSQL (mira el README).",
    );
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const baseDir = localDataDir();
  fs.mkdirSync(baseDir, { recursive: true });
  lockDataDir(baseDir);
  const db = new PGlite(path.join(baseDir, "pgdata"));
  await db.waitReady;

  return {
    kind: "pglite",
    query: async <T>(text: string, params?: unknown[]) =>
      (await db.query<T>(text, params as unknown[] | undefined)).rows,
    exec: async (sql) => {
      await db.exec(sql);
    },
    transaction: (fn) =>
      db.transaction((tx) =>
        fn(async <T>(text: string, params?: unknown[]) => (await tx.query<T>(text, params)).rows),
      ),
  };
}

/**
 * La base local solo admite un programa a la vez. Si se abrieran dos ventanas
 * de la app sobre la misma carpeta, los datos podrían dañarse; por eso se
 * deja una marca (ver lock.ts) y se rechaza un segundo arranque.
 */
function lockDataDir(baseDir: string) {
  const lockFile = path.join(baseDir, "comanda.lock");
  const owner = findLockOwner(lockFile);
  if (owner) {
    throw new Error(
      `La base de datos local ya está en uso por otra ventana de la app (proceso ${owner}). ` +
        "Cierra esa ventana y vuelve a intentar. Si no hay ninguna abierta, espera medio minuto o borra el archivo data/comanda.lock.",
    );
  }
  holdLock(lockFile);
}

/* ---------- PostgreSQL (nube) ---------- */

async function createPostgresDriver(rawUrl: string): Promise<Driver> {
  const { default: pg } = await import("pg");
  const { connectionString, ssl } = parseDatabaseUrl(rawUrl);
  const pool = new pg.Pool({
    connectionString,
    ssl,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });
  // Un fallo en una conexión en reposo no debe tumbar el servidor.
  pool.on("error", (error) => console.error("[db] conexión en reposo falló:", error.message));

  const run = async <T>(text: string, params?: unknown[]) =>
    (await pool.query(text, params as unknown[] | undefined)).rows as T[];

  return {
    kind: "postgres",
    query: async <T>(text: string, params?: unknown[]) => {
      try {
        return await run<T>(text, params);
      } catch (error) {
        // En servidores que "duermen" entre visitas, la primera consulta puede
        // encontrar una conexión ya cerrada. Las lecturas se reintentan una vez.
        const dropped = /Connection terminated|ECONNRESET|EPIPE|connection.*closed/i.test(String(error));
        if (dropped && /^\s*select\b/i.test(text)) return run<T>(text, params);
        throw error;
      }
    },
    exec: async (sql) => {
      await pool.query(sql);
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn(
          async <T>(text: string, params?: unknown[]) =>
            (await client.query(text, params as unknown[] | undefined)).rows as T[],
        );
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

/* ---------- API pública ---------- */

/** Ejecuta una consulta con parámetros ($1, $2…) y devuelve las filas. */
export async function query<T = Row>(text: string, params?: unknown[]): Promise<T[]> {
  const driver = await getDriver();
  return driver.query<T>(text, params);
}

/** Igual que `query`, pero devuelve solo la primera fila (o null). */
export async function queryOne<T = Row>(text: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Ejecuta varias consultas como una sola operación: o se guardan todas o ninguna. */
export async function transaction<T>(fn: (query: QueryFn) => Promise<T>): Promise<T> {
  const driver = await getDriver();
  return driver.transaction(fn);
}

/**
 * Vuelve a aplicar la estructura de la base. Se usa después de restaurar una
 * copia de seguridad antigua, para completar lo que esa versión no tenía.
 */
export async function applySchema(): Promise<void> {
  const driver = await getDriver();
  await driver.exec(SCHEMA_SQL);
}
