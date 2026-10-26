import "server-only";

import { notFound } from "next/navigation";
import { requireUser, type SessionUser } from "./auth";
import { DEMO_EMAIL } from "./config";
import { getBusinessByOwner } from "./data";
import { DEFAULT_TIMEZONE } from "./dates";
import { isLocalDatabase } from "./db";

/**
 * Administración del servicio: quién puede ver todos los comercios.
 *
 * Se decide con la variable ADMIN_EMAILS (uno o varios correos separados por
 * comas). En el computador, si no se ha configurado, la cuenta de ejemplo es
 * la administradora para poder probar esa parte sin preparar nada.
 */
export function adminEmails(): string[] {
  const configured = (process.env.ADMIN_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length > 0) return configured;
  return isLocalDatabase() ? [DEMO_EMAIL] : [];
}

export const isAdminEmail = (email: string) => adminEmails().includes(email.trim().toLowerCase());

/** True si el correo está en ADMIN_EMAILS (sin contar la cuenta de ejemplo local). */
export const isReservedAdminEmail = (email: string) =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .includes(email.trim().toLowerCase());

/**
 * Puerta de entrada de /admin. A quien no es administrador se le responde
 * "no existe", igual que con cualquier dirección inventada.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  return user;
}

/** Zona horaria con la que el administrador ve las fechas: la de su propio negocio. */
export async function adminTimezone(userId: string): Promise<string> {
  return (await getBusinessByOwner(userId))?.timezone ?? DEFAULT_TIMEZONE;
}
