/**
 * "Dragón de Papel": un dragón de festival recorre el jardín casilla a casilla.
 * Come flores de cerezo para crecer y, de vez en cuando, aparece la siguiente
 * letra de NATHALIA: si la alcanza antes de que se vaya, crece más. Con las
 * ocho letras se gana el mensaje secreto y una vida, y el nombre empieza otra vez.
 * Si choca con la cerca o consigo mismo, pierde una vida y vuelve al centro.
 */

import { paintSprite, rect, type Colors, type Ctx, type Sprite } from "../art";
import { UI } from "../texts";
import { WORLD_COUNT, worldName } from "../worlds";
import { DIM, FLOWER, FLOWER_COLORS, GOLD, INK, NAME, NIGHT, WIDTH, center, drawFrame, drawName, drawTop, lookOf, outlined, widthOf, write } from "./kit";
import { defineGame, roll, type Dir, type Point } from "./types";

/* ---------- Medidas ---------- */

export const COLS = 15;
export const ROWS = 22;
const TILE = 8;
const LEFT = (WIDTH - COLS * TILE) / 2; // 4: deja sitio para la cerca a cada lado
const TOP = 28; // debajo del marcador y del nombre
const FENCE = 4;

const START_LENGTH = 3;
const START_LIVES = 3;
const MAX_LIVES = 5;
/** Segundos que espera quieto antes de arrancar solo (al empezar y al reaparecer). */
const READY_TIME = 1.5;
/** Pausa después de un choque, antes de reaparecer. */
const CRASH_TIME = 0.9;
/** Cuánto dura una letra en el jardín antes de irse volando. */
const LETTER_TIME = 9;

const STEP: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const OPPOSITE: Record<Dir, Dir> = { left: "right", right: "left", up: "down", down: "up" };
const DIRS: readonly Dir[] = ["left", "right", "up", "down"];
const isDir = (key: string): key is Dir => (DIRS as readonly string[]).includes(key);

export type State = {
  random: number;
  /** Casillas del dragón: la primera es la cabeza. */
  body: Point[];
  /** Dónde estaba cada parte antes del último paso (para dibujarlo avanzando suave). */
  last: Point[];
  dir: Dir;
  /** Giros pedidos que todavía no se hicieron (hasta 2), para que un giro rápido no se pierda. */
  turns: Dir[];
  /** Tiempo acumulado hacia el siguiente paso. */
  clock: number;
  /** Partes que le faltan por crecer. */
  grow: number;
  flower: Point | null;
  letter: (Point & { time: number }) | null;
  /** Segundos de vuelo que faltan para que aparezca la siguiente letra. */
  letterWait: number;
  /** Letras de NATHALIA juntadas en esta vuelta del nombre (0 a 7). */
  letters: number;
  secretDone: boolean;
  /** Mayor que cero: el dragón espera quieto a que se le dé una orden (o a que pase el tiempo). */
  ready: number;
  /** Mayor que cero: acaba de chocar y está en la pausa. */
  crash: number;
  flowers: number;
  score: number;
  lives: number;
  level: number;
  over: boolean;
  time: number;
};

const worldOf = (level: number) => (level - 1) % WORLD_COUNT;
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const addScore = (state: State, points: number) => {
  state.score = Math.min(999999, state.score + points);
};

/** Más largo, más rápido: de 5 pasos por segundo a casi 14. */
export const intervalOf = (length: number) => Math.max(0.072, 0.2 - (length - START_LENGTH) * 0.0045);

/** Dragón corto en el centro, mirando hacia arriba, con la cola hacia abajo. */
function centerDragon(): Point[] {
  const x = Math.floor(COLS / 2);
  const y = Math.floor(ROWS / 2);
  return Array.from({ length: START_LENGTH }, (_, i) => ({ x, y: y + i }));
}

