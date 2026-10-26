/**
 * "Fichas del Templo": fichas de marfil apiladas en capas formando una figura.
 * Se quitan de a dos, con la misma cara, y solo si están libres: nada encima y
 * con el lado izquierdo o el derecho despejado. Las caras se reparten al revés
 * (quitando parejas libres de la figura llena), así que todo reparto tiene salida.
 */

import { rect, type Sprite } from "../art";
import { lettersOf } from "../../../lib/game-name";
import { CUSTOM, DIM, FLOWER, FLOWER_COLORS, GOLD, INK, LETTER_SHAPES, NAME, NIGHT, NINJA, NINJA_COLORS, SPIRIT, SPIRIT_COLORS, WIDTH, center, drawFrame, drawTop, lookOf, outlined, widthOf } from "./kit";
import { WORLDS } from "./kit";
import { defineGame, roll, type Out, type Point } from "./types";

/* ---------- Medidas ---------- */

/** Una ficha ocupa 14 × 16 (cara de 12 × 14 y canto de 2). La rejilla va en medias fichas: 7 × 8. */
export const TILE_W = 14;
export const TILE_H = 16;
const HALF_W = 7;
const HALF_H = 8;
/** Cada capa se corre 2 píxeles hacia arriba a la izquierda, para que se vea la altura. */
const LIFT = 2;
/** Dónde puede estar el tablero. */
export const AREA = { left: 3, top: 26, right: 125, bottom: 220 } as const;

export const SHUFFLES = 3;
const PAIR = 20;
const CLEAR_BONUS = 1000;
/** Segundos para que la siguiente pareja cuente como cadena. */
const CHAIN_TIME = 3.5;

/* ---------- Figuras ---------- */

/** Un lugar para una ficha: columna y fila en medias fichas, y capa. */
export type Slot = { gx: number; gy: number; z: number };

/** Rellena un rectángulo de fichas enteras (columnas c0..c1, filas r0..r1) en una capa, con medio paso opcional. */
function block(z: number, c0: number, c1: number, r0: number, r1: number, halfX = 0, halfY = 0): Slot[] {
  const slots: Slot[] = [];
  for (let r = r0; r <= r1; r++) for (let col = c0; col <= c1; col++) slots.push({ gx: col * 2 + halfX, gy: r * 2 + halfY, z });
  return slots;
}

export const FIGURES: readonly { name: string; slots: readonly Slot[] }[] = [
  {
    name: "PIRAMIDE",
    slots: [
      // Piso: 6 × 9 sin las esquinas, y una ficha suelta a cada lado.
      ...block(0, 0, 5, 0, 8).filter(({ gx, gy }) => !((gx === 0 || gx === 10) && (gy === 0 || gy === 16))),
      { gx: -2, gy: 8, z: 0 },
      { gx: 12, gy: 8, z: 0 },
      ...block(1, 1, 4, 1, 7),
      ...block(2, 2, 3, 3, 5),
      { gx: 5, gy: 7, z: 3 },
      { gx: 5, gy: 9, z: 3 },
    ],
  },
  {
    name: "TEMPLO",
    slots: [
      ...block(0, 3, 4, 0, 0),
      ...block(0, 1, 6, 1, 1),
      ...block(0, 0, 7, 2, 2),
      ...block(0, 2, 5, 3, 3),
      ...block(0, 1, 6, 4, 4),
      ...block(0, 0, 7, 5, 5),
      ...block(0, 2, 5, 6, 6),
      ...block(0, 0, 7, 7, 8),
      ...block(1, 2, 5, 1, 2),
      ...block(1, 2, 5, 4, 5),
      ...block(1, 1, 6, 7, 8),
      ...block(2, 3, 4, 2, 2),
      ...block(2, 3, 4, 5, 5),
      ...block(2, 3, 4, 8, 8),
    ],
  },
  {
    name: "PUERTA",
    slots: [
      ...block(0, 0, 7, 0, 0),
      ...block(0, 1, 6, 1, 1),
      ...block(0, 1, 2, 2, 8),
      ...block(0, 5, 6, 2, 8),
      ...block(0, 3, 4, 3, 3),
      ...block(0, 0, 2, 9, 9),
      ...block(0, 5, 7, 9, 9),
      ...block(1, 1, 6, 0, 0),
      ...block(1, 1, 2, 4, 7),
      ...block(1, 5, 6, 4, 7),
      ...block(2, 2, 5, 0, 0),
      ...block(2, 1, 1, 5, 6),
      ...block(2, 6, 6, 5, 6),
    ],
  },
];

