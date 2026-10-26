"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CheckCouponResult, OrderDraft, SubmitOrderResult } from "@/components/menu/types";
import { clientAddress } from "@/lib/auth";
import { isBillingBlocked } from "@/lib/billing";
import { LIMITS } from "@/lib/config";
import { couponProblem, normalizeCode } from "@/lib/coupons";
import { findCoupon } from "@/lib/coupons-data";
import { getBusinessBySlug, getZones } from "@/lib/data";
import { todayKey } from "@/lib/dates";
import { getOpenStatus } from "@/lib/hours";
import { OPTION_LIMITS, optionsSummary } from "@/lib/options";
import { isDeliveryMode, isOrderStatus } from "@/lib/orders";
import { createOrder, forgetCustomer, setOrderStatus } from "@/lib/orders-data";
import { getBaseUrl, requireBusiness } from "@/lib/panel";
import { billingOf } from "@/lib/plans-data";
import { isLimited, recordAttempt } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { isUuid, isValidSlug } from "@/lib/slug";
import { buildOrderMessage, buildWhatsAppUrl, cleanText, validateCustomer } from "@/lib/whatsapp";

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Negocio que puede recibir pedidos: existe, no está suspendido y está al día con su plan. */
async function findOpenBusiness(slug: unknown) {
  const business = typeof slug === "string" && isValidSlug(slug) ? await getBusinessBySlug(slug) : null;
  if (!business || business.isSuspended) return null;
  if (isBillingBlocked(await billingOf(business))) return null;
  return business;
}

/**
 * Registra un pedido hecho desde el menú público.
 *
 * Cualquiera puede llamarla, así que no se fía de nada de lo que recibe:
 * revisa cada campo, limita la cantidad de pedidos por visitante y calcula
 * precios, descuentos, domicilio y totales con los datos de la base.
 */
export async function submitOrderAction(slug: string, draft: OrderDraft): Promise<SubmitOrderResult> {
  const fail = (error: string, menuChanged = false, field?: "zone" | "coupon" | "privacy"): SubmitOrderResult => ({
    ok: false,
    error,
    menuChanged,
    field,
  });

  const business = await findOpenBusiness(slug);
  if (!business) return fail("Este menú no está recibiendo pedidos por ahora.");

  // Límite por visitante. Si el servidor no sabe de dónde viene la visita (sin
  // proxy que lo indique), todos compartirían el mismo cupo: en ese caso el
  // límite es por negocio y mucho más amplio, solo para frenar avalanchas.
  const address = await clientAddress();
  const known = address !== "local";
  const limitKey = known ? `pedido:${address}` : `pedido:negocio:${business.id}`;
  if (isLimited(limitKey, known ? LIMITS.ordersPerWindow : LIMITS.ordersPerWindowShared)) {
    return fail("Se están recibiendo demasiados pedidos seguidos. Espera unos minutos y vuelve a intentar.");
  }

  // La tienda pudo cerrar mientras la persona armaba su pedido.
  const openStatus = getOpenStatus(business.openMode, business.schedule, new Date(), business.timezone);
  if (!openStatus.open) {
    return fail(`${business.name} está cerrado en este momento y no recibe pedidos. ${openStatus.detail}`.trim(), true);
  }

  const rawItems = Array.isArray(draft?.items) ? draft.items : [];
  if (rawItems.length === 0) return fail("Tu pedido está vacío.");
  if (rawItems.length > LIMITS.orderLines) return fail("El pedido tiene demasiados productos distintos.");
  const maxChoices = OPTION_LIMITS.groups * OPTION_LIMITS.choices;
  const items: { productId: string; quantity: number; choiceIds: string[] }[] = [];
  for (const item of rawItems) {
    const quantity = Number(item?.quantity);
    const choiceIds: unknown[] = Array.isArray(item?.choiceIds) ? item.choiceIds : [];
    const validChoices =
      choiceIds.length <= maxChoices && choiceIds.every((id) => typeof id === "string" && /^[a-z0-9]{4,16}$/.test(id));
    if (
      !isUuid(item?.productId) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > LIMITS.maxQuantity ||
      !validChoices
    ) {
      return fail("Hay un producto con una cantidad que no es válida. Actualiza el menú y revisa tu pedido.", true);
    }
    items.push({ productId: item.productId, quantity, choiceIds: [...new Set(choiceIds as string[])] });
  }

  const raw = (draft?.customer ?? {}) as Record<string, unknown>;
  const delivery = isDeliveryMode(raw.delivery) ? raw.delivery : business.deliveryModes[0];
  // La zona se identifica por su id; el nombre que queda en el pedido sale de la base.
  const zones = delivery === "domicilio" ? await getZones(business.id) : [];
  const zone = zones.find((candidate) => candidate.id === draft?.zoneId) ?? null;
  const customer = {
    name: cleanText(text(raw.name, LIMITS.customerName)),
    phone: cleanText(text(raw.phone, 24)),
    delivery,
    // La dirección solo tiene sentido a domicilio; en el local guarda la mesa.
    address: delivery === "recoger" ? "" : cleanText(text(raw.address, LIMITS.address)),
    payment: cleanText(text(raw.payment, LIMITS.paymentMethod)),
    notes: cleanText(text(raw.notes, LIMITS.notes)),
    zone: zone?.name ?? "",
  };
  const problems = validateCustomer(customer, {
    deliveryModes: business.deliveryModes,
    paymentMethods: business.paymentMethods,
    zones: zones.map((candidate) => candidate.name),
  });
  const firstProblem = Object.values(problems)[0];
  if (firstProblem) return fail(firstProblem, false, problems.zone ? "zone" : undefined);

  // Aviso de datos: si el servicio exige la casilla, tiene que venir marcada.
  const settings = await getSettings();
  if (settings.privacyCheckbox && draft?.privacyAccepted !== true) {
    return fail("Para enviar tu pedido, acepta el tratamiento de tus datos.", false, "privacy");
  }

  recordAttempt(limitKey);
  const result = await createOrder(business, {
    items,
    customer,
    zoneId: zone?.id ?? null,
    couponCode: normalizeCode(draft?.couponCode) || undefined,
    privacyConsent: settings.privacyCheckbox ? "casilla" : "aviso",
  });
  if (!result.ok) return fail(result.message, result.menuChanged, result.field);

  const { order, totals } = result;
  const trackUrl = order.publicToken ? `${await getBaseUrl()}/p/${order.publicToken}` : undefined;
  const message = buildOrderMessage(
    business,
    order.items.map((item) => ({
      name: item.name,
      priceCents: item.unitPriceCents,
      quantity: item.quantity,
      options: optionsSummary(item.options),
    })),
    customer,
    totals,
    { number: order.number, couponCode: order.couponCode, trackUrl },
  );

  // El menú se vuelve a pintar con las existencias al día.
  revalidatePath(`/m/${business.slug}`);
  return {
    ok: true,
    receipt: {
      number: order.number,
      totalCents: order.totalCents,
      deliveryPending: totals.deliveryPending,
      message,
      whatsappUrl: buildWhatsAppUrl(business.whatsapp, message),
      trackUrl,
    },
  };
}

