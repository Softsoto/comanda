"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BANNER_TITLE_MAX, getBannerSlot, isBannerSlot } from "@/lib/banners";
import { addBanner, deleteBanner, getBanners, insertImage, setOpenMode, setSchedule, type Business } from "@/lib/data";
import { readText, type FormState } from "@/lib/form";
import { hasAnyHours, isOpenMode, validateSchedule } from "@/lib/hours";
import { readImageUpload } from "@/lib/images";
import { requireBusiness } from "@/lib/panel";
import { isUuid } from "@/lib/slug";

/** Después de cada cambio se refrescan el panel y el menú público. */
function refresh(business: Business) {
  revalidatePath("/panel", "layout");
  revalidatePath(`/m/${business.slug}`);
}

/* ---------- Abierto, cerrado o según horario ---------- */

export async function setOpenModeAction(formData: FormData): Promise<void> {
  const { business } = await requireBusiness();
  const mode = formData.get("mode");
  if (!isOpenMode(mode)) return;
  await setOpenMode(business.id, mode);
  refresh(business);
  // "Según horario" sin horario dejaría la tienda cerrada: se lleva a definirlo.
  if (mode === "horario" && !hasAnyHours(business.schedule)) redirect("/panel/horarios");
}

export async function saveScheduleAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness();
  const text = formData.get("schedule");
  let raw: unknown = null;
  if (typeof text === "string" && text.length <= 4000) {
    try {
      raw = JSON.parse(text);
    } catch {
      raw = null;
    }
  }
  if (!Array.isArray(raw)) {
    return { message: "No se pudo leer el horario. Recarga la página y vuelve a intentar." };
  }

  const check = validateSchedule(raw);
  if (!check.ok) {
    return {
      message: "Hay horas por corregir. Revisa los días marcados.",
      errors: Object.fromEntries(Object.entries(check.errors).map(([day, message]) => [`day${day}`, message])),
    };
  }

  await setSchedule(business.id, check.schedule);
  refresh(business);
  return { ok: true, message: "Horario guardado." };
}

/* ---------- Publicidad ---------- */

export async function addBannerAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness();
  const slotValue = formData.get("slot");
  if (!isBannerSlot(slotValue)) return { message: "No se reconoció el espacio de publicidad. Recarga la página." };
  const slot = getBannerSlot(slotValue);
  const title = readText(formData, "title", BANNER_TITLE_MAX);

  const current = (await getBanners(business.id)).filter((banner) => banner.slot === slot.value);
  if (current.length >= slot.max) {
    return { message: `Este espacio admite máximo ${slot.max} imágenes. Quita una para subir otra.` };
  }

  const upload = await readImageUpload(formData.get("image"));
  if (upload.kind === "none") return { message: "Elige una imagen para subir." };
  if (upload.kind === "error") return { message: upload.message };

  const imageId = await insertImage(business.id, upload.mime, upload.bytes);
  await addBanner(business.id, slot.value, imageId, title);
  refresh(business);
  return { ok: true, message: "Imagen añadida. Ya se ve en tu menú." };
}

export async function deleteBannerAction(formData: FormData): Promise<void> {
  const { business } = await requireBusiness();
  const id = formData.get("id");
  if (!isUuid(id)) return;
  await deleteBanner(business.id, id);
  refresh(business);
}
