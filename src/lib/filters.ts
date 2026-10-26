import { addDays, isDayKey, resolveRange, todayKey, type DateRange } from "./dates";
import { isOrderStatus, type OrderStatus } from "./orders";

/**
 * Filtros de las listas de pedidos y de los reportes. Viajan en la dirección
 * de la página (?periodo=7d&estado=nuevo), así un filtro se puede guardar en
 * favoritos o compartir.
 */

export const RANGE_PRESETS = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "mes", label: "Este mes" },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]["value"];

export const isRangePreset = (value: unknown): value is RangePreset =>
  RANGE_PRESETS.some((preset) => preset.value === value);

/** Días que abarca un período rápido, contados en la zona horaria del negocio. */
export function presetRange(preset: RangePreset, timeZone: string): DateRange {
  const today = todayKey(timeZone);
  switch (preset) {
    case "hoy":
      return { from: today, to: today };
    case "ayer":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "mes":
      return { from: `${today.slice(0, 8)}01`, to: today };
  }
}

export type SearchParams = Record<string, string | string[] | undefined>;

export const firstParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export type ListFilters = {
  range: DateRange;
  /** Período rápido elegido, o null si las fechas se escribieron a mano. */
  preset: RangePreset | null;
  status: OrderStatus | undefined;
  page: number;
};

/** Lee los filtros de la dirección; lo que falte o esté mal escrito se reemplaza por el valor por defecto. */
export function readFilters(params: SearchParams, timeZone: string, defaultPreset: RangePreset): ListFilters {
  const from = firstParam(params.desde);
  const to = firstParam(params.hasta);
  const presetParam = firstParam(params.periodo);

  let preset: RangePreset | null = null;
  let range: DateRange;
  if (isDayKey(from) || isDayKey(to)) {
    range = resolveRange(from, to, timeZone);
  } else {
    preset = isRangePreset(presetParam) ? presetParam : defaultPreset;
    range = presetRange(preset, timeZone);
  }

  const statusParam = firstParam(params.estado);
  const page = Math.floor(Number(firstParam(params.pagina)));
  return {
    range,
    preset,
    status: isOrderStatus(statusParam) ? statusParam : undefined,
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 100_000) : 1,
  };
}

/** Texto "?periodo=7d&estado=nuevo" para armar enlaces que conservan los filtros. */
export function filtersToQuery(
  filters: Pick<ListFilters, "range" | "preset"> & { status?: OrderStatus },
  extra: Record<string, string | number | undefined> = {},
): string {
  const query = new URLSearchParams();
  if (filters.preset) {
    query.set("periodo", filters.preset);
  } else {
    query.set("desde", filters.range.from);
    query.set("hasta", filters.range.to);
  }
  if (filters.status) query.set("estado", filters.status);
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return `?${query.toString()}`;
}
