/**
 * "Ruta de los Faroles": una carrera contra el reloj vista desde atrás del auto.
 *
 * La carretera se dibuja como en las máquinas de carreras de antes: es una fila
 * de tramos cortos (segmentos) y cada uno se proyecta en la pantalla más chico
 * cuanto más lejos está. Las curvas desplazan poco a poco cada tramo hacia un
 * lado y las lomas lo suben o lo bajan; un tramo que queda detrás de una loma
 * no se pinta. Las cosas del borde y los otros autos se agrandan al acercarse.
 *
 * Se empieza con 40 segundos. Cada arco de faroles (punto de control) suma
 * tiempo y lleva al siguiente paisaje. Las letras del nombre flotan sobre un
 * carril: pasar por encima las junta, en orden. Con todas se gana el mensaje
 * secreto y 10 segundos más.
 */

import { rect, type Colors, type Ctx, type Sprite } from "../art";
import { UI } from "../texts";
import { WORLD_COUNT, worldName } from "../worlds";
import {
  CAR,
  CAR_COLORS,
  DIM,
  GOLD,
  HEART,
  HEIGHT,
  INK,
  LANTERN,
  LANTERN_COLORS,
  LETTER_SHAPES,
  MOON,
  MOON_COLORS,
  NAME,
  NIGHT,
  WIDTH,
  center,
  drawFrame,
  drawName,
  lookOf,
  outlined,
  widthOf,
  write,
} from "./kit";
import { defineGame, roll, type Input, type Out } from "./types";

/* ---------- Medidas del mundo ---------- */

/** Largo de cada tramo de carretera (en unidades del mundo). */
export const SEG = 200;
/** Medio ancho de la carretera. Las posiciones de lado se miden en "medios anchos": -1 y 1 son los bordes. */
export const ROAD_W = 2000;
/** Altura de la cámara sobre el piso y distancia de la cámara al auto. */
const CAM_H = 1000;
export const PLAYER_Z = 840;
/** Cuánto agranda la proyección a lo ancho y a lo alto (elegidos para que la ruta mida unos 100 píxeles junto al auto). */
const KX = 21;
const KY = 94;
/** Dónde queda el horizonte cuando la ruta es plana, y dónde termina el marcador de arriba. */
const HORIZON = 100;
const HUD = 27;
/** Cuántos tramos se ven hacia adelante. */
const DRAW = 120;
/** Tramos seguidos del mismo color (las franjas que pasan rápido). */
const STRIPE = 3;
/** Fila donde apoyan las ruedas del auto. */
const CAR_BOTTOM = 212;

/* ---------- Números del juego ---------- */

/** Velocidad máxima: 60 tramos por segundo. */
export const MAX_SPEED = 12000;
const BRAKE = MAX_SPEED * 1.1;
const COAST = MAX_SPEED * 0.2;
/** Fuera de la carretera se frena hasta un cuarto de la velocidad máxima. */
export const OFF_LIMIT = MAX_SPEED * 0.25;
const OFF_DECEL = MAX_SPEED * 0.6;
/** Cuánto empujan las curvas hacia afuera (comparado con lo que gira el volante). */
const CENTRIFUGAL = 0.13;
/** Hasta dónde se puede salir uno de la ruta (en medios anchos). */
export const EDGE = 2.4;
export const START_TIME = 40;
const LETTER_TIME = 10;
/** Medio ancho de un auto, en medios anchos de ruta (los autos miden lo mismo que el del jugador). */
export const CAR_HALF = 0.3;
/** Dónde van los carriles (y las letras). */
export const LANES = [-0.66, 0, 0.66] as const;

/** Largo de cada etapa en tramos: un poco más larga cada vez. */
export const stageLength = (stage: number) => Math.min(2400, 1400 + 120 * (stage - 1));
/** El tramo donde está el arco de faroles que cierra la etapa `stage` (la primera es la 1). */
export function gateOf(stage: number): number {
  let at = 0;
  for (let s = 1; s <= stage; s++) at += stageLength(s);
  return at;
}
/** Segundos que regala cada arco: menos en las etapas avanzadas. */
export const bonusOf = (stage: number) => Math.max(18, Math.round(28 - 1.5 * stage));
export const worldOf = (stage: number) => (stage - 1) % WORLD_COUNT;

/* ---------- El estado ---------- */

/** Un tramo de ruta: curva, altura de su borde cercano y lejano, paisaje, cosas al borde (pares tipo, lado) y si es el arco. */
export type Seg = { c: number; y0: number; y1: number; w: number; d: number[]; g: boolean };
export type Rival = { z: number; x: number; to: number; speed: number; paint: number; passed: boolean };
export type Letter = { seg: number; x: number };

export type State = {
  random: number;
  /** Segundos de carrera y segundos que quedan. */
  time: number;
  left: number;
  /** Dónde está la cámara a lo largo de la ruta, y la velocidad. */
  position: number;
  speed: number;
  /** El auto a lo ancho (0 = centro, ±1 = bordes de la ruta). */
  x: number;
  /** Hacia dónde gira ahora (-1, 0, 1), para inclinar el dibujo. */
  steer: number;
  offroad: boolean;
  stage: number;
  bonus: number;
  passes: number;
  letters: number;
  secret: boolean;
  over: boolean;
  started: boolean;
  /** Tramos ya hechos: `segs[0]` es el tramo número `base`. */
  segs: Seg[];
  base: number;
  /** Cómo va la fábrica de ruta: hasta qué tramo, a qué altura, en qué etapa y dónde está su arco. */
  made: number;
  madeY: number;
  madeStage: number;
  madeGate: number;
  /** El siguiente arco por cruzar. */
  gate: number;
  rivals: Rival[];
  letter: Letter | null;
  nextLetter: number;
  /** Tiempo sin volver a sonar el choque, y cuánto se sacude todavía. */
  bump: number;
  shake: number;
  /** Desplazamiento del fondo lejano y cercano (se mueven en las curvas). */
  far: number;
  near: number;
  banner: string[];
  bannerTime: number;
};

/* ---------- Dibujos propios ---------- */

const LAMP: Sprite = [
  "...k...",
  "..kkk..",
  ".kRRRk.",
  "kRRoRRk",
  "kRoyoRk",
  "kRoyoRk",
  "kRRoRRk",
  ".kRRRk.",
  "..kkk..",
  "...p...",
  "...p...",
  "...p...",
  "...p...",
  "...p...",
  "...p...",
  "...p...",
  "...p...",
  "..ppp..",
  ".kkkkk.",
];
const LAMP_COLORS: Colors = { k: "#1a0f14", R: "#ee4f2c", o: "#ffa23f", y: "#ffe58c", p: "#5a3a2a" };

