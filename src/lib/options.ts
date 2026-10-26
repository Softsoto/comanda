/**
 * Opciones de un producto: tamaños, adicionales, extras.
 *
 * Un producto puede tener varios grupos ("Tamaño", "Adiciones"). Cada grupo
 * dice cuántas opciones se pueden elegir (mínimo y máximo) y cada opción
 * suma su precio al del producto. En la base de datos se guardan como texto
 * JSON dentro del propio producto.
 */

export type OptionChoice = {
  id: string;
  name: string;
  /** Lo que suma al precio del producto; 0 si no lo cambia. */
  priceCents: number;
  /** Lo que le cuesta al negocio (opcional; vacío cuenta como 0). Nunca se envía al menú público. */
  costCents: number | null;
  available: boolean;
};

export type OptionGroup = {
  id: string;
  name: string;
  /** Cuántas opciones hay que elegir como mínimo (0 = el grupo es opcional). */
  min: number;
  /** Cuántas se pueden elegir como máximo. */
  max: number;
  choices: OptionChoice[];
};

/** Opción elegida, como queda guardada en el pedido. */
export type ChosenOption = { group: string; name: string; priceCents: number };

export const OPTION_LIMITS = { groups: 8, choices: 20, name: 40 };

const isId = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9]{4,16}$/.test(value);
const cleanName = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, OPTION_LIMITS.name) : "";
const wholeNumber = (value: unknown, fallback: number) =>
  Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;

/** Lee las opciones guardadas. Lo que no entienda lo descarta, sin fallar. */
export function parseOptions(text: string | null | undefined): OptionGroup[] {
  if (!text) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const groups: OptionGroup[] = [];
  for (const item of raw.slice(0, OPTION_LIMITS.groups)) {
    const group = item as Partial<OptionGroup> | null;
    if (!group || !isId(group.id) || !Array.isArray(group.choices)) continue;
    const choices: OptionChoice[] = [];
    for (const entry of group.choices.slice(0, OPTION_LIMITS.choices)) {
      const choice = entry as Partial<OptionChoice> | null;
      if (!choice || !isId(choice.id) || !cleanName(choice.name)) continue;
      choices.push({
        id: choice.id,
        name: cleanName(choice.name),
        priceCents: wholeNumber(choice.priceCents, 0),
        costCents: choice.costCents === null || choice.costCents === undefined ? null : wholeNumber(choice.costCents, 0),
        available: choice.available !== false,
      });
    }
    if (!cleanName(group.name) || choices.length === 0) continue;
    const max = Math.min(Math.max(1, wholeNumber(group.max, 1)), choices.length);
    groups.push({ id: group.id, name: cleanName(group.name), min: Math.min(wholeNumber(group.min, 0), max), max, choices });
  }
  return groups;
}

export const serializeOptions = (groups: OptionGroup[]) => (groups.length === 0 ? "" : JSON.stringify(groups));

/** Lo que llega del formulario del panel: precios y costos todavía como texto. */
export type OptionGroupDraft = {
  id?: string;
  name?: string;
  min?: number;
  max?: number;
  choices?: { id?: string; name?: string; price?: string; cost?: string; available?: boolean }[];
};

export type OptionsCheck = { ok: true; groups: OptionGroup[] } | { ok: false; message: string };

/**
 * Revisa las opciones que el dueño escribió en el formulario del producto.
 * - parsePrice convierte "3.000" en centavos (o null si no se entiende).
 * - newId genera un identificador para los grupos y opciones nuevos.
 */
export function validateOptionDrafts(
  raw: unknown,
  parsePrice: (text: string) => number | null,
  newId: () => string,
): OptionsCheck {
  if (raw === null || raw === undefined || raw === "") return { ok: true, groups: [] };
  if (!Array.isArray(raw)) return { ok: false, message: "No se pudieron leer las opciones. Recarga la página y vuelve a intentar." };
  if (raw.length > OPTION_LIMITS.groups) {
    return { ok: false, message: `Un producto puede tener máximo ${OPTION_LIMITS.groups} grupos de opciones.` };
  }

  const used = new Set<string>();
  const idFor = (candidate: unknown) => {
    let id = isId(candidate) && !used.has(candidate) ? candidate : newId();
    while (used.has(id)) id = newId();
    used.add(id);
    return id;
  };

  const groups: OptionGroup[] = [];
  for (const item of raw as OptionGroupDraft[]) {
    const name = cleanName(item?.name);
    const rows = Array.isArray(item?.choices) ? item.choices : [];
    // Un grupo vacío del todo (sin nombre y sin opciones escritas) se ignora.
    const written = rows.filter((row) => cleanName(row?.name) !== "");
    if (!name && written.length === 0) continue;
    if (!name) return { ok: false, message: "Ponle nombre a cada grupo de opciones (por ejemplo, “Tamaño”)." };
    if (written.length === 0) return { ok: false, message: `Añade al menos una opción al grupo “${name}”.` };
    if (written.length > OPTION_LIMITS.choices) {
      return { ok: false, message: `El grupo “${name}” puede tener máximo ${OPTION_LIMITS.choices} opciones.` };
    }

    const choices: OptionChoice[] = [];
    const names = new Set<string>();
    for (const row of written) {
      const choiceName = cleanName(row.name);
      if (names.has(choiceName.toLowerCase())) {
        return { ok: false, message: `En “${name}” la opción “${choiceName}” está repetida.` };
      }
      names.add(choiceName.toLowerCase());
      const priceText = String(row.price ?? "").trim();
      const costText = String(row.cost ?? "").trim();
      const priceCents = priceText === "" ? 0 : parsePrice(priceText);
      const costCents = costText === "" ? null : parsePrice(costText);
      if (priceCents === null) {
        return { ok: false, message: `No entendimos el precio de “${choiceName}” en “${name}”. Escríbelo solo con números.` };
      }
      if (costText !== "" && costCents === null) {
        return { ok: false, message: `No entendimos el costo de “${choiceName}” en “${name}”. Escríbelo solo con números o déjalo vacío.` };
      }
      choices.push({ id: idFor(row.id), name: choiceName, priceCents, costCents, available: row.available !== false });
    }

    const max = Math.min(Math.max(1, wholeNumber(item.max, 1)), choices.length);
    const min = Math.min(wholeNumber(item.min, 0), max);
    groups.push({ id: idFor(item.id), name, min, max, choices });
  }
  return { ok: true, groups };
}