/* ---------- Caras ---------- */

/** Dibujos de 8 × 9 con sus colores. */
const PICTURES: readonly { name: string; rows: Sprite; colors: Record<string, string> }[] = [
  {
    name: "luna",
    rows: ["..kkkk..", ".kyyyk..", "kyywk...", "kyyk....", "kyyk....", "kyyk....", "kyywk...", ".kyyyk..", "..kkkk.."],
    colors: { k: "#6b4a10", y: "#f2c84b", w: "#fff4c0" },
  },
  {
    name: "estrella",
    rows: ["...bb...", "...bb...", "..bccb..", "bbbccbbb", ".bccccb.", "..bccb..", ".bcbbcb.", ".bb..bb.", "b......b"],
    colors: { b: "#3448b8", c: "#9fb4ff" },
  },
  {
    name: "flor",
    rows: ["...pp...", "..pppp..", "pp.pp.pp", "pppyyppp", ".pyyyyp.", "pppyyppp", "pp.pp.pp", "..pppp..", "...pp..."],
    colors: { p: "#e0508e", y: "#e8a010" },
  },
  {
    name: "farol",
    rows: ["..kkkk..", ".rrrrrr.", "rroyyorr", "royyyyor", "royyyyor", "rroyyorr", ".rrrrrr.", "..kkkk..", "...kk..."],
    colors: { k: "#2a1410", r: "#d23a22", o: "#f08a2a", y: "#ffd25a" },
  },
  {
    name: "espiritu",
    rows: ["..kkkk..", ".kwwwwk.", "kwwwwwwk", "kwkwwkwk", "kwwwwwwk", "kwppppwk", "kwwwwwwk", "kwwwwwwk", "kk.kk.kk"],
    colors: { k: "#1d5560", w: "#bff0f4", p: "#f08aa0" },
  },
  {
    name: "natha",
    rows: ["..kkkk..", ".kbbbbk.", "kbbbbbbk", "kssssssk", "ksessesk", "kbbbbbbk", "tkbbbbk.", "ttkbbk..", ".t.kk..."],
    colors: { k: "#07050f", b: "#5f6be0", s: "#f3cba6", e: "#1b1030", t: "#1fb89c" },
  },
  {
    name: "fuego",
    rows: ["...c....", "...cc...", "..ccc..c", "..cbcc.c", ".ccbbcc.", ".cbwwbc.", "cbbwwbbc", ".cbbbbc.", "..cccc.."],
    colors: { c: "#2440b8", b: "#4aa8f0", w: "#d8f6ff" },
  },
  {
    name: "ola",
    rows: ["..dddd..", ".dbbbbd.", "dbbwwbbd", "dbw..wbd", "dw..dbbd", "...dbbbd", "dddbbbwd", "bbbbbwbb", "dddddddd"],
    colors: { d: "#1f5f98", b: "#3b8fd0", w: "#e6f6ff" },
  },
  {
    name: "bambu",
    rows: ["....gd..", "....gd.l", "....ddll", "...gd.l.", "ll.gd...", ".llgd...", "..ddd...", "..gd....", "..gd...."],
    colors: { g: "#4caa3c", d: "#1f6a20", l: "#86c840" },
  },
  {
    name: "montana",
    rows: ["...dd...", "..dssd..", ".dsssmd.", ".dmsmmd.", "dmmmmmmd", "dmmmdmmd", "mmmddmmm", "mmddddmm", "dddddddd"],
    colors: { s: "#ffffff", d: "#33427a", m: "#6878b0" },
  },
  {
    name: "pez",
    rows: ["........", "........", "...rr...", ".rrrrr.d", "rkrrrrdd", "roooorrd", ".rrrrr.d", "...rr...", "........"],
    colors: { r: "#e0542a", o: "#ffb070", k: "#2a1008", d: "#a83a14" },
  },
  {
    name: "abanico",
    rows: [".dpdpdp.", "dpdpdpdp", "dpdpdpdp", ".dpdpdp.", "..dpdp..", "...dp...", "...kk...", "....r...", "....r..."],
    colors: { p: "#e85a7a", d: "#a82848", k: "#5a3010", r: "#d23a22" },
  },
  {
    name: "campana",
    rows: ["...kk...", "..kbbk..", ".kbwbbk.", ".kbwbbk.", ".kbbbbk.", "kbbbbbbk", "kkkkkkkk", "...kk...", "........"],
    colors: { k: "#4a2a08", b: "#c88a2a", w: "#ffe08a" },
  },
];