const CHERRY: Sprite = [
  "....kkkkkk.....",
  "..kkPPPPPPkk...",
  ".kPPpPPPPpPPk..",
  "kPPPPPPpPPPPPk.",
  "kPpPPPPPPPPpPPk",
  "kPPPPpPPPPPPPPk",
  ".kPPPPPPPpPPPk.",
  "..kkPPPPPPPkk..",
  "....kkTkkkk....",
  "......TT.......",
  "......TT.......",
  ".....TTT.......",
  "......TT.......",
  "......TT.......",
  "......TTT......",
  ".....TTTTT.....",
  "....kkkkkkk....",
];
const CHERRY_COLORS: Colors = { k: "#3a1430", P: "#f58fbd", p: "#ffc8e0", T: "#4a2a2a" };

const HOUSE: Sprite = [
  "......kkkkkk......",
  "....kkRRRRRRkk....",
  "..kkRRrRRRRrRRkk..",
  "kkRRRRRRRRRRRRRRkk",
  "kkkkkkkkkkkkkkkkkk",
  "..kwwwwwwwwwwwwk..",
  "..kwyyyywwyyyywk..",
  "..kwyoyywwyoyywk..",
  "..kwyyyywwyyyywk..",
  "..kwwwwwwwwwwwwk..",
  "..kwwwwkddkwwwwk..",
  "..kwwwwkddkwwwwk..",
  "..kwwwwkddkwwwwk..",
  ".kkkkkkkkkkkkkkkk.",
];
const HOUSE_COLORS: Colors = { k: "#14101e", R: "#3a2e6e", r: "#5a4a9a", w: "#d9ccb0", y: "#ffd684", o: "#ffa23f", d: "#5a3a2a" };

/** Una mata de bambú: tres cañas con nudos y hojas. */
const BAMBOO: Sprite = (() => {
  const rows: string[][] = [];
  // Columna de cada caña, en qué fila empieza y cada cuánto tiene nudo.
  const canes = [
    [1, 3, 0],
    [5, 0, 2],
    [8, 6, 4],
  ];
  for (let y = 0; y < 27; y++) {
    const row = Array<string>(11).fill(".");
    for (const [x, start, shift] of canes) {
      if (y < start) continue;
      const joint = (y + shift) % 6 === 0;
      row[x] = joint ? "J" : "G";
      row[x + 1] = joint ? "J" : "D";
    }
    rows.push(row);
  }
  const leaves = [[0, 2], [0, 3], [3, 1], [4, 0], [7, 2], [10, 5], [10, 6], [7, 8], [3, 9], [4, 10], [0, 12], [10, 13], [7, 16], [3, 18], [0, 20], [10, 21]];
  for (const [x, y] of leaves) if (rows[y][x] === ".") rows[y][x] = "L";
  rows.push([..."kkkkkkkkkkk"]);
  return rows.map((row) => row.join(""));
})();
const BAMBOO_COLORS: Colors = { G: "#8fd05a", D: "#4f8a2e", J: "#24461a", L: "#b8ea6a", k: "#10200a" };

const ROCK: Sprite = [
  "....kkkkk.....",
  "..kkwwwwwkk...",
  ".kwwwwwwwwwk..",
  "kwwwwWWwwwwwk.",
  "kWwrrWWWwwWWWk",
  "krrrrrWWrrrWWk",
  "krRrrrrrrrrrRk",
  "kRRRrrrRRrrRRk",
  ".kkkkkkkkkkkk.",
];
const ROCK_COLORS: Colors = { k: "#141826", w: "#f4f8ff", W: "#bccbe6", r: "#5a6280", R: "#3a4060" };

const PINE: Sprite = [
  "......k......",
  ".....kwk.....",
  "....kwwwk....",
  "....kgwgk....",
  "...kwwwwwk...",
  "...kgGwGgk...",
  "..kwwwgwwwk..",
  "..kGgGGGgGk..",
  ".kwwwwGwwwwk.",
  ".kgGGGGGGGgk.",
  "kwwgwwwwwgwwk",
  "kGGGGGgGGGGGk",
  ".kkkkkkkkkkk.",
  ".....ktk.....",
  ".....ktk.....",
  ".....ktk.....",
  "....kkkkk....",
];
const PINE_COLORS: Colors = { k: "#0e1420", w: "#f4f8ff", g: "#2e5a4a", G: "#3f7a5a", t: "#4a3428" };

/** Un farol de papel flotando en el lago, con su reflejo. */
const FLOAT: Sprite = [
  "..kkk..",
  ".kRRRk.",
  "kRoyoRk",
  "kRyYyRk",
  "kRoyoRk",
  ".kRRRk.",
  "..kkk..",
  ".oo.oo.",
  "..o.o..",
];
const FLOAT_COLORS: Colors = { k: "#1a0f14", R: "#ff8a3a", o: "#ffc46b", y: "#ffe58c", Y: "#ffffff" };

/** Los autos rivales vistos desde atrás (16 × 12), con su carrocería de color. */
export const RIVAL: Sprite = [
  "....kkkkkkkk....",
  "...kBBBBBBBBk...",
  "..kBccccccccBk..",
  "..kBcccccccwBk..",
  ".kkBBBBBBBBBBkk.",
  "kBBBBBBBBBBBBBBk",
  "kBllBBBBBBBBllBk",
  "kBBBBkkkkkkBBBBk",
  "kbbbbkwwwwkbbbbk",
  "kbbbbbbbbbbbbbbk",
  "kddkkkkkkkkkkddk",
  "kddk........kddk",
];
const RIVAL_BASE = { k: "#14101e", c: "#26305a", w: "#cfe8ff", l: "#ff5a4a", d: "#2c2838" };
const PAINTS: readonly Colors[] = [
  { ...RIVAL_BASE, B: "#3be6c6", b: "#1b8a7a" },
  { ...RIVAL_BASE, B: "#9a7bff", b: "#5f45b0" },
  { ...RIVAL_BASE, B: "#ffd684", b: "#b88a40" },
  { ...RIVAL_BASE, B: "#e8ecff", b: "#9aa2c4" },
  { ...RIVAL_BASE, B: "#ff8ac0", b: "#b8507e" },
  { ...RIVAL_BASE, B: "#5f8fff", b: "#3550b0" },
];

