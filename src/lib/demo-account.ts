import { createHash, randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DEMO_EMAIL } from "./config";
import { LEGACY_DEMO_PASSWORD, hashPassword, verifyPassword } from "./password";

/**
 * La contraseña de la cuenta de ejemplo.
 *
 * Cada instalación genera la suya la primera vez que arranca y la deja escrita
 * en un archivo dentro de la carpeta de datos, para que quien instala la app
 * pueda entrar a probar. No hay una contraseña igual para todos: esa cuenta
 * puede administrar el servicio, y una clave conocida dejaría la puerta
 * abierta a cualquiera que llegue a la página (por la red wifi o por internet).
 *
 * Este módulo no abre la base: recibe la función de consulta. Lo usan la app
 * y los comandos de consola.
 */

type Query = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

export const DEMO_PASSWORD_FILE = "cuenta-de-ejemplo.txt";

/** Letras y números que no se confunden al leerlos (sin 0/o, 1/l/i). */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Una contraseña nueva, fácil de copiar a mano: "k3m9-x2pd". */
export function newDemoPassword(): string {
  const pick = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${pick()}-${pick()}`;
}

export function writeDemoPasswordFile(dataDir: string, password: string): boolean {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, DEMO_PASSWORD_FILE),
      [
        "Cuenta de ejemplo de esta instalación",
        "",
        `Correo:      ${DEMO_EMAIL}`,
        `Contraseña:  ${password}`,
        "",
        "Esta contraseña es solo de esta instalación. Si la cambias desde el panel,",
        "este archivo se borra solo la próxima vez que abras la app.",
        "",
      ].join("\n"),
      { mode: 0o600 },
    );
    return true;
  } catch (error) {
    console.error(`[cuenta de ejemplo] no se pudo guardar ${DEMO_PASSWORD_FILE}:`, error);
    return false;
  }
}

/** La contraseña escrita en el archivo, o null si no hay archivo. */
export function readDemoPasswordFile(dataDir: string): string | null {
  try {
    const text = fs.readFileSync(path.join(dataDir, DEMO_PASSWORD_FILE), "utf8");
    return /^Contraseña:\s*(\S+)/m.exec(text)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Borra el archivo. Se llama cuando alguien le cambia la contraseña a la cuenta
 * de ejemplo: la que estaba escrita ya no es la suya.
 */
export function removeDemoPasswordFile(dataDir: string) {
  try {
    fs.rmSync(path.join(dataDir, DEMO_PASSWORD_FILE), { force: true });
  } catch {
    // Si no se puede borrar, queda un archivo con una contraseña que ya no sirve: no es un riesgo.
  }
}

/** Ajuste donde se anota qué contraseña de la cuenta de ejemplo ya se revisó (su huella, no la contraseña). */
const CHECKED_KEY = "demo_account_checked";
const fingerprint = (hash: string) => createHash("sha256").update(hash).digest("hex").slice(0, 32);

export type DemoAccountCheck =
  /** No hay cuenta de ejemplo, o está como debe. */
  | "ok"
  /** Tenía la contraseña conocida de versiones anteriores: se le puso una nueva (queda en el archivo). */
  | "renovada"
  /** Tenía la contraseña conocida y aquí no hay dónde dejar una nueva: quedó sin contraseña. */
  | "desactivada";

/**
 * Revisa la cuenta de ejemplo. Se llama en cada arranque y después de
 * restaurar una copia de seguridad.
 *
 * - Si todavía tiene la contraseña de versiones anteriores (la misma en todas
 *   las instalaciones), se cambia: en el computador o en un servidor propio
 *   por una nueva que queda en el archivo; en la nube, donde no hay carpeta de
 *   datos, la cuenta queda sin contraseña hasta que el administrador le ponga una.
 * - Si el archivo ya no coincide con la cuenta (alguien cambió la contraseña,
 *   o la cuenta ya no existe), se borra.
 *
 * `dataDir` es la carpeta de la base local, o null con una base en la nube.
 */
export async function secureDemoAccount(query: Query, dataDir: string | null): Promise<DemoAccountCheck> {
  const rows = await query<{ id: string; password_hash: string; checked: string | null }>(
    `select u.id, u.password_hash, (select s.value from settings s where s.key = $2) as checked
       from users u where u.email = $1`,
    [DEMO_EMAIL, CHECKED_KEY],
  );
  const user = rows[0];
  if (!user) {
    if (dataDir) removeDemoPasswordFile(dataDir);
    return "ok";
  }

  let hash = user.password_hash;
  let result: DemoAccountCheck = "ok";
  // Comprobar una contraseña tarda (a propósito). Se anota cuál se revisó ya, para
  // repetirlo solo cuando la contraseña de la cuenta cambia, no en cada arranque.
  if (user.checked !== fingerprint(hash)) {
    if (await verifyPassword(LEGACY_DEMO_PASSWORD, hash)) {
      const password = dataDir ? newDemoPassword() : null;
      // Sin contraseña válida ("!") nadie puede entrar hasta que se le ponga una.
      hash = password ? await hashPassword(password) : "!";
      await query("update users set password_hash = $2 where id = $1", [user.id, hash]);
      // Quien hubiera entrado con la contraseña conocida queda fuera.
      await query("delete from sessions where user_id = $1", [user.id]);
      if (password && dataDir) writeDemoPasswordFile(dataDir, password);
      result = password ? "renovada" : "desactivada";
    }
    await query("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [
      CHECKED_KEY,
      fingerprint(hash),
    ]);
  }

  if (dataDir && result === "ok") {
    const written = readDemoPasswordFile(dataDir);
    if (written !== null && !(await verifyPassword(written, hash))) removeDemoPasswordFile(dataDir);
  }
  return result;
}
