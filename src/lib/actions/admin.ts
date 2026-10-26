"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { deleteBusinessAccount, setSuspended } from "@/lib/admin-data";
import { DEFAULT_CURRENCY, DEFAULT_PAYMENT_METHODS, LIMITS } from "@/lib/config";
import { createAccount, findUserByEmail, getBusinessById, getBusinessByOwner, isUniqueViolation, setPassword } from "@/lib/data";
import { isEmail, readText, type FormState } from "@/lib/form";
import { hashPassword, passwordProblem } from "@/lib/password";
import { joinWhatsapp, whatsappProblem } from "@/lib/phone";
import { isUuid } from "@/lib/slug";

/**
 * Acciones de la administración del servicio. Todas empiezan por
 * requireAdmin(): quien no es administrador no puede ejecutarlas aunque
 * conozca su dirección.
 */

/** Crea la cuenta de un comercio desde la administración (por ejemplo, con el registro público cerrado). */
export async function adminCreateBusinessAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const businessName = readText(formData, "businessName", LIMITS.businessName);
  const email = readText(formData, "email", 254).toLowerCase();
  const countryCode = readText(formData, "countryCode", 4);
  const phone = readText(formData, "phone", 24);
  const password = String(formData.get("password") ?? "");
  const whatsapp = joinWhatsapp(countryCode, phone);
  const values = { businessName, email, countryCode, phone };

  const errors: Record<string, string> = {};
  if (businessName.length < 2) errors.businessName = "Escribe el nombre del negocio.";
  if (!isEmail(email)) errors.email = "Escribe un correo válido, por ejemplo nombre@correo.com.";
  // El WhatsApp es opcional aquí: el comercio puede ponerlo después en su panel.
  if (whatsapp && whatsappProblem(whatsapp)) errors.phone = whatsappProblem(whatsapp) as string;
  const passwordError = passwordProblem(password);
  if (passwordError) errors.password = passwordError;
  if (Object.keys(errors).length > 0) return { errors, values };

  const emailTaken: FormState = { errors: { email: "Ya existe una cuenta con ese correo." }, values };
  if (await findUserByEmail(email)) return emailTaken;

  let userId: string;
  try {
    userId = await createAccount({
      email,
      passwordHash: await hashPassword(password),
      businessName,
      whatsapp,
      currency: DEFAULT_CURRENCY,
      paymentMethods: DEFAULT_PAYMENT_METHODS,
    });
  } catch (error) {
    if (isUniqueViolation(error)) return emailTaken;
    throw error;
  }

  const business = await getBusinessByOwner(userId);
  revalidatePath("/admin", "layout");
  redirect(business ? `/admin/comercios/${business.id}` : "/admin");
}

/** Suspende o reactiva un comercio. Suspendido, su menú deja de mostrarse y no recibe pedidos. */
export async function adminSuspendAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id");
  if (!isUuid(id)) return;
  const business = await getBusinessById(id);
  if (!business) return;
  await setSuspended(business.id, formData.get("suspended") === "1");
  revalidatePath("/admin", "layout");
  revalidatePath(`/m/${business.slug}`);
}

/** Pone una contraseña nueva a la cuenta de un comercio (para cuando la olvida) y cierra sus sesiones. */
export async function adminSetPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = formData.get("id");
  const password = String(formData.get("password") ?? "");
  if (!isUuid(id)) return { message: "No se encontró el comercio." };
  const passwordError = passwordProblem(password);
  if (passwordError) return { errors: { password: passwordError } };
  const business = await getBusinessById(id);
  if (!business) return { message: "No se encontró el comercio." };
  await setPassword(business.ownerId, await hashPassword(password));
  return { ok: true, message: "Contraseña cambiada. Entrégasela al comercio; sus sesiones abiertas se cerraron." };
}

/** Elimina un comercio con todos sus datos. No se puede deshacer. */
export async function adminDeleteBusinessAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = formData.get("id");
  if (!isUuid(id)) return;
  const business = await getBusinessById(id);
  // Nadie puede borrar su propia cuenta desde aquí: se quedaría sin acceso.
  if (!business || business.ownerId === admin.id) return;
  await deleteBusinessAccount(business.id);
  revalidatePath("/admin", "layout");
  revalidatePath(`/m/${business.slug}`);
  redirect("/admin");
}