/** Las cosas del borde: dibujo, colores, tamaño de cada píxel (en medios anchos de ruta) y medio ancho con que se choca. */
type Deco = { rows: Sprite; colors: Colors; pix: number; hit: number };
export const DECOS: readonly Deco[] = [
  { rows: LAMP, colors: LAMP_COLORS, pix: 0.05, hit: 0.1 },
  { rows: CHERRY, colors: CHERRY_COLORS, pix: 0.06, hit: 0.14 },
  { rows: HOUSE, colors: HOUSE_COLORS, pix: 0.06, hit: 0.5 },
  { rows: BAMBOO, colors: BAMBOO_COLORS, pix: 0.06, hit: 0.3 },
  { rows: ROCK, colors: ROCK_COLORS, pix: 0.06, hit: 0.38 },
  { rows: PINE, colors: PINE_COLORS, pix: 0.07, hit: 0.14 },
  { rows: FLOAT, colors: FLOAT_COLORS, pix: 0.05, hit: 0.16 },
];
const [D_LAMP, D_CHERRY, D_HOUSE, D_BAMBOO, D_ROCK, D_PINE, D_FLOAT] = [0, 1, 2, 3, 4, 5, 6];
/** Tamaño de cada píxel de los autos: así un auto mide lo mismo que el del jugador (32 píxeles) junto a él. */
const CAR_PIX = (2 * CAR_HALF) / 16;

/** Colores de cada paisaje: pasto (o agua) en dos tonos, asfalto en dos tonos, cielo de arriba abajo y cerros cercanos. */
const PAINT_OF = [
  { grass: ["#3b5a2e", "#34522a"], road: ["#3c3a4c", "#38364a"], sky: ["#0d0920", "#171034", "#22184a", "#30225c"], hills: "#1c1438" },
  { grass: ["#1f4a40", "#1a4238"], road: ["#3a3e4a", "#363a46"], sky: ["#030e14", "#06202a", "#0b2c33", "#123c44"], hills: "#08242a" },
  { grass: ["#2f5a1f", "#29511b"], road: ["#3c3c40", "#38383c"], sky: ["#060c10", "#0d1a1c", "#142a24", "#1d3a2a"], hills: "#10260e" },
  { grass: ["#18346a", "#152e60"], road: ["#3a3a52", "#36364e"], sky: ["#02040e", "#060e26", "#0b1838", "#132652"], hills: "#081230" },
  { grass: ["#c8d6ee", "#b8c8e4"], road: ["#5a6078", "#545a72"], sky: ["#0a0d1c", "#141a32", "#1f2846", "#2c385c"], hills: "#3a4870" },
] as const;
/** Mezcla dos colores (#rrggbb): para el campo lejano, entre los cerros y el pasto. */
function mix(a: string, b: string, amount: number) {
  const part = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
  const channel = (at: number) => Math.round(part(a, at) + (part(b, at) - part(a, at)) * amount).toString(16).padStart(2, "0");
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}
const FIELDS = PAINT_OF.map((paint) => mix(paint.hills, paint.grass[1], 0.55));
const RUMBLE = ["#d5422d", "#f0ece4"] as const;
const LINE = "#f0ece4";

/* ---------- Fábrica de ruta ---------- */

const easeIn = (a: number, b: number, p: number) => a + (b - a) * p * p;
const easeOut = (a: number, b: number, p: number) => a + (b - a) * (1 - (1 - p) * (1 - p));
const easeInOut = (a: number, b: number, p: number) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);
const between = (state: State, min: number, max: number) => min + roll(state) * (max - min);
const side = (state: State) => (roll(state) < 0.5 ? -1 : 1);

/** Lo que hay al borde de un tramo nuevo, según el paisaje. */
function decoFor(state: State, index: number, world: number, nearGate: boolean): number[] {
  const out: number[] = [];
  if (index < 4 || nearGate) return out;
  const add = (kind: number, offset: number) => out.push(kind, Math.round(offset * 100) / 100);
  if (world === 0) {
    if (index % 12 === 0) add(D_LAMP, -1.3), add(D_LAMP, 1.3);
    const pick = roll(state);
    if (pick < 0.09) add(D_HOUSE, side(state) * between(state, 2.05, 2.7));
    else if (pick < 0.17) add(D_CHERRY, side(state) * between(state, 1.6, 2.7));
  } else if (world === 1) {
    if (index % 16 === 0) add(D_LAMP, -1.3), add(D_LAMP, 1.3);
    if (roll(state) < 0.24) add(D_CHERRY, side(state) * between(state, 1.45, 2.7));
  } else if (world === 2) {
    if (roll(state) < 0.3) add(D_BAMBOO, -between(state, 1.35, 2.7));
    if (roll(state) < 0.3) add(D_BAMBOO, between(state, 1.35, 2.7));
  } else if (world === 3) {
    if (index % 10 === 0) add(D_LAMP, -1.3), add(D_LAMP, 1.3);
    if (roll(state) < 0.14) add(D_FLOAT, side(state) * between(state, 1.7, 3));
  } else {
    const pick = roll(state);
    if (pick < 0.12) add(D_ROCK, side(state) * between(state, 1.4, 2.5));
    else if (pick < 0.27) add(D_PINE, side(state) * between(state, 1.5, 2.8));
  }
  return out;
}

function addSeg(state: State, curve: number, y: number) {
  const index = state.made;
  while (index >= state.madeGate) {
    state.madeStage += 1;
    state.madeGate = gateOf(state.madeStage);
  }
  const gateBefore = gateOf(state.madeStage - 1);
  const nearGate = Math.abs(index - gateBefore) < 3 || Math.abs(index - state.madeGate) < 3;
  const world = worldOf(state.madeStage);
  state.segs.push({
    c: Math.round(curve * 1000) / 1000,
    y0: state.madeY,
    y1: Math.round(y),
    w: world,
    d: decoFor(state, index, world, nearGate),
    g: index === gateBefore && index > 0,
  });
  state.madeY = Math.round(y);
  state.made += 1;
}

