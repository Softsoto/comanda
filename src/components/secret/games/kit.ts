/**
 * Piezas de dibujo que comparten los juegos pequeños: letras de píxeles dentro
 * del lienzo, el marcador de arriba, el nombre letra por letra, los colores de
 * cada paisaje y los muñequitos pequeños (8 × 8).
 */

import { rect, type Colors, type Ctx, type Sprite } from "../art";
import { WORLDS } from "../../../lib/blocks";
import { GAME_NAME as NAME, shapeOf } from "../../../lib/game-name";
import { shownWorld } from "../../../lib/world-list";
import { glyphFor, normalizeText, type Glyph } from "../pixel-font";

export const WIDTH = 128;
export const HEIGHT = 224;
/** El nombre que se junta en los juegos: cambia si se cambia en la administración. */
export { NAME };

export const INK = "#f7f2ff";
export const GOLD = "#ffd684";
export const DIM = "#5d5790";
export const NIGHT = "#06040e";
export const HEART = "#ff7a8a";

/**
 * Colores de los juegos en cada paisaje: muros (`wall`, con su borde `edge`),
 * luces o premios (`light`), suelo (`ground`, con su borde `grass`) y fondo del tablero (`board`).
 */
export const LOOKS = [
  { wall: "#2a2168", edge: "#7460c4", light: "#ffd684", ground: "#3a2460", grass: "#c57f37", board: "rgba(6, 4, 14, 0.9)" },
  { wall: "#0d3a40", edge: "#3c9c88", light: "#8ff3ff", ground: "#0b2c33", grass: "#d5422d", board: "rgba(2, 12, 16, 0.9)" },
  { wall: "#1f3d1a", edge: "#6fae45", light: "#f4ffb0", ground: "#1a2e12", grass: "#8fbf4a", board: "rgba(4, 14, 6, 0.9)" },
  { wall: "#13254d", edge: "#4f74c4", light: "#ffc46b", ground: "#0b1838", grass: "#f0a040", board: "rgba(3, 8, 24, 0.9)" },
  { wall: "#2b3557", edge: "#9fc3e8", light: "#ffffff", ground: "#2a3150", grass: "#e8f1ff", board: "rgba(10, 13, 28, 0.9)" },
  { wall: "#4a1c4e", edge: "#ff6fb5", light: "#7ff6ff", ground: "#2b1030", grass: "#ffb3d9", board: "rgba(18, 5, 20, 0.9)" },
] as const;
export type Look = (typeof LOOKS)[number];
/** Los colores del paisaje que se ve cuando el juego va por su paisaje número `world`. */
export const lookOf = (world: number) => LOOKS[shownWorld(world)];
/** Cuántos paisajes hay (los juegos avanzan por ellos con `(nivel - 1) % WORLDS`). */
export { WORLDS };

/* ---------- Muñequitos pequeños ---------- */

export const NINJA_COLORS: Colors = { k: "#07050f", b: "#5f6be0", s: "#f3cba6", e: "#1b1030", t: "#3be6c6" };
/** Natha, la ninja: quieta y andando. */
export const NINJA: readonly Sprite[] = [
  ["..kkkk..", ".kbbbbk.", ".ksesek.", ".kbbbbk.", "tkbbbbk.", "ttbbbbk.", ".kb..bk.", ".kk..kk."],
  ["..kkkk..", ".kbbbbk.", ".ksesek.", ".kbbbbk.", "tkbbbbk.", ".tbbbbk.", ".kbkkbk.", "..k..k.."],
];
export const SPIRIT: readonly Sprite[] = [
  ["..####..", ".######.", ".#e##e#.", ".#e##e#.", "########", "########", "########", "#.##.#.#"],
  ["..####..", ".######.", ".#e##e#.", ".#e##e#.", "########", "########", "########", ".#.##.#."],
];
export const SPIRIT_COLORS: readonly Colors[] = [
  { "#": "#effcff", e: "#143540" },
  { "#": "#ffd0e0", e: "#4a1830" },
  { "#": "#c8ffe6", e: "#0f3b2c" },
];
export const SCARED_COLORS: Colors = { "#": "#5964c8", e: "#f7f2ff" };
export const FLOWER: Sprite = [".p.p.", "ppppp", ".pyp.", "ppppp", ".p.p."];
export const FLOWER_COLORS: Colors = { p: "#f58fbd", y: "#ffd95e" };
export const STAR: readonly Sprite[] = [
  ["..w..", "..w..", "wwkww", "..w..", "..w.."],
  ["w...w", ".w.w.", "..k..", ".w.w.", "w...w"],
];
export const STAR_COLORS: Colors = { w: "#e8ecff", k: "#8088c8" };
export const DROP: Sprite = [".i.", "ioi", "ioi", "ooo", ".o."];
export const DROP_COLORS: Colors = { o: "#2fb8ee", i: "#8ff3ff" };
export const LANTERN: Sprite = [".kkk.", "rrorr", "royor", "royor", "royor", "rrorr", ".kkk."];
export const LANTERN_COLORS: Colors = { k: "#1a0f14", r: "#ee4f2c", o: "#ffa23f", y: "#ffe58c" };
/** El auto de carreras visto desde atrás (16 × 12). Se puede cambiar por uno propio en la administración. */
export const CAR: Sprite = [
  "....kkkkkkkk....",
  "...kRRRRRRRRk...",
  "..kRrwwwwwwrRk..",
  "..kRwbbbbbbwRk..",
  ".kkRRRRRRRRRRkk.",
  "kddkRRRRRRRRkddk",
  "kddRRrrrrrrRRddk",
  "kkkRyyRRRRyyRkkk",
  ".kRRRRkkkkRRRRk.",
  ".kRRRRRRRRRRRRk.",
  ".kddkkkkkkkkddk.",
  ".kkk........kkk.",
];
export const CAR_COLORS: Colors = { k: "#14101e", R: "#e8483a", r: "#ff8a6b", w: "#cfe8ff", b: "#4a6fae", d: "#2c2838", y: "#ffd95e" };
export const MOON: Sprite = [".yyy.", "yyyyw", "yyyyy", "ydyyy", ".yyy."];
export const MOON_COLORS: Colors = { y: "#fff1b8", w: "#ffffff", d: "#e2c87a" };

