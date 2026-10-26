/**
 * Dibujos del juego escondido: las fichas, el tablero y los muñequitos.
 *
 * Todo está hecho a mano, píxel por píxel, en tablas de texto: cada letra es un
 * color y el punto es transparente. Se pinta en un lienzo pequeño que el
 * navegador agranda sin suavizar; por eso se ven los cuadritos.
 *
 * Los paisajes de fondo están en worlds.ts.
 */

import { COLS, KINDS, ROWS, cellsOf, dropDistance, kindNumber, previewOf, type GameState, type PieceKind } from "../../lib/blocks";

export type Ctx = CanvasRenderingContext2D;
/** Un dibujo: cada texto es una fila y cada letra, un píxel. */
export type Sprite = readonly string[];
/** Qué color es cada letra de un dibujo. Las letras que no están aquí son transparentes. */
export type Colors = Readonly<Record<string, string>>;

/* ---------- Herramientas ---------- */

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function rect(c: Ctx, x: number, y: number, width: number, height: number, color: string) {
  c.fillStyle = color;
  c.fillRect(x, y, width, height);
}

/** Azar con semilla: con el mismo número, el paisaje sale siempre igual. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * Tramado: para mezclar dos colores sin usar tonos intermedios, se pinta uno de
 * cada tantos píxeles siguiendo un patrón fijo. `amount` va de 0 (ninguno) a 1 (todos).
 */
export const dither = (x: number, y: number, amount: number) => BAYER[((y & 3) << 2) | (x & 3)] < amount * 16;

/** Pinta un dibujo con su esquina superior izquierda en (x, y). Con `flip`, mirando al otro lado. */
export function paintSprite(c: Ctx, rows: Sprite, colors: Colors, x: number, y: number, flip = false) {
  for (let row = 0; row < rows.length; row++) {
    const line = rows[row];
    for (let column = 0; column < line.length; column++) {
      const color = colors[line[flip ? line.length - 1 - column : column]];
      if (!color) continue;
      c.fillStyle = color;
      c.fillRect(x + column, y + row, 1, 1);
    }
  }
}

/** Lienzo auxiliar para guardar un dibujo ya hecho y no repetirlo en cada cuadro. */
export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  return canvas;
}

/* ---------- Trofeos de los logros ---------- */

/** Una copa de trofeo de 9 × 9: "l" brillo, "m" color, "d" sombra, "k" contorno. */
export const TROPHY: Sprite = [
  "kkkkkkkkk",
  "kllmmmmdk",
  "kklmmmdkk",
  ".klmmmdk.",
  "..kmmdk..",
  "...kdk...",
  "...kmk...",
  "..kmmdk..",
  "..kkkkk..",
];
export const TROPHY_COLORS: Record<"bronce" | "plata" | "oro" | "nada", Colors> = {
  oro: { k: "#3a2108", l: "#fff4b0", m: "#ffc83d", d: "#c27a12" },
  plata: { k: "#1f2633", l: "#ffffff", m: "#c8d3e6", d: "#7d8aa3" },
  bronce: { k: "#2e1406", l: "#ffd0a0", m: "#d9844a", d: "#8f4a1e" },
  nada: { k: "#24203a", l: "#4a4466", m: "#3a3554", d: "#2e2a46" },
};

/* ---------- Muñequitos (también se usan en la portada y en el mensaje) ---------- */

export const NINJA_COLORS: Colors = {
  k: "#07050f", // contorno
  b: "#343c9c", // traje
  B: "#5f6be0", // traje, lado de la luna
  s: "#f3cba6", // piel
  e: "#1b1030", // ojos
  t: "#3be6c6", // bufanda
  T: "#1ba892", // bufanda, sombra
};

