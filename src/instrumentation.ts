/**
 * Se ejecuta una vez al encender el servidor. Aquí arrancan las copias de
 * seguridad automáticas (ver src/lib/auto-backup.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAutoBackups } = await import("./lib/auto-backup");
  startAutoBackups();
}
