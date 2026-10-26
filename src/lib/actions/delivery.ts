"use server";

import { revalidatePath } from "next/cache";
import { LIMITS } from "@/lib/config";
import { addZone, deleteZone, getZones, updateDelivery, updateZone, type Business } from "@/lib/data";
import { readText, type FormState } from "@/lib/form";
import { parsePriceToCents } from "@/lib/money";
import { DELIVERY_MODES } from "@/lib/orders";
import { requireBusiness } from "@/lib/panel";
import { isUuid } from "@/lib/slug";

/** Después de cada cambio se refrescan el panel y el menú público. */
function refresh(business: Business) {
  revalidatePath("/panel", "layout");
  revalidatePath(`/m/${business.slug}`);
}

/** Formas de entrega, costo fijo de domicilio, domicilio gratis desde un valor y pedido mínimo. */
export async function saveDeliveryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness();

  const deliveryModes = DELIVERY_MODES.map((mode) => mode.value).filter((value) =>
    formData.getAll("deliveryModes").includes(value),
  );
  const deliveryFeeText = readText(formData, "deliveryFee", 20);
  const freeFromText = readText(formData, "freeFrom", 20);
  const minOrderText = readText(formData, "minOrder", 20);
  const values = {
    deliveryModes: deliveryModes.join(","),
    deliveryFee: deliveryFeeText,
    freeFrom: freeFromText,
    minOrder: minOrderText,
  };

  const errors: Record<string, string> = {};
  if (deliveryModes.length === 0) errors.deliveryModes = "Marca al menos una forma de entrega.";
  // Vacío equivale a cero: sin costo fijo, sin domicilio gratis y sin pedido mínimo.
  const amount = (text: string, field: string) => {
    const cents = text === "" ? 0 : parsePriceToCents(text);
    if (cents === null) errors[field] = "No entendimos ese valor. Escríbelo solo con números.";
    return cents ?? 0;
  };
  const deliveryFeeCents = amount(deliveryFeeText, "deliveryFee");
  const freeDeliveryFromCents = amount(freeFromText, "freeFrom");
  const minOrderCents = amount(minOrderText, "minOrder");
  if (Object.keys(errors).length > 0) return { errors, values };

  await updateDelivery(business.id, { deliveryModes, deliveryFeeCents, minOrderCents, freeDeliveryFromCents });
  refresh(business);
  return { ok: true, message: "Cambios guardados." };
}

/** Lee y revisa el nombre y el precio de una zona. */
async function readZone(businessId: string, formData: FormData, exceptId?: string) {
  const name = readText(formData, "name", LIMITS.zoneName);
  const feeText = readText(formData, "fee", 20);
  const values = { name, fee: feeText };
  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Escribe el nombre de la zona o barrio.";
  // Vacío o cero: a esa zona el domicilio es gratis.
  const feeCents = feeText === "" ? 0 : parsePriceToCents(feeText);
  if (feeCents === null) errors.fee = "No entendimos ese precio. Escríbelo solo con números.";

  const zones = await getZones(businessId);
  if (!errors.name && zones.some((zone) => zone.id !== exceptId && zone.name.toLowerCase() === name.toLowerCase())) {
    errors.name = "Ya tienes una zona con ese nombre.";
  }
  return { name, feeCents: feeCents ?? 0, values, errors, count: zones.length };
}

export async function addZoneAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness();
  const zone = await readZone(business.id, formData);
  if (Object.keys(zone.errors).length > 0) return { errors: zone.errors, values: zone.values };
  if (zone.count >= LIMITS.maxZones) {
    return { message: `Llegaste al máximo de ${LIMITS.maxZones} zonas.`, values: zone.values };
  }
  await addZone(business.id, zone.name, zone.feeCents);
  refresh(business);
  return { ok: true, message: `Zona “${zone.name}” añadida.` };
}

export async function updateZoneAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness();
  const id = formData.get("id");
  if (!isUuid(id)) return { message: "No se encontró la zona." };
  const zone = await readZone(business.id, formData, id);
  if (Object.keys(zone.errors).length > 0) return { errors: zone.errors, values: zone.values };
  await updateZone(business.id, id, zone.name, zone.feeCents);
  refresh(business);
  return { ok: true, message: "Zona actualizada." };
}

export async function deleteZoneAction(formData: FormData): Promise<void> {
  const { business } = await requireBusiness();
  const id = formData.get("id");
  if (!isUuid(id)) return;
  await deleteZone(business.id, id);
  refresh(business);
}
