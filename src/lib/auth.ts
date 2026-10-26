import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { query, queryOne } from "./db";

/**
 * Sesiones: al entrar se crea un código aleatorio que viaja en una cookie
 * (solo lectura para el servidor). En la base de datos se guarda únicamente
 * la huella (hash) de ese código, así que aunque alguien leyera la tabla no
 * podría usarla para entrar.
 */
const SESSION_COOKIE = "comanda_session";
const SESSION_DAYS = 30;

export type SessionUser = { id: string; email: string };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function isHttps(): Promise<boolean> {
  const headerList = await headers();
  return headerList.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await query("delete from sessions where expires_at < now()");
  await query("insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)", [
    hashToken(token),
    userId,
    expiresAt.toISOString(),
  ]);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // En local se usa http; en la web (https) la cookie solo viaja cifrada.
    secure: await isHttps(),
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await query("delete from sessions where token_hash = $1", [hashToken(token)]);
  cookieStore.delete(SESSION_COOKIE);
}

/** Huella de la sesión de este navegador (para conservarla al cerrar las demás). */
export async function currentSessionHash(): Promise<string | undefined> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : undefined;
}

/** Usuario de la sesión actual, o null. Se calcula una sola vez por petición. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  return queryOne<SessionUser>(
    `select u.id, u.email
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
});

/** Para páginas y acciones del panel: si no hay sesión, manda a /entrar. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/entrar");
  return user;
}

/**
 * Dirección del visitante, para limitar intentos por origen.
 *
 * Sale de la cabecera X-Forwarded-For, donde cada proxy añade al final la
 * dirección de quien le habló. Se toma la última: la puso el proxy más cercano
 * (o el propio servidor, cuando no hay proxy), así que el visitante no puede
 * inventarla para saltarse los límites. Con más de un proxy delante (por
 * ejemplo, Cloudflare y además Nginx), TRUSTED_PROXIES dice cuántos son.
 */
export async function clientAddress(): Promise<string> {
  const headerList = await headers();
  const chain = (headerList.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const proxies = Math.max(1, Math.floor(Number(process.env.TRUSTED_PROXIES)) || 1);
  return chain[chain.length - proxies] ?? chain[0] ?? headerList.get("x-real-ip") ?? "local";
}