/**
 * Qué personajes tienen dibujo propio (lo pone theme.ts al aplicar la
 * personalización) y un número que cambia cada vez, para rehacer lo que un
 * juego haya guardado ya dibujado.
 */
export const CUSTOM = { version: 0, hero: false, heroSmall: false, friend: false, friendSmall: false, prize: false, prizeSmall: false, car: false };

/** Un dibujo agrandado: cada píxel pasa a ser un cuadrado de `times` × `times`. */
export const scaleSprite = (rows: readonly string[], times: number): string[] =>
  rows.flatMap((row) => {
    const wide = [...row].map((char) => char.repeat(times)).join("");
    return Array.from({ length: times }, () => wide);
  });

/* ---------- Letras dentro del lienzo ---------- */

const glyphOf = (char: string) => glyphFor(char) ?? (glyphFor("?") as Glyph);

/** Ancho en píxeles de un texto escrito con `write`. */
export function widthOf(text: string, scale = 1): number {
  let width = 0;
  for (const char of normalizeText(text)) width += (glyphOf(char).width + 1) * scale;
  return Math.max(0, width - scale);
}

/** Escribe un texto con su esquina superior izquierda en (x, y). Las letras miden 7 de alto (× `scale`); las tildes asoman 2 más por encima. Devuelve dónde termina. */
export function write(c: Ctx, text: string, x: number, y: number, color: string, scale = 1): number {
  c.fillStyle = color;
  let left = x;
  for (const char of normalizeText(text)) {
    const glyph = glyphOf(char);
    glyph.rows.forEach((row, line) => {
      for (let column = 0; column < row.length; column++) {
        if (row[column] === "#") c.fillRect(left + column * scale, y + line * scale, scale, scale);
      }
    });
    // Las tildes van en las dos filas de encima de la letra.
    glyph.accent?.forEach((row, line) => {
      for (let column = 0; column < row.length; column++) {
        if (row[column] === "#") c.fillRect(left + column * scale, y + (line - glyph.accent!.length) * scale, scale, scale);
      }
    });
    left += (glyph.width + 1) * scale;
  }
  return left;
}

/** Escribe un texto centrado a lo ancho del lienzo. */
export const center = (c: Ctx, text: string, y: number, color: string, scale = 1) =>
  write(c, text, Math.round((WIDTH - widthOf(text, scale)) / 2), y, color, scale);

/** Escribe un texto con un borde oscuro alrededor, para que se lea encima de cualquier cosa. */
export function outlined(c: Ctx, text: string, x: number, y: number, color: string, scale = 1) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) write(c, text, x + dx, y + dy, NIGHT, scale);
  return write(c, text, x, y, color, scale);
}

/** Marcador de arriba: puntos a la izquierda y vidas (corazones) a la derecha. Ocupa de y=5 a y=11. */
export function drawTop(c: Ctx, score: number, lives: number) {
  write(c, String(score), 5, 5, INK);
  const hearts = "♥".repeat(Math.max(0, Math.min(lives, 6)));
  write(c, hearts, WIDTH - 5 - widthOf(hearts), 5, HEART);
}

/** El nombre letra por letra: doradas las que ya se tienen. Con `current`, la siguiente parpadea. */
export function drawName(c: Ctx, y: number, done: number, scale: number, current: boolean, time: number) {
  let x = Math.round((WIDTH - widthOf(NAME, scale)) / 2);
  [...NAME].forEach((char, index) => {
    const blink = current && index === done && Math.floor(time * 3) % 2 === 0;
    x = write(c, char, x, y, index < done ? GOLD : blink ? INK : DIM, scale);
  });
}

/** Fondo del tablero con su marco de un píxel, del color del paisaje. */
export function drawFrame(c: Ctx, world: number) {
  const look = lookOf(world);
  c.clearRect(0, 0, WIDTH, HEIGHT);
  rect(c, 0, 0, WIDTH, HEIGHT, look.board);
  rect(c, 0, 0, WIDTH, 1, look.edge);
  rect(c, 0, HEIGHT - 1, WIDTH, 1, look.edge);
  rect(c, 0, 0, 1, HEIGHT, look.edge);
  rect(c, WIDTH - 1, 0, 1, HEIGHT, look.edge);
}

/** Forma de cualquier letra en una rejilla de 5 × 7 (para formaciones y muros con forma de letra). */
export const LETTER_SHAPES: Readonly<Record<string, readonly string[]>> = new Proxy({} as Record<string, readonly string[]>, {
  get: (_target, key) => (typeof key === "string" ? shapeOf(key) : undefined),
});
