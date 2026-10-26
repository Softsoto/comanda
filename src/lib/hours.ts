import { partsIn } from "./dates";

/**
 * Tienda abierta o cerrada.
 *
 * Cada negocio elige entre tres modos:
 * - "abierto": recibe pedidos siempre.
 * - "cerrado": no recibe pedidos hasta que el dueño lo cambie.
 * - "horario": abre y cierra solo, según el horario de cada día.
 */

export const OPEN_MODES = [
  { value: "abierto", label: "Abierto" },
  { value: "cerrado", label: "Cerrado" },
  { value: "horario", label: "Según horario" },
] as const;

export type OpenMode = (typeof OPEN_MODES)[number]["value"];

export const isOpenMode = (value: unknown): value is OpenMode => OPEN_MODES.some((mode) => mode.value === value);

/** Tramo de atención: "11:30" a "22:00". Si la hora de cierre no es mayor, cierra al día siguiente. */
export type TimeRange = { from: string; to: string };

/** Horario semanal: una lista de tramos por día; índice 0 = domingo … 6 = sábado. Sin tramos = cerrado. */
export type WeeklySchedule = TimeRange[][];

export const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** Orden en que se muestran los días: de lunes a domingo. */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const MAX_RANGES_PER_DAY = 2;

export const emptySchedule = (): WeeklySchedule => Array.from({ length: 7 }, () => []);

export const isTime = (value: unknown): value is string =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Minuto de cierre: "23:59" cuenta como el final del día, para no cerrar un minuto antes de la medianoche. */
const closeMinutes = (time: string) => (time === "23:59" ? 1440 : toMinutes(time));

/** Un tramo pasa de medianoche cuando la hora de cierre no es mayor que la de apertura. */
const crossesMidnight = (range: TimeRange) => closeMinutes(range.to) <= toMinutes(range.from);

/** Tramo como minutos desde el inicio del día; el cierre puede pasar de 1440 si termina al día siguiente. */
function span(range: TimeRange): [number, number] {
  const from = toMinutes(range.from);
  const to = closeMinutes(range.to);
  return [from, to <= from ? to + 1440 : to];
}

export type ScheduleCheck =
  | { ok: true; schedule: WeeklySchedule }
  /** errors: mensaje por día (índice 0 = domingo). */
  | { ok: false; errors: Record<number, string> };

/**
 * Revisa un horario que llega del formulario: horas bien escritas, apertura
 * distinta del cierre y tramos de un mismo día que no se crucen.
 */
