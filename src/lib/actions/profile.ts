"use server";

import { revalidatePath } from "next/cache";
import { CURRENCIES, LIMITS } from "@/lib/config";
import { deleteImage, insertImage, isSlugTaken, isUniqueViolation, setBusinessLogo, updateBusiness } from "@/lib/data";
import { isTimezone } from "@/lib/dates";
import { readMultiline, readText, type FormState } from "@/lib/form";
import { readImageUpload } from "@/lib/images";
import { requireBusiness } from "@/lib/panel";
import { joinWhatsapp, whatsappProblem } from "@/lib/phone";
import { isValidSlug } from "@/lib/slug";

export async function saveProfileAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness();

  const name = readText(formData, "name", LIMITS.businessName);
  const slug = readText(formData, "slug", 40).toLowerCase();
  const countryCode = readText(formData, "countryCode", 4);
  const phone = readText(formData, "phone", 24);
  const currency = readText(formData, "currency", 3).toUpperCase();
  const paymentText = readMultiline(formData, "paymentMethods", 400);
  const removeLogo = formData.get("removeLogo") === "1";
  const whatsapp = joinWhatsapp(countryCode, phone);
  const timezone = readText(formData, "timezone", 40);
  const values = { name, slug, countryCode, phone, currency, paymentMethods: paymentText, timezone };

  const paymentMethods = [
    ...new Set(
      paymentText
        .split("\n")
        .map((method) => method.replace(/\s+/g, " ").trim().slice(0, LIMITS.paymentMethod))
        .filter(Boolean),
    ),
  ];

  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Escribe el nombre de tu negocio.";
  if (!isValidSlug(slug)) {
    errors.slug = "Usa de 3 a 40 caracteres: solo letras minúsculas, números y guiones.";
  } else if (slug !== business.slug && (await isSlugTaken(slug, business.id))) {
    errors.slug = "Ese enlace ya lo usa otro negocio. Prueba con otro.";
  }
  const phoneProblem = whatsapp ? whatsappProblem(whatsapp) : null;
  if (phoneProblem) errors.phone = phoneProblem;
  if (!CURRENCIES.some((item) => item.code === currency)) errors.currency = "Elige una moneda de la lista.";
  if (paymentMethods.length === 0) errors.paymentMethods = "Escribe al menos una forma de pago.";
  if (paymentMethods.length > LIMITS.paymentMethods) {
    errors.paymentMethods = `Deja máximo ${LIMITS.paymentMethods} formas de pago.`;
  }
  if (!isTimezone(timezone)) errors.timezone = "Elige una zona horaria de la lista.";

  const upload = await readImageUpload(formData.get("image"));
  if (upload.kind === "error") errors.image = upload.message;
  if (Object.keys(errors).length > 0) return { errors, values };

  try {
    await updateBusiness(business.id, { name, slug, whatsapp, currency, paymentMethods, timezone });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { errors: { slug: "Ese enlace ya lo usa otro negocio. Prueba con otro." }, values };
    }
    throw error;
  }

  if (upload.kind === "image") {
    const imageId = await insertImage(business.id, upload.mime, upload.bytes);
    await setBusinessLogo(business.id, imageId);
    await deleteImage(business.id, business.logoImageId);
  } else if (removeLogo && business.logoImageId) {
    await setBusinessLogo(business.id, null);
    await deleteImage(business.id, business.logoImageId);
  }

  revalidatePath("/panel", "layout");
  revalidatePath(`/m/${business.slug}`);
  if (slug !== business.slug) revalidatePath(`/m/${slug}`);
  return { ok: true, message: "Cambios guardados." };
}
