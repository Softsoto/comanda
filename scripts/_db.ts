/**
 * Abre la base de datos para los comandos de consola (copia y restauración),
 * igual que lo hace la app: PostgreSQL si hay DATABASE_URL, o la base local
 * de la carpeta "data" si no.
 */
import fs from "node:fs";
import path from "node:path";
import type { BackupQuery } from "../src/lib/backup";
import { parseDatabaseUrl } from "../src/lib/database-url";
import { findLockOwner } from "../src/lib/lock";
import { SCHEMA_SQL } from "../src/lib/schema";

// Lee las mismas variables que usa la app (.env.local y .env), si existen.
for (const file of [".env.local", ".env"]) {
  try {
    if (fs.existsSync(file)) process.loadEnvFile(file);
  } catch {
    // Versiones antiguas de Node no traen loadEnvFile: se usa el entorno tal cual.
  }
}

export function fail(message: string): never {
  console.error(`\n  ERROR: ${message}\n`);
  process.exit(1);
}

export type ScriptDb = {
  /** "la base local (carpeta data)" o "la base de datos de DATABASE_URL". */
  label: string;
  /** Carpeta de la base local, o null con DATABASE_URL. */
  dataDir: string | null;
  query: BackupQuery;
  transaction<T>(fn: (query: BackupQuery) => Promise<T>): Promise<T>;
  /** Vuelve a aplicar la estructura (completa lo que una copia antigua no traía). */
  applySchema(): Promise<void>;
  close(): Promise<void>;
};

/**
 * Lee la base dentro de una sola transacción que ve todas las tablas como
 * estaban en el mismo instante, aunque la app siga recibiendo pedidos mientras
 * tanto. Así una copia nunca queda con un pedido a medias.
 */
export function readSnapshot<T>(db: ScriptDb, fn: (query: BackupQuery) => Promise<T>): Promise<T> {
  return db.transaction(async (query) => {
    await query("set transaction isolation level repeatable read");
    return fn(query);
  });
}

/** Abre la base y se asegura de que tenga la estructura de esta versión. */
export async function openDatabase(options: { create?: boolean } = {}): Promise<ScriptDb> {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import("pg");
    const { connectionString, ssl } = parseDatabaseUrl(process.env.DATABASE_URL);
    const client = new pg.Client({ connectionString, ssl });
    await client.connect();
    await client.query(SCHEMA_SQL);
    const query: BackupQuery = async <T>(text: string, params?: unknown[]) =>
      (await client.query(text, params as unknown[] | undefined)).rows as T[];
    return {
      label: "la base de datos de DATABASE_URL",
      dataDir: null,
      query,
      transaction: async (fn) => {
        await client.query("begin");
        try {
          const result = await fn(query);
          await client.query("commit");
          return result;
        } catch (error) {
          await client.query("rollback").catch(() => {});
          throw error;
        }
      },
      applySchema: async () => {
        await client.query(SCHEMA_SQL);
      },
      close: () => client.end(),
    };
  }

  const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
  if (!options.create && !fs.existsSync(path.join(dataDir, "pgdata"))) {
    fail("Aún no hay base de datos local. Abre la app al menos una vez.");
  }
  if (findLockOwner(path.join(dataDir, "comanda.lock"))) {
    fail("La app está abierta. Ciérrala (la ventana negra) y vuelve a ejecutar este comando.");
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(path.join(dataDir, "pgdata"));
  await db.waitReady;
  await db.exec(SCHEMA_SQL);
  return {
    label: "la base local (carpeta data)",
    dataDir,
    query: async <T>(text: string, params?: unknown[]) => (await db.query<T>(text, params as unknown[] | undefined)).rows,
    transaction: (fn) =>
      db.transaction((tx) => fn(async <T>(text: string, params?: unknown[]) => (await tx.query<T>(text, params)).rows)),
    applySchema: () => db.exec(SCHEMA_SQL).then(() => undefined),
    close: () => db.close(),
  };
}