/** Las letras van en dorado, con una sombra de un tono. */
function letterPicture(letter: string): { name: string; rows: Sprite; colors: Record<string, string> } {
  const grid = Array.from({ length: 9 }, () => [..."........"]);
  LETTER_SHAPES[letter].forEach((line, y) =>
    [...line].forEach((cell, x) => {
      if (cell === "#") grid[y + 2][x + 2] = "s";
    }),
  );
  LETTER_SHAPES[letter].forEach((line, y) =>
    [...line].forEach((cell, x) => {
      if (cell === "#") grid[y + 1][x + 1] = "g";
    }),
  );
  return { name: letter, rows: grid.map((row) => row.join("")), colors: { g: "#d08e10", s: "#5a3406" } };
}

/** Si hay dibujos propios de los personajes, las fichas de la protagonista, el compañero y la flor los usan. */
function customized(picture: (typeof PICTURES)[number]) {
  if (picture.name === "natha" && CUSTOM.heroSmall) return { name: picture.name, rows: NINJA[0], colors: NINJA_COLORS as Record<string, string> };
  if (picture.name === "espiritu" && CUSTOM.friendSmall) return { name: picture.name, rows: SPIRIT[0], colors: SPIRIT_COLORS[0] as Record<string, string> };
  if (picture.name === "flor" && CUSTOM.prizeSmall) return { name: picture.name, rows: FLOWER, colors: FLOWER_COLORS as Record<string, string> };
  return picture;
}

type Run = { x: number; y: number; w: number; color: string };
let built = { stamp: "", faces: [] as { name: string; rows: Sprite; colors: Record<string, string> }[], runs: [] as Run[][] };

/** Las caras de las fichas: los dibujos y hasta seis letras distintas del nombre. Se rehacen si cambia la personalización. */
export function faces() {
  const stamp = `${CUSTOM.version}:${NAME}`;
  if (built.stamp !== stamp) {
    const list = [...PICTURES.map(customized), ...lettersOf(NAME).slice(0, 6).map(letterPicture)];
    built = { stamp, faces: list, runs: list.map(runsOf) };
  }
  return built.faces;
}

/** Cada cara convertida en tramos del mismo color (menos rectángulos al dibujar). */
function runsOf({ rows, colors }: { rows: Sprite; colors: Record<string, string> }) {
  const runs: Run[] = [];
  rows.forEach((line, y) => {
    let x = 0;
    while (x < line.length) {
      const color = colors[line[x]];
      let end = x + 1;
      while (end < line.length && line[end] === line[x]) end++;
      if (color) runs.push({ x, y, w: end - x, color });
      x = end;
    }
  });
  return runs;
}

/* ---------- Estado ---------- */

