import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { forgetDemoPasswordFile } from "./data";
import { query, queryOne, transaction } from "./db";

/**
 * Enlaces para restablecer la contraseña. El código viaja en el enlace del
 * correo; en la base de datos se guarda solo su huella (hash), así que nadie
 * que lea la tabla puede usarlo. Cada enlace sirve una vez y por poco tiempo.
 */
export const RESET_MINUTES = 60;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const isToken = (token: string) => /^[A-Za-z0-9_-]{30,80}$/.test(token);

/** Crea un enlace nuevo para esa cuenta (los anteriores dejan de servir) y devuelve su código. */
export async function createPasswordReset(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await transaction(async (q) => {
    await q("delete from password_resets where user_id = $1 or expires_at < now() - interval '7 days'", [userId]);
    await q(
      `insert into password_resets (token_hash, user_id, expires_at)
       values ($1, $2, now() + interval '${RESET_MINUTES} minutes')`,
      [hashToken(token), userId],
    );
  });
  return token;
}

/** Cuenta a la que pertenece un enlace todavía válido, o null. */
export async function findPasswordReset(token: string): Promise<{ email: string } | null> {
  if (!isToken(token)) return null;
  return queryOne<{ email: string }>(
    `select u.email from password_resets r join users u on u.id = r.user_id
      where r.token_hash = $1 and r.used_at is null and r.expires_at > now()`,
    [hashToken(token)],
  );
}

/** Usa el enlace: cambia la contraseña, lo marca como usado y cierra las sesiones abiertas de esa cuenta. */
export async function consumePasswordReset(token: string, passwordHash: string): Promise<boolean> {
  if (!isToken(token)) return false;
  const email = await transaction(async (q) => {
    // "for update": dos intentos a la vez con el mismo enlace no pueden usarlo dos veces.
    const rows = await q<{ user_id: string }>(
      `select user_id from password_resets
        where token_hash = $1 and used_at is null and expires_at > now() for update`,
      [hashToken(token)],
    );
    const userId = rows[0]?.user_id;
    if (!userId) return null;
    const updated = await q<{ email: string }>("update users set password_hash = $2 where id = $1 returning email", [
      userId,
      passwordHash,
    ]);
    await q("update password_resets set used_at = now() where token_hash = $1", [hashToken(token)]);
    await q("delete from sessions where user_id = $1", [userId]);
    return updated[0]?.email ?? "";
  });
  if (email === null) return false;
  forgetDemoPasswordFile(email);
  return true;
}

/** Para pruebas y limpieza: borra los enlaces vencidos. */
export async function deleteExpiredResets(): Promise<void> {
  await query("delete from password_resets where expires_at < now()");
}
