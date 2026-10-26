/**
 * El nombre que se junta letra por letra en los juegos escondidos (NATHALIA,
 * si nadie lo cambia en la administración).
 *
 * Es una variable que se puede cambiar mientras la página está abierta: los
 * juegos la leen cada vez, así que con `setGameName` se usa el nombre nuevo
 * desde la próxima partida.
 */

import { glyphFor, normalizeText } from "../components/secret/pixel-font";

export const DEFAULT_GAME_NAME = "NATHALIA";
export const NAME_MIN = 3;
export const NAME_MAX = 10;

export let GAME_NAME = DEFAULT_GAME_NAME;

/** Deja solo letras (con tildes y Ñ), en mayúsculas. */
export const cleanGameName = (value: unknown) =>
  typeof value === "string"
    ? normalizeText(value)
        .replace(/[^A-ZÁÉÍÓÚÜÑ]/g, "")
        .slice(0, NAME_MAX)
    : "";

export function setGameName(name: string) {
  const clean = cleanGameName(name);
  GAME_NAME = clean.length >= NAME_MIN ? clean : DEFAULT_GAME_NAME;
}

/**
 * La forma de una letra en una rejilla de 5 × 7 (la de las letras de píxeles),
 * para las formaciones de espíritus y los muros de faroles. Las letras angostas
 * (como la I) se centran en las 5 columnas.
 */
export function shapeOf(letter: string): string[] {
  const glyph = glyphFor(normalizeText(letter)[0] ?? "?") ?? glyphFor("?");
  const rows = glyph ? glyph.rows : ["#####", "#...#", "#...#", "#...#", "#...#", "#...#", "#####"];
  const pad = Math.max(0, 5 - rows[0].length);
  const left = ".".repeat(pad >> 1);
  const right = ".".repeat(pad - (pad >> 1));
  return rows.map((row) => (left + row + right).slice(0, 5));
}

/** Las letras distintas del nombre, en el orden en que aparecen (para las caras de cartas y fichas). */
export const lettersOf = (name: string = GAME_NAME) => [...new Set(name)];