function isFree(state: State, x: number, y: number) {
  if (state.body.some((part) => part.x === x && part.y === y)) return false;
  if (state.flower && state.flower.x === x && state.flower.y === y) return false;
  if (state.letter && state.letter.x === x && state.letter.y === y) return false;
  // Nada justo delante de la cabeza: así no aparece algo que se coma sin querer.
  const head = state.body[0];
  const [dx, dy] = STEP[state.dir];
  return !(x === head.x + dx && y === head.y + dy);
}

/** Una casilla libre al azar, o null si el jardín está lleno. */
function freeCell(state: State): Point | null {
  const free: Point[] = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (isFree(state, x, y)) free.push({ x, y });
  if (free.length === 0) return null;
  return free[Math.floor(roll(state) * free.length)];
}

export function createDragon(seed: number): State {
  const body = centerDragon();
  const state: State = {
    random: seed >>> 0,
    body,
    last: body.map((part) => ({ ...part })),
    dir: "up",
    turns: [],
    clock: 0,
    grow: 0,
    flower: null,
    letter: null,
    letterWait: 0,
    letters: 0,
    secretDone: false,
    ready: READY_TIME,
    crash: 0,
    flowers: 0,
    score: 0,
    lives: START_LIVES,
    level: 1,
    over: false,
    time: 0,
  };
  state.flower = freeCell(state);
  state.letterWait = 5 + roll(state) * 4;
  return state;
}

/** Guarda un giro si tiene sentido: ni el mismo rumbo ni media vuelta sobre sí mismo. */
function wantTurn(state: State, dir: Dir) {
  const before = state.turns.length > 0 ? state.turns[state.turns.length - 1] : state.dir;
  if (dir === before || dir === OPPOSITE[before]) return;
  if (state.turns.length < 2) state.turns.push(dir);
}

type Events = { sound: (name: "move" | "clear" | "clear2" | "level" | "letter" | "lock" | "over") => void; say: (text: string) => void; secret: () => void };

function crash(state: State, out: Events) {
  state.lives -= 1;
  state.turns = [];
  out.sound("lock");
  if (state.lives <= 0) {
    state.lives = 0;
    state.over = true;
    out.sound("over");
    out.say(UI.gameOver);
    return;
  }
  state.crash = CRASH_TIME;
  out.say(`${UI.lives}: ${state.lives}`);
}

/** El dragón vuelve corto al centro, con el puntaje y las letras que ya tenía. */
function respawn(state: State) {
  state.body = centerDragon();
  state.last = state.body.map((part) => ({ ...part }));
  state.dir = "up";
  state.turns = [];
  state.grow = 0;
  state.clock = 0;
  state.ready = READY_TIME;
  if (state.flower && state.body.some((part) => same(part, state.flower as Point))) state.flower = freeCell(state);
  if (state.letter && state.body.some((part) => same(part, state.letter as Point))) state.letter = null;
}

/** Un paso de casilla. Devuelve false si chocó. */
function advance(state: State, out: Events): boolean {
  const next = state.turns.shift();
  if (next) state.dir = next;
  const head = state.body[0];
  const [dx, dy] = STEP[state.dir];
  const to = { x: head.x + dx, y: head.y + dy };
  if (to.x < 0 || to.y < 0 || to.x >= COLS || to.y >= ROWS) return false;
  // La punta de la cola se mueve en este mismo paso, así que se puede pisar (si no está creciendo).
  const solid = state.grow > 0 ? state.body : state.body.slice(0, -1);
  if (solid.some((part) => same(part, to))) return false;

  state.last = state.body.map((part) => ({ ...part }));
  state.body.unshift(to);
  if (state.grow > 0) state.grow -= 1;
  else state.body.pop();

  if (state.flower && same(state.flower, to)) {
    state.grow += 1;
    state.flowers += 1;
    addScore(state, 10);
    state.flower = freeCell(state);
    if (state.flowers % 10 === 0) {
      state.level += 1;
      out.sound("level");
      out.say(`${UI.level} ${state.level}. ${worldName(worldOf(state.level))}.`);
    } else out.sound("clear");
  }
  if (state.letter && same(state.letter, to)) {
    state.grow += 2;
    addScore(state, 100);
    state.letter = null;
    state.letters += 1;
    state.letterWait = 4 + roll(state) * 4;
    if (state.letters >= NAME.length) {
      state.letters = 0;
      state.lives = Math.min(MAX_LIVES, state.lives + 1);
      out.sound("letter");
      out.say(`${NAME}. ${UI.lives}: ${state.lives}`);
      if (!state.secretDone) {
        state.secretDone = true;
        out.secret();
      }
    } else {
      out.sound("clear2");
      out.say(NAME.slice(0, state.letters));
    }
  }
  return true;
}