/** El ninja de la aldea, mirando a la derecha: dos pasos de carrera, el salto y de pie. */
export const NINJA = {
  run: [
    [
      "....kkkkk...",
      "...kbbbbBk..",
      "...kbbbbBk..",
      "...ksesesk..",
      "t..kbbbbBk..",
      "tttTkkkkk...",
      ".tTkbbbBkk..",
      "...kbbbBkBk.",
      "...kbbbbk...",
      "..kbbkkbBk..",
      ".kbbk..kbBk.",
      ".kkk....kkk.",
    ],
    [
      "....kkkkk...",
      "...kbbbbBk..",
      "...kbbbbBk..",
      "...ksesesk..",
      ".t.kbbbbBk..",
      "ttTTkkkkk...",
      "..tkbbbBk...",
      "..kBkbbBk...",
      "...kbbbbk...",
      "....kbBk....",
      "....kbbkk...",
      "....kkkkk...",
    ],
  ],
  jump: [
    "....kkkkk...",
    "...kbbbbBk..",
    "...kbbbbBk..",
    "...ksesesk..",
    "...kbbbbBk..",
    "t.kkkkkkkkk.",
    "tTkBkbbBkBk.",
    ".tT.kbbbk...",
    "...kbbkbBkk.",
    "..kbbk.kkBk.",
    "..kkk....kk.",
    "............",
  ],
  stand: [
    "....kkkkk...",
    "...kbbbbBk..",
    "...kbbbbBk..",
    "...ksesesk..",
    "...kbbbbBk..",
    ".tTTkkkkk...",
    ".t.kbbbBk...",
    ".t.kbbbBk...",
    "...kbbbbk...",
    "...kbkkBk...",
    "...kbk.kBk..",
    "...kkk.kkk..",
  ],
} as const;

export const GHOST_COLORS: Colors = {
  "#": "#effcff", // cuerpo
  s: "#b3e0ea", // sombra
  e: "#143540", // ojos
  p: "#ffb3c9", // mejillas
};

/** Un espíritu del santuario: ojos abiertos y parpadeando. */
export const GHOST = {
  open: [
    "...#####...",
    "..#######s.",
    ".#########s",
    ".##e###e##s",
    ".##e###e##s",
    ".#p#####p#s",
    ".#########s",
    ".#########s",
    ".#########s",
    ".##s###s##s",
    ".#s.s#s.s#s",
    "...........",
  ],
  blink: [
    "...#####...",
    "..#######s.",
    ".#########s",
    ".#########s",
    ".#ee###ee#s",
    ".#p#####p#s",
    ".#########s",
    ".#########s",
    ".#########s",
    ".##s###s##s",
    ".#s.s#s.s#s",
    "...........",
  ],
} as const;

export const WISP_COLORS: Colors = { o: "#2fb8ee", i: "#8ff3ff", w: "#f0ffff" };

/** Fuego azul que flota: dos cuadros para que tiemble. */
export const WISP = [
  ["...o...", "...o...", "..oo...", "..oio..", ".oiiio.", ".oiwio.", ".oiwio.", "..oio..", "...o..."],
  ["...o...", "....o..", "...oo..", "..oio..", ".oiiio.", ".oiwio.", ".oiwio.", "..oio..", "...o..."],
] as const;

export const FLOWER_COLORS: Colors = { p: "#f58fbd", l: "#ffc9df", d: "#c9578f", y: "#ffd95e" };

/** Flor de cerezo, con sus cinco pétalos. */
export const FLOWER: Sprite = [
  "....pp.....",
  "...pllp....",
  ".pp.plp.pp.",
  "pllp.p.pllp",
  "plllpyplllp",
  ".pppyyyppd.",
  "...pypyp...",
  "..plp.plp..",
  ".pllp.plld.",
  ".pppd.pddd.",
  "..dd...dd..",
];

/* ---------- Fichas ---------- */

/** Lado de una ficha, en píxeles del lienzo. */
export const TILE = 12;

type TileLook = { base: string; light: string; dark: string; icon: Sprite };

/**
 * Aspecto de cada pieza: su color y un dibujito grabado ("#" hundido, "+" en relieve).
 * I pergamino · O farol · T estrella · S pétalo · Z amuleto · J llama · L espíritu
 */