/** Cara de una ficha y el turno en que sale en una forma segura de despejar el tablero. */
type Deal = { face: number; turn: number };
export type Tile = Slot & Deal & { alive: boolean; x: number; y: number };
type Pop = { x: number; y: number; t: number; text: string };

export type State = {
  random: number;
  time: number;
  score: number;
  /** Barajadas que quedan (se ven como corazones). */
  shuffles: number;
  level: number;
  /** Fichas en orden de dibujo (de abajo hacia arriba). */
  tiles: Tile[];
  selected: number;
  cursor: number;
  /** Parejas seguidas hechas rápido. */
  chain: number;
  lastPair: number;
  /** "play" se juega; "stuck" y "clear" esperan un momento con un aviso; "over" terminó. */
  phase: "play" | "stuck" | "clear" | "over";
  wait: number;
  banner: string;
  bannerTime: number;
  shake: number;
  shakeTile: number;
  pops: Pop[];
  secretDone: boolean;
  over: boolean;
};

export const figureOf = (level: number) => FIGURES[(level - 1) % FIGURES.length];
const worldOf = (level: number) => (level - 1) % WORLDS;

/* ---------- Reglas ---------- */

/** ¿La ficha i está libre? Nada encima que la tape y un lado (izquierdo o derecho) despejado. */
export function isFree(tiles: readonly (Slot & { alive: boolean })[], i: number): boolean {
  const tile = tiles[i];
  if (!tile.alive) return false;
  let left = false;
  let right = false;
  for (let j = 0; j < tiles.length; j++) {
    const other = tiles[j];
    if (j === i || !other.alive) continue;
    const dx = other.gx - tile.gx;
    const dy = other.gy - tile.gy;
    if (Math.abs(dy) >= 2) continue;
    if (other.z > tile.z && Math.abs(dx) < 2) return false;
    if (other.z === tile.z) {
      if (dx === -2) left = true;
      if (dx === 2) right = true;
    }
  }
  return !left || !right;
}

export const freeTiles = (tiles: readonly Tile[]) => tiles.map((_, i) => i).filter((i) => isFree(tiles, i));

/** ¿Hay alguna pareja libre con la misma cara? */
export function hasMove(tiles: readonly Tile[]): boolean {
  const seen = new Set<number>();
  for (const i of freeTiles(tiles)) {
    if (seen.has(tiles[i].face)) return true;
    seen.add(tiles[i].face);
  }
  return false;
}

