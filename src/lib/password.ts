import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Contraseñas: nunca se guardan tal cual. Se guarda un "hash" calculado con
 * scrypt (viene incluido en Node) junto con una sal aleatoria distinta por
 * usuario. Formato guardado:  scrypt$N$r$p$sal$hash
 */
const PARAMS = { N: 16384, r: 8, p: 5 };
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, params: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { ...params, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, saltText, keyText] = stored.split("$");
  if (scheme !== "scrypt" || !saltText || !keyText) return false;
  const expected = Buffer.from(keyText, "base64url");
  const params = { N: Number(N), r: Number(r), p: Number(p) };
  if (!Number.isInteger(params.N) || !Number.isInteger(params.r) || !Number.isInteger(params.p)) return false;
  try {
    const actual = await derive(password, Buffer.from(saltText, "base64url"), params);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * La contraseña que traía la cuenta de ejemplo en versiones anteriores. Era la
 * misma en todas las instalaciones, así que cualquiera la conoce: ya no se
 * acepta en ninguna cuenta (ver demo-account.ts).
 */
export const LEGACY_DEMO_PASSWORD = "demo1234";

/** Por qué no sirve una contraseña que alguien eligió, o null si sirve. */
export function passwordProblem(password: string, subject = "La contraseña"): string | null {
  if (password.length < 8) return `${subject} debe tener al menos 8 caracteres.`;
  if (password.length > 200) return `${subject} es demasiado larga.`;
  if (password.normalize("NFKC") === LEGACY_DEMO_PASSWORD) {
    return "Elige otra contraseña: esa es la que traía la cuenta de ejemplo y cualquiera la conoce.";
  }
  return null;
}

/** Hash de relleno: se usa para tardar lo mismo cuando el correo no existe. */
let dummyHash: Promise<string> | undefined;
export const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(12).toString("hex")));