export const TILES: Record<PieceKind, TileLook> = {
  I: {
    base: "#ecdcaa",
    light: "#fff8dc",
    dark: "#b2955b",
    icon: ["#++++#", "#+##+#", "#++++#", "#+##+#", "#++++#", "#++++#"],
  },
  O: {
    base: "#f0603b",
    light: "#ffa377",
    dark: "#a5311f",
    icon: [".####.", "++++++", "######", "++++++", "######", ".++++."],
  },
  T: {
    base: "#8fa4c4",
    light: "#d6e2f3",
    dark: "#536689",
    icon: ["+.+.+.", ".+++..", "++#++.", ".+++..", "+.+.+.", "......"],
  },
  S: {
    base: "#f67fb3",
    light: "#ffc6de",
    dark: "#af477d",
    icon: ["....++", "..++++", ".+++#.", ".++#..", "++#...", "+....."],
  },
  Z: {
    base: "#f3ba36",
    light: "#ffe88f",
    dark: "#ab7512",
    icon: ["..++..", ".+##+.", "+#++#+", "+#++#+", ".+##+.", "..++.."],
  },
  J: {
    base: "#4a97ee",
    light: "#a9d6ff",
    dark: "#2256ad",
    icon: ["..+...", "..++..", ".+++..", ".+#++.", ".+##+.", "..++.."],
  },
  L: {
    base: "#5fd9b0",
    light: "#bdf8e0",
    dark: "#299277",
    icon: [".++++.", "++++++", "+#++#+", "++++++", "++++++", "+.++.+"],
  },
};

const STONE: TileLook = { base: "#6c7089", light: "#a7abc2", dark: "#3d4058", icon: [] };
const FLASH: TileLook = { base: "#fffdf0", light: "#ffffff", dark: "#ffe9a6", icon: [] };

/** Color claro de cada pieza (para la sombra que marca dónde va a caer). */
export const pieceColor = (kind: PieceKind) => TILES[kind].light;

function paintTile(c: Ctx, look: TileLook, x: number, y: number) {
  rect(c, x, y, TILE, TILE, look.base);
  rect(c, x, y, TILE - 1, 1, look.light);
  rect(c, x, y, 1, TILE - 1, look.light);
  rect(c, x + 1, y + TILE - 1, TILE - 1, 1, look.dark);
  rect(c, x + TILE - 1, y + 1, 1, TILE - 1, look.dark);
  paintSprite(c, look.icon, { "#": look.dark, "+": look.light }, x + 3, y + 3);
}

const STONE_INDEX = KINDS.length + 1;
const FLASH_INDEX = KINDS.length + 2;
let sheet: HTMLCanvasElement | null = null;

/** Todas las fichas pintadas una sola vez, una al lado de la otra. */
function tileSheet(): HTMLCanvasElement {
  if (sheet) return sheet;
  sheet = makeCanvas(TILE * (FLASH_INDEX + 1), TILE);
  const c = sheet.getContext("2d") as Ctx;
  KINDS.forEach((kind) => paintTile(c, TILES[kind], kindNumber(kind) * TILE, 0));
  paintTile(c, STONE, STONE_INDEX * TILE, 0);
  paintTile(c, FLASH, FLASH_INDEX * TILE, 0);
  return sheet;
}

/** Pinta una ficha. `value` es el número de la pieza (1 a 7). */
export function drawTile(c: Ctx, value: number, x: number, y: number) {
  c.drawImage(tileSheet(), value * TILE, 0, TILE, TILE, x, y, TILE, TILE);
}

/* ---------- Tablero ---------- */

/** Grosor del marco del tablero. */
export const FRAME = 4;
export const FIELD_WIDTH = COLS * TILE + FRAME * 2;
export const FIELD_HEIGHT = ROWS * TILE + FRAME * 2;

const OUTLINE = "#06040e";

/** Marco del tablero en cada mundo: madera y oro en la aldea, bermellón en el santuario. */
const FRAMES = [
  { light: "#ffd684", mid: "#c57f37", dark: "#774220", stud: "#fff3cf", glass: "rgba(9, 7, 28, 0.8)" },
  { light: "#ff8f70", mid: "#d5422d", dark: "#86241e", stud: "#ffe7cf", glass: "rgba(2, 15, 19, 0.8)" },
];

export type FieldLook = {
  /** 0 = aldea, 1 = santuario. */
  world: number;
  /** Avance (de 0 a 1) de la animación de las filas que se están borrando. */
  clearing: number;
  /** Al terminar la partida, cuántas filas (contando desde abajo) ya se volvieron piedra. */
  stoneRows: number;
};

