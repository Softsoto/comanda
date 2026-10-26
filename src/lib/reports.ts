import { addDays, daysBetween, formatDayMonth, formatDayShort, formatMonth, weekdayOf, type DateRange } from "./dates";

/**
 * Cuentas de los reportes: resumen por día, totales y agrupación para la gráfica.
 * No tocan la base de datos, así que se pueden probar solas.
 */

export type DayStats = {
  /** "AAAA-MM-DD" en la zona horaria del negocio. */
  day: string;
  /** Pedidos recibidos ese día, en cualquier estado. */
  orders: number;
  completed: number;
  cancelled: number;
  /** Lo cobrado en pedidos completados (productos más domicilio). */
  salesCents: number;
  /** Ganancia de los pedidos completados: venta menos costo de los productos con costo registrado. */
  profitCents: number;
  /** Cuántos pedidos completados tenían algún producto con costo registrado. */
  completedWithCost: number;
  visits: number;
};

export type OrderForStats = {
  day: string;
  status: string;
  totalCents: number;
  /** null si ningún producto del pedido tenía costo registrado. */
  profitCents: number | null;
};

/** Una fila por cada día del rango, también los días sin pedidos. */
export function buildDayStats(range: DateRange, orders: OrderForStats[], visits: Map<string, number>): DayStats[] {
  const days = new Map<string, DayStats>();
  const total = daysBetween(range.from, range.to);
  for (let index = 0; index < total; index++) {
    const day = addDays(range.from, index);
    days.set(day, {
      day,
      orders: 0,
      completed: 0,
      cancelled: 0,
      salesCents: 0,
      profitCents: 0,
      completedWithCost: 0,
      visits: visits.get(day) ?? 0,
    });
  }
  for (const order of orders) {
    const stats = days.get(order.day);
    if (!stats) continue;
    stats.orders += 1;
    if (order.status === "cancelado") stats.cancelled += 1;
    if (order.status !== "completado") continue;
    stats.completed += 1;
    stats.salesCents += order.totalCents;
    if (order.profitCents !== null) {
      stats.profitCents += order.profitCents;
      stats.completedWithCost += 1;
    }
  }
  return [...days.values()];
}

export type Totals = Omit<DayStats, "day"> & { averageCents: number };

export function sumStats(days: DayStats[]): Totals {
  const totals = { orders: 0, completed: 0, cancelled: 0, salesCents: 0, profitCents: 0, completedWithCost: 0, visits: 0 };
  for (const day of days) {
    totals.orders += day.orders;
    totals.completed += day.completed;
    totals.cancelled += day.cancelled;
    totals.salesCents += day.salesCents;
    totals.profitCents += day.profitCents;
    totals.completedWithCost += day.completedWithCost;
    totals.visits += day.visits;
  }
  return { ...totals, averageCents: totals.completed > 0 ? Math.round(totals.salesCents / totals.completed) : 0 };
}

export type Bucket = {
  key: string;
  /** Nombre completo: "sáb 3 oct", "29 sep – 5 oct", "oct 2026". */
  label: string;
  /** Nombre corto para el eje de la gráfica. */
  shortLabel: string;
  orders: number;
  completed: number;
  salesCents: number;
  visits: number;
};

export type BucketUnit = "día" | "semana" | "mes";

/**
 * Agrupa los días para la gráfica: por día hasta un mes, por semana (de lunes
 * a domingo) hasta seis meses y por mes en rangos más largos. Así las barras
 * nunca quedan tan apretadas que no se puedan leer.
 */
export function bucketDays(days: DayStats[]): { unit: BucketUnit; buckets: Bucket[] } {
  const unit: BucketUnit = days.length <= 31 ? "día" : days.length <= 183 ? "semana" : "mes";
  const groups = new Map<string, DayStats[]>();
  for (const day of days) {
    const key =
      unit === "día"
        ? day.day
        : unit === "semana"
          ? addDays(day.day, -((weekdayOf(day.day) + 6) % 7)) // lunes de esa semana
          : day.day.slice(0, 7);
    const group = groups.get(key);
    if (group) group.push(day);
    else groups.set(key, [day]);
  }

  const buckets = [...groups.entries()].map(([key, group]): Bucket => {
    const first = group[0].day;
    const last = group[group.length - 1].day;
    const label =
      unit === "día"
        ? formatDayShort(first)
        : unit === "semana"
          ? first === last
            ? formatDayMonth(first)
            : `${formatDayMonth(first)} – ${formatDayMonth(last)}`
          : formatMonth(first);
    return {
      key,
      label,
      shortLabel: unit === "mes" ? formatMonth(first).slice(0, 3) : formatDayMonth(first),
      orders: group.reduce((sum, day) => sum + day.orders, 0),
      completed: group.reduce((sum, day) => sum + day.completed, 0),
      salesCents: group.reduce((sum, day) => sum + day.salesCents, 0),
      visits: group.reduce((sum, day) => sum + day.visits, 0),
    };
  });
  return { unit, buckets };
}

/**
 * Marcas del eje vertical: de cero a un tope "redondo" por encima del máximo.
 * niceScale(12_345_600) → [0, 5_000_000, 10_000_000, 15_000_000]
 */
export function niceScale(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough) ?? 10 * power;
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(Math.round(value));
  return ticks;
}
