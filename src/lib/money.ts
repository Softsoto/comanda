import { CURRENCIES, LIMITS, type CurrencyInfo } from "./config";

const NBSP = " ";

export function getCurrency(code: string): CurrencyInfo {
  return (
    CURRENCIES.find((c) => c.code === code) ?? {
      code,
      label: code,
      symbol: code,
      space: true,
      thousands: ",",
      decimal: ".",
      decimals: 2,
    }
  );
}

/**
 * Convierte centavos en texto listo para mostrar: 3600000 → "$ 36.000".
 * Se formatea a mano (sin Intl) para que el resultado sea idéntico en el
 * servidor, en el navegador y en el mensaje de WhatsApp.
 */
export function formatMoney(cents: number, currencyCode: string): string {
  const currency = getCurrency(currencyCode);
  const value = Math.round(Math.abs(cents));
  const whole = Math.floor(value / 100);
  const fraction = value % 100;
  const showDecimals = currency.decimals === 2 || fraction !== 0;

  let number = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousands);
  if (showDecimals) number += currency.decimal + String(fraction).padStart(2, "0");

  const gap = currency.space ? NBSP : "";
  const text = currency.symbolAfter ? number + gap + currency.symbol : currency.symbol + gap + number;
  return cents < 0 ? "-" + text : text;
}

/**
 * Redondea al valor más pequeño que se usa en esa moneda: pesos enteros en
 * las que no llevan decimales (COP, CLP…), centavos en las demás.
 * Sirve para promedios, que casi nunca dan un número redondo.
 */
export function roundToCurrency(cents: number, currencyCode: string): number {
  return getCurrency(currencyCode).decimals === 0 ? Math.round(cents / 100) * 100 : Math.round(cents);
}

/**
 * Dinero abreviado para gráficas y espacios pequeños:
 * 15000000 → "$ 150 mil", 125000000 → "$ 1,25 M", 95000 → "$ 950".
 */
export function formatCompactMoney(cents: number, currencyCode: string): string {
  const currency = getCurrency(currencyCode);
  const total = Math.round(Math.abs(cents));
  const value = total / 100;

  let number: string;
  if (value < 10_000) {
    const fraction = total % 100;
    number = String(Math.floor(total / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousands);
    if (fraction !== 0) number += currency.decimal + String(fraction).padStart(2, "0");
  } else {
    // 999.500 ya se redondea a "1 M"; así nunca sale "1000 mil".
    const [scaled, suffix] = value >= 999_500 ? [value / 1_000_000, " M"] : [value / 1_000, " mil"];
    const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
    const text = digits > 0 ? scaled.toFixed(digits).replace(/\.?0+$/, "") : scaled.toFixed(0);
    number = text.replace(".", currency.decimal) + suffix.replace(" ", NBSP);
  }

  const gap = currency.space ? NBSP : "";
  const text = currency.symbolAfter ? number + gap + currency.symbol : currency.symbol + gap + number;
  return cents < 0 ? "-" + text : text;
}

/**
 * Interpreta un precio escrito por una persona y lo devuelve en centavos.
 * Acepta "36000", "36.000", "36,000", "12.50", "12,5", "1.500,50", "$ 18.000".
 *
 * Regla para un solo separador: si le siguen exactamente tres cifras es un
 * separador de miles ("36.000" = treinta y seis mil); si le siguen una o dos,
 * es el separador decimal ("12.50" = doce con cincuenta).
 * Devuelve null si no se entiende.
 */
export function parsePriceToCents(input: string): number | null {
  const text = String(input ?? "").replace(/[^\d.,]/g, "");
  if (!/\d/.test(text)) return null;

  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  let wholePart = text;
  let decimalPart = "";

  if (lastDot >= 0 && lastComma >= 0) {
    // Los dos separadores: el último es el decimal.
    const index = Math.max(lastDot, lastComma);
    wholePart = text.slice(0, index).replace(/[.,]/g, "");
    decimalPart = text.slice(index + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const parts = text.split(lastDot >= 0 ? "." : ",");
    if (parts.length > 2) {
      // Varios separadores iguales: son de miles ("1.250.000").
      if (parts.slice(1).some((group) => group.length !== 3)) return null;
      wholePart = parts.join("");
    } else {
      const [before, after] = parts;
      if (after.length === 3 && before.length >= 1 && before.length <= 3 && before !== "0") {
        wholePart = before + after;
      } else if (after.length <= 2) {
        wholePart = before;
        decimalPart = after;
      } else {
        return null;
      }
    }
  }

  if (decimalPart.length > 2 || !/^\d*$/.test(wholePart) || !/^\d*$/.test(decimalPart)) return null;
  if (wholePart === "" && decimalPart === "") return null;

  const cents = Number(wholePart || "0") * 100 + Number(decimalPart.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents) || cents > LIMITS.maxPriceCents) return null;
  return cents;
}

/** Texto para rellenar el campo de precio al editar: 3600000 → "36000", 1250 → "12.50". */
export function centsToInput(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, "0")}`;
}
