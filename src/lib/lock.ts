import fs from "node:fs";

/**
 * Marca de "base de datos local en uso".
 *
 * La app escribe su número de proceso en data/comanda.lock y renueva la fecha
 * del archivo cada pocos segundos. Otra copia de la app (o el script de cambio
 * de contraseña) considera la base ocupada solo si ese proceso sigue vivo Y la
 * marca es reciente. Así, una marca que quedó de un cierre brusco deja de
 * estorbar en segundos, aunque otro programa haya reutilizado ese número.
 */
export const LOCK_HEARTBEAT_MS = 5_000;
const LOCK_STALE_MS = 20_000;

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Devuelve el número del proceso que tiene abierta la base, o null si está libre. */
export function findLockOwner(lockFile: string, now = Date.now()): number | null {
  try {
    const pid = Number(fs.readFileSync(lockFile, "utf8"));
    const age = now - fs.statSync(lockFile).mtimeMs;
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return null;
    return age < LOCK_STALE_MS && isProcessAlive(pid) ? pid : null;
  } catch {
    return null; // no hay marca
  }
}

/** Toma la marca para este proceso y la mantiene al día mientras la app esté abierta. */
export function holdLock(lockFile: string): void {
  fs.writeFileSync(lockFile, String(process.pid));
  const heartbeat = setInterval(() => {
    try {
      const time = new Date();
      fs.utimesSync(lockFile, time, time);
    } catch {
      // Si borraron el archivo, se vuelve a crear.
      try {
        fs.writeFileSync(lockFile, String(process.pid));
      } catch {
        // Carpeta no disponible: no hay nada más que hacer.
      }
    }
  }, LOCK_HEARTBEAT_MS);
  heartbeat.unref(); // no impide que el proceso termine
  process.once("exit", () => {
    try {
      if (Number(fs.readFileSync(lockFile, "utf8")) === process.pid) fs.unlinkSync(lockFile);
    } catch {
      // Ya no existe.
    }
  });
}
