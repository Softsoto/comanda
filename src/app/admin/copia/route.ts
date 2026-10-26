import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import packageInfo from "../../../../package.json";
import { requireAdmin } from "@/lib/admin";
import { backupFileName, writeBackup } from "@/lib/backup";
import { transaction } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Descarga una copia de seguridad de toda la base de datos (comercios, menús,
 * fotos, pedidos, pagos y ajustes) en un solo archivo.
 */
export async function GET() {
  await requireAdmin();

  // La copia se escribe primero en un archivo temporal, dentro de una sola
  // transacción (una "foto" coherente de todas las tablas), y luego se envía.
  const file = path.join(os.tmpdir(), `comanda-copia-${randomBytes(8).toString("hex")}.json.gz`);
  try {
    await transaction(async (query) => {
      await query("set transaction isolation level repeatable read");
      await writeBackup(query, fs.createWriteStream(file), { app: packageInfo.version });
    });
  } catch (error) {
    fs.rm(file, { force: true }, () => {});
    throw error;
  }

  const stream = fs.createReadStream(file);
  stream.on("close", () => fs.rm(file, { force: true }, () => {}));
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Length": String(fs.statSync(file).size),
      "Content-Disposition": `attachment; filename="${backupFileName()}"`,
      "Cache-Control": "no-store",
    },
  });
}