export function stepDragon(state: State, dt: number, wanted: readonly Dir[], out: Events) {
  if (state.over) return;
  state.time += dt;

  if (state.crash > 0) {
    state.crash -= dt;
    if (state.crash <= 0) {
      state.crash = 0;
      respawn(state);
    }
    return;
  }

  for (const dir of wanted) wantTurn(state, dir);
  if (state.ready > 0) {
    state.ready -= dt;
    // Cualquier control lo pone en marcha; si no, arranca solo al acabarse la espera.
    if (wanted.length > 0 || state.ready <= 0) {
      state.ready = 0;
      state.clock = 0;
    }
    return;
  }

  if (state.letter) {
    state.letter.time -= dt;
    if (state.letter.time <= 0) {
      state.letter = null;
      state.letterWait = 4 + roll(state) * 4;
    }
  } else {
    state.letterWait -= dt;
    if (state.letterWait <= 0) {
      const cell = freeCell(state);
      if (cell) {
        state.letter = { ...cell, time: LETTER_TIME };
        out.sound("move");
      } else state.letterWait = 1;
    }
  }
  if (!state.flower) state.flower = freeCell(state);

  state.clock += dt;
  // Un bucle por si dt es grande: puede dar más de un paso en el mismo cuadro.
  while (state.clock >= intervalOf(state.body.length)) {
    state.clock -= intervalOf(state.body.length);
    if (!advance(state, out)) {
      state.clock = 0;
      crash(state, out);
      return;
    }
  }
}

/* ---------- Dibujos (8 × 8) ---------- */

/** Cabeza mirando a la derecha: cuernos dorados, ojo grande, hocico y bigotes. */
const HEAD: Sprite = [
  "yk.yk...",
  "kkkkkkk.",
  "krRRRRkk",
  "krRwerrk",
  "krrrrrrW",
  "kyyrrrrk",
  "kyykkkkW",
  ".kk...W.",
];
/** Segmento del cuerpo en horizontal: cresta arriba, escamas en medio y panza abajo. */
const SEGMENT: Sprite = [
  "kkkkkkkk",
  "cRRcRRcR",
  "rRrrrRrr",
  "rrdrrrdr",
  "rdrdrdrd",
  "rrrrrrrr",
  "oyoyoyoy",
  "kkkkkkkk",
];
/** Cola en horizontal: el cuerpo llega por la izquierda y las cintas se van a la derecha. */
const TAIL: readonly Sprite[] = [
  [
    "kkk.....",
    "rrrk.tt.",
    "rRrrkTtt",
    "rrrrry..",
    "rrrrkyyy",
    "oyok.pp.",
    "kkk...pp",
    "........",
  ],
  [
    "kkk.....",
    "rrrk..tt",
    "rRrrktt.",
    "rrrrryy.",
    "rrrrk.yy",
    "oyokpp..",
    "kkk..pp.",
    "........",
  ],
];

const RED: Colors = { k: "#2a0710", r: "#d8323a", R: "#ff6a5a", d: "#8e1626", c: "#ffd25e", y: "#ffd25e", o: "#d9962b", w: "#ffffff", e: "#1b1030", W: "#ffe9b0", t: "#3be6c6", T: "#1ba892", p: "#f58fbd" };
/** Los segmentos alternan rojo y dorado, como los faroles del festival. */
const GOLDEN: Colors = { ...RED, r: "#f2b234", R: "#ffe08a", d: "#c0392b", c: "#ff6a5a", y: "#d8323a", o: "#9e1c28" };