export function validateSchedule(raw: unknown): ScheduleCheck {
  const schedule = emptySchedule();
  const errors: Record<number, string> = {};
  const days = Array.isArray(raw) ? raw : [];
  for (let day = 0; day < 7; day++) {
    const name = DAY_NAMES[day].toLowerCase();
    const ranges: unknown[] = Array.isArray(days[day]) ? days[day] : [];
    if (ranges.length > MAX_RANGES_PER_DAY) {
      errors[day] = `Deja máximo ${MAX_RANGES_PER_DAY} tramos para el ${name}.`;
      continue;
    }
    for (const item of ranges) {
      const range = item as Partial<TimeRange> | null;
      if (!range || !isTime(range.from) || !isTime(range.to)) {
        errors[day] = `Completa la hora de apertura y la de cierre del ${name}.`;
        break;
      }
      if (range.from === range.to) {
        errors[day] = `El ${name} abre y cierra a la misma hora. Si abres todo el día, pon de 12:00 a. m. a 11:59 p. m.`;
        break;
      }
      schedule[day].push({ from: range.from, to: range.to });
    }
    if (errors[day]) continue;
    schedule[day].sort((a, b) => a.from.localeCompare(b.from));
    if (schedule[day].length === 2) {
      const [first, second] = schedule[day].map(span);
      // Ya están ordenados por apertura: se cruzan si el segundo empieza antes de que termine el primero.
      if (second[0] < first[1]) errors[day] = `Los dos tramos del ${name} se cruzan. Revisa las horas.`;
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, schedule };
}

/** Lee el horario guardado (texto JSON). Lo que no entienda lo deja como cerrado. */
export function parseSchedule(text: string | null | undefined): WeeklySchedule {
  const schedule = emptySchedule();
  if (!text) return schedule;
  try {
    const raw = JSON.parse(text);
    if (!Array.isArray(raw)) return schedule;
    for (let day = 0; day < 7; day++) {
      const ranges = Array.isArray(raw[day]) ? raw[day] : [];
      for (const range of ranges.slice(0, MAX_RANGES_PER_DAY)) {
        if (range && isTime(range.from) && isTime(range.to)) schedule[day].push({ from: range.from, to: range.to });
      }
    }
  } catch {
    // Texto dañado: se trata como "sin horario".
  }
  return schedule;
}

export const serializeSchedule = (schedule: WeeklySchedule) => JSON.stringify(schedule);

export const hasAnyHours = (schedule: WeeklySchedule) => schedule.some((day) => day.length > 0);

/** "17:00" → "5:00 p. m." */
export function formatClock(time: string): string {
  const minutes = toMinutes(time);
  const hour = Math.floor(minutes / 60);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minutes % 60).padStart(2, "0")} ${hour < 12 ? "a. m." : "p. m."}`;
}

/** "las 5:00 p. m.", o "la 1:00 p. m." cuando es la una. */
function atClock(time: string): string {
  const hour = Math.floor(toMinutes(time) / 60) % 12;
  return `${hour === 1 ? "la" : "las"} ${formatClock(time)}`;
}

export type OpenStatus = {
  open: boolean;
  /** "Abierto" o "Cerrado". */
  label: string;
  /** Aclaración para el cliente: "Cierra a las 10:00 p. m.", "Abre mañana a las 11:30 a. m."… Vacío si no hay nada que añadir. */
  detail: string;
};

/** ¿Está abierta la tienda en este instante? */
export function getOpenStatus(mode: OpenMode, schedule: WeeklySchedule, now: Date, timeZone: string): OpenStatus {
  if (mode === "abierto") return { open: true, label: "Abierto", detail: "" };
  if (mode === "cerrado") return { open: false, label: "Cerrado", detail: "" };

  const parts = partsIn(now, timeZone);
  const today = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  const minute = parts.hour * 60 + parts.minute;

  // La hora ya termina en punto ("p. m."), así que la frase no lleva otro.
  const closesAt = (range: TimeRange) => `Cierra a ${atClock(range.to)}`;

  // Un tramo de ayer que pasa de medianoche puede seguir abierto hoy.
  for (const range of schedule[(today + 6) % 7]) {
    if (crossesMidnight(range) && minute < closeMinutes(range.to)) {
      return { open: true, label: "Abierto", detail: closesAt(range) };
    }
  }
  for (const range of schedule[today]) {
    if (minute >= toMinutes(range.from) && (crossesMidnight(range) || minute < closeMinutes(range.to))) {
      return { open: true, label: "Abierto", detail: closesAt(range) };
    }
  }

  // Cerrado: se busca la próxima apertura, hoy más tarde o en los días siguientes.
  for (let offset = 0; offset <= 7; offset++) {
    const day = (today + offset) % 7;
    const next = schedule[day]
      .map((range) => range.from)
      .filter((from) => offset > 0 || toMinutes(from) > minute)
      .sort()[0];
    if (next) {
      const when = offset === 0 ? "hoy" : offset === 1 ? "mañana" : `el ${DAY_NAMES[day].toLowerCase()}`;
      return { open: false, label: "Cerrado", detail: `Abre ${when} a ${atClock(next)}` };
    }
  }
  // "Según horario" sin ningún día con horas: cerrado, sin fecha de apertura que anunciar.
  return { open: false, label: "Cerrado", detail: "" };
}

/** Horario de la semana listo para mostrar, de lunes a domingo. */
export function scheduleLines(schedule: WeeklySchedule): { day: string; text: string }[] {
  return DAY_ORDER.map((day) => ({
    day: DAY_NAMES[day],
    text:
      schedule[day].length === 0
        ? "Cerrado"
        : schedule[day].map((range) => `${formatClock(range.from)} a ${formatClock(range.to)}`).join(" y "),
  }));
}
