/**
 * "Parejas de Espíritus": cartas boca abajo en una rejilla. Se tocan dos; si
 * tienen el mismo dibujo se quedan descubiertas, y si no, se vuelven a tapar.
 * Son tres rondas, cada una con más cartas. Al terminar la tercera se abre el
 * mensaje secreto.
 *
 * Puntos: cada pareja da 100, más 50 por cada pareja seguida que se encontró
 * justo antes (la racha). Al cerrar una ronda hay un bono por rapidez:
 * 600 menos 5 por cada segundo que tomó (nunca menos de 0).
 */

import { paintSprite, rect, type Colors, type Ctx, type Sprite } from "../art";
import { lettersOf } from "../../../lib/game-name";
import { CUSTOM, DIM, FLOWER, FLOWER_COLORS, GOLD, HEIGHT, INK, LETTER_SHAPES, NAME, NIGHT, NINJA, NINJA_COLORS, SPIRIT, SPIRIT_COLORS, WIDTH, center, drawFrame, drawTop, lookOf, outlined, scaleSprite, widthOf, write } from "./kit";
import { defineGame, roll, type Key } from "./types";

/* ---------- Medidas ---------- */

export const CARD_W = 26;
export const CARD_H = 28;
const GAP_X = 4;
const GAP_Y = 3;
/** El tablero de cartas va de aquí hacia abajo, debajo del marcador. */
export const BOARD_TOP = 27;
const BOARD_BOTTOM = HEIGHT - 4;
export const COLS = 4;
/** Filas de cada ronda: 4 × 4, 4 × 5 y 4 × 6. */
export const ROUND_ROWS = [4, 5, 6] as const;
export const ROUNDS = ROUND_ROWS.length;

/** Lo que dura el giro de una carta (en segundos). */
export const FLIP = 0.15;
/** Lo que se ven dos cartas distintas antes de taparse otra vez. */
export const SHOW = 0.8;
/** Lo que dura el destello de una pareja encontrada. */
const GLOW = 0.6;
/** Pausa al cerrar una ronda (para ver el bono) y aviso de la ronda nueva. */
const PAUSE = 1.4;
const BANNER = 1.3;

/* ---------- Dibujos de las caras ---------- */

/**
 * Las caras se dibujan sin contorno y aquí se les pone uno oscuro alrededor,
 * así no hay que contar a mano los píxeles del borde.
 */
function outline(rows: readonly string[]): Sprite {
  const width = Math.max(...rows.map((row) => row.length)) + 2;
  const grid = ["", ...rows, ""].map((row) => `.${row}`.padEnd(width, ".").split(""));
  const filled = (x: number, y: number) => {
    const char = rows[y - 1]?.[x - 1];
    return char !== undefined && char !== ".";
  };
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < width; x++) {
      if (filled(x, y)) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) grid[y][x] = "k";
    }
  }
  return grid.map((row) => row.join(""));
}

/** Dibuja con una regla: para cada píxel, qué letra va (o "." si nada). */
function shape(width: number, height: number, pick: (x: number, y: number) => string): string[] {
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) row += pick(x, y);
    rows.push(row);
  }
  return rows;
}

