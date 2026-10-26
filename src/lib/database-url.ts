/**
 * Decide el cifrado de la conexión.
 * - Servidor en este mismo computador: sin cifrado.
 * - Servidor remoto: cifrado. Por defecto no se verifica el certificado
 *   (Supabase usa uno propio); con DATABASE_SSL=verify o sslmode=verify-full
 *   sí se verifica.
 */
export function parseDatabaseUrl(rawUrl: string): {
  connectionString: string;
  ssl: false | { rejectUnauthorized: boolean };
} {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error(
      "DATABASE_URL no es una dirección válida. Debe verse así: postgresql://usuario:clave@servidor:5432/base. " +
        "Si la clave tiene símbolos como @ # / ? usa una clave solo con letras y números.",
    );
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    throw new Error("DATABASE_URL debe empezar por postgresql://");
  }
  const sslmode = url.searchParams.get("sslmode");
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) {
    url.searchParams.delete(key);
  }
  const setting = (process.env.DATABASE_SSL ?? "").toLowerCase();
  const isLocalHost = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);

  let ssl: false | { rejectUnauthorized: boolean };
  if (setting === "off" || sslmode === "disable") ssl = false;
  else if (setting === "verify" || sslmode === "verify-full" || sslmode === "verify-ca")
    ssl = { rejectUnauthorized: true };
  else if (setting === "require" || sslmode === "require") ssl = { rejectUnauthorized: false };
  else ssl = isLocalHost ? false : { rejectUnauthorized: false };

  return { connectionString: url.toString(), ssl };
}
