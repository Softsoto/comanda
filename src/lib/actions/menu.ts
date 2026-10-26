"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LIMITS } from "@/lib/config";
import {
  categoryBelongsTo,
  countMenu,
  createCategory,
  createProduct,
  deleteCategory,
  deleteImage,
  deleteProduct,
  getProduct,
  insertImage,
  moveItem,
  renameCategory,
  setProductAvailability,
  setProductImage,
  updateProduct,
  type Business,
} from "@/lib/data";
import { readMultiline, readText, type FormState } from "@/lib/form";
import { readImageUpload } from "@/lib/images";
import { parsePriceToCents } from "@/lib/money";
import { validateOptionDrafts } from "@/lib/options";
import { requireBusiness } from "@/lib/panel";
import { getPlan } from "@/lib/plans-data";
import { isUuid } from "@/lib/slug";

/** Después de cada cambio se refrescan el panel y el menú público. */
function refresh(business: Business) {
  revalidatePath("/panel", "layout");
  revalidatePath(`/m/${business.slug}`);
}

/* ---------- Categorías ---------- */

export async function createCategoryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness();
  const name = readText(formData, "name", LIMITS.categoryName);
  if (name.length < 2) return { errors: { name: "Escribe el nombre de la categoría." }, values: { name } };
  if ((await countMenu(business.id)).categories >= LIMITS.maxCategories) {
    return { errors: { name: `Llegaste al máximo de ${LIMITS.maxCategories} categorías.` }, values: { name } };
  }
  await createCategory(business.id, name);
  refresh(business);
  return { ok: true, message: `Categoría "${name}" creada.` };
}

export async function renameCategoryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness();
  const id = formData.get("id");
  const name = readText(formData, "name", LIMITS.categoryName);
  if (!isUuid(id)) return { message: "No se encontró la categoría." };
  if (name.length < 2) return { errors: { name: "Escribe el nombre de la categoría." }, values: { name } };
  await renameCategory(business.id, id, name);
  refresh(business);
  return { ok: true, message: "Nombre actualizado." };
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const { business } = await requireBusiness();
  const id = formData.get("id");
  if (!isUuid(id)) return;
  await deleteCategory(business.id, id);
  refresh(business);
}

export async function moveAction(formData: FormData): Promise<void> {
  const { business } = await requireBusiness();
  const id = formData.get("id");
  const kind = formData.get("kind");
  const direction = formData.get("direction");
  if (!isUuid(id)) return;
  if (kind !== "category" && kind !== "product" && kind !== "banner" && kind !== "zone") return;
  if (direction !== "up" && direction !== "down") return;
  await moveItem(business.id, kind, id, direction);
  refresh(business);
}

/* ---------- Productos ---------- */

export async function saveProductAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness();

  const id = formData.get("id");
  const name = readText(formData, "name", LIMITS.productName);
  const description = readMultiline(formData, "description", LIMITS.productDescription).replace(/\s*\n\s*/g, " ");
  const priceText = readText(formData, "price", 20);
  const categoryId = String(formData.get("categoryId") ?? "");
  const costText = readText(formData, "cost", 20);
  const stockText = readText(formData, "stock", 10);
  const isAvailable = formData.get("isAvailable") === "on";
  const removeImage = formData.get("removeImage") === "1";
  const values = {
    name,
    description,
    price: priceText,
    cost: costText,
    stock: stockText,
    categoryId,
    isAvailable: isAvailable ? "on" : "",
  };

  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Escribe el nombre del producto.";
  const priceCents = parsePriceToCents(priceText);
  if (priceText === "") errors.price = "Escribe el precio.";
  else if (priceCents === null) errors.price = "No entendimos ese precio. Escríbelo solo con números, por ejemplo 18000.";
  // Costo y existencias son opcionales: vacío significa "no lo registro".
  const costCents = costText === "" ? null : parsePriceToCents(costText);
  if (costText !== "" && costCents === null) {
    errors.cost = "No entendimos ese costo. Escríbelo solo con números, o déjalo vacío.";
  }
  const stock = stockText === "" ? null : Number(stockText);
  if (stock !== null && (!/^\d+$/.test(stockText) || stock > LIMITS.maxStock)) {
    errors.stock = "Escribe cuántas unidades tienes (un número entero), o déjalo vacío.";
  }
  if (!isUuid(categoryId) || !(await categoryBelongsTo(business.id, categoryId))) {
    errors.categoryId = "Elige una categoría.";
  }
  // Opciones (tamaños, adicionales): llegan como texto JSON desde el editor del formulario.
  const optionsText = formData.get("options");
  let optionsRaw: unknown = [];
  if (typeof optionsText === "string" && optionsText !== "") {
    try {
      optionsRaw = optionsText.length <= 60_000 ? JSON.parse(optionsText) : null;
    } catch {
      optionsRaw = null;
    }
  }
  const options = validateOptionDrafts(optionsRaw, parsePriceToCents, () => randomBytes(4).toString("hex"));
  if (!options.ok) errors.options = options.message;

  const upload = await readImageUpload(formData.get("image"));
  if (upload.kind === "error") errors.image = upload.message;
  if (Object.keys(errors).length > 0 || priceCents === null || !options.ok) {
    return { errors, values, message: errors.options ? "Revisa las opciones del producto." : undefined };
  }

  const input = { categoryId, name, description, priceCents, isAvailable, costCents, stock, options: options.groups };

  if (isUuid(id)) {
    const existing = await getProduct(business.id, id);
    if (!existing) return { message: "Ese producto ya no existe.", values };
    await updateProduct(business.id, id, input);
    if (upload.kind === "image") {
      const imageId = await insertImage(business.id, upload.mime, upload.bytes);
      await setProductImage(business.id, id, imageId);
      await deleteImage(business.id, existing.imageId);
    } else if (removeImage && existing.imageId) {
      await setProductImage(business.id, id, null);
      await deleteImage(business.id, existing.imageId);
    }
  } else {
    const { products } = await countMenu(business.id);
    if (products >= LIMITS.maxProducts) {
      return { message: `Llegaste al máximo de ${LIMITS.maxProducts} productos.`, values };
    }
    // Tope de productos del plan contratado, si el servicio lo usa.
    const plan = await getPlan(business.planId);
    if (plan?.maxProducts !== null && plan?.maxProducts !== undefined && products >= plan.maxProducts) {
      return {
        message: `Tu plan (${plan.name}) permite hasta ${plan.maxProducts} ${plan.maxProducts === 1 ? "producto" : "productos"}. Para tener más, pide al administrador del servicio un plan mayor.`,
        values,
      };
    }
    const imageId = upload.kind === "image" ? await insertImage(business.id, upload.mime, upload.bytes) : null;
    await createProduct(business.id, input, imageId);
  }

  refresh(business);
  redirect("/panel/menu");
}

export async function toggleProductAction(formData: FormData): Promise<void> {
  const { business } = await requireBusiness();
  const id = formData.get("id");
  if (!isUuid(id)) return;
  await setProductAvailability(business.id, id, formData.get("available") === "1");
  refresh(business);
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const { business } = await requireBusiness();
  const id = formData.get("id");
  if (!isUuid(id)) return;
  await deleteProduct(business.id, id);
  refresh(business);
  redirect("/panel/menu");
}