const shuffle = <T>(state: State, list: T[]) => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(roll(state) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

/**
 * Reparte al revés: de la figura llena se quitan dos lugares libres al azar y se
 * les da la misma cara, una y otra vez. Jugando en ese mismo orden siempre hay salida.
 * Devuelve la cara de cada lugar y en qué turno sale (una forma segura de
 * despejar), o null si se trabó (entonces se prueba otra vez).
 */
function dealBackwards(state: State, slots: readonly Slot[], pairs: readonly number[]): Deal[] | null {
  const marks = slots.map((slot) => ({ ...slot, alive: true }));
  const faces: Deal[] = slots.map(() => ({ face: -1, turn: -1 }));
  for (let k = 0; k < pairs.length; k++) {
    const free = marks.map((_, i) => i).filter((i) => isFree(marks, i));
    if (free.length < 2) return null;
    const a = free.splice(Math.floor(roll(state) * free.length), 1)[0];
    const b = free[Math.floor(roll(state) * free.length)];
    faces[a] = faces[b] = { face: pairs[k], turn: k };
    marks[a].alive = false;
    marks[b].alive = false;
  }
  return faces;
}

/** Pone las fichas en el tablero: calcula dónde se dibuja cada una para que la figura quede centrada. */
function place(state: State, slots: readonly Slot[], faces: readonly Deal[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { gx, gy, z } of slots) {
    minX = Math.min(minX, gx * HALF_W - z * LIFT);
    maxX = Math.max(maxX, gx * HALF_W - z * LIFT + TILE_W);
    minY = Math.min(minY, gy * HALF_H - z * LIFT);
    maxY = Math.max(maxY, gy * HALF_H - z * LIFT + TILE_H);
  }
  const ox = Math.round(AREA.left + (AREA.right - AREA.left - (maxX - minX)) / 2) - minX;
  const oy = Math.round(AREA.top + (AREA.bottom - AREA.top - (maxY - minY)) / 2) - minY;
  state.tiles = slots
    .map((slot, i) => ({ ...slot, ...faces[i], alive: true, x: ox + slot.gx * HALF_W - slot.z * LIFT, y: oy + slot.gy * HALF_H - slot.z * LIFT }))
    .sort((a, b) => a.z - b.z || a.gy - b.gy || a.gx - b.gx);
  state.selected = -1;
  if (state.cursor >= 0) state.cursor = -1;
}

/** Un tablero nuevo con la figura del nivel. */
function newBoard(state: State) {
  const slots = figureOf(state.level).slots;
  const order = shuffle(state, faces().map((_, i) => i));
  const pairs = Array.from({ length: slots.length / 2 }, (_, i) => order[i % order.length]);
  for (let attempt = 0; attempt < 200; attempt++) {
    const faces = dealBackwards(state, slots, shuffle(state, [...pairs]));
    if (faces) return place(state, slots, faces);
  }
  // No debería pasar; por si acaso, se reparte en una sola capa (siempre tiene salida).
  flatDeal(state, pairs.length * 2, pairs);
}

/** Reparto en el piso de la figura: en una sola capa siempre hay al menos dos fichas libres. */
function flatDeal(state: State, count: number, pairs: number[]) {
  const ground = figureOf(state.level).slots.filter((slot) => slot.z === 0);
  const cx = ground.reduce((sum, s) => sum + s.gx, 0) / ground.length;
  const cy = ground.reduce((sum, s) => sum + s.gy, 0) / ground.length;
  const slots = [...ground].sort((a, b) => Math.hypot(a.gx - cx, a.gy - cy) - Math.hypot(b.gx - cx, b.gy - cy) || a.gy - b.gy || a.gx - b.gx).slice(0, count);
  for (let attempt = 0; attempt < 200; attempt++) {
    const faces = dealBackwards(state, slots, shuffle(state, [...pairs]));
    if (faces) return place(state, slots, faces);
  }
}

/** Se vuelven a repartir las fichas que quedan, también con salida. */
export function reshuffle(state: State) {
  const alive = state.tiles.filter((tile) => tile.alive);
  const sorted = alive.map((tile) => tile.face).sort((a, b) => a - b);
  const pairs: number[] = [];
  for (let i = 0; i < sorted.length; i += 2) pairs.push(sorted[i]);
  const slots = alive.map(({ gx, gy, z }) => ({ gx, gy, z }));
  for (let attempt = 0; attempt < 60; attempt++) {
    const faces = dealBackwards(state, slots, shuffle(state, [...pairs]));
    if (faces) return place(state, slots, faces);
  }
  flatDeal(state, alive.length, pairs);
}

export function createFichas(seed: number): State {
  const state: State = {
    random: seed >>> 0,
    time: 0,
    score: 0,
    shuffles: SHUFFLES,
    level: 1,
    tiles: [],
    selected: -1,
    cursor: -1,
    chain: 0,
    lastPair: -99,
    phase: "play",
    wait: 0,
    banner: "",
    bannerTime: 0,
    shake: 0,
    shakeTile: -1,
    pops: [],
    secretDone: false,
    over: false,
  };
  newBoard(state);
  return state;
}

const centerOf = (tile: Tile): Point => ({ x: tile.x + 6, y: tile.y + 7 });

/** La ficha más alta bajo el dedo (o -1). */
export function tileAt(state: State, point: Point): number {
  for (let i = state.tiles.length - 1; i >= 0; i--) {
    const tile = state.tiles[i];
    if (tile.alive && point.x >= tile.x && point.x < tile.x + TILE_W && point.y >= tile.y && point.y < tile.y + TILE_H) return i;
  }
  return -1;
}

/** La ficha libre más cercana a un punto. */
function nearestFree(state: State, point: Point): number {
  let best = -1;
  let bestDistance = Infinity;
  for (const i of freeTiles(state.tiles)) {
    const c = centerOf(state.tiles[i]);
    const distance = Math.hypot(c.x - point.x, c.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] } as const;

/** Mueve el cursor a la ficha libre más cercana en esa dirección (si hay). */
function moveCursor(state: State, dir: keyof typeof DIRS, out: Out) {
  const current = state.cursor >= 0 && isFree(state.tiles, state.cursor) ? state.cursor : -1;
  if (current < 0) {
    state.cursor = nearestFree(state, { x: WIDTH / 2, y: (AREA.top + AREA.bottom) / 2 });
    if (state.cursor >= 0) out.sound("move");
    return;
  }
  const [dx, dy] = DIRS[dir];
  const from = centerOf(state.tiles[current]);
  let best = -1;
  let bestScore = Infinity;
  for (const i of freeTiles(state.tiles)) {
    if (i === current) continue;
    const c = centerOf(state.tiles[i]);
    const ahead = (c.x - from.x) * dx + (c.y - from.y) * dy;
    const side = Math.abs((c.x - from.x) * dy) + Math.abs((c.y - from.y) * dx);
    if (ahead <= 2) continue;
    const score = ahead + side * 2;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best >= 0) {
    state.cursor = best;
    out.sound("move");
  }
}

function addScore(state: State, points: number) {
  state.score = Math.min(999999, state.score + points);
}

/** Tocar o elegir una ficha. */
export function choose(state: State, i: number, out: Out) {
  if (state.phase !== "play") return;
  if (i < 0) {
    state.selected = -1;
    return;
  }
  const tile = state.tiles[i];
  if (!tile.alive) return;
  if (!isFree(state.tiles, i)) {
    state.shake = 0.3;
    state.shakeTile = i;
    out.sound("lock");
    return;
  }
  if (state.selected === i) {
    state.selected = -1;
    out.sound("move");
    return;
  }
  const other = state.selected >= 0 ? state.tiles[state.selected] : null;
  if (!other || !other.alive || other.face !== tile.face) {
    state.selected = i;
    out.sound("move");
    return;
  }
  // Pareja: las dos se van.
  other.alive = false;
  tile.alive = false;
  state.selected = -1;
  state.chain = state.time - state.lastPair <= CHAIN_TIME ? state.chain + 1 : 0;
  state.lastPair = state.time;
  const bonus = 10 * Math.min(state.chain, 5);
  addScore(state, PAIR + bonus);
  const a = centerOf(other);
  const b = centerOf(tile);
  state.pops.push({ x: a.x, y: a.y, t: 0, text: "" }, { x: b.x, y: b.y, t: 0, text: `+${PAIR + bonus}` });
  out.sound(state.chain >= 2 ? "clear2" : "clear");
  if (state.cursor >= 0 && !state.tiles[state.cursor].alive) state.cursor = nearestFree(state, b);

  if (state.tiles.every((t) => !t.alive)) {
    addScore(state, CLEAR_BONUS);
    state.phase = "clear";
    state.wait = 2;
    state.banner = "DESPEJADO!";
    state.bannerTime = 2;
    out.sound("level");
    out.say(`Tablero despejado. Más ${CLEAR_BONUS} puntos.`);
    if (!state.secretDone) {
      state.secretDone = true;
      out.secret();
    }
  } else if (!hasMove(state.tiles)) {
    state.phase = "stuck";
    state.wait = 1.2;
    state.banner = "SIN JUGADAS";
    state.bannerTime = 1.2;
    out.sound("lock");
  }
}

/** Lo que pasa cuando termina la espera de un aviso. */
function afterWait(state: State, out: Out) {
  if (state.phase === "clear") {
    state.level += 1;
    state.cursor = state.cursor >= 0 ? 0 : -1;
    newBoard(state);
    if (state.cursor >= 0) state.cursor = nearestFree(state, { x: WIDTH / 2, y: 120 });
    state.phase = "play";
    state.chain = 0;
    state.banner = figureOf(state.level).name;
    state.bannerTime = 1.2;
    out.sound("start");
    out.say(`Nivel ${state.level}: ${figureOf(state.level).name.toLowerCase()}.`);
  } else if (state.phase === "stuck") {
    if (state.shuffles > 0) {
      state.shuffles -= 1;
      const hadCursor = state.cursor >= 0;
      reshuffle(state);
      if (hadCursor) state.cursor = nearestFree(state, { x: WIDTH / 2, y: 120 });
      state.phase = "play";
      state.banner = "BARAJADA";
      state.bannerTime = 1.2;
      out.sound("rotate");
      out.say(`Sin jugadas: se barajan las fichas. Quedan ${state.shuffles} barajadas.`);
    } else {
      state.phase = "over";
      state.over = true;
      state.banner = "SIN JUGADAS";
      out.sound("over");
      out.say("Sin jugadas ni barajadas. Fin de la partida.");
    }
  }
}

export function stepFichas(state: State, dt: number, taps: readonly Point[], pressed: readonly string[], out: Out) {
  state.time += dt;
  state.shake = Math.max(0, state.shake - dt);
  state.bannerTime = Math.max(0, state.bannerTime - dt);
  for (const pop of state.pops) pop.t += dt;
  state.pops = state.pops.filter((pop) => pop.t < 0.7);
  if (state.over) return;
  if (state.phase !== "play") {
    state.wait -= dt;
    if (state.wait <= 0) afterWait(state, out);
    return;
  }
  for (const tap of taps) {
    const i = tileAt(state, tap);
    if (i >= 0) state.cursor = state.cursor >= 0 ? i : -1;
    choose(state, i, out);
    if (state.phase !== "play") return;
  }
  for (const key of pressed) {
    if (key === "left" || key === "right" || key === "up" || key === "down") moveCursor(state, key, out);
    else if (key === "fire") {
      if (state.cursor < 0 || !state.tiles[state.cursor]?.alive) moveCursor(state, "left", out);
      else choose(state, state.cursor, out);
      if (state.phase !== "play") return;
    }
  }
}

/* ---------- Dibujo ---------- */

const EDGE = "#2a1d12";
const SIDE = "#c4a77a";
const SIDE_LOW = "#957650";
const FACE_FREE = "#fbf3dc";
const FACE_LOCKED = "#cdbd98";
const FACE_PICKED = "#ffe08a";
const SHINE = "#fffdf4";

function drawTile(c: CanvasRenderingContext2D, tile: Tile, x: number, y: number, face: string) {
  // Canto (a la derecha y abajo): se ve el grueso de la ficha.
  rect(c, x + 1, y + 1, 13, 15, EDGE);
  rect(c, x + 2, y + 2, 11, 12, SIDE);
  rect(c, x + 2, y + 13, 11, 2, SIDE_LOW);
  // Cara.
  rect(c, x, y, 12, 14, EDGE);
  rect(c, x + 1, y + 1, 10, 12, face);
  rect(c, x + 1, y + 1, 10, 1, face === FACE_LOCKED ? FACE_FREE : SHINE);
  faces();
  for (const run of built.runs[tile.face] ?? []) rect(c, x + 2 + run.x, y + 3 + run.y, run.w, 1, run.color);
}

function box(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  rect(c, x, y, w, 1, color);
  rect(c, x, y + h - 1, w, 1, color);
  rect(c, x, y, 1, h, color);
  rect(c, x + w - 1, y, 1, h, color);
}

export default defineGame<State>({
  help: "Toca dos fichas libres con el mismo dibujo para quitarlas. Una ficha está libre si nada la tapa y tiene despejado su lado izquierdo o el derecho. Con el teclado, las flechas recorren las fichas libres y la barra espaciadora elige.",
  create: (seed) => createFichas(seed),
  pad: () => [[], []],
  step(state, dt, input, out) {
    stepFichas(state, dt, input.taps, input.pressed, out);
  },
  draw(c, state, time, still) {
    const world = worldOf(state.level);
    const look = lookOf(world);
    drawFrame(c, world);
    drawTop(c, state.score, state.shuffles);
    center(c, `NIVEL ${state.level} · ${figureOf(state.level).name}`, 15, INK);
    // Una línea separa el marcador del tablero.
    rect(c, 2, AREA.top - 2, WIDTH - 4, 1, look.edge);

    const free = new Set(freeTiles(state.tiles));
    state.tiles.forEach((tile, i) => {
      if (!tile.alive) return;
      let x = tile.x;
      if (!still && state.shake > 0 && state.shakeTile === i) x += Math.round(Math.sin(state.shake * 60));
      const face = i === state.selected ? FACE_PICKED : free.has(i) ? FACE_FREE : FACE_LOCKED;
      // Las fichas de arriba echan sombra sobre las de abajo: así se nota la altura.
      if (tile.z > 0) rect(c, x + 2, tile.y + 2, 14, 16, "rgba(10, 4, 0, 0.45)");
      drawTile(c, tile, x, tile.y, face);
      if (i === state.selected) box(c, x - 1, tile.y - 1, 14, 16, GOLD);
    });

    const cursor = state.cursor >= 0 ? state.tiles[state.cursor] : null;
    if (cursor?.alive && state.phase === "play" && (still || Math.floor(time * 4) % 4 !== 0)) {
      box(c, cursor.x - 2, cursor.y - 2, 16, 18, NIGHT);
      box(c, cursor.x - 1, cursor.y - 1, 14, 16, look.light);
    }

    for (const pop of state.pops) {
      if (!still) {
        const r = Math.round(2 + pop.t * 10);
        rect(c, Math.round(pop.x) - r, Math.round(pop.y), 2, 1, look.light);
        rect(c, Math.round(pop.x) + r - 1, Math.round(pop.y), 2, 1, look.light);
        rect(c, Math.round(pop.x), Math.round(pop.y) - r, 1, 2, look.light);
        rect(c, Math.round(pop.x), Math.round(pop.y) + r - 1, 1, 2, look.light);
      }
      if (pop.text) {
        const rise = still ? 0 : Math.round(pop.t * 12);
        const x = Math.max(2, Math.min(WIDTH - 2 - widthOf(pop.text), Math.round(pop.x - widthOf(pop.text) / 2)));
        outlined(c, pop.text, x, Math.round(pop.y) - 10 - rise, GOLD);
      }
    }

    if (state.over || state.bannerTime > 0) {
      const text = state.over ? "SIN JUGADAS" : state.banner;
      // Los avisos que no detienen el juego dejan ver las fichas de abajo.
      const pause = state.over || state.phase !== "play";
      rect(c, 1, 100, WIDTH - 2, 26, pause ? "rgba(6, 4, 14, 0.85)" : "rgba(6, 4, 14, 0.55)");
      rect(c, 1, 100, WIDTH - 2, 1, look.edge);
      rect(c, 1, 125, WIDTH - 2, 1, look.edge);
      center(c, text, 105, state.phase === "clear" ? GOLD : INK);
      const sub = state.over ? "FIN DE LA PARTIDA" : state.phase === "clear" ? `+${CLEAR_BONUS}` : state.banner === "BARAJADA" ? `QUEDAN ${state.shuffles}` : "";
      if (sub) center(c, sub, 115, state.phase === "clear" ? GOLD : DIM);
    }
  },
  status: (state) => ({
    score: state.score,
    lives: state.shuffles,
    level: state.level,
    letters: 0,
    world: worldOf(state.level),
    over: state.over,
  }),
});
