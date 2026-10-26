/**
 * Restaura una copia de seguridad: REEMPLAZA todo lo que hay en la base de
 * datos por el contenido del archivo.
 *
 *   npm run restaurar -- copias/comanda-copia-2026-10-04-0930.json.gz
 *
 * Pide confirmación antes de cambiar nada (con "--si" al final no la pide).
 * Con la base local, cierra primero la app. Sirve también para mudarse: una
 * copia hecha en el computador se puede restaurar en la nube, y al revés.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import packageInfo from "../package.json";
import { BackupError, backupFileName, describeBackup, restoreBackup, writeBackup } from "../src/lib/backup";
import { DEMO_PASSWORD_FILE, secureDemoAccount } from "../src/lib/demo-account";
import { fail, openDatabase, readSnapshot } from "./_db";

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith("--"));
  if (!file) fail("Uso: npm run restaurar -- ruta/de/la/copia.json.gz");
  const source = path.resolve(file);
  if (!fs.existsSync(source)) fail(`No existe el archivo ${source}`);

  const db = await openDatabase({ create: true });
  const [{ count }] = await db.query<{ count: number }>("select count(*)::int as count from businesses");

  if (!args.includes("--si")) {
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(`\n  Vas a REEMPLAZAR ${db.label} por el contenido de:\n    ${source}`);
    if (Number(count) > 0) {
      console.log(`  Ahora mismo tiene ${Number(count) === 1 ? "1 comercio, que se perderá" : `${count} comercios, que se perderán`}.`);
    }
    const answer = await prompt.question("\n  Escribe RESTAURAR para continuar: ");
    prompt.close();
    if (answer.trim() !== "RESTAURAR") {
      await db.close();
      fail("No se cambió nada.");
    }
  }

  // Antes de reemplazar, se guarda lo que hay (si hay algo).
  if (Number(count) > 0) {
    const before = path.resolve("copias", `antes-de-restaurar-${backupFileName().replace("comanda-copia-", "")}`);
    fs.mkdirSync(path.dirname(before), { recursive: true });
    await readSnapshot(db, (query) => writeBackup(query, fs.createWriteStream(before), { app: packageInfo.version }));
    console.log(`\n  Lo que había quedó guardado en: ${before}`);
  }

  try {
    const summary = await db.transaction((query) => restoreBackup(query, fs.createReadStream(source)));
    // Una copia de una versión anterior puede no traer columnas nuevas: se completan.
    await db.applySchema();
    // Y puede traer la cuenta de ejemplo con la contraseña que era igual en todas las instalaciones.
    const demo = await secureDemoAccount(db.query, db.dataDir);
    console.log(`\n  Copia restaurada: ${describeBackup(summary)}.`);
    if (summary.createdAt) console.log(`  Fecha de la copia: ${new Date(summary.createdAt).toLocaleString("es-CO")}`);
    if (demo === "renovada") {
      console.log(`  La cuenta de ejemplo traía la contraseña conocida de versiones anteriores: ahora tiene una nueva,\n  que está en ${path.join(db.dataDir ?? "data", DEMO_PASSWORD_FILE)}`);
    } else if (demo === "desactivada") {
      console.log("  La cuenta de ejemplo traía la contraseña conocida de versiones anteriores y quedó sin contraseña.\n  Ponle una desde la administración (o con npm run clave) si la necesitas.");
    }
    console.log("  Las sesiones abiertas se cerraron: hay que volver a entrar.\n");
  } catch (error) {
    await db.close();
    if (error instanceof BackupError) fail(error.message);
    throw error;
  }
  await db.close();
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
