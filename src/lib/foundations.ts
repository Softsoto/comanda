/**
 * Fundaciones que rescatan perros y gatos, para el mensaje "Ayuda a un
 * animalito" del juego de mascotas. El administrador puede cambiar la lista en
 * el panel de diseño; esta es la que viene de fábrica (datos públicos de
 * prensa colombiana; conviene revisarlos de vez en cuando).
 *
 * Es una variable que cambia en vivo (`setFoundations`), como el nombre del juego.
 */

export type Foundation = {
  name: string;
  /** Ciudad o región. */
  place: string;
  /** Cómo encontrarla: usuario de Instagram, página o teléfono. */
  contact: string;
};

export const DEFAULT_FOUNDATIONS: readonly Foundation[] = [
  { name: "Peluditos con Futuro", place: "Bogotá", contact: "@peluditos_colombia" },
  { name: "Second Chances", place: "Bogotá", contact: "@secondchances_15" },
  { name: "Fundación Dannvalent Dog", place: "Guatavita, Cundinamarca", contact: "@dannvalentdog" },
  { name: "Fundación Por Amor a Rocky", place: "Medellín", contact: "@poramorarocky1" },
  { name: "Albergue Pataclau", place: "Cali", contact: "@alberguepataclau" },
  { name: "Unidad de Protección Animal (UPA)", place: "Manizales", contact: "Secretaría de Medio Ambiente de Manizales" },
];

export const FOUNDATION_LIMITS = { name: 48, place: 40, contact: 60, count: 20 } as const;

export let FOUNDATIONS: readonly Foundation[] = DEFAULT_FOUNDATIONS;

const clip = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Deja solo fundaciones con nombre; si no queda ninguna, vuelve la lista de fábrica. */
export function cleanFoundations(value: unknown): Foundation[] {
  if (!Array.isArray(value)) return [...DEFAULT_FOUNDATIONS];
  const list = value
    .map((item) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      return { name: clip(raw.name, FOUNDATION_LIMITS.name), place: clip(raw.place, FOUNDATION_LIMITS.place), contact: clip(raw.contact, FOUNDATION_LIMITS.contact) };
    })
    .filter((item) => item.name.length >= 2)
    .slice(0, FOUNDATION_LIMITS.count);
  return list.length > 0 ? list : [...DEFAULT_FOUNDATIONS];
}

export function setFoundations(list: unknown) {
  FOUNDATIONS = cleanFoundations(list);
}