/** Gira un dibujo un cuarto de vuelta (en el sentido del reloj). */
function turnRight(rows: Sprite): Sprite {
  const size = rows.length;
  return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => rows[size - 1 - x][y]).join(""));
}
const mirror = (rows: Sprite): Sprite => rows.map((row) => [...row].reverse().join(""));

/** Cada dibujo en las cuatro direcciones, hecho una sola vez. */
function facings(right: Sprite): Record<Dir, Sprite> {
  const down = turnRight(right);
  return { right, down, left: mirror(right), up: mirror(turnRight(turnRight(down))) };
}
const HEADS = facings(HEAD);
const TAILS = TAIL.map(facings);
const SEGMENTS = { across: SEGMENT, upright: turnRight(SEGMENT) };

/** Hacia dónde va una parte, mirando a la que tiene delante. */
function dirBetween(from: Point, to: Point): Dir {
  if (to.x > from.x) return "right";
  if (to.x < from.x) return "left";
  return to.y > from.y ? "down" : "up";
}

/* ---------- Dibujo del jardín ---------- */

function drawFence(c: Ctx, world: number) {
  const look = lookOf(world);
  const top = TOP - FENCE;
  const bottom = TOP + ROWS * TILE;
  const right = LEFT + COLS * TILE;
  // Cañas horizontales arriba y abajo, cañas verticales a los lados, con su brillo y sus nudos.
  for (const y of [top, bottom]) {
    rect(c, 0, y, WIDTH, FENCE, look.wall);
    rect(c, 0, y + 1, WIDTH, 1, look.edge);
    rect(c, 0, y + FENCE - 1, WIDTH, 1, NIGHT);
    for (let x = 6; x < WIDTH; x += 16) rect(c, x, y, 1, FENCE, NIGHT);
  }
  for (const x of [0, right]) {
    rect(c, x, top, FENCE, ROWS * TILE + FENCE * 2, look.wall);
    rect(c, x + 1, top, 1, ROWS * TILE + FENCE * 2, look.edge);
    rect(c, x + FENCE - 1, top, 1, ROWS * TILE + FENCE * 2, NIGHT);
    for (let y = TOP + 6; y < bottom; y += 16) rect(c, x, y, FENCE, 1, NIGHT);
  }
  // Postes dorados en las esquinas.
  for (const [x, y] of [[0, top], [right, top], [0, bottom], [right, bottom]]) {
    rect(c, x, y, FENCE, FENCE, look.grass);
    rect(c, x + 1, y + 1, 2, 2, look.light);
  }
}

function drawGround(c: Ctx, world: number) {
  const look = lookOf(world);
  rect(c, LEFT, TOP, COLS * TILE, ROWS * TILE, look.ground);
  // Baldosas en damero, apenas más oscuras, para que se lean las casillas sin distraer.
  c.fillStyle = "rgba(0, 0, 0, 0.16)";
  for (let y = 0; y < ROWS; y++) for (let x = (y & 1); x < COLS; x += 2) c.fillRect(LEFT + x * TILE, TOP + y * TILE, TILE, TILE);
}

function drawLetter(c: Ctx, letter: Point & { time: number }, char: string, time: number, still: boolean) {
  // Al final parpadea para avisar que se va a ir.
  if (!still && letter.time < 2.5 && Math.floor(time * 8) % 2 === 1) return;
  // Una tarjeta dorada un poco más grande que la casilla, para que la letra se lea bien.
  const x = LEFT + letter.x * TILE - 1;
  const y = TOP + letter.y * TILE - 1;
  rect(c, x, y, TILE + 2, TILE + 2, NIGHT);
  rect(c, x + 1, y + 1, TILE, TILE, GOLD);
  write(c, char, x + 1 + Math.floor((TILE - widthOf(char)) / 2), y + 1, NIGHT);
}

