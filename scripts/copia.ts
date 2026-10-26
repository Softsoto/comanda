/**
 * Guarda una copia de seguridad de toda la base de datos en un archivo.
 *
 *   npm run copia                      la deja en la carpeta "copias" del proyecto
 *   npm run copia -- mi-copia.json.gz  la deja donde tú digas
 *
 * Con la base local, cierra primero la app (solo un programa puede abrirla a
 * la vez). Con DATABASE_URL se puede usar en cualquier momento. La misma
 * copia se puede descargar desde la administración (Ajustes).
 */
import fs from "node:fs";
import path from "node:path";
import packageInfo from "../package.json";
import { backupFileName, describeBackup, writeBackup } from "../src/lib/backup";
import { fail, openDatabase, readSnapshot } from "./_db";

async function main() {
  const target = path.resolve(process.argv[2] ?? path.join("copias", backupFileName()));
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const db = await openDatabase();
  const summary = await readSnapshot(db, (query) =>
    writeBackup(query, fs.createWriteStream(target), { app: packageInfo.version }),
  );
  await db.close();

  const size = (fs.statSync(target).size / 1024 / 1024).toFixed(1).replace(".", ",");
  console.log(`\n  Copia guardada: ${target}`);
  console.log(`  Contiene ${describeBackup(summary)} (${size} MB).`);
  console.log("  Guárdala fuera de este computador: en una memoria USB o en la nube.\n");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
