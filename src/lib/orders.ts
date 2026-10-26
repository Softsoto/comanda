import type { CouponKind } from "./coupons";
import { roundToCurrency } from "./money";

/**
 * Reglas de los pedidos que comparten el navegador y el servidor:
 * estados, formas de entrega y cálculo de totales.
 */

export const ORDER_STATUSES = [
  { value: "nuevo", label: "Nuevo", plural: "Nuevos" },
  { value: "preparando", label: "En preparación", plural: "En preparación" },
  { value: "listo", label: "Listo / en camino", plural: "Listos / en camino" },
  { value: "completado", label: "Completado", plural: "Completados" },
  { value: "cancelado", label: "Cancelado", plural: "Cancelados" },
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number]["value"];

export const isOrderStatus = (value: unknown): value is OrderStatus =>
  ORDER_STATUSES.some((status) => status.value === value);

export const statusLabel = (status: string) =>
  ORDER_STATUSES.find((item) => item.value === status)?.label ?? status;

/**
 * Formas de entrega que un negocio puede ofrecer.
 * - domicilio: se lleva a la dirección del cliente (puede tener costo).
 * - recoger: el cliente pasa por el pedido.
 * - local: el cliente ya está en el local y pide desde la mesa.
 */
export const DELIVERY_MODES = [
  { value: "domicilio", label: "A domicilio", inMessage: "A domicilio" },
  { value: "recoger", label: "Recoger", inMessage: "Recoge en el local" },
  { value: "local", label: "En el local", inMessage: "Consume en el local" },
] as const;

export type DeliveryMode = (typeof DELIVERY_MODES)[number]["value"];

export const isDeliveryMode = (value: unknown): value is DeliveryMode =>
  DELIVERY_MODES.some((mode) => mode.value === value);

export const deliveryLabel = (mode: string) => DELIVERY_MODES.find((item) => item.value === mode)?.label ?? mode;

export const DEFAULT_DELIVERY_MODES: DeliveryMode[] = ["domicilio", "recoger"];

/** Lee la lista guardada ("domicilio,recoger") y descarta lo que no reconozca. */
export function parseDeliveryModes(text: string | null | undefined): DeliveryMode[] {
  const modes = String(text ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(isDeliveryMode);
  const unique = DELIVERY_MODES.map((mode) => mode.value).filter((value) => modes.includes(value));
  return unique.length > 0 ? unique : DEFAULT_DELIVERY_MODES;
}

/**
 * Nombre de un estado según la forma de entrega: un pedido "listo" está
 * "En camino" si va a domicilio y "Listo para recoger" si el cliente pasa por él.
 */
export function statusLabelFor(status: string, delivery: string): string {
  if (status === "listo") {
    return delivery === "domicilio" ? "En camino" : delivery === "recoger" ? "Listo para recoger" : "Listo";
  }
  return statusLabel(status);
}

/** Pasos que ve el cliente en el seguimiento de su pedido, en orden. */
export function trackingSteps(delivery: string): string[] {
  return ["Recibido", "En preparación", statusLabelFor("listo", delivery), "Entregado"];
}

/** En qué paso del seguimiento va un pedido (0 a 3), o -1 si se canceló. */
export function trackingIndex(status: string): number {
  return { nuevo: 0, preparando: 1, listo: 2, completado: 3 }[status] ?? -1;
}

/** Lo que pasa con el pedido en este momento, dicho al cliente. */
export function trackingMessage(status: string, delivery: string): string {
  switch (status) {
    case "nuevo":
      return "Recibimos tu pedido. En un momento empezamos a prepararlo.";
    case "preparando":
      return "Estamos preparando tu pedido.";
    case "listo":
      return delivery === "domicilio"
        ? "Tu pedido va en camino."
        : delivery === "recoger"
          ? "Tu pedido está listo: ya puedes pasar a recogerlo."
          : "Tu pedido está listo.";
    case "completado":
      return "Pedido entregado. ¡Gracias por tu compra!";
    default:
      return "Este pedido fue cancelado.";
  }
}

export type TotalsInput = {
  lines: { priceCents: number; quantity: number }[];
  delivery: DeliveryMode;
  /**
   * Costo de domicilio que aplica: el de la zona elegida o el fijo del negocio.
   * null = no se conoce todavía y se acuerda con el cliente por WhatsApp.
   */
  deliveryFeeCents: number | null;
  /** Domicilio gratis a partir de este valor en productos; 0 = no aplica. */
  freeDeliveryFromCents?: number;
  coupon?: { kind: CouponKind; value: number } | null;
  /** Moneda, para redondear los descuentos por porcentaje a un valor que exista. */
  currency?: string;
};

export type OrderTotals = {
  subtotalCents: number;
  discountCents: number;
  deliveryCents: number;
  totalCents: number;
  /** A domicilio y sin costo conocido: se confirma por WhatsApp (el total no lo incluye). */
  deliveryPending: boolean;
  /** A domicilio y no se cobra: por el valor del pedido, por un cupón o porque la zona no tiene costo. */
  deliveryFree: boolean;
};

/**
 * Total de un pedido: productos, menos el descuento del cupón, más el domicilio.
 * El domicilio solo se cobra en pedidos a domicilio.
 */
export function computeTotals(input: TotalsInput): OrderTotals {
  const subtotalCents = input.lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);

  let discountCents = 0;
  if (input.coupon?.kind === "percent") {
    const percent = Math.min(Math.max(input.coupon.value, 0), 100);
    discountCents = roundToCurrency((subtotalCents * percent) / 100, input.currency ?? "");
  } else if (input.coupon?.kind === "amount") {
    discountCents = Math.max(0, input.coupon.value);
  }
  discountCents = Math.min(discountCents, subtotalCents);

  let deliveryCents = 0;
  let deliveryPending = false;
  let deliveryFree = false;
  if (input.delivery === "domicilio") {
    const threshold = input.freeDeliveryFromCents ?? 0;
    const waived = (threshold > 0 && subtotalCents >= threshold) || input.coupon?.kind === "free_delivery";
    if (waived) deliveryFree = true;
    else if (input.deliveryFeeCents === null) deliveryPending = true;
    else if (input.deliveryFeeCents <= 0) deliveryFree = true;
    else deliveryCents = input.deliveryFeeCents;
  }

  return {
    subtotalCents,
    discountCents,
    deliveryCents,
    totalCents: subtotalCents - discountCents + deliveryCents,
    deliveryPending,
    deliveryFree,
  };
}

/**
 * Costo de domicilio que le toca a un pedido: si el negocio tiene zonas, el de
 * la zona elegida; si no, su costo fijo. null cuando no se puede saber aún.
 */
export function deliveryFeeFor(
  business: { deliveryFeeCents: number; zones: { id: string; feeCents: number }[] },
  zoneId: string | null | undefined,
): number | null {
  if (business.zones.length > 0) return business.zones.find((zone) => zone.id === zoneId)?.feeCents ?? null;
  return business.deliveryFeeCents > 0 ? business.deliveryFeeCents : null;
}