function drawDragon(c: Ctx, state: State, time: number, still: boolean) {
  const { body, last } = state;
  // Avance suave entre una casilla y la siguiente.
  const moving = state.ready <= 0 && state.crash <= 0;
  const t = moving ? Math.min(1, state.clock / intervalOf(body.length)) : 1;
  const place = (index: number) => {
    const to = body[index];
    const from = last[Math.min(index, last.length - 1)] ?? to;
    return { x: LEFT + (from.x + (to.x - from.x) * t) * TILE, y: TOP + (from.y + (to.y - from.y) * t) * TILE };
  };
  const flutter = still ? 0 : Math.floor(time * 6) % 2;

  // De la cola a la cabeza, para que la cabeza quede encima.
  for (let index = body.length - 1; index >= 0; index--) {
    const part = body[index];
    const spot = place(index);
    if (index === 0) {
      paintSprite(c, HEADS[state.dir], RED, Math.round(spot.x), Math.round(spot.y));
      continue;
    }
    const ahead = body[index - 1];
    const dir = dirBetween(part, ahead);
    if (index === body.length - 1) {
      paintSprite(c, TAILS[flutter][OPPOSITE[dir]], RED, Math.round(spot.x), Math.round(spot.y));
      continue;
    }
    // El cuerpo se ondula: cada segmento se corre un píxel a un lado y al otro, como papel al viento.
    // En las curvas no se mueve, para que el cuerpo no se vea cortado.
    const across = dir === "left" || dir === "right";
    const straight = dirBetween(body[index + 1], part) === dir;
    const wave = still || !straight ? 0 : Math.round(Math.sin(time * 6 - index * 0.9));
    const colors = index % 2 === 0 ? GOLDEN : RED;
    paintSprite(c, across ? SEGMENTS.across : SEGMENTS.upright, colors, Math.round(spot.x + (across ? 0 : wave)), Math.round(spot.y + (across ? wave : 0)));
  }
}

export default defineGame<State>({
  help: "Flechas o deslizar el dedo para guiar al dragón. Come flores de cerezo para crecer y junta las letras de su nombre; no choques con la cerca ni contigo.",
  create: (seed) => createDragon(seed),
  pad: () => [
    [
      { key: "left", glyph: "←", label: "Izquierda" },
      { key: "right", glyph: "→", label: "Derecha" },
    ],
    [
      { key: "down", glyph: "↓", label: "Abajo" },
      { key: "up", glyph: "↑", label: "Arriba" },
    ],
  ],
  step(state, dt, input, out) {
    const wanted: Dir[] = [];
    for (const key of input.pressed) if (isDir(key)) wanted.push(key);
    for (const swipe of input.swipes) wanted.push(swipe);
    stepDragon(state, dt, wanted, out);
  },
  draw(c, state, time, still) {
    const world = worldOf(state.level);
    const look = lookOf(world);
    drawFrame(c, world);
    drawTop(c, state.score, state.lives);
    drawName(c, 15, state.letters, 1, !still && state.letter !== null, time);
    drawGround(c, world);
    drawFence(c, world);

    if (state.flower) {
      const bob = still ? 0 : Math.floor(time * 2) % 2;
      paintSprite(c, FLOWER, FLOWER_COLORS, LEFT + state.flower.x * TILE + 1, TOP + state.flower.y * TILE + 1 + bob);
    }
    if (state.letter) drawLetter(c, state.letter, NAME[state.letters], time, still);

    // Durante la pausa del choque, el dragón parpadea.
    if (state.crash <= 0 || still || Math.floor(time * 8) % 2 === 0) drawDragon(c, state, time, still);

    center(c, `${UI.level} ${state.level}`.toUpperCase(), 212, DIM);
    if (state.over) {
      const text = "FIN";
      outlined(c, text, Math.round((WIDTH - widthOf(text, 2)) / 2), 100, INK, 2);
    } else if (state.ready > 0 && (still || Math.floor(time * 3) % 3 !== 0)) {
      const text = "LISTO";
      outlined(c, text, Math.round((WIDTH - widthOf(text)) / 2), TOP + 7 * TILE, look.light);
    }
  },
  status: (state) => ({
    score: state.score,
    lives: state.lives,
    level: state.level,
    letters: state.letters,
    world: worldOf(state.level),
    over: state.over,
  }),
});
