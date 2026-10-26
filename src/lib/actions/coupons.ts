"use server";

import { revalidatePath } from "next/cache";
import { LIMITS } from "@/lib/config";
import { isCouponKind, normalizeCode } from "@/lib/coupons";
import { createCoupon, deleteCoupon, listCoupons, setCouponActive } from "@/lib/coupons-data";
import { isUniqueViolation, type Business } from "@/lib/data";
import { isDayKey, todayKey } from "@/lib/dates";
import { readText, type FormState } from "@/lib/form";
import { parsePriceToCents } from "@/lib/money";
import { requireBusiness } from "@/lib/panel";
import { isUuid } from "@/lib/slug";

function refresh(business: Business) {
  revalidatePath("/panel", "layout");
  revalidatePath(`/m/${business.slug}`);
}

export async function createCouponAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness();

  const codeText = readText(formData, "code", 40);
  const kind = formData.get("kind");
  const valueText = readText(formData, "value", 20);
  const minText = readText(formData, "minSubtotal", 20);
  const endsOn = readText(formData, "endsOn", 10);
  const maxUsesText = readText(formData, "maxUses", 8);
  const values = {
    code: codeText,
    kind: typeof kind === "string" ? kind : "",
    value: valueText,
    minSubtotal: minText,
    endsOn,
    maxUses: maxUsesText,
  };

  const errors: Record<string, string> = {};
  const code = normalizeCode(codeText);
  if (code.length < 3) errors.code = "Escribe un código de al menos 3 letras o números, por ejemplo BIENVENIDO10.";

  let value = 0;
  if (!isCouponKind(kind)) {
    errors.kind = "Elige qué hace el cupón.";
  } else if (kind === "percent") {
    value = Number(valueText.replace("%", "").trim());
    if (!Number.isInteger(value) || value < 1 || value > 100) errors.value = "Escribe un porcentaje entre 1 y 100.";
  } else if (kind === "amount") {
    const cents = parsePriceToCents(valueText);
    if (cents === null || cents <= 0) errors.value = "Escribe el valor del descuento, solo con números.";
    else value = cents;
  }

  const minSubtotalCents = minText === "" ? 0 : parsePriceToCents(minText);
  if (minSubtotalCents === null) errors.minSubtotal = "No entendimos ese valor. Escríbelo solo con números.";
  if (endsOn !== "" && !isDayKey(endsOn)) errors.endsOn = "Elige una fecha válida.";
  else if (endsOn !== "" && endsOn < todayKey(business.timezone)) errors.endsOn = "Esa fecha ya pasó.";
  const maxUses = maxUsesText === "" ? null : Number(maxUsesText);
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1_000_000)) {
    errors.maxUses = "Escribe cuántas veces se puede usar (un número entero), o déjalo vacío.";
  }
  if (Object.keys(errors).length > 0 || !isCouponKind(kind) || minSubtotalCents === null) return { errors, values };

  const existing = await listCoupons(business.id);
  if (existing.some((coupon) => coupon.code === code)) {
    return { errors: { code: "Ya tienes un cupón con ese código." }, values };
  }
  if (existing.length >= LIMITS.maxCoupons) {
    return { message: `Llegaste al máximo de ${LIMITS.maxCoupons} cupones. Elimina alguno que ya no uses.`, values };
  }

  try {
    await createCoupon(business.id, { code, kind, value, minSubtotalCents, endsOn: endsOn || null, maxUses });
  } catch (error) {
    if (isUniqueViolation(error)) return { errors: { code: "Ya tienes un cupón con ese código." }, values };
    throw error;
  }
  refresh(business);
  return { ok: true, message: `Cupón ${code} creado. Ya se puede usar en tu menú.` };
}

/** Pausa o reactiva un cupón. */
export async function toggleCouponAction(formData: FormData): Promise<void> {
  const { business } = await requireBusiness();
  const id = formData.get("id");
  if (!isUuid(id)) return;
  await setCouponActive(business.id, id, formData.get("active") === "1");
  refresh(business);
}

export async function deleteCouponAction(formData: FormData): Promise<void> {
  const { business } = await requireBusiness();
  const id = formData.get("id");
  if (!isUuid(id)) return;
  await deleteCoupon(business.id, id);
  refresh(business);
}