/** Lo mínimo que hace falta de un grupo para revisar una selección (el menú público no trae los costos). */
export type SelectableGroup = {
  name: string;
  min: number;
  max: number;
  choices: { id: string; name: string; priceCents: number; available: boolean; costCents?: number | null }[];
};

export type SelectionCheck =
  | { ok: true; chosen: ChosenOption[]; choiceIds: string[]; extraCents: number; extraCostCents: number }
  | { ok: false; message: string };

/**
 * Revisa lo que eligió el cliente contra las opciones del producto: que cada
 * opción exista y esté disponible, y que cada grupo tenga entre su mínimo y
 * su máximo. La usan el navegador (para avisar) y el servidor (que no se fía).
 */
export function checkSelection(groups: SelectableGroup[], choiceIds: string[]): SelectionCheck {
  const wanted = new Set(choiceIds);
  const known = new Set<string>();
  const chosen: ChosenOption[] = [];
  const ids: string[] = [];
  let extraCents = 0;
  let extraCostCents = 0;

  for (const group of groups) {
    let count = 0;
    for (const choice of group.choices) {
      known.add(choice.id);
      if (!wanted.has(choice.id)) continue;
      if (!choice.available) return { ok: false, message: `“${choice.name}” ya no está disponible.` };
      count += 1;
      chosen.push({ group: group.name, name: choice.name, priceCents: choice.priceCents });
      ids.push(choice.id);
      extraCents += choice.priceCents;
      extraCostCents += choice.costCents ?? 0;
    }
    if (count < group.min) {
      return { ok: false, message: group.min === 1 ? `Elige una opción de “${group.name}”.` : `Elige al menos ${group.min} opciones de “${group.name}”.` };
    }
    if (count > group.max) {
      return { ok: false, message: group.max === 1 ? `En “${group.name}” solo puedes elegir una opción.` : `En “${group.name}” puedes elegir máximo ${group.max} opciones.` };
    }
  }
  for (const id of wanted) {
    if (!known.has(id)) return { ok: false, message: "Una de las opciones elegidas ya no existe. Actualiza el menú." };
  }
  return { ok: true, chosen, choiceIds: ids, extraCents, extraCostCents };
}

/** Texto corto de las opciones elegidas: "Familiar, Queso extra". */
export const optionsSummary = (chosen: { name: string }[]) => chosen.map((option) => option.name).join(", ");

/** Lee las opciones guardadas en un renglón de pedido. */
export function parseChosen(text: string | null | undefined): ChosenOption[] {
  if (!text) return [];
  try {
    const raw = JSON.parse(text);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item) => item && typeof item.name === "string")
      .map((item) => ({ group: String(item.group ?? ""), name: String(item.name), priceCents: wholeNumber(item.priceCents, 0) }));
  } catch {
    return [];
  }
}

/** Identifica un renglón del carrito: el mismo producto con opciones distintas es otro renglón. */
export function lineKey(productId: string, choiceIds: string[]): string {
  return choiceIds.length === 0 ? productId : `${productId}:${[...choiceIds].sort().join(",")}`;
}

/**
 * Precio más bajo posible del producto: el base más lo mínimo que obligan a
 * elegir sus grupos. `varies` dice si una elección obligatoria (el tamaño, por
 * ejemplo) puede cambiar el precio: entonces el menú anuncia "Desde". Los
 * adicionales opcionales no cuentan: el producto se puede pedir sin ellos.
 */
export function priceRange(
  basePriceCents: number,
  groups: { min: number; choices: { priceCents: number; available: boolean }[] }[],
): { fromCents: number; varies: boolean } {
  let fromCents = basePriceCents;
  let varies = false;
  for (const group of groups) {
    if (group.min < 1) continue;
    const prices = group.choices.filter((choice) => choice.available).map((choice) => choice.priceCents).sort((a, b) => a - b);
    if (prices.length > 0 && prices[prices.length - 1] !== prices[0]) varies = true;
    for (let index = 0; index < group.min && index < prices.length; index++) fromCents += prices[index];
  }
  return { fromCents, varies };
}
