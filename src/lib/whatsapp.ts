import { formatMoney } from "./money";
import { DELIVERY_MODES, type DeliveryMode, type OrderTotals } from "./orders";
import { digitsOnly } from "./phone";

export type OrderLine = {
  name: string;
  /** Precio de una unidad, ya con las opciones elegidas. */
  priceCents: number;
  quantity: number;
  /** Opciones elegidas, en texto: "Familiar, Queso extra". */
  options?: string;
};

export type OrderCustomer = {
  name: string;
  phone: string;
  delivery: DeliveryMode;
  /** Dirección (a domicilio) o número de mesa (en el local). */
  address: string;
  payment: string;
  notes: string;
  /** Zona o barrio de domicilio, si el negocio las usa. */
  zone?: string;
};

export type OrderBusiness = { name: string; whatsapp: string; currency: string };

export const subtotalCents = (lines: OrderLine[]) =>
  lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);

/**
 * WhatsApp convierte *texto* en negrita, _texto_ en cursiva y ~texto~ en
 * tachado. Se quitan esos símbolos de lo que escribe el cliente para que no
 * rompan el formato del mensaje, y se dejan los saltos de línea como espacios.
 */
export const cleanText = (value: string) =>
  String(value ?? "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Arma el texto del pedido tal como le llega al negocio.
 * - totals: subtotal, descuento, domicilio y total ya calculados (computeTotals).
 * - number: número del pedido ya registrado (si lo hay).
 * - couponCode: código del cupón aplicado.
 * - trackUrl: enlace para que el cliente siga su pedido.
 */
export function buildOrderMessage(
  business: OrderBusiness,
  lines: OrderLine[],
  customer: OrderCustomer,
  totals: OrderTotals,
  extras: { number?: number; couponCode?: string; trackUrl?: string } = {},
): string {
  const money = (cents: number) => formatMoney(cents, business.currency);
  const name = cleanText(business.name);

  const rows: string[] = [
    extras.number ? `*Pedido #${extras.number} — ${name}*` : `*Nuevo pedido — ${name}*`,
    "",
    ...lines.map((line) => {
      const options = cleanText(line.options ?? "");
      return `• ${line.quantity} x ${cleanText(line.name)}${options ? ` (${options})` : ""} — ${money(line.priceCents * line.quantity)}`;
    }),
    "",
  ];

  const toHome = customer.delivery === "domicilio";
  if (!toHome && totals.discountCents === 0) {
    rows.push(`*Total:* ${money(totals.totalCents)}`);
  } else {
    rows.push(`*Subtotal:* ${money(totals.subtotalCents)}`);
    if (totals.discountCents > 0) {
      const code = cleanText(extras.couponCode ?? "");
      rows.push(`*Descuento${code ? ` (${code})` : ""}:* -${money(totals.discountCents)}`);
    }
    if (toHome) {
      const delivery = totals.deliveryPending ? "por confirmar" : totals.deliveryFree ? "gratis" : money(totals.deliveryCents);
      rows.push(`*Domicilio:* ${delivery}`);
    }
    // Con el domicilio por confirmar no hay un total definitivo que anunciar.
    if (!totals.deliveryPending) rows.push(`*Total:* ${money(totals.totalCents)}`);
    else if (totals.discountCents > 0) rows.push(`*Total sin domicilio:* ${money(totals.totalCents)}`);
  }

  rows.push("", `*Nombre:* ${cleanText(customer.name)}`, `*Teléfono:* ${cleanText(customer.phone)}`);
  const mode = DELIVERY_MODES.find((item) => item.value === customer.delivery);
  rows.push(`*Entrega:* ${mode?.inMessage ?? customer.delivery}`);
  if (toHome && cleanText(customer.zone ?? "")) rows.push(`*Zona:* ${cleanText(customer.zone ?? "")}`);
  if (toHome) rows.push(`*Dirección:* ${cleanText(customer.address)}`);
  if (customer.delivery === "local" && cleanText(customer.address)) rows.push(`*Mesa:* ${cleanText(customer.address)}`);
  if (cleanText(customer.payment)) rows.push(`*Pago:* ${cleanText(customer.payment)}`);
  if (cleanText(customer.notes)) rows.push(`*Notas:* ${cleanText(customer.notes)}`);
  if (extras.trackUrl) rows.push("", `Seguimiento: ${extras.trackUrl}`);
  return rows.join("\n");
}

/**
 * Enlace oficial de WhatsApp para abrir un chat con el texto ya escrito.
 * Si el negocio aún no tiene número, WhatsApp deja elegir a quién enviarlo.
 */
export function buildWhatsAppUrl(whatsapp: string, message: string): string {
  const number = digitsOnly(whatsapp);
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export type CustomerErrors = Partial<Record<"name" | "phone" | "delivery" | "zone" | "address" | "payment", string>>;

/**
 * Revisa los datos del cliente. La usan el formulario (para avisar al
 * momento) y el servidor (que no se fía de lo que llega del navegador).
 * - zones: nombres de las zonas de domicilio del negocio; si hay, elegir una es obligatorio a domicilio.
 */
export function validateCustomer(
  customer: OrderCustomer,
  options: { deliveryModes: DeliveryMode[]; paymentMethods: string[]; zones?: string[] },
): CustomerErrors {
  const errors: CustomerErrors = {};
  if (cleanText(customer.name).length < 2) errors.name = "Escribe tu nombre.";
  if (digitsOnly(customer.phone).length < 7) errors.phone = "Escribe un teléfono válido.";
  if (!options.deliveryModes.includes(customer.delivery)) errors.delivery = "Elige cómo recibes el pedido.";
  if (customer.delivery === "domicilio") {
    if (options.zones && options.zones.length > 0 && !options.zones.includes(customer.zone ?? "")) {
      errors.zone = "Elige tu zona o barrio.";
    }
    if (cleanText(customer.address).length < 5) errors.address = "Escribe tu dirección de entrega.";
  }
  if (options.paymentMethods.length > 0 && !options.paymentMethods.includes(customer.payment)) {
    errors.payment = "Elige cómo vas a pagar.";
  }
  return errors;
}
