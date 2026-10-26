/**
 * Cambia la contraseña de una cuenta desde la consola. Útil cuando un negocio
 * olvida la suya y no hay un servicio de correo conectado para que la recupere solo.
 *
 *   npm run clave -- correo@negocio.com NuevaClave123
 *
 * Con la base de datos local, cierra primero la app (solo un programa puede
 * abrirla a la vez). Con DATABASE_URL se puede usar en cualquier momento.
 */
import fs from "node:fs";
import path from "node:path";
import { DEMO_EMAIL } from "../src/lib/config";
import { parseDatabaseUrl } from "../src/lib/database-url";
import { removeDemoPasswordFile } from "../src/lib/demo-account";
import { findLockOwner } from "../src/lib/lock";
import { hashPassword, passwordProblem } from "../src/lib/password";

// Lee las mismas variables que usa la app (.env.local y .env), si existen.
for (const file of [".env.local", ".env"]) {
  try {
    if (fs.existsSync(file)) process.loadEnvFile(file);
  } catch {
    // Versiones antiguas de Node no traen loadEnvFile: se usa el entorno tal cual.
  }
}

function fail(message: string): never {
  console.error(`\n  ERROR: ${message}\n`);
  process.exit(1);
}

async function main() {
  const [emailArg, password] = process.argv.slice(2);
  const email = (emailArg ?? "").trim().toLowerCase();
  if (!email || !password) fail("Uso: npm run clave -- correo@negocio.com NuevaClave123");
  const problem = passwordProblem(password);
  if (problem) fail(problem);

  type Run = (text: string, params: unknown[]) => Promise<{ id: string }[]>;
  let run: Run;
  let close: () => Promise<void>;
  let localDataDir: string | null = null;

  if (process.env.DATABASE_URL) {
    const { default: pg } = await import("pg");
    const client = new pg.Client(parseDatabaseUrl(process.env.DATABASE_URL));
    await client.connect();
    run = async (text, params) => (await client.query(text, params)).rows;
    close = () => client.end();
  } else {
    const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
    localDataDir = dataDir;
    if (!fs.existsSync(path.join(dataDir, "pgdata"))) fail("Aún no hay base de datos local. Abre la app al menos una vez.");
    if (findLockOwner(path.join(dataDir, "comanda.lock"))) {
      fail("La app está abierta. Ciérrala, cambia la contraseña y vuelve a abrirla.");
    }
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite(path.join(dataDir, "pgdata"));
    await db.waitReady;
    run = async (text, params) => (await db.query<{ id: string }>(text, params)).rows;
    close = () => db.close();
  }

  const updated = await run("update users set password_hash = $2 where email = $1 returning id", [
    email,
    await hashPassword(password),
  ]);
  if (updated.length > 0) {
    // Cierra las sesiones abiertas de esa cuenta: tendrá que entrar con la clave nueva.
    await run("delete from sessions where user_id = $1 returning user_id as id", [updated[0].id]);
  }
  await close();

  if (updated.length === 0) fail(`No hay ninguna cuenta con el correo ${email}.`);
  // La contraseña de la cuenta de ejemplo que estaba escrita en la carpeta de datos ya no es la suya.
  if (email === DEMO_EMAIL && localDataDir) removeDemoPasswordFile(localDataDir);
  console.log(`\n  Listo: contraseña cambiada para ${email}.\n`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
