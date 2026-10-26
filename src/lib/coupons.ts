import { formatDay } from "./dates";
import { formatMoney } from "./money";

/**
 * Cupones de descuento. Reglas que comparten el navegador y el servidor.
 */

export const COUPON_KINDS = [
  { value: "percent", label: "Porcentaje de descuento" },
  { value: "amount", label: "Valor fijo de descuento" },
  { value: "free_delivery", label: "Domicilio gratis" },
] as const;

export type CouponKind = (typeof COUPON_KINDS)[number]["value"];

export const isCouponKind = (value: unknown): value is CouponKind =>
  COUPON_KINDS.some((kind) => kind.value === value);

export type Coupon = {
  id: string;
  code: string;
  kind: CouponKind;
  /** Porcentaje (1 a 100) o valor en centavos, según el tipo. En "domicilio gratis" no se usa. */
  value: number;
  minSubtotalCents: number;
  /** Último día en que sirve ("AAAA-MM-DD"), o null si no vence. */
  endsOn: string | null;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
};

/** Lo que el navegador necesita de un cupón ya aceptado para calcular el descuento. */
export type AppliedCoupon = Pick<Coupon, "code" | "kind" | "value" | "minSubtotalCents">;

export const COUPON_CODE_MAX = 20;

/** Los códigos se guardan en mayúsculas, solo con letras y números: "bienvenido 10" → "BIENVENIDO10". */
export const normalizeCode = (text: unknown) =>
  String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, COUPON_CODE_MAX);

/** "10 % de descuento", "$ 5.000 de descuento" o "Domicilio gratis". */
export function describeCoupon(coupon: Pick<Coupon, "kind" | "value">, currency: string): string {
  if (coupon.kind === "percent") return `${coupon.value} % de descuento`;
  if (coupon.kind === "amount") return `${formatMoney(coupon.value, currency)} de descuento`;
  return "Domicilio gratis";
}

/** Explica por qué un cupón no se puede usar ahora, o devuelve null si sirve. */
export function couponProblem(coupon: Coupon, subtotalCents: number, today: string, currency: string): string | null {
  if (!coupon.isActive) return "Ese cupón no está activo.";
  if (coupon.endsOn && today > coupon.endsOn) return `Ese cupón venció el ${formatDay(coupon.endsOn)}.`;
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return "Ese cupón ya se usó todas las veces permitidas.";
  if (subtotalCents < coupon.minSubtotalCents) {
    return `Ese cupón sirve para pedidos desde ${formatMoney(coupon.minSubtotalCents, currency)} en productos.`;
  }
  return null;
}
