import "server-only";

import { cache } from "react";
import { DEFAULT_CURRENCY } from "./config";
import { query } from "./db";

/**
 * Ajustes generales del servicio. Los cambia el administrador en
 * /admin/ajustes y se guardan en la tabla "settings" (clave y valor).
 */
export type Settings = {
  /** Días de prueba que recibe un comercio nuevo cuando hay un plan para nuevos. 0 = sin fecha de vencimiento. */
  trialDays: number;
  /** Días de gracia después del vencimiento, en los que el menú sigue funcionando. */
  graceDays: number;
  /** Moneda en la que se cobran los planes. */
  serviceCurrency: string;
  /** WhatsApp de soporte (solo cifras, con indicativo): a él escriben los comercios para renovar o pedir ayuda. */
  supportWhatsapp: string;
  /** Texto propio del aviso de tratamiento de datos. Vacío = se usa la plantilla incluida. */
  privacyText: string;
  /** Si es true, el cliente debe marcar una casilla para aceptar el aviso antes de enviar el pedido. */
  privacyCheckbox: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  trialDays: 15,
  graceDays: 3,
  serviceCurrency: DEFAULT_CURRENCY,
  supportWhatsapp: "",
  privacyText: "",
  privacyCheckbox: false,
};

const KEYS: Record<keyof Settings, string> = {
  trialDays: "trial_days",
  graceDays: "grace_days",
  serviceCurrency: "service_currency",
  supportWhatsapp: "support_whatsapp",
  privacyText: "privacy_text",
  privacyCheckbox: "privacy_checkbox",
};

const wholeNumber = (text: string | undefined, fallback: number, max: number) => {
  const value = Number(text);
  return text !== undefined && Number.isInteger(value) && value >= 0 ? Math.min(value, max) : fallback;
};

/** Convierte las filas clave/valor en los ajustes; lo que falte toma su valor por defecto. */
export function settingsFromRows(rows: { key: string; value: string }[]): Settings {
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  return {
    trialDays: wholeNumber(stored.get(KEYS.trialDays), DEFAULT_SETTINGS.trialDays, 365),
    graceDays: wholeNumber(stored.get(KEYS.graceDays), DEFAULT_SETTINGS.graceDays, 60),
    serviceCurrency: stored.get(KEYS.serviceCurrency) || DEFAULT_SETTINGS.serviceCurrency,
    supportWhatsapp: stored.get(KEYS.supportWhatsapp) ?? "",
    privacyText: stored.get(KEYS.privacyText) ?? "",
    privacyCheckbox: stored.get(KEYS.privacyCheckbox) === "1",
  };
}

/** Ajustes del servicio. Se leen una sola vez por petición. */
export const getSettings = cache(async (): Promise<Settings> => {
  return settingsFromRows(await query<{ key: string; value: string }>("select key, value from settings"));
});

export async function saveSettings(values: Partial<Settings>): Promise<void> {
  for (const [name, value] of Object.entries(values) as [keyof Settings, Settings[keyof Settings]][]) {
    if (value === undefined) continue;
    const text = typeof value === "boolean" ? (value ? "1" : "0") : String(value);
    await query(
      "insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value",
      [KEYS[name], text],
    );
  }
}
