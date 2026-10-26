/**
 * Fechas en la zona horaria de cada negocio.
 *
 * La base de datos guarda instantes exactos (UTC). Para mostrar "9:45 p. m."
 * o filtrar "los pedidos de hoy" hay que convertirlos a la hora local del
 * negocio; el servidor puede estar en otra zona (en la nube suele estar en UTC).
 * Los días se manejan como texto "AAAA-MM-DD".
 */

export const TIMEZONES: { value: string; label: string }[] = [
  { value: "America/Bogota", label: "Colombia (Bogotá)" },
  { value: "America/Argentina/Buenos_Aires", label: "Argentina (Buenos Aires)" },
  { value: "America/La_Paz", label: "Bolivia (La Paz)" },
  { value: "America/Sao_Paulo", label: "Brasil (São Paulo)" },
  { value: "America/Santiago", label: "Chile (Santiago)" },
  { value: "America/Costa_Rica", label: "Costa Rica" },
  { value: "America/Guayaquil", label: "Ecuador (Guayaquil)" },
  { value: "America/El_Salvador", label: "El Salvador" },
  { value: "Europe/Madrid", label: "España (Madrid)" },
  { value: "America/New_York", label: "EE. UU. (Este)" },
  { value: "America/Chicago", label: "EE. UU. (Centro)" },
  { value: "America/Los_Angeles", label: "EE. UU. (Pacífico)" },
  { value: "America/Guatemala", label: "Guatemala" },
  { value: "America/Tegucigalpa", label: "Honduras" },
  { value: "America/Mexico_City", label: "México (Ciudad de México)" },
  { value: "America/Managua", label: "Nicaragua" },
  { value: "America/Panama", label: "Panamá" },
  { value: "America/Asuncion", label: "Paraguay (Asunción)" },
  { value: "America/Lima", label: "Perú (Lima)" },
  { value: "America/Puerto_Rico", label: "Puerto Rico" },
  { value: "America/Santo_Domingo", label: "República Dominicana" },
  { value: "America/Montevideo", label: "Uruguay (Montevideo)" },
  { value: "America/Caracas", label: "Venezuela (Caracas)" },
];

export const DEFAULT_TIMEZONE = "America/Bogota";

export const isTimezone = (value: unknown): value is string =>
  typeof value === "string" && TIMEZONES.some((zone) => zone.value === value);

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Fecha y hora "de reloj" que marca un instante en una zona horaria. */
export function partsIn(date: Date, timeZone: string): Parts {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  const found: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") found[part.type] = Number(part.value);
  }
  return {
    year: found.year,
    month: found.month,
    day: found.day,
    hour: found.hour % 24,
    minute: found.minute,
    second: found.second,
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Día local de un instante: "2026-10-03". */
export function dayKey(date: Date, timeZone: string): string {
  const parts = partsIn(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export const todayKey = (timeZone: string) => dayKey(new Date(), timeZone);

/** Comprueba que el texto sea un día real con forma AAAA-MM-DD. */
export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Suma (o resta) días a un día: addDays("2026-10-31", 1) → "2026-11-01". */
export function addDays(day: string, amount: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, date + amount));
  return `${result.getUTCFullYear()}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`;
}

/** Cuántos días hay entre dos días (ambos incluidos). */
export function daysBetween(from: string, to: string): number {
  const toUtc = (day: string) => {
    const [year, month, date] = day.split("-").map(Number);
    return Date.UTC(year, month - 1, date);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000) + 1;
}

/**
 * Instante exacto en que empieza un día local en esa zona horaria.
 *
 * Casi siempre es su medianoche, pero hay países donde el cambio de hora
 * ocurre justo a las 12 de la noche y ese día empieza a la 1:00. Por eso no
 * se calcula restando un desfase: se busca el primer instante cuyo día local
 * ya es el pedido. Ninguna zona horaria se aleja más de 14 horas de UTC, así
 * que basta buscar en esa ventana.
 */
export function dayStart(day: string, timeZone: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  const midnightUtc = Date.UTC(year, month - 1, date) / 1000;
  const reached = (seconds: number) => dayKey(new Date(seconds * 1000), timeZone) >= day;
  let before = midnightUtc - 14 * 3600 - 1; // aquí todavía es la víspera
  let after = midnightUtc + 14 * 3600; // aquí ya empezó el día
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (reached(middle)) after = middle;
    else before = middle;
  }
  return new Date(after * 1000);
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** "9:45 p. m." */
export function formatTime(date: Date, timeZone: string): string {
  const { hour, minute } = partsIn(date, timeZone);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${pad(minute)} ${hour < 12 ? "a. m." : "p. m."}`;
}

/** "3 oct 2026" a partir de un día "2026-10-03". */
export function formatDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return `${date} ${MONTHS[month - 1]} ${year}`;
}

/** "3 oct" a partir de un día "2026-10-03". */
export function formatDayMonth(day: string): string {
  const [, month, date] = day.split("-").map(Number);
  return `${date} ${MONTHS[month - 1]}`;
}

/** "oct 2026" a partir de un día "2026-10-03" o de un mes "2026-10". */
export function formatMonth(day: string): string {
  const [year, month] = day.split("-").map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

/** Día de la semana de un día "AAAA-MM-DD": 0 = domingo … 6 = sábado. */
export function weekdayOf(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
}

/** "sáb 3 oct" a partir de un día "2026-10-03". */
export function formatDayShort(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${date} ${MONTHS[month - 1]}`;
}

/** "3 oct 2026, 9:45 p. m." en la hora del negocio. */
export function formatDateTime(date: Date, timeZone: string): string {
  return `${formatDay(dayKey(date, timeZone))}, ${formatTime(date, timeZone)}`;
}

/** "Hoy, 9:45 p. m.", "Ayer, 9:45 p. m." o "3 oct, 9:45 p. m." en la hora del negocio. */
export function formatWhen(date: Date, timeZone: string, now: Date = new Date()): string {
  const day = dayKey(date, timeZone);
  const today = dayKey(now, timeZone);
  const time = formatTime(date, timeZone);
  if (day === today) return `Hoy, ${time}`;
  if (day === addDays(today, -1)) return `Ayer, ${time}`;
  return `${day.slice(0, 4) === today.slice(0, 4) ? formatDayMonth(day) : formatDay(day)}, ${time}`;
}

export type DateRange = { from: string; to: string };

/**
 * Rango de fechas de una búsqueda. Si falta algo o está al revés se corrige;
 * por defecto, los últimos 30 días. Como mucho abarca dos años.
 */
export function resolveRange(from: unknown, to: unknown, timeZone: string, defaultDays = 30): DateRange {
  const today = todayKey(timeZone);
  let end = isDayKey(to) ? to : today;
  let start = isDayKey(from) ? from : addDays(end, -(defaultDays - 1));
  if (start > end) [start, end] = [end, start];
  if (daysBetween(start, end) > 731) start = addDays(end, -730);
  return { from: start, to: end };
}

/** Instantes de inicio y fin (el fin es el comienzo del día siguiente) de un rango de días. */
export function rangeInstants(range: DateRange, timeZone: string): { start: Date; end: Date } {
  return { start: dayStart(range.from, timeZone), end: dayStart(addDays(range.to, 1), timeZone) };
}
