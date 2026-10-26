"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { PAYMENT_MONTHS } from "@/lib/billing";
import { CURRENCIES, LIMITS } from "@/lib/config";
import { getBusinessById } from "@/lib/data";
import { isDayKey, todayKey } from "@/lib/dates";
import { readMultiline, readText, type FormState } from "@/lib/form";
import { parsePriceToCents } from "@/lib/money";
import { joinWhatsapp, whatsappProblem } from "@/lib/phone";
import {
  createPlan,
  deletePayment,
  deletePlan,
  getPlan,
  registerPayment,
  setBusinessPlan,
  setDefaultPlan,
  updatePlan,
} from "@/lib/plans-data";
import { PRIVACY_TEXT_MAX } from "@/lib/privacy";
import { getSettings, saveSettings } from "@/lib/settings";
import { isUuid } from "@/lib/slug";

/**
 * Acciones de cobro de la administración del servicio: planes, pagos y
 * ajustes. Todas empiezan por requireAdmin().
 */

/* ---------- Planes ---------- */

export async function savePlanAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = formData.get("id");
  const name = readText(formData, "name", LIMITS.planName);
  const priceText = readText(formData, "price", 20);
  const maxText = readText(formData, "maxProducts", 6);
  const values = { name, price: priceText, maxProducts: maxText };

  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Escribe el nombre del plan.";
  // Un plan puede ser gratis: vacío o cero.
  const priceCents = priceText === "" ? 0 : parsePriceToCents(priceText);
  if (priceCents === null) errors.price = "No entendimos ese precio. Escríbelo solo con números.";
  const maxProducts = maxText === "" ? null : Number(maxText);
  if (maxProducts !== null && (!Number.isInteger(maxProducts) || maxProducts < 1 || maxProducts > LIMITS.maxProducts)) {
    errors.maxProducts = `Escribe un número entre 1 y ${LIMITS.maxProducts}, o déjalo vacío para no poner límite.`;
  }
  if (Object.keys(errors).length > 0 || priceCents === null) return { errors, values };

  if (isUuid(id)) await updatePlan(id, { name, priceCents, maxProducts });
  else await createPlan({ name, priceCents, maxProducts });
  revalidatePath("/admin", "layout");
  revalidatePath("/panel", "layout");
  return { ok: true, message: isUuid(id) ? "Plan actualizado." : `Plan “${name}” creado.` };
}

export async function deletePlanAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id");
  if (!isUuid(id)) return;
  await deletePlan(id);
  revalidatePath("/admin", "layout");
  revalidatePath("/panel", "layout");
}

/** Marca el plan que reciben los comercios nuevos, o ninguno. */
export async function setDefaultPlanAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id");
  await setDefaultPlan(isUuid(id) ? id : null);
  revalidatePath("/admin", "layout");
}

/* ---------- Plan y vencimiento de un comercio ---------- */

export async function setBusinessPlanAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const businessId = formData.get("businessId");
  const planId = formData.get("planId");
  const paidUntil = readText(formData, "paidUntil", 10);
  if (!isUuid(businessId)) return { message: "No se encontró el comercio." };
  const business = await getBusinessById(businessId);
  if (!business) return { message: "No se encontró el comercio." };
  if (paidUntil !== "" && !isDayKey(paidUntil)) return { errors: { paidUntil: "Elige una fecha válida, o déjala vacía." } };
  const plan = isUuid(planId) ? await getPlan(planId) : null;

  await setBusinessPlan(business.id, plan?.id ?? null, paidUntil || null);
  revalidatePath("/admin", "layout");
  revalidatePath("/panel", "layout");
  revalidatePath(`/m/${business.slug}`);
  return { ok: true, message: "Plan y vencimiento guardados." };
}

/* ---------- Pagos ---------- */

export async function registerPaymentAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const businessId = formData.get("businessId");
  const amountText = readText(formData, "amount", 20);
  const months = Number(formData.get("months"));
  const method = readText(formData, "method", LIMITS.paymentMethod);
  const note = readText(formData, "note", LIMITS.paymentNote);
  const values = { amount: amountText, months: String(months), method, note };
  if (!isUuid(businessId)) return { message: "No se encontró el comercio." };
  const business = await getBusinessById(businessId);
  if (!business) return { message: "No se encontró el comercio." };

  const errors: Record<string, string> = {};
  const amountCents = parsePriceToCents(amountText);
  if (amountCents === null) errors.amount = "Escribe cuánto pagó, solo con números.";
  if (!PAYMENT_MONTHS.includes(months)) errors.months = "Elige cuántos meses paga.";
  if (Object.keys(errors).length > 0 || amountCents === null) return { errors, values };

  const settings = await getSettings();
  const period = await registerPayment(business.id, {
    amountCents,
    currency: settings.serviceCurrency,
    months,
    paidOn: todayKey(business.timezone),
    method,
    note,
  });
  if (!period) return { message: "No se encontró el comercio." };
  revalidatePath("/admin", "layout");
  revalidatePath("/panel", "layout");
  revalidatePath(`/m/${business.slug}`);
  return { ok: true, message: "Pago registrado. El vencimiento del comercio se extendió." };
}

export async function deletePaymentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id");
  if (!isUuid(id)) return;
  await deletePayment(id);
  revalidatePath("/admin", "layout");
}

/* ---------- Ajustes del servicio ---------- */

export async function saveBillingSettingsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const trialText = readText(formData, "trialDays", 4);
  const graceText = readText(formData, "graceDays", 3);
  const currency = readText(formData, "serviceCurrency", 3).toUpperCase();
  const countryCode = readText(formData, "countryCode", 4);
  const phone = readText(formData, "phone", 24);
  const values = { trialDays: trialText, graceDays: graceText, serviceCurrency: currency, countryCode, phone };

  const errors: Record<string, string> = {};
  const trialDays = Number(trialText === "" ? "0" : trialText);
  if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) errors.trialDays = "Escribe un número de días entre 0 y 365.";
  const graceDays = Number(graceText === "" ? "0" : graceText);
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 60) errors.graceDays = "Escribe un número de días entre 0 y 60.";
  if (!CURRENCIES.some((item) => item.code === currency)) errors.serviceCurrency = "Elige una moneda de la lista.";
  const supportWhatsapp = phone ? joinWhatsapp(countryCode, phone) : "";
  const phoneProblem = supportWhatsapp ? whatsappProblem(supportWhatsapp) : null;
  if (phoneProblem) errors.phone = phoneProblem;
  if (Object.keys(errors).length > 0) return { errors, values };

  await saveSettings({ trialDays, graceDays, serviceCurrency: currency, supportWhatsapp });
  revalidatePath("/admin", "layout");
  revalidatePath("/panel", "layout");
  return { ok: true, message: "Ajustes guardados." };
}

export async function savePrivacySettingsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const privacyText = readMultiline(formData, "privacyText", PRIVACY_TEXT_MAX);
  const privacyCheckbox = formData.get("privacyCheckbox") === "on";
  await saveSettings({ privacyText, privacyCheckbox });
  // El aviso se ve en el menú de todos los comercios.
  revalidatePath("/", "layout");
  return { ok: true, message: "Aviso guardado. Ya se ve en los menús." };
}
