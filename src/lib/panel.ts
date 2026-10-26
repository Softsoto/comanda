import "server-only";

import { headers } from "next/headers";
import { requireUser, type SessionUser } from "./auth";
import { ensureBusiness, type Business } from "./data";

/**
 * Puerta de entrada de todo el panel: comprueba la sesión y devuelve el
 * negocio de esa cuenta. Cada página y cada acción del panel empieza aquí.
 */
export async function requireBusiness(): Promise<{ user: SessionUser; business: Business }> {
  const user = await requireUser();
  const business = await ensureBusiness(user.id);
  return { user, business };
}

/** La dirección escrita en APP_URL, sin barra final; si le falta el "https://", se le pone. */
function configuredAppUrl(): string | null {
  const raw = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/** Dirección pública de la app: la de APP_URL o, si no está definida, la que se ve en el navegador. */
export async function getBaseUrl(): Promise<string> {
  const configured = configuredAppUrl();
  if (configured) return configured;
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host")?.split(",")[0].trim() || headerList.get("host") || "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  return `${protocol}://${host}`;
}

/**
 * Dirección para los enlaces que viajan en un correo (el de cambiar la
 * contraseña). No se toma de la petición: quien la envía puede falsear esa
 * dirección, y el enlace del correo terminaría llevando a otro sitio. Sale de
 * APP_URL o, en Vercel, del dominio del proyecto. Sin ninguna de las dos, null.
 */
export function getTrustedBaseUrl(): string | null {
  const configured = configuredAppUrl();
  if (configured) return configured;
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercelDomain ? `https://${vercelDomain}` : null;
}

/** True cuando la app se está viendo desde el mismo computador donde corre. */
export const isLocalhostUrl = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(url);
