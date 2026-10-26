/**
 * Qué paisajes salen en los juegos escondidos y en qué orden.
 *
 * Cada juego cuenta sus paisajes 0, 1, 2… a medida que avanza; aquí ese número
 * se traduce al paisaje que se ve, saltando los que el administrador apagó en
 * el panel de diseño. Es una variable que cambia en vivo (`setShownWorlds`).
 */

export const WORLD_NAMES = [
  "LA ALDEA",
  "EL SANTUARIO",
  "EL BOSQUE DE BAMBÚ",
  "EL LAGO DE LOS FAROLES",
  "LA CUMBRE NEVADA",
  "EL CUARTO DEL JACUZZI",
] as const;
/** Cuántos paisajes hay. Los juegos los recorren en orden y vuelven a empezar. */
export const WORLD_COUNT = WORLD_NAMES.length;
const ALL = Array.from({ length: WORLD_COUNT }, (_, index) => index);

export let SHOWN_WORLDS: readonly number[] = ALL;

/** Deja solo números de paisaje válidos y sin repetir; si no queda ninguno, salen todos. */
export function cleanWorldList(value: unknown): number[] {
  if (!Array.isArray(value)) return [...ALL];
  const list = [...new Set(value.filter((item): item is number => Number.isInteger(item) && item >= 0 && item < WORLD_COUNT))];
  return list.length > 0 ? list : [...ALL];
}

export function setShownWorlds(list: unknown) {
  SHOWN_WORLDS = cleanWorldList(list);
}

/** El paisaje que se ve cuando un juego va por su paisaje número `index`. */
export const shownWorld = (index: number) => SHOWN_WORLDS[((Math.trunc(index) % SHOWN_WORLDS.length) + SHOWN_WORLDS.length) % SHOWN_WORLDS.length];
/** El nombre del paisaje que se ve en ese momento. */
export const worldName = (index: number) => WORLD_NAMES[shownWorld(index)];