/** Una letra de NATHALIA al doble de tamaño, dorada y con sombra abajo en cada cuadrito. */
const bigLetter = (char: string) =>
  outline(LETTER_SHAPES[char].flatMap((row) => {
    const wide = row.replace(/#/g, "##").replace(/\./g, "..");
    return [wide.replace(/#/g, "g"), wide.replace(/#/g, "d")];
  }));

type Face = { name: string; rows: Sprite; colors: Colors };

const K = "#1a1024";
const LETTER_COLORS: Colors = { k: K, g: "#ffd684", d: "#d39a3a" };

const PICTURES: readonly Face[] = [
  {
    name: "la protagonista",
    rows: outline([
      "..bbbbbbbb...",
      ".bbbbbbbbbb..",
      "bbbbbbbbbbbbt",
      "sseesssseesst",
      "sssssssssssst",
      "bbbbbbbbbbbb.",
      ".bbbbbbbbbb..",
      "..tttttttt...",
      ".bbbbbbbbbb..",
      ".bbbbbbbbbb..",
      ".bbbb..bbbb..",
    ]),
    colors: { k: K, b: "#5f6be0", s: "#f3cba6", e: "#1b1030", t: "#3be6c6" },
  },
  {
    name: "espíritu",
    rows: outline([
      "...wwwwww...",
      "..wwwwwwwww.",
      ".wwwwwwwwwwc",
      ".wweewwweewc",
      ".wweewwweewc",
      ".wpwwwwwwpwc",
      "wwwwwmmwwwwc",
      "wwwwwwwwwwwc",
      "wwwwwwwwwwwc",
      "wwwwwwwwwwwc",
      "ww.www.wwww.",
      "w...w...ww..",
    ]),
    colors: { k: "#143540", w: "#effcff", c: "#9fd4e4", e: "#143540", p: "#ff9fc0", m: "#4a7a8a" },
  },
  {
    name: "flor de cerezo",
    rows: outline([
      "....pp....",
      "...plpp...",
      "pp.pppp.pp",
      "plpdppdplp",
      "pppdyydppp",
      ".pdyyyydp.",
      ".ppdyydpp.",
      "pppddddppp",
      "plpp..pplp",
      ".pp....pp.",
    ]),
    colors: { k: "#5a1838", p: "#f58fbd", l: "#ffd6e8", d: "#c9578f", y: "#ffd95e" },
  },
  {
    name: "farol",
    rows: outline([
      "...gggg...",
      "..kkkkkk..",
      ".rrooyorr.",
      "rrooyyyorr",
      "dddddddddd",
      "rrooyyyorr",
      "rrooyyyorr",
      "dddddddddd",
      "rrooyyyorr",
      ".rroooorr.",
      "..kkkkkk..",
      "...gggg...",
      "....gg....",
      "....g.....",
    ]),
    colors: { k: "#1a0f14", r: "#ee4f2c", d: "#8a2418", o: "#ffa23f", y: "#ffe58c", g: "#ffd684" },
  },
  {
    name: "luna",
    rows: outline(
      shape(12, 12, (x, y) => {
        const outer = (x - 5.5) ** 2 + (y - 5.5) ** 2 <= 36;
        const bite = (x - 8.5) ** 2 + (y - 3.5) ** 2 <= 22;
        if (!outer || bite) return ".";
        return (x - 5.5) ** 2 + (y - 5.5) ** 2 > 22 && x < 5 ? "y" : (x + y) % 7 === 0 ? "d" : "w";
      }),
    ),
    colors: { k: "#3a2a10", y: "#e2c87a", w: "#fff1b8", d: "#f0d890" },
  },
  {
    name: "estrella",
    rows: outline([
      ".....yy.....",
      ".....yy.....",
      "....yyyy....",
      "....ywwy....",
      "yyyyywwyyyyy",
      ".yyyywwyyyy.",
      "..yyyyyyyy..",
      "...yyyyyy...",
      "...yyyyyy...",
      "..yyyy.yyyy.",
      "..yyy...yyy.",
      ".yy.......yy",
    ].map((row) => row.slice(0, 12))),
    colors: { k: "#2a2a5a", y: "#ffe27a", w: "#ffffff" },
  },
  {
    name: "fuego azul",
    rows: outline([
      ".....b......",
      "....bb......",
      "....bbb..b..",
      "...bbbb.bb..",
      "..bbbcbbbb..",
      "..bbccbbbbb.",
      ".bbbcccbbbb.",
      ".bbccwccbbb.",
      ".bbcwwwccbb.",
      ".bbcwwwwcbb.",
      "..bccwwccb..",
      "...bbccbb...",
    ]),
    colors: { k: "#061a40", b: "#2f6bee", c: "#5fd0ff", w: "#e8fcff" },
  },
  {
    name: "amuleto de papel",
    rows: outline([
      "...gg...",
      "...gg...",
      "pppppppp",
      "prrrrrrp",
      "pppppppp",
      "pprrrrpp",
      "pppprppp",
      "pprrrrpp",
      "pppprppp",
      "pprrprpp",
      "pppppppp",
      "pprrrrpp",
      "pppppppp",
    ]),
    colors: { k: "#3a2a20", p: "#fff3d6", r: "#d8352a", g: "#ffd684" },
  },
  {
    name: "abanico",
    rows: outline(
      shape(13, 11, (x, y) => {
        const dx = x - 6;
        const dy = 8 - y;
        const r = Math.hypot(dx, dy);
        if (dy >= 0 && r <= 6.6 && r >= 1.6) {
          const sector = Math.floor(((Math.atan2(dy, dx) + 0.01) / Math.PI) * 6);
          return sector % 2 === 0 ? "r" : "w";
        }
        if (dy >= -2 && r < 1.6) return "g";
        if (y >= 9 && x === 6) return "g";
        return ".";
      }),
    ),
    colors: { k: "#2a0a18", r: "#e0406a", w: "#ffe0ea", g: "#ffd684" },
  },
  {
    name: "campana",
    rows: outline([
      ".....dd.....",
      "....gggg....",
      "...gggggg...",
      "..ggwggggg..",
      "..gwgggggd..",
      "..gwgggggd..",
      ".gggggggggd.",
      ".gggggggggd.",
      "gggggggggggd",
      "dddddddddddd",
      ".....dd.....",
      ".....dd.....",
    ]),
    colors: { k: "#3a2408", g: "#ffc44a", d: "#c47a1c", w: "#fff4c8" },
  },
  {
    name: "montaña con luna",
    rows: outline([
      "........yy..",
      ".......yyyy.",
      ".......yyyy.",
      "........yy..",
      ".....ww.....",
      "....wwww....",
      "...wwmwmw...",
      "..mmmmmmmmm.",
      ".mmmmmmnmmmm",
      "mmmmmnnnmmmm",
      "mmmmnnnnnmmm",
    ]),
    colors: { k: "#10142a", y: "#fff1b8", w: "#ffffff", m: "#6a78b8", n: "#454f88" },
  },
  {
    name: "pez koi",
    rows: outline([
      "....oo.......",
      "..ooowwo.....",
      ".owwwwooo..ff",
      "oewwooowwwfff",
      "owwwoowwwwff.",
      ".owwwwwwoo.ff",
      "..ooowwoo...f",
      "....oo.......",
    ]),
    colors: { k: "#2a0e06", o: "#ff7a2c", w: "#fff6ea", e: "#1a0a06", f: "#ffb27a" },
  },
];

/** Si hay dibujos propios de los personajes, las cartas de la protagonista, el compañero y la flor los usan (al doble de tamaño). */
function customized(face: Face): Face {
  if (face.name === "la protagonista" && CUSTOM.heroSmall) return { name: face.name, rows: scaleSprite(NINJA[0], 2), colors: NINJA_COLORS };
  if (face.name === "espíritu" && CUSTOM.friendSmall) return { name: face.name, rows: scaleSprite(SPIRIT[0], 2), colors: SPIRIT_COLORS[0] };
  if (face.name === "flor de cerezo" && CUSTOM.prizeSmall) return { name: face.name, rows: scaleSprite(FLOWER, 3), colors: FLOWER_COLORS };
  return face;
}

let built = { stamp: "", faces: [] as Face[] };
/** Las caras de las cartas: los dibujos y hasta seis letras distintas del nombre. Se rehacen si cambia la personalización. */
export function faces(): readonly Face[] {
  const stamp = `${CUSTOM.version}:${NAME}`;
  if (built.stamp !== stamp) {
    const letters = lettersOf(NAME).slice(0, 6).map((char) => ({ name: `letra ${char}`, rows: bigLetter(char), colors: LETTER_COLORS }));
    built = { stamp, faces: [...PICTURES.map(customized), ...letters] };
  }
  return built.faces;
}

/** La luna del dorso de las cartas. */
const BACK_MOON = outline(["..yy.", ".yy..", "yy...", "yy...", "yy...", ".yy..", "..yy."]);
const BACK_MOON_COLORS: Colors = { k: "#1a1440", y: "#ffd684" };

/* ---------- Estado ---------- */

export type Card = {
  face: number;
  /** Boca arriba (o girando hacia arriba). */
  up: boolean;
  matched: boolean;
  /** Tiempo que le falta al giro (0 = quieta). */
  turn: number;
  /** Tiempo que le falta al destello de pareja. */
  glow: number;
};

export type State = {
  random: number;
  round: number;
  cards: Card[];
  /** Cartas volteadas que esperan su pareja (0, 1 o 2). */
  open: number[];
  /** Mientras es mayor que 0, dos cartas distintas se están mostrando y no se puede tocar otra. */
  wait: number;
  streak: number;
  score: number;
  /** Segundos que va tomando la ronda (para el bono). */
  clock: number;
  /** Pausa tras cerrar una ronda; al llegar a 0 empieza la siguiente (o termina). */
  pause: number;
  /** Lo que se ganó de bono en la ronda que se acaba de cerrar. */
  bonus: number;
  /** Aviso "RONDA N" al empezar una ronda nueva. */
  banner: number;
  cursor: number;
  /** Si se está jugando con teclado (entonces se ve el cursor). */
  keys: boolean;
  secret: boolean;
  over: boolean;
};

export const rowsOf = (round: number) => ROUND_ROWS[Math.min(round, ROUNDS) - 1];
export const pairsOf = (round: number) => (COLS * rowsOf(round)) / 2;

/** Esquina superior izquierda de la carta número `index` en la ronda `round`. */
export function cardAt(round: number, index: number): { x: number; y: number } {
  const rows = rowsOf(round);
  const left = Math.round((WIDTH - (COLS * CARD_W + (COLS - 1) * GAP_X)) / 2);
  const height = rows * CARD_H + (rows - 1) * GAP_Y;
  const top = BOARD_TOP + Math.floor((BOARD_BOTTOM - BOARD_TOP - height) / 2);
  return { x: left + (index % COLS) * (CARD_W + GAP_X), y: top + Math.floor(index / COLS) * (CARD_H + GAP_Y) };
}

/** Reparte las cartas de una ronda: se eligen caras al azar, dos de cada una, y se barajan. */
function deal(state: State, round: number) {
  const order = faces().map((_, index) => index);
  shuffle(state, order);
  const pairs = pairsOf(round);
  const chosen = order.slice(0, pairs).flatMap((face) => [face, face]);
  shuffle(state, chosen);
  state.round = round;
  state.cards = chosen.map((face) => ({ face, up: false, matched: false, turn: 0, glow: 0 }));
  state.open = [];
  state.wait = 0;
  state.clock = 0;
  state.streak = 0;
  state.cursor = Math.min(state.cursor, state.cards.length - 1);
}

function shuffle(state: State, list: number[]) {
  for (let index = list.length - 1; index > 0; index--) {
    const other = Math.floor(roll(state) * (index + 1));
    [list[index], list[other]] = [list[other], list[index]];
  }
}

export function createParejas(seed: number): State {
  const state: State = {
    random: seed >>> 0,
    round: 1,
    cards: [],
    open: [],
    wait: 0,
    streak: 0,
    score: 0,
    clock: 0,
    pause: 0,
    bonus: 0,
    banner: 0,
    cursor: 0,
    keys: false,
    secret: false,
    over: false,
  };
  deal(state, 1);
  return state;
}

/** Se puede tocar una carta solo si está tapada, quieta y no hay otra pareja mostrándose. */
const busy = (state: State) => state.over || state.pause > 0 || state.banner > 0 || state.wait > 0;

const MOVES: Partial<Record<Key, [number, number]>> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

export default defineGame<State>({
  help: "Toca dos cartas para voltearlas y encuentra las parejas iguales. Con teclado, las flechas eligen carta y la barra espaciadora la voltea. Son tres rondas.",
  create: (seed) => createParejas(seed),
  pad: () => [[], []],
  step(state, dt, input, out) {
    for (const card of state.cards) {
      card.turn = Math.max(0, card.turn - dt);
      card.glow = Math.max(0, card.glow - dt);
    }
    if (state.over) return;

    // Ronda cerrada: se deja ver el bono un momento y luego viene la siguiente (o el final).
    if (state.pause > 0) {
      state.pause -= dt;
      if (state.pause > 0) return;
      state.pause = 0;
      if (state.round >= ROUNDS) {
        state.over = true;
        return;
      }
      deal(state, state.round + 1);
      state.banner = BANNER;
      out.sound("level");
      out.say(`Ronda ${state.round}: ${pairsOf(state.round)} parejas.`);
      return;
    }
    if (state.banner > 0) {
      state.banner = Math.max(0, state.banner - dt);
      return;
    }
    state.clock += dt;

    // Dos cartas distintas: al acabar de mostrarse, las dos se tapan a la vez.
    if (state.wait > 0) {
      state.wait -= dt;
      if (state.wait <= 0) {
        state.wait = 0;
        for (const index of state.open) {
          state.cards[index].up = false;
          state.cards[index].turn = FLIP;
        }
        state.open = [];
        out.sound("drop");
      }
    }

    const rows = rowsOf(state.round);
    let flip: number | null = null;
    for (const key of input.pressed) {
      const move = MOVES[key];
      if (move) {
        state.keys = true;
        const column = Math.max(0, Math.min(COLS - 1, (state.cursor % COLS) + move[0]));
        const row = Math.max(0, Math.min(rows - 1, Math.floor(state.cursor / COLS) + move[1]));
        state.cursor = row * COLS + column;
      } else if (key === "fire") {
        state.keys = true;
        flip = state.cursor;
      }
    }
    for (const tap of input.taps) {
      const index = state.cards.findIndex((_, i) => {
        const { x, y } = cardAt(state.round, i);
        return tap.x >= x - 1 && tap.x < x + CARD_W + 1 && tap.y >= y - 1 && tap.y < y + CARD_H + 1;
      });
      if (index >= 0) {
        state.cursor = index;
        flip = index;
      }
    }
    if (flip === null || busy(state)) return;

    const card = state.cards[flip];
    if (card.up || card.matched) return;
    card.up = true;
    card.turn = FLIP;
    state.open.push(flip);
    out.sound("rotate");
    out.say(faces()[card.face].name);
    if (state.open.length < 2) return;

    const [first, second] = state.open.map((index) => state.cards[index]);
    if (first.face !== second.face) {
      state.streak = 0;
      state.wait = SHOW + FLIP;
      return;
    }
    // ¡Pareja! La racha suma 50 por cada pareja seguida que vino antes.
    first.matched = second.matched = true;
    first.glow = second.glow = GLOW + FLIP;
    state.open = [];
    state.score = Math.min(999999, state.score + 100 + 50 * state.streak);
    state.streak += 1;

    if (state.cards.every((each) => each.matched)) {
      state.bonus = Math.max(0, 600 - 5 * Math.floor(state.clock));
      state.score = Math.min(999999, state.score + state.bonus);
      state.pause = PAUSE;
      if (state.round >= ROUNDS) {
        out.sound("letter");
        out.say(`¡Completaste las tres rondas! Bono de tiempo: ${state.bonus}.`);
        if (!state.secret) {
          state.secret = true;
          out.secret();
        }
      } else {
        out.sound("clear2");
        out.say(`Ronda ${state.round} completa. Bono de tiempo: ${state.bonus}.`);
      }
    } else out.sound("clear");
  },
  draw(c, state, time, still) {
    const world = state.round - 1;
    const look = lookOf(world);
    drawFrame(c, world);
    drawTop(c, state.score, 0);
    const seconds = Math.floor(state.clock);
    const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    write(c, clock, WIDTH - 5 - widthOf(clock), 5, DIM);
    write(c, `RONDA ${state.round}`, 5, 16, look.edge);
    const found = state.cards.filter((card) => card.matched).length / 2;
    const pairs = `${found}/${state.cards.length / 2}`;
    write(c, pairs, WIDTH - 5 - widthOf(pairs), 16, GOLD);
    if (state.streak >= 2) center(c, `X${state.streak}`, 16, INK);

    state.cards.forEach((card, index) => {
      const { x, y } = cardAt(state.round, index);
      drawCard(c, card, x, y, still);
    });

    // Cursor de teclado: un marco dorado que respira (fijo con menos movimiento).
    if (state.keys && !state.over && state.pause <= 0 && state.cards[state.cursor]) {
      const { x, y } = cardAt(state.round, state.cursor);
      const on = still || Math.floor(time * 3) % 3 !== 0;
      const color = on ? GOLD : "#a0783a";
      rect(c, x - 2, y - 2, CARD_W + 4, 1, color);
      rect(c, x - 2, y + CARD_H + 1, CARD_W + 4, 1, color);
      rect(c, x - 2, y - 2, 1, CARD_H + 4, color);
      rect(c, x + CARD_W + 1, y - 2, 1, CARD_H + 4, color);
    }

    if (state.pause > 0) {
      const last = state.round >= ROUNDS;
      panel(c, 84, 50);
      center(c, last ? "¡LO LOGRASTE!" : "¡RONDA LISTA!", 92, INK);
      outlined(c, `+${state.bonus}`, Math.round((WIDTH - widthOf(`+${state.bonus}`, 2)) / 2), 104, GOLD, 2);
      center(c, "BONO DE TIEMPO", 122, DIM);
    } else if (state.banner > 0) {
      panel(c, 92, 34);
      const text = `RONDA ${state.round}`;
      outlined(c, text, Math.round((WIDTH - widthOf(text, 2)) / 2), 102, GOLD, 2);
    }
  },
  status: (state) => ({
    score: state.score,
    lives: 0,
    level: state.round,
    letters: 0,
    world: state.round - 1,
    over: state.over,
    result: state.over ? "¡Completaste las tres rondas!" : undefined,
  }),
});

/** Recuadro oscuro con borde dorado para los avisos encima de las cartas. */
function panel(c: Ctx, y: number, height: number) {
  rect(c, 10, y - 1, WIDTH - 20, height + 2, GOLD);
  rect(c, 11, y, WIDTH - 22, height, NIGHT);
}

const PAPER = "#f6ecd2";
const PAPER_SHADE = "#d9c49a";
const INDIGO = "#2a2168";
const INDIGO_LIGHT = "#3f3494";

/**
 * Una carta. Al girar se angosta (26 → 16 → 4 px), cambia de lado y se vuelve a
 * ensanchar: tres cuadros que bastan para que se lea como un giro.
 */
function drawCard(c: Ctx, card: Card, x: number, y: number, still: boolean) {
  let width = CARD_W;
  let faceUp = card.up;
  if (card.turn > 0 && !still) {
    const progress = 1 - card.turn / FLIP;
    width = progress < 1 / 3 || progress >= 2 / 3 ? 16 : 4;
    if (progress < 1 / 2) faceUp = !card.up;
  }
  const left = x + Math.floor((CARD_W - width) / 2);
  rect(c, left + 1, y + CARD_H, width - 1, 1, "rgba(0, 0, 0, 0.5)");
  if (width < CARD_W) {
    // Mientras gira solo se ve el papel, sin el dibujo.
    rect(c, left, y, width, CARD_H, K);
    rect(c, left + 1, y + 1, width - 2, CARD_H - 2, faceUp ? PAPER : GOLD);
    if (width > 4) rect(c, left + 2, y + 2, width - 4, CARD_H - 4, faceUp ? PAPER : INDIGO);
    return;
  }
  if (!faceUp) {
    rect(c, x, y, CARD_W, CARD_H, K);
    rect(c, x + 1, y + 1, CARD_W - 2, CARD_H - 2, GOLD);
    rect(c, x + 2, y + 2, CARD_W - 4, CARD_H - 4, INDIGO);
    rect(c, x + 4, y + 4, CARD_W - 8, CARD_H - 8, INDIGO_LIGHT);
    rect(c, x + 5, y + 5, CARD_W - 10, CARD_H - 10, INDIGO);
    paintSprite(c, BACK_MOON, BACK_MOON_COLORS, x + 9, y + 9);
    rect(c, x + 17, y + 8, 1, 1, GOLD);
    rect(c, x + 8, y + 19, 1, 1, GOLD);
    return;
  }
  const glowing = card.glow > 0 && card.glow <= GLOW && !still;
  rect(c, x, y, CARD_W, CARD_H, card.matched ? GOLD : K);
  rect(c, x + 1, y + 1, CARD_W - 2, CARD_H - 2, glowing && Math.floor(card.glow * 12) % 2 === 0 ? "#fffbea" : PAPER);
  rect(c, x + 1, y + CARD_H - 3, CARD_W - 2, 2, PAPER_SHADE);
  const face = faces()[card.face];
  const w = face.rows[0].length;
  const h = face.rows.length;
  paintSprite(c, face.rows, face.colors, x + Math.floor((CARD_W - w) / 2), y + Math.floor((CARD_H - 2 - h) / 2));
  if (glowing) {
    // Destello: cuatro chispas que se alejan de las esquinas.
    const spread = Math.round((1 - card.glow / GLOW) * 4);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = sx < 0 ? x - spread : x + CARD_W - 1 + spread;
      const cy = sy < 0 ? y - spread : y + CARD_H - 1 + spread;
      rect(c, cx - 1, cy, 3, 1, "#fff6c0");
      rect(c, cx, cy - 1, 1, 3, "#fff6c0");
    }
  }
}