/**
 * Revisa un cupón antes de enviar el pedido, para mostrarle al cliente el
 * descuento. Al registrar el pedido se vuelve a revisar: esto es solo un aviso.
 */
export async function checkCouponAction(slug: string, code: string, subtotalCents: number): Promise<CheckCouponResult> {
  const business = await findOpenBusiness(slug);
  if (!business) return { ok: false, error: "Este menú no está recibiendo pedidos por ahora." };

  // Límite de intentos: los códigos no se pueden adivinar probando miles.
  const address = await clientAddress();
  const limitKey = address !== "local" ? `cupon:${address}` : `cupon:negocio:${business.id}`;
  if (isLimited(limitKey, address !== "local" ? 15 : 200)) {
    return { ok: false, error: "Demasiados intentos. Espera unos minutos y vuelve a probar." };
  }
  recordAttempt(limitKey);

  const normalized = normalizeCode(code);
  if (!normalized) return { ok: false, error: "Escribe el código del cupón." };
  const coupon = await findCoupon(business.id, normalized);
  if (!coupon) return { ok: false, error: "Ese cupón no existe. Revisa que esté bien escrito." };
  const subtotal = Number.isFinite(subtotalCents) ? Math.max(0, Math.floor(subtotalCents)) : 0;
  const problem = couponProblem(coupon, subtotal, todayKey(business.timezone), business.currency);
  if (problem) return { ok: false, error: problem };
  return {
    ok: true,
    coupon: { code: coupon.code, kind: coupon.kind, value: coupon.value, minSubtotalCents: coupon.minSubtotalCents },
  };
}

/** Cambia el estado de un pedido desde el panel del negocio. */
export async function setOrderStatusAction(formData: FormData): Promise<void> {
  const { business } = await requireBusiness();
  const id = formData.get("id");
  const status = formData.get("status");
  if (!isUuid(id) || !isOrderStatus(status)) return;
  await setOrderStatus(business.id, id, status);
  revalidatePath("/panel", "layout");
  revalidatePath(`/m/${business.slug}`);
}

/**
 * Borra los datos personales de un cliente (nombre, teléfono, dirección y
 * notas) de todos sus pedidos. Los pedidos se conservan para las cuentas.
 */
export async function forgetCustomerAction(formData: FormData): Promise<void> {
  const { business } = await requireBusiness();
  const phone = String(formData.get("phone") ?? "").replace(/\D/g, "");
  if (phone.length < 5 || phone.length > 20) return;
  await forgetCustomer(business.id, phone);
  revalidatePath("/panel", "layout");
  redirect("/panel/clientes?borrado=1");
}
