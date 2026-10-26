import { addDays, daysBetween, formatDay } from "./dates";

/**
 * Cobro a los comercios: cuándo vence cada uno y en qué estado queda.
 *
 * Cada comercio puede tener un "último día pagado". Sin esa fecha no vence
 * nunca. Al pasar la fecha entra en unos días de gracia (su menú sigue
 * funcionando) y, si tampoco paga, queda vencido: su menú deja de mostrarse
 * hasta que se registre un pago. Los días se manejan como texto "AAAA-MM-DD".
 */

/** Con cuántos días de anticipación se avisa de que el plan está por vencer. */
export const BILLING_WARN_DAYS = 5;

/** Períodos que se pueden pagar de una vez, en meses. */
export const PAYMENT_MONTHS = [1, 3, 6, 12];

export type BillingState = "sin-vencimiento" | "activo" | "por-vencer" | "gracia" | "vencido";

export type Billing = {
  state: BillingState;
  /** Último día pagado, o null si el comercio no vence. */
  paidUntil: string | null;
  /** Días pagados que le quedan, contando hoy; 0 si ya venció o no tiene fecha. */
  daysLeft: number;
  /** Último día en que su menú sigue funcionando, contando la gracia. */
  lastDay: string | null;
};

export function billingStatus(paidUntil: string | null, today: string, graceDays: number): Billing {
  if (!paidUntil) return { state: "sin-vencimiento", paidUntil: null, daysLeft: 0, lastDay: null };
  const lastDay = addDays(paidUntil, Math.max(0, Math.floor(graceDays)));
  if (today <= paidUntil) {
    const daysLeft = daysBetween(today, paidUntil);
    return { state: daysLeft <= BILLING_WARN_DAYS ? "por-vencer" : "activo", paidUntil, daysLeft, lastDay };
  }
  return { state: today <= lastDay ? "gracia" : "vencido", paidUntil, daysLeft: 0, lastDay };
}

/** Vencido y sin gracia: el menú del comercio no se muestra ni recibe pedidos. */
export const isBillingBlocked = (billing: Billing) => billing.state === "vencido";

/** El estado dicho en pocas palabras, para listas y fichas. */
export function billingLabel(billing: Billing): string {
  switch (billing.state) {
    case "sin-vencimiento":
      return "Sin vencimiento";
    case "activo":
      return `Al día · vence el ${formatDay(billing.paidUntil as string)}`;
    case "por-vencer":
      return billing.daysLeft === 1
        ? "Vence hoy"
        : billing.daysLeft === 2
          ? "Vence mañana"
          : `Vence en ${billing.daysLeft - 1} días`;
    case "gracia":
      return `Venció el ${formatDay(billing.paidUntil as string)} · en días de gracia`;
    case "vencido":
      return `Vencido desde el ${formatDay(billing.paidUntil as string)}`;
  }
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Suma meses a un día. Si el mes de destino es más corto, se queda en su último día: 31 ene + 1 mes = 28 feb. */
export function addMonths(day: string, months: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastOfMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(Math.min(date, lastOfMonth))}`;
}

/**
 * Período que cubre un pago nuevo. Si el comercio está al día, empieza al día
 * siguiente de lo que ya tenía pagado; si estaba vencido (o no tenía fecha),
 * empieza hoy: no se le cobran los días en que no tuvo servicio.
 */
export function extendPaidUntil(paidUntil: string | null, today: string, months: number): { from: string; to: string } {
  const from = paidUntil && paidUntil >= today ? addDays(paidUntil, 1) : today;
  return { from, to: addDays(addMonths(from, Math.max(1, Math.floor(months))), -1) };
}
