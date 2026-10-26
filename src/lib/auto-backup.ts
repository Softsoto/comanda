import "server-only";

import fs from "node:fs";
import path from "node:path";
import packageInfo from "../../package.json";
import { backupFileName, writeBackup } from "./backup";
import { transaction } from "./db";

/**
 * Copias de seguridad automáticas: mientras la app está encendida en un
 * servidor propio (tu computador, tu NAS), cada cierto tiempo guarda sola una
 * copia completa —comercios, pedidos, ajustes, la personalización de los
 * juegos, los códigos y los puntajes— en la carpeta de copias, y borra las más
 * viejas.
 *
 * Se ajusta con variables de entorno:
 *   COPIAS_AUTOMATICAS=0         las apaga
 *   COPIAS_CADA_HORAS=24         cada cuántas horas (mínimo 1)
 *   COPIAS_GUARDAR=14            cuántas copias automáticas se conservan
 *   COPIAS_CARPETA=copias/automaticas   dónde se guardan
 */

const hours = Math.max(1, Number(process.env.COPIAS_CADA_HORAS) || 24);
/** Cada cuánto se hace la copia, dicho en palabras ("cada día", "cada 6 horas"). */
export const AUTO_BACKUP_EVERY = hours === 24 ? "cada día" : hours % 24 === 0 ? `cada ${hours / 24} días` : hours === 1 ? "cada hora" : `cada ${hours} horas`;
const keep = Math.max(1, Math.floor(Number(process.env.COPIAS_GUARDAR) || 14));
export const AUTO_BACKUP_DIR = path.resolve(/* turbopackIgnore: true */ process.env.COPIAS_CARPETA || path.join("copias", "automaticas"));
const PREFIX = "comanda-copia-";

/** Las copias automáticas que hay, de la más nueva a la más vieja. */
export function listAutoBackups(): { name: string; size: number; date: Date }[] {
  try {
    return fs
      .readdirSync(AUTO_BACKUP_DIR)
      .filter((name) => name.startsWith(PREFIX) && name.endsWith(".json.gz"))
      .map((name) => {
        const stat = fs.statSync(path.join(AUTO_BACKUP_DIR, name));
        return { name, size: stat.size, date: stat.mtime };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  } catch {
    return [];
  }
}

export const autoBackupsEnabled = () => process.env.COPIAS_AUTOMATICAS !== "0" && !process.env.VERCEL;

let running = false;

/** Hace una copia si ya pasó el tiempo desde la última. */
export async function autoBackupIfDue(now = new Date()): Promise<string | null> {
  if (running) return null;
  const last = listAutoBackups()[0];
  if (last && now.getTime() - last.date.getTime() < hours * 3600_000 - 60_000) return null;
  running = true;
  fs.mkdirSync(AUTO_BACKUP_DIR, { recursive: true });
  const file = path.join(AUTO_BACKUP_DIR, backupFileName(now));
  const temporary = `${file}.parcial`;
  try {
    await transaction(async (query) => {
      await query("set transaction isolation level repeatable read");
      await writeBackup(query, fs.createWriteStream(temporary), { app: packageInfo.version });
    });
    // Solo cuando la copia quedó entera toma su nombre: nunca queda una copia a medias con nombre de copia.
    fs.renameSync(temporary, file);
    for (const old of listAutoBackups().slice(keep)) fs.rmSync(path.join(AUTO_BACKUP_DIR, old.name), { force: true });
    return file;
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    console.error("No se pudo hacer la copia automática:", error instanceof Error ? error.message : error);
    return null;
  } finally {
    running = false;
  }
}

/** Revisa cada hora si toca hacer copia (la primera revisión, a los dos minutos de encender). */
export function startAutoBackups() {
  if (!autoBackupsEnabled()) return;
  const check = () => void autoBackupIfDue();
  setTimeout(check, 2 * 60_000).unref?.();
  setInterval(check, 60 * 60_000).unref?.();
}