/** Un tramo de ruta: entra en la curva, la mantiene y sale; y de paso sube o baja `hill` (en tramos de altura). */
function addRoad(state: State, enter: number, hold: number, leave: number, curve: number, hill: number) {
  const startY = state.madeY;
  const endY = startY + hill * SEG;
  const total = enter + hold + leave;
  for (let n = 0; n < enter; n++) addSeg(state, easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
  for (let n = 0; n < hold; n++) addSeg(state, curve, easeInOut(startY, endY, (enter + n) / total));
  for (let n = 0; n < leave; n++) addSeg(state, easeOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
}

/** Elige el próximo trozo de ruta: rectas, curvas suaves o fuertes, lomas, eses. Más difícil en las etapas avanzadas. */
function addSection(state: State) {
  if (state.made === 0) return addRoad(state, 0, 40, 0, 0, 0);
  const stage = state.madeStage;
  const pick = roll(state);
  // Las lomas grandes se guardan para cuando el auto ya va en marcha; nunca se vuelve muy lejos de la altura cero.
  const hillSize = between(state, 6, 12 + Math.min(18, stage * 4));
  const hill = Math.abs(state.madeY) > 6000 ? -Math.sign(state.madeY) * hillSize : side(state) * hillSize;
  const hard = roll(state) < Math.min(0.5, 0.12 + stage * 0.08);
  const curve = side(state) * (hard ? between(state, 5, 6.5) : between(state, 2, 4));
  const len = () => Math.round(between(state, 12, 28));
  if (pick < 0.18) addRoad(state, 0, Math.round(between(state, 20, 50)), 0, 0, 0);
  else if (pick < 0.42) addRoad(state, len(), len() + 10, len(), curve, 0);
  else if (pick < 0.6) addRoad(state, len(), len(), len(), 0, hill);
  else if (pick < 0.8) addRoad(state, len(), len() + 10, len(), curve, hill);
  else {
    // Una ese: a un lado y enseguida al otro.
    addRoad(state, len(), len(), len(), curve, 0);
    addRoad(state, len(), len(), len(), -curve, hill * 0.5);
  }
}

/** Hace ruta hasta bastante más allá de lo que se ve, y olvida la que quedó atrás. */
function buildAhead(state: State) {
  const playerSeg = Math.floor((state.position + PLAYER_Z) / SEG);
  while (state.made < playerSeg + DRAW + 260) addSection(state);
  const behind = Math.floor(state.position / SEG) - 4 - state.base;
  if (behind > 200) {
    state.segs.splice(0, behind);
    state.base += behind;
  }
}

export const segAt = (state: State, index: number): Seg | undefined => state.segs[index - state.base];

function newRival(state: State, z: number, slow: boolean): Rival {
  const lane = LANES[Math.floor(roll(state) * 3)];
  const top = Math.min(0.72, 0.55 + state.stage * 0.02);
  const speed = MAX_SPEED * (slow ? between(state, 0.2, 0.32) : between(state, 0.32, top));
  return { z, x: lane, to: lane, speed: Math.round(speed), paint: Math.floor(roll(state) * PAINTS.length), passed: false };
}

export function createRace(seed: number): State {
  const state: State = {
    random: seed >>> 0,
    time: 0,
    left: START_TIME,
    position: 0,
    speed: 0,
    x: 0,
    steer: 0,
    offroad: false,
    stage: 1,
    bonus: 0,
    passes: 0,
    letters: 0,
    secret: false,
    over: false,
    started: false,
    segs: [],
    base: 0,
    made: 0,
    madeY: 0,
    madeStage: 1,
    madeGate: gateOf(1),
    gate: gateOf(1),
    rivals: [],
    letter: null,
    nextLetter: 60,
    bump: 0,
    shake: 0,
    far: 0,
    near: 0,
    banner: [`ETAPA 1`, worldName(0)],
    bannerTime: 2.5,
  };
  buildAhead(state);
  // Unos autos lentos a la vista desde el principio, para tener a quién adelantar.
  for (const ahead of [14, 30, 52]) state.rivals.push(newRival(state, (ahead + 4) * SEG + PLAYER_Z, true));
  return state;
}

/* ---------- Cómo avanza ---------- */

export const scoreOf = (state: State) => Math.min(999999, Math.floor(state.position / SEG / 4) + state.bonus);
export const kmh = (speed: number) => Math.round((speed / MAX_SPEED) * 240);

/** Los controles de este paso: a qué lado gira, si acelera y si frena. El dedo gira hacia su mitad del tablero y acelera. */
export function controlsOf(input: Input) {
  let turn = 0;
  if (input.held.has("left")) turn -= 1;
  if (input.held.has("right")) turn += 1;
  let gas = input.held.has("up") || input.held.has("fire");
  for (const touch of input.touches) {
    gas = true;
    // Una franja angosta en el medio solo acelera, para poder ir derecho con el dedo.
    if (touch.x < WIDTH / 2 - 6) turn -= 1;
    else if (touch.x > WIDTH / 2 + 6) turn += 1;
  }
  return { turn: Math.sign(turn), gas, brake: input.held.has("down") };
}

function crash(state: State, out: Out) {
  state.shake = 0.45;
  if (state.bump <= 0) out.sound("lock");
  state.bump = 0.5;
}

export function stepRace(state: State, rawDt: number, input: Input, out: Out) {
  if (state.over) return;
  if (!state.started) {
    state.started = true;
    out.sound("start");
    out.say(`${UI.level} 1. ${worldName(0)}.`);
  }
  const dt = Math.max(0, Math.min(0.05, rawDt || 0));
  if (dt <= 0) return;
  state.time += dt;
  state.bannerTime = Math.max(0, state.bannerTime - dt);
  state.bump = Math.max(0, state.bump - dt);
  state.shake = Math.max(0, state.shake - dt);
  buildAhead(state);

  const { turn, gas, brake } = controlsOf(input);
  const pct = state.speed / MAX_SPEED;
  const startAbs = state.position + PLAYER_Z;
  const startSeg = Math.floor(startAbs / SEG);
  const here = segAt(state, startSeg);

  // Volante: gira más rápido cuanto más rápido se va (quieto, casi nada). Las curvas empujan hacia afuera.
  state.steer = turn;
  if (state.speed > 0) state.x += turn * dt * 2.1 * Math.min(1, 0.25 + pct);
  state.x -= dt * 2 * pct * pct * (here?.c ?? 0) * CENTRIFUGAL;
  state.x = Math.max(-EDGE, Math.min(EDGE, state.x));
  state.offroad = Math.abs(state.x) > 1.08;

  // Acelera fuerte desde parado y cada vez menos cerca del tope.
  if (brake) state.speed -= BRAKE * dt;
  else if (gas) state.speed += MAX_SPEED * 0.34 * (1 - 0.7 * pct) * dt;
  else state.speed -= COAST * dt;
  if (state.offroad && state.speed > OFF_LIMIT) state.speed = Math.max(OFF_LIMIT, state.speed - OFF_DECEL * dt);
  state.speed = Math.max(0, Math.min(MAX_SPEED, state.speed));

  let move = state.speed * dt;
  const before = state.position;

  // Chocar con una cosa del borde (solo pasa fuera de la ruta): el auto queda justo antes y casi parado.
  if (state.offroad) {
    const reach = Math.floor((startAbs + move) / SEG);
    for (let index = startSeg + 1; index <= reach; index++) {
      const seg = segAt(state, index);
      if (!seg) break;
      let hit = false;
      for (let k = 0; k < seg.d.length; k += 2) {
        if (Math.abs(state.x - seg.d[k + 1]) < DECOS[seg.d[k]].hit + CAR_HALF * 0.8) hit = true;
      }
      if (hit) {
        move = Math.max(0, index * SEG - 1 - startAbs);
        state.speed = Math.min(state.speed, MAX_SPEED * 0.05);
        crash(state, out);
        break;
      }
    }
  }
  state.position += move;

  // Los rivales avanzan a su paso y a veces cambian de carril.
  for (const rival of state.rivals) {
    const gap = rival.z - startAbs;
    rival.z += rival.speed * dt;
    if (roll(state) < dt * 0.12) rival.to = LANES[Math.floor(roll(state) * 3)];
    const shift = Math.sign(rival.to - rival.x) * Math.min(Math.abs(rival.to - rival.x), dt * 0.5);
    rival.x = Math.round((rival.x + shift) * 1000) / 1000;
    const after = rival.z - (state.position + PLAYER_Z);
    const side = Math.abs(state.x - rival.x) < CAR_HALF * 2 * 0.85;
    if (gap >= 0 && after < SEG * 0.35 && side && state.speed > rival.speed) {
      // Choque por detrás: el auto queda pegado atrás y mucho más lento.
      state.position = rival.z - PLAYER_Z - SEG * 0.5;
      state.speed = rival.speed * 0.45;
      state.x += state.x < rival.x ? -0.08 : 0.08;
      crash(state, out);
    } else if (gap > 0 && after <= 0 && !rival.passed) {
      rival.passed = true;
      state.passes += 1;
      state.bonus += 50;
      out.sound("move");
    }
  }
  state.position = Math.max(before, state.position);
  const endAbs = state.position + PLAYER_Z;
  const endSeg = Math.floor(endAbs / SEG);

  // El fondo se corre en las curvas, según lo recorrido.
  const curve = segAt(state, endSeg)?.c ?? 0;
  const went = (state.position - before) / SEG;
  state.far = (((state.far + curve * went * 0.04) % 256) + 256) % 256;
  state.near = (((state.near + curve * went * 0.09) % 256) + 256) % 256;

  // La letra se toma pasando por encima de su carril.
  const letter = state.letter;
  if (letter && endSeg >= letter.seg) {
    state.letter = null;
    if (Math.abs(state.x - letter.x) < 0.4) {
      state.letters += 1;
      state.bonus += 100;
      out.say(NAME.slice(0, state.letters));
      if (state.letters >= NAME.length) {
        state.left += LETTER_TIME;
        state.banner = [NAME, `+${LETTER_TIME} S`];
        state.bannerTime = 2.5;
        out.sound("letter");
        if (!state.secret) {
          state.secret = true;
          out.secret();
        }
      } else out.sound("clear");
      state.nextLetter = endSeg + 60 + Math.floor(roll(state) * 80);
    } else state.nextLetter = endSeg + 30 + Math.floor(roll(state) * 40);
  }

  // El arco de faroles: más tiempo y paisaje nuevo. Las letras empiezan otra vuelta si ya estaban todas.
  while (endSeg >= state.gate) {
    const extra = bonusOf(state.stage);
    state.stage += 1;
    state.gate = gateOf(state.stage);
    state.left += extra;
    if (state.letters >= NAME.length) state.letters = 0;
    const name = worldName(worldOf(state.stage));
    state.banner = [`ETAPA ${state.stage}`, `+${extra} S`, name];
    state.bannerTime = 2.5;
    out.sound("level");
    out.say(`${UI.level} ${state.stage}. ${name}. Más ${extra} segundos.`);
  }

  // Autos nuevos aparecen lejos, más allá de lo que se ve; los que quedaron atrás se olvidan.
  state.rivals = state.rivals.filter((rival) => rival.z > endAbs - 30 * SEG && rival.z < endAbs + 400 * SEG);
  const want = Math.min(7, 3 + Math.floor(state.stage / 2));
  const ahead = state.rivals.filter((rival) => rival.z > endAbs).length;
  if (ahead < want && roll(state) < dt * 1.5) state.rivals.push(newRival(state, endAbs + (DRAW + 5 + Math.floor(roll(state) * 30)) * SEG, false));

  // La siguiente letra, sobre un carril, lejos todavía.
  if (!state.letter && state.letters < NAME.length && endSeg >= state.nextLetter) {
    let seg = endSeg + DRAW - 5;
    if (Math.abs(seg - state.gate) < 4) seg += 8;
    state.letter = { seg, x: LANES[Math.floor(roll(state) * 3)] };
  }

  state.left = Math.round((state.left - dt) * 1e6) / 1e6;
  if (state.left <= 0) {
    state.left = 0;
    state.over = true;
    state.speed = 0;
    state.banner = ["SE ACABÓ", "EL TIEMPO"];
    state.bannerTime = 99;
    out.sound("over");
    out.say(`Se acabó el tiempo. ${scoreOf(state)} puntos.`);
  }
}

/* ---------- Dibujo ---------- */

/** Cada fila de un dibujo, en tiras del mismo color seguidas: se pinta con menos rectángulos. */
type Run = [number, number, string];
const runCache = new WeakMap<Sprite, Run[][]>();
function runsOf(rows: Sprite): Run[][] {
  return rows.map((line) => {
    const runs: Run[] = [];
    for (let column = 0; column < line.length; column++) {
      const char = line[column];
      if (char === ".") continue;
      const last = runs[runs.length - 1];
      if (last && last[0] + last[1] === column && last[2] === char) last[1] += 1;
      else runs.push([column, 1, char]);
    }
    return runs;
  });
}
function cachedRuns(rows: Sprite) {
  let runs = runCache.get(rows);
  if (!runs) runCache.set(rows, (runs = runsOf(rows)));
  return runs;
}

/**
 * Pinta un dibujo agrandado `size` veces (puede ser 2,7 o 0,4) con rectángulos
 * de borde redondeado a píxel entero: se ve nítido y pixelado a cualquier distancia.
 * Lo que queda debajo de `bottom` (tapado por una loma) o encima del marcador no se pinta.
 */
function paintScaled(c: Ctx, runs: Run[][], colors: Colors, left: number, top: number, size: number, bottom: number, flip = false, width = 0) {
  for (let row = 0; row < runs.length; row++) {
    let y0 = Math.round(top + row * size);
    let y1 = Math.round(top + (row + 1) * size);
    if (y0 >= bottom) break;
    y1 = Math.min(y1, bottom);
    y0 = Math.max(y0, HUD);
    if (y1 <= y0) continue;
    for (const [column, length, char] of runs[row]) {
      const color = colors[char];
      if (!color) continue;
      const from = flip ? width - column - length : column;
      const x0 = Math.round(left + from * size);
      const x1 = Math.round(left + (from + length) * size);
      if (x1 <= x0 || x1 <= 0 || x0 >= WIDTH) continue;
      c.fillStyle = color;
      c.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
}

/** Las montañas lejanas y los cerros cercanos: alturas que se repiten cada 256 columnas, sin cortes. */
const wave = (x: number, parts: readonly [number, number, number][]) =>
  parts.reduce((sum, [period, size, phase]) => sum + Math.sin(((x / 256) * period + phase) * Math.PI * 2) * size, 0);
const FAR_LINE = Array.from({ length: 256 }, (_, x) => Math.round(26 + wave(x, [[2, 7, 0.1], [5, 5, 0.6], [11, 2.5, 0.3], [23, 1.2, 0.8]])));
const NEAR_LINE = Array.from({ length: 256 }, (_, x) => Math.round(9 + wave(x, [[3, 3, 0.4], [7, 2.5, 0.2], [17, 1.5, 0.7]])));
const STARS = Array.from({ length: 22 }, (_, n) => [(n * 97 + 13) % 256, HUD + 4 + ((n * 53) % 40)]);

function drawSky(c: Ctx, state: State, world: number) {
  const look = lookOf(world);
  const paint = PAINT_OF[world];
  const band = Math.ceil((HORIZON - HUD) / paint.sky.length);
  paint.sky.forEach((color, n) => rect(c, 0, HUD + n * band, WIDTH, band, color));
  // Estrellas y luna, casi quietas: están muy lejos.
  for (const [x, y] of STARS) {
    const sx = (((x - Math.round(state.far * 0.5)) % 256) + 256) % 256;
    if (sx < WIDTH && y < HORIZON - 30) rect(c, sx, y, 1, 1, look.light);
  }
  const moonX = ((((126 - Math.round(state.far * 0.3)) % 200) + 200) % 200) - 30;
  paintScaled(c, cachedRuns(MOON), MOON_COLORS, moonX, 36, 3, HORIZON);
  // Montañas lejanas con su borde claro.
  const far = Math.round(state.far);
  for (let x = 0; x < WIDTH; x++) {
    const h = FAR_LINE[(x + far) & 255];
    rect(c, x, HORIZON - h, 1, h, look.wall);
    rect(c, x, HORIZON - h, 1, 1, look.edge);
  }
  // Cerros cercanos, que siguen hacia abajo (se ven cuando la ruta se esconde tras una loma).
  const near = Math.round(state.near);
  c.fillStyle = paint.hills;
  for (let x = 0; x < WIDTH; x++) {
    const h = NEAR_LINE[(x + near) & 255];
    c.fillRect(x, HORIZON - h, 1, h);
  }
  rect(c, 0, HORIZON, WIDTH, HEIGHT - HORIZON, FIELDS[world]);
}

/* Lo que queda de cada tramo proyectado (se reusa en cada cuadro para no crear basura). */
const P_X0 = new Float64Array(DRAW);
const P_Y0 = new Float64Array(DRAW);
const P_W0 = new Float64Array(DRAW);
const P_X1 = new Float64Array(DRAW);
const P_Y1 = new Float64Array(DRAW);
const P_W1 = new Float64Array(DRAW);
const P_CLIP = new Float64Array(DRAW);
const P_OK = new Uint8Array(DRAW);

/** Pinta una franja de pantalla de un tramo, fila por fila: pasto, bordillos, asfalto y líneas. */
function drawBand(c: Ctx, seg: Seg, index: number, top: number, bottom: number, n: number) {
  const stripe = Math.floor(index / STRIPE) % 2;
  const paint = PAINT_OF[seg.w];
  rect(c, 0, top, WIDTH, bottom - top, paint.grass[stripe]);
  const x0 = P_X0[n];
  const x1 = P_X1[n];
  const w0 = P_W0[n];
  const w1 = P_W1[n];
  const y0 = P_Y0[n];
  const y1 = P_Y1[n];
  const span = y0 - y1;
  for (let y = top; y < bottom; y++) {
    const t = Math.min(1, Math.max(0, (y + 0.5 - y1) / span));
    const x = x1 + (x0 - x1) * t;
    const w = w1 + (w0 - w1) * t;
    const r = w / 6;
    const outerL = Math.round(x - w - r);
    const outerR = Math.round(x + w + r);
    if (outerR < 0 || outerL > WIDTH) continue;
    const roadL = Math.round(x - w);
    const roadR = Math.round(x + w);
    c.fillStyle = RUMBLE[stripe];
    c.fillRect(outerL, y, outerR - outerL, 1);
    if (seg.g) {
      // La línea del arco: cuadros claros y oscuros.
      const cells = 8;
      for (let k = 0; k < cells; k++) {
        const a = Math.round(roadL + ((roadR - roadL) * k) / cells);
        const b = Math.round(roadL + ((roadR - roadL) * (k + 1)) / cells);
        c.fillStyle = (k + (y - top < (bottom - top) / 2 ? 0 : 1)) % 2 ? "#f7f2ff" : "#14101e";
        c.fillRect(a, y, b - a, 1);
      }
      continue;
    }
    c.fillStyle = paint.road[stripe];
    c.fillRect(roadL, y, roadR - roadL, 1);
    if (stripe === 0) {
      const line = Math.max(1, Math.round(w / 28));
      c.fillStyle = LINE;
      c.fillRect(Math.round(x - w / 3 - line / 2), y, line, 1);
      c.fillRect(Math.round(x + w / 3 - line / 2), y, line, 1);
    }
  }
}

/** El arco de faroles: dos postes rojos, dos vigas y faroles colgando. */
function drawGate(c: Ctx, x: number, y: number, w: number, clip: number, time: number, still: boolean) {
  const part = (fromX: number, toX: number, fromY: number, toY: number, color: string) => {
    const left = Math.round(x + fromX * w);
    const right = Math.round(x + toX * w);
    const top = Math.max(HUD, Math.round(y - fromY * w));
    const bottom = Math.min(clip, Math.round(y - toY * w));
    if (right > left && bottom > top) rect(c, left, top, right - left, bottom - top, color);
  };
  const dark = "#2a0c14";
  for (const s of [-1, 1]) {
    part(s * 1.28 - 0.08, s * 1.28 + 0.08, 1.25, 0, dark);
    part(s * 1.28 - 0.055, s * 1.28 + 0.055, 1.22, 0, "#c8332a");
  }
  part(-1.55, 1.55, 1.36, 1.22, dark);
  part(-1.5, 1.5, 1.33, 1.25, "#e04a30");
  part(-1.3, 1.3, 1.08, 1.01, "#c8332a");
  const size = (0.05 * w) / 1;
  if (size < 0.15) return;
  const sway = still ? 0 : Math.sin(time * 2) * 0.02;
  for (let k = -2; k <= 2; k++) {
    const lx = x + (k * 0.48 + sway) * w - (LANTERN[0].length * size) / 2;
    part(k * 0.48 - 0.01, k * 0.48 + 0.01, 1.22, 1.1, dark);
    paintScaled(c, cachedRuns(LANTERN), LANTERN_COLORS, lx, y - 1.1 * w, size, clip);
  }
}

/** La letra flotando: una placa oscura con la letra dorada. */
function drawLetter(c: Ctx, letter: string, x: number, ground: number, size: number, clip: number, look: { edge: string }) {
  const shape = LETTER_SHAPES[letter] ?? LETTER_SHAPES["?"];
  const tile: Sprite = ["kkkkkkkkk", ...shape.map((line) => `ke${line.replace(/\./g, "e").replace(/#/g, "g")}ek`), "kkkkkkkkk"];
  const left = x - (9 * size) / 2;
  const top = ground - 9 * size;
  // El borde claro alrededor de la placa, para que se vea desde lejos.
  const a = Math.round(left - size);
  const b = Math.round(top - size);
  const width = Math.round(left + 10 * size) - a;
  const height = Math.min(clip, Math.round(top + 10 * size)) - Math.max(b, HUD);
  if (width > 0 && height > 0) rect(c, a, Math.max(b, HUD), width, height, look.edge);
  paintScaled(c, runsOf(tile), { k: NIGHT, e: NIGHT, g: GOLD }, left, top, size, clip);
}

function drawRoad(c: Ctx, state: State, time: number, still: boolean, shakeX: number) {
  const pos = state.position;
  const first = Math.floor(pos / SEG);
  const percent = (pos % SEG) / SEG;
  const playerAbs = pos + PLAYER_Z;
  const playerSeg = segAt(state, Math.floor(playerAbs / SEG));
  const playerPercent = (playerAbs % SEG) / SEG;
  const playerY = playerSeg ? playerSeg.y0 + (playerSeg.y1 - playerSeg.y0) * playerPercent : 0;
  const camY = playerY + CAM_H;
  const camX = state.x * ROAD_W;
  const cx = WIDTH / 2 + shakeX;
  let maxY = HEIGHT;
  let x = 0;
  let dx = -((segAt(state, first)?.c ?? 0) * percent);
  P_OK.fill(0);
  for (let n = 0; n < DRAW; n++) {
    const index = first + n;
    const seg = segAt(state, index);
    if (!seg) break;
    const dz0 = index * SEG - pos;
    const dz1 = dz0 + SEG;
    const nearX = x;
    const farX = x + dx;
    x += dx;
    dx += seg.c;
    if (dz0 <= 0) continue;
    const s0 = 1 / dz0;
    const s1 = 1 / dz1;
    P_X0[n] = cx + (nearX - camX) * KX * s0;
    P_X1[n] = cx + (farX - camX) * KX * s1;
    P_Y0[n] = HORIZON + (camY - seg.y0) * KY * s0;
    P_Y1[n] = HORIZON + (camY - seg.y1) * KY * s1;
    P_W0[n] = ROAD_W * KX * s0;
    P_W1[n] = ROAD_W * KX * s1;
    P_CLIP[n] = maxY;
    P_OK[n] = 1;
    const y1 = P_Y1[n];
    // Un tramo que queda detrás de una loma (o que baja de espaldas) no se pinta.
    if (y1 >= maxY || y1 >= P_Y0[n]) continue;
    const top = Math.max(HUD, Math.ceil(y1));
    const bottom = Math.min(maxY, Math.ceil(P_Y0[n]));
    if (bottom > top) drawBand(c, seg, index, top, bottom, n);
    maxY = Math.min(maxY, top);
  }

  // Cosas, autos, letra y arco: de lo más lejano a lo más cercano, cada uno tapado por las lomas de delante.
  const look = lookOf(worldOf(state.stage));
  const byTramo = new Map<number, Rival[]>();
  for (const rival of state.rivals) {
    const n = Math.floor(rival.z / SEG) - first;
    if (n > 0 && n < DRAW) {
      const list = byTramo.get(n);
      if (list) list.push(rival);
      else byTramo.set(n, [rival]);
    }
  }
  const playerN = Math.floor(playerAbs / SEG) - first;
  const bob = still ? 0 : Math.sin(time * 3) * 0.04;
  for (let n = DRAW - 1; n > 0; n--) {
    if (n === playerN) drawPlayer(c, state, time, still, shakeX);
    if (!P_OK[n]) continue;
    const index = first + n;
    const seg = segAt(state, index);
    if (!seg) continue;
    const clip = P_CLIP[n];
    const sx = P_X0[n];
    const sy = P_Y0[n];
    const w = P_W0[n];
    if (sy - w * 3 >= clip) continue;
    if (seg.g) drawGate(c, sx, sy, w, clip, time, still);
    for (let k = 0; k < seg.d.length; k += 2) {
      const deco = DECOS[seg.d[k]];
      const offset = seg.d[k + 1];
      const size = deco.pix * w;
      if (size < 0.2) continue;
      const wide = deco.rows[0].length;
      paintScaled(c, cachedRuns(deco.rows), deco.colors, sx + offset * w - (wide * size) / 2, sy - deco.rows.length * size, size, clip, offset < 0, wide);
    }
    const rivals = byTramo.get(n);
    if (rivals) {
      rivals.sort((a, b) => b.z - a.z);
      for (const rival of rivals) {
        const f = (rival.z % SEG) / SEG;
        const rw = P_W0[n] + (P_W1[n] - P_W0[n]) * f;
        const rx = P_X0[n] + (P_X1[n] - P_X0[n]) * f + rival.x * rw;
        const ry = P_Y0[n] + (P_Y1[n] - P_Y0[n]) * f;
        const size = CAR_PIX * rw;
        if (size < 0.12) continue;
        paintScaled(c, cachedRuns(RIVAL), PAINTS[rival.paint], rx - 8 * size, ry - 12 * size, size, clip);
      }
    }
    if (state.letter && state.letter.seg === index) {
      const size = 0.09 * w;
      if (size >= 0.1) drawLetter(c, NAME[state.letters] ?? "?", sx + state.letter.x * w, sy - (0.3 + bob) * w, size, clip, look);
    }
  }
  if (playerN <= 0 || playerN >= DRAW) drawPlayer(c, state, time, still, shakeX);
}

/** El auto del jugador: al doble de tamaño, abajo al centro, con un pequeño balanceo y la parte de arriba inclinada al girar. */
function drawPlayer(c: Ctx, state: State, time: number, still: boolean, shakeX: number) {
  const runs = runsOf(CAR);
  const width = CAR[0]?.length ?? 16;
  const height = CAR.length;
  const moving = state.speed > MAX_SPEED * 0.05;
  const bob = still || !moving ? 0 : state.offroad ? (Math.floor(time * 14) % 2) * 2 : Math.floor(time * 7) % 2;
  const left = WIDTH / 2 - width + shakeX + state.steer;
  const top = CAR_BOTTOM - height * 2 - bob;
  c.fillStyle = "rgba(6, 4, 14, 0.45)";
  c.fillRect(left + 2, CAR_BOTTOM - 3, width * 2 - 4, 4);
  // Arriba se corre un píxel hacia donde gira: parece que el auto se inclina.
  const half = Math.floor(height / 2);
  paintScaled(c, runs.slice(0, half), CAR_COLORS, left + state.steer, top, 2, HEIGHT);
  paintScaled(c, runs.slice(half), CAR_COLORS, left, top + half * 2, 2, HEIGHT);
}

const CLOCK: Sprite = [".kkk.", "kwkwk", "kwkwk", "kwkkk", "kwwwk", ".kkk."];

function drawHud(c: Ctx, state: State, time: number, still: boolean) {
  const look = lookOf(worldOf(state.stage));
  rect(c, 0, 0, WIDTH, HUD, NIGHT);
  rect(c, 0, HUD - 1, WIDTH, 1, look.edge);
  write(c, String(scoreOf(state)), 5, 3, INK);
  const stage = `ETAPA ${state.stage}`;
  write(c, stage, Math.round((WIDTH - widthOf(stage)) / 2) + 6, 3, DIM);
  // El tiempo, donde otros juegos ponen los corazones: rojo y parpadeando al final.
  const seconds = String(Math.ceil(state.left));
  const hurry = state.left < 10 && !state.over;
  const color = hurry ? (still || Math.floor(time * 4) % 2 === 0 ? HEART : INK) : GOLD;
  const tx = WIDTH - 5 - widthOf(seconds);
  write(c, seconds, tx, 3, color);
  paintScaled(c, cachedRuns(CLOCK), { k: color, w: NIGHT }, tx - 8, 3, 1, HUD);
  drawName(c, 13, Math.min(state.letters, NAME.length), 1, !still && state.letter !== null, time);
  // Velocímetro: el número y una barra de bloques que se encienden.
  const speed = kmh(state.speed);
  write(c, String(speed), 5, 13, INK);
  const blocks = 16;
  const lit = Math.round((state.speed / MAX_SPEED) * blocks);
  const from = WIDTH - 5 - blocks * 2;
  for (let k = 0; k < blocks; k++) {
    const on = k < lit;
    const tone = k < 9 ? "#6fae45" : k < 13 ? GOLD : HEART;
    rect(c, from + k * 2, 19 - Math.floor(k / 4), 1, 2 + Math.floor(k / 4), on ? tone : "#2a2440");
  }
}

function drawBanner(c: Ctx, state: State) {
  if (state.bannerTime <= 0 || state.banner.length === 0) return;
  const [title, ...rest] = state.banner;
  const scale = widthOf(title, 2) <= WIDTH - 8 ? 2 : 1;
  outlined(c, title, Math.round((WIDTH - widthOf(title, scale)) / 2), 40, GOLD, scale);
  rest.forEach((line, n) => outlined(c, line, Math.round((WIDTH - widthOf(line)) / 2), 60 + n * 11, INK));
}

/* ---------- El juego ---------- */

export default defineGame<State>({
  help: "Flechas izquierda y derecha para girar, arriba o espacio para acelerar, abajo para frenar. Con el dedo, toca el lado hacia donde quieres girar. Pasa los arcos de faroles antes de que se acabe el tiempo y junta las letras del nombre.",
  create: (seed) => createRace(seed),
  pad: () => [
    [
      { key: "left", glyph: "←", label: "Izquierda" },
      { key: "right", glyph: "→", label: "Derecha" },
    ],
    [
      { key: "down", glyph: "↓", label: "Frenar" },
      { key: "fire", glyph: "▶", label: "Acelerar", main: true },
    ],
  ],
  step: stepRace,
  draw(c, state, time, still) {
    const world = worldOf(state.stage);
    drawFrame(c, world);
    drawSky(c, state, world);
    const shakeX = still || state.shake <= 0 ? 0 : Math.round(Math.sin(time * 70) * 3 * Math.min(1, state.shake / 0.3));
    drawRoad(c, state, time, still, shakeX);
    drawBanner(c, state);
    drawHud(c, state, time, still);
    const look = lookOf(world);
    rect(c, 0, HEIGHT - 1, WIDTH, 1, look.edge);
    rect(c, 0, 0, 1, HEIGHT, look.edge);
    rect(c, WIDTH - 1, 0, 1, HEIGHT, look.edge);
    rect(c, 0, 0, WIDTH, 1, look.edge);
    if (state.over) center(c, `${scoreOf(state)} PUNTOS`, 84, INK);
  },
  status: (state) => ({
    score: scoreOf(state),
    lives: 0,
    level: state.stage,
    letters: Math.min(state.letters, NAME.length),
    world: worldOf(state.stage),
    over: state.over,
  }),
});
