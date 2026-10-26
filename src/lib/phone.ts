import { COUNTRY_CODES, NATIONAL_NUMBER_LENGTHS } from "./config";

/** Deja solo las cifras de un teléfono. */
export const digitsOnly = (value: string) => String(value ?? "").replace(/\D/g, "");

/**
 * Une indicativo y número local en el formato que pide WhatsApp:
 * solo cifras, con indicativo y sin "+". ("57", "300 123 4567") → "573001234567"
 *
 * Tolera las formas habituales de escribirlo:
 * - "+57 300 123 4567" o "0057 300…": ya trae el indicativo, se usa tal cual.
 * - "573001234567" con Colombia elegida: el indicativo está repetido y se quita.
 * - "099 123 4567": se quita el cero inicial.
 */
export function joinWhatsapp(countryCode: string, localNumber: string): string {
  const raw = String(localNumber ?? "").trim();
  let local = digitsOnly(raw);
  if (!local) return "";
  if (raw.startsWith("+")) return local;
  if (raw.startsWith("00")) return local.replace(/^00/, "");

  const code = digitsOnly(countryCode);
  local = local.replace(/^0+/, "");
  const lengths = NATIONAL_NUMBER_LENGTHS[code];
  if (lengths && local.startsWith(code) && !lengths.includes(local.length) && lengths.includes(local.length - code.length)) {
    local = local.slice(code.length);
  }
  return code + local;
}

/** Separa un número guardado en indicativo + número local para mostrarlo en el formulario. */
export function splitWhatsapp(number: string): { code: string; local: string } {
  const digits = digitsOnly(number);
  const match = COUNTRY_CODES.map((c) => c.code)
    .filter((code) => digits.startsWith(code))
    .sort((a, b) => b.length - a.length)[0];
  return match ? { code: match, local: digits.slice(match.length) } : { code: "", local: digits };
}

/** WhatsApp acepta números de 8 a 15 cifras contando el indicativo. */
export function isValidWhatsapp(number: string): boolean {
  return whatsappProblem(number) === null;
}

/** Explica qué tiene de raro un número, o devuelve null si se ve bien. */
export function whatsappProblem(number: string): string | null {
  if (!/^[1-9]\d{7,14}$/.test(number)) {
    return "Ese número no parece válido. Revisa el indicativo del país y el número.";
  }
  const { code, local } = splitWhatsapp(number);
  const lengths = NATIONAL_NUMBER_LENGTHS[code];
  if (lengths && !lengths.includes(local.length)) {
    const country = COUNTRY_CODES.find((item) => item.code === code)?.label.replace(/\s*\(\+\d+\)$/, "") ?? "ese país";
    const expected = [...lengths].sort((a, b) => a - b).join(" u ");
    return `En ${country} los números tienen ${expected} cifras sin contar el indicativo, y este tiene ${local.length}. Revísalo.`;
  }
  return null;
}

/** Muestra un número guardado de forma legible: "573001234567" → "+57 300 123 4567". */
export function formatWhatsapp(number: string): string {
  const { code, local } = splitWhatsapp(number);
  if (!local) return "";
  const grouped =
    local.length === 10
      ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
      : local.replace(/(\d{3,4})(?=\d{4}$)/, "$1 ");
  return code ? `+${code} ${grouped}` : `+${grouped}`;
}

/**
 * Número de un cliente listo para abrirle un chat de WhatsApp.
 * Los clientes suelen escribir su teléfono sin indicativo; en ese caso se usa
 * el del país del negocio. Devuelve "" si el teléfono no sirve.
 */
export function customerWhatsapp(customerPhone: string, businessWhatsapp: string): string {
  const raw = String(customerPhone ?? "").trim();
  const digits = digitsOnly(raw);
  if (digits.length < 7 || digits.length > 15) return "";
  if (raw.startsWith("+")) return digits;
  if (raw.startsWith("00")) return digits.replace(/^00/, "");
  const { code } = splitWhatsapp(businessWhatsapp);
  return code ? joinWhatsapp(code, raw) : digits;
}
