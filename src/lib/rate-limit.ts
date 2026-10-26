/**
 * Límite de intentos por clave (por ejemplo "entrar:cuenta:correo").
 *
 * Vive en la memoria del servidor: suficiente para un solo servidor. En un
 * despliegue con muchas instancias conviene moverlo a la base de datos.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60 * 1000;

/** True si esa clave ya llegó al máximo de intentos en los últimos 10 minutos. */
export function isLimited(key: string, max: number): boolean {
  const entry = attempts.get(key);
  return !!entry && entry.resetAt >= Date.now() && entry.count >= max;
}

export function recordAttempt(key: string): void {
  const now = Date.now();
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k);
  }
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
}

export const clearAttempts = (key: string) => attempts.delete(key);