/** Pinta el tablero completo: marco, fichas quietas, la pieza que cae y su sombra. */
export function drawField(c: Ctx, state: GameState, look: FieldLook) {
  const frame = FRAMES[look.world & 1];
  c.clearRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);

  // Marco: contorno, listón con brillo arriba y sombra abajo, y otro contorno por dentro.
  rect(c, 0, 0, FIELD_WIDTH, FIELD_HEIGHT, OUTLINE);
  rect(c, 1, 1, FIELD_WIDTH - 2, FIELD_HEIGHT - 2, frame.mid);
  rect(c, 1, 1, FIELD_WIDTH - 2, 1, frame.light);
  rect(c, 1, 1, 1, FIELD_HEIGHT - 2, frame.light);
  rect(c, 1, FIELD_HEIGHT - 2, FIELD_WIDTH - 2, 1, frame.dark);
  rect(c, FIELD_WIDTH - 2, 1, 1, FIELD_HEIGHT - 2, frame.dark);
  rect(c, 3, 3, FIELD_WIDTH - 6, FIELD_HEIGHT - 6, OUTLINE);
  for (const x of [1, FIELD_WIDTH - 3]) for (const y of [1, FIELD_HEIGHT - 3]) rect(c, x, y, 2, 2, frame.stud);

  // Por dentro es como un vidrio oscuro: deja ver el paisaje de fondo.
  c.clearRect(FRAME, FRAME, COLS * TILE, ROWS * TILE);
  rect(c, FRAME, FRAME, COLS * TILE, ROWS * TILE, frame.glass);
  c.fillStyle = "rgba(255, 255, 255, 0.09)";
  for (let row = 1; row < ROWS; row++) {
    for (let column = 1; column < COLS; column++) c.fillRect(FRAME + column * TILE, FRAME + row * TILE, 1, 1);
  }

  // Fichas quietas.
  const clearing = new Set(state.clearing);
  for (let row = 0; row < ROWS; row++) {
    const y = FRAME + row * TILE;
    for (let column = 0; column < COLS; column++) {
      const value = state.board[row][column];
      if (value === 0) continue;
      const x = FRAME + column * TILE;
      if (clearing.has(row)) {
        // La fila se deshace del centro hacia los lados, dejando chispas.
        const distance = Math.abs(column - (COLS - 1) / 2);
        if (distance < look.clearing * (COLS / 2 + 1)) {
          if (look.clearing < 0.85) {
            rect(c, x + 5, y + 3, 2, 6, "#fff6c4");
            rect(c, x + 3, y + 5, 6, 2, "#fff6c4");
          }
        } else drawTile(c, FLASH_INDEX, x, y);
      } else drawTile(c, row >= ROWS - look.stoneRows ? STONE_INDEX : value, x, y);
    }
  }

  if (!state.piece) return;
  // Sombra: el contorno de dónde va a caer la pieza.
  const distance = dropDistance(state);
  const value = kindNumber(state.piece.kind);
  if (distance > 0) {
    const color = pieceColor(state.piece.kind);
    for (const [column, row] of cellsOf(state.piece)) {
      const x = FRAME + column * TILE;
      const y = FRAME + (row + distance) * TILE;
      if (row + distance < 0) continue;
      c.globalAlpha = 0.16;
      rect(c, x + 1, y + 1, TILE - 2, TILE - 2, color);
      c.globalAlpha = 0.75;
      rect(c, x, y, TILE, 1, color);
      rect(c, x, y + TILE - 1, TILE, 1, color);
      rect(c, x, y + 1, 1, TILE - 2, color);
      rect(c, x + TILE - 1, y + 1, 1, TILE - 2, color);
      c.globalAlpha = 1;
    }
  }
  // La pieza que cae.
  for (const [column, row] of cellsOf(state.piece)) {
    if (row >= 0) drawTile(c, value, FRAME + column * TILE, FRAME + row * TILE);
  }
}

/* ---------- La pieza que sigue ---------- */

export const PREVIEW_WIDTH = TILE * 4;
export const PREVIEW_HEIGHT = TILE * 2;

/** Pinta la próxima pieza, centrada en su recuadro. */
export function drawPreview(c: Ctx, kind: PieceKind | null) {
  c.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  if (!kind) return;
  const { cells } = previewOf(kind);
  const columns = cells.map(([x]) => x);
  const rows = cells.map(([, y]) => y);
  const left = Math.min(...columns);
  const top = Math.min(...rows);
  const offsetX = Math.floor((PREVIEW_WIDTH - (Math.max(...columns) - left + 1) * TILE) / 2) - left * TILE;
  const offsetY = Math.floor((PREVIEW_HEIGHT - (Math.max(...rows) - top + 1) * TILE) / 2) - top * TILE;
  for (const [x, y] of cells) drawTile(c, kindNumber(kind), offsetX + x * TILE, offsetY + y * TILE);
}
