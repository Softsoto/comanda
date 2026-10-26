/**
 * "Cadena de Lunas": una cadena de esferas de colores rueda por un camino de
 * piedra hacia un pozo oscuro con forma de luna nueva. En el centro del tablero
 * hay un ídolo de piedra con forma de luna que gira hacia donde apuntas y lanza
 * esferas: se meten en la cadena donde chocan, y tres o más del mismo color
 * juntas desaparecen. Si al cerrarse el hueco quedan frente a frente dos del
 * mismo color, la parte de adelante retrocede atraída como por un imán y puede
 * armar reacciones en cadena (combos).
 *
 * La barra de arriba se llena con los puntos del nivel: cuando está llena ya no
 * salen más esferas y, al vaciar la cadena, se pasa al siguiente nivel. Si la
 * primera esfera llega al pozo, se pierde una vida y el nivel vuelve a empezar.
 *
 * Hay 24 niveles en 6 etapas (y después vuelven, más rápidos). Las reglas y el
 * dibujo están en este mismo archivo.
 */

import { makeCanvas, paintSprite, rect, seeded, type Ctx } from "../art";
import { UI } from "../texts";
import { worldName } from "../worlds";
import { GOLD, HEART, HEIGHT, INK, NIGHT, WIDTH, WORLDS, center, drawFrame, drawTop, lookOf, outlined, widthOf, write, type Look } from "./kit";
import { defineGame, roll, type Input, type Out } from "./types";

/* ---------- Medidas ---------- */

/** Diámetro de cada esfera: también es la distancia entre dos esferas que se tocan. */
export const BALL = 8;
/** Zona del tablero donde pueden ir los caminos (los centros de las esferas). */
export const AREA = { left: 5, right: 122, top: 28, bottom: 218 };
/** Radio del ídolo que lanza. */
export const IDOL_R = 10;
/** Lo que tarda una esfera lanzada en abrirse espacio dentro de la cadena. */
const INSERT_TIME = 0.14;
const SHOT_SPEED = 250;
const AIM_SPEED = 380;
const RELOAD = 0.22;
const TURN_SPEED = 3.4;
/** Al empezar, la cadena entra rodando rápido hasta cubrir este tramo del camino. */
const RUSH_PART = 0.26;
const RUSH_SPEED = 110;
const MAGNET_ACCEL = 520;
const MAGNET_MAX = 240;
const REVERSE_SPEED = 42;
const DYING_SPEED = 330;
/** Cada cuántos niveles cambia la etapa, y cuántos niveles distintos hay. */
export const PER_STAGE = 4;
export const LEVEL_COUNT = 24;
/** Una vida extra cada tantos puntos. */
const LIFE_EVERY = 8000;
const SECRET_LEVEL = 10;

/* ---------- Colores de las esferas ---------- */

/**
 * Seis colores muy distintos entre sí y, además, un símbolo propio para cada uno
 * (para quien no distingue bien los colores): X, anillo, barras, rayas, punto y cuatro puntos.
 */
const PAINT = [
  { body: "#e8413c", light: "#ff9a88", dark: "#9a1b2a", mark: "#5c0a18", name: "ROJA" },
  { body: "#ffcf3a", light: "#fff3a8", dark: "#c6860e", mark: "#6e4300", name: "AMARILLA" },
  { body: "#38c45a", light: "#a8f5a0", dark: "#18793a", mark: "#063d1a", name: "VERDE" },
  { body: "#3f7dff", light: "#a8c8ff", dark: "#2142b0", mark: "#0b1a5c", name: "AZUL" },
  { body: "#b358ea", light: "#e6b0ff", dark: "#6e2598", mark: "#36094f", name: "MORADA" },
  { body: "#e6ecf6", light: "#ffffff", dark: "#8e9ab8", mark: "#3a4260", name: "BLANCA" },
] as const;
const SYMBOLS: readonly (readonly string[])[] = [
  ["#..#", ".##.", ".##.", "#..#"],
  [".##.", "#..#", "#..#", ".##."],
  ["#..#", "#..#", "#..#", "#..#"],
  ["####", "....", "....", "####"],
  ["....", ".##.", ".##.", "...."],
  ["#..#", "....", "....", "#..#"],
];

/* ---------- Caminos ---------- */

type Pt = readonly [number, number];
/** Un camino ya armado: un punto por cada píxel de largo, y qué tramos pasan por debajo de otro. */
export type Track = {
  xs: number[];
  ys: number[];
  /** Largo en píxeles (la cadena pierde cuando la primera esfera llega aquí). */
  length: number;
  /** Tramos tapados (bajo un puente o una cueva): ahí las esferas no se pueden tocar. */
  hidden: Uint8Array;
  /** Tramos que pasan por debajo (se dibujan antes que los puentes). */
  under: Uint8Array;
  /** Tramos que hacen de puente sobre otro (se vuelven a pintar encima). */
  bridge: Uint8Array;
  /** Tramos de cueva: se tapan con roca. */
  cave: Uint8Array;
};
type Shape = { name: string; idol: Pt; paths: { points: Pt[]; caves?: [number, number][] }[] };

/** Curva suave que pasa por todos los puntos (Catmull-Rom), muestreada con un punto por píxel de largo. */
function smooth(points: readonly Pt[]): { xs: number[]; ys: number[] } {
  const dense: [number, number][] = [];
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < 24; k++) {
      const t = k / 24;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push([points[points.length - 1][0], points[points.length - 1][1]]);
  // Un punto cada píxel de largo, para que las esferas avancen parejo.
  const xs = [dense[0][0]];
  const ys = [dense[0][1]];
  let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    const [ax, ay] = dense[i - 1];
    const [bx, by] = dense[i];
    const seg = Math.hypot(bx - ax, by - ay);
    let along = 1 - carry;
    while (along <= seg) {
      const t = along / seg;
      xs.push(ax + (bx - ax) * t);
      ys.push(ay + (by - ay) * t);
      along += 1;
    }
    carry = seg - (along - 1);
  }
  return { xs, ys };
}

/** Puntos de una espiral alrededor de (cx, cy): el radio va de `r0` a `r1` mientras da `turns` vueltas. */
function spiral(cx: number, cy: number, r0: number, r1: number, start: number, turns: number, squash = 1): Pt[] {
  const list: Pt[] = [];
  const steps = Math.ceil(turns * 16);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + t * turns * Math.PI * 2;
    const r = r0 + (r1 - r0) * t;
    list.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * squash]);
  }
  return list;
}

const mirror = (shape: Shape, name: string): Shape => ({
  name,
  idol: [127 - shape.idol[0], shape.idol[1]],
  paths: shape.paths.map((path) => ({ ...path, points: path.points.map(([x, y]) => [127 - x, y] as Pt) })),
});
/** Media vuelta alrededor del centro del tablero (para los caminos gemelos). */
const turned = (points: readonly Pt[]): Pt[] => points.map(([x, y]) => [127 - x, 246 - y] as Pt);

/** La trenza: baja ondulando, da la vuelta abajo y sube ondulando al revés, cruzándose dos veces consigo misma. */
function braid(): Pt[] {
  const wave = (y: number) => 34 * Math.sin((2 * Math.PI * (y - 70)) / 120);
  const list: Pt[] = [];
  for (let y = 30; y <= 175; y += 5) list.push([64 + wave(y), y]);
  for (let k = 1; k < 8; k++) {
    const a = Math.PI - (k / 8) * Math.PI;
    list.push([64 + 24 * Math.cos(a), 175 + 24 * Math.sin(a)]);
  }
  for (let y = 175; y >= 32; y -= 5) list.push([64 - wave(y), y]);
  return list;
}

/** Un camino de tramos rectos con esquinas redondeadas de radio `r` (puntos cada pocos píxeles). */
function rounded(corners: readonly Pt[], r: number): Pt[] {
  const list: Pt[] = [];
  const line = (a: Pt, b: Pt) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6));
    for (let k = 0; k < steps; k++) list.push([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]);
  };
  let from: Pt = corners[0];
  for (let i = 1; i < corners.length - 1; i++) {
    const [p, q, n] = [corners[i - 1], corners[i], corners[i + 1]];
    const d1 = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const d2 = Math.hypot(n[0] - q[0], n[1] - q[1]);
    const a: Pt = [q[0] + ((p[0] - q[0]) * r) / d1, q[1] + ((p[1] - q[1]) * r) / d1];
    const b: Pt = [q[0] + ((n[0] - q[0]) * r) / d2, q[1] + ((n[1] - q[1]) * r) / d2];
    line(from, a);
    // La esquina: una curva suave de a a b pasando cerca de q.
    for (let k = 0; k < 4; k++) {
      const t = k / 4;
      list.push([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * q[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * q[1] + t * t * b[1]]);
    }
    from = b;
  }
  line(from, corners[corners.length - 1]);
  list.push(corners[corners.length - 1]);
  return list;
}

const RIVER: Pt[] = [[6, 30], [34, 34], [44, 52], [30, 70], [12, 84], [10, 110], [24, 130], [40, 148], [34, 170], [14, 186], [18, 204], [42, 210]];
const TWIN: Pt[] = [[6, 30], [58, 32], [100, 34], [112, 52], [96, 66], [52, 68], [22, 78], [14, 104], [30, 118]];

/** Los caminos distintos, de más fácil a más difícil. */
const SHAPES: Shape[] = [
  {
    name: "LA PRIMERA VUELTA",
    idol: [64, 124],
    paths: [{ points: [[6, 31], [64, 31], [110, 33], [120, 58], [120, 186], [110, 212], [64, 214], [18, 212], [8, 188], [8, 70], [18, 52], [64, 52], [96, 56], [102, 82], [102, 164], [90, 190], [40, 192], [26, 174], [26, 132]] }],
  },
  {
    name: "LA SERPIENTE",
    idol: [64, 196],
    paths: [{ points: [[121, 32], [64, 33], [20, 34], [9, 49], [20, 63], [64, 64], [108, 65], [119, 80], [108, 95], [64, 96], [20, 97], [9, 112], [20, 127], [64, 128], [108, 129], [119, 144], [108, 159], [50, 160]] }],
  },
  { name: "EL CARACOL", idol: [64, 190], paths: [{ points: spiral(64, 95, 57, 14, Math.PI, 2.05) }] },
  {
    name: "LA GOTA",
    idol: [64, 138],
    paths: [{ points: [[64, 30], [84, 52], [108, 90], [118, 140], [104, 194], [64, 212], [24, 194], [10, 140], [20, 92], [40, 64], [56, 62], [70, 76]] }],
  },
  { name: "LOS DOS RIOS", idol: [64, 118], paths: [{ points: RIVER }, { points: RIVER.map(([x, y]) => [127 - x, y] as Pt) }] },
  {
    name: "EL RAYO",
    idol: [102, 126],
    paths: [{ points: [[6, 30], [56, 36], [72, 52], [56, 70], [20, 82], [12, 100], [30, 114], [70, 120], [78, 138], [62, 154], [22, 164], [14, 182], [32, 196], [70, 204], [96, 210]] }],
  },
  {
    name: "LA CASCADA",
    idol: [64, 196],
    paths: [{ points: [[10, 29], [10, 140], [23, 154], [36, 140], [36, 46], [49, 32], [62, 46], [62, 140], [75, 154], [88, 140], [88, 46], [101, 32], [114, 46], [114, 120]] }],
  },
  {
    name: "LA CUEVA",
    idol: [64, 192],
    paths: [
      {
        points: [[6, 34], [64, 36], [106, 38], [118, 56], [106, 74], [64, 76], [22, 78], [10, 96], [22, 114], [64, 116], [106, 118], [118, 136], [106, 154], [44, 156]],
        caves: [[0.12, 0.24], [0.5, 0.62]],
      },
    ],
  },
  {
    name: "EL OCHO",
    idol: [64, 176],
    paths: [
      {
        points: Array.from({ length: 49 }, (_, i) => {
          const t = -Math.PI / 2 + (i / 48) * (2 * Math.PI - 0.75);
          return [64 + 54 * Math.sin(2 * t) * 0.5 * 1.9, 122 + 90 * Math.sin(t)] as Pt;
        }),
      },
    ],
  },
  { name: "EL REMOLINO", idol: [64, 192], paths: [{ points: spiral(64, 96, 12, 57, -Math.PI / 2, 2.0) }] },
  { name: "LOS GEMELOS", idol: [64, 123], paths: [{ points: TWIN }, { points: turned(TWIN) }] },
  {
    name: "EL CORAZON",
    idol: [64, 112],
    paths: [{ points: [[66, 216], [92, 180], [114, 130], [118, 70], [104, 38], [80, 34], [64, 54], [48, 34], [24, 38], [10, 70], [14, 130], [36, 180], [52, 200]] }],
  },
  {
    name: "EL PUENTE",
    idol: [58, 160],
    paths: [{ points: [[6, 82], [40, 82], [80, 82], [106, 70], [110, 44], [88, 32], [66, 42], [62, 66], [66, 98], [88, 120], [110, 150], [106, 192], [70, 210], [30, 204], [12, 174], [20, 136]] }],
  },
  { name: "LAS DOS LUNAS", idol: [100, 70], paths: [{ points: spiral(40, 72, 34, 11, Math.PI, 1.55) }, { points: spiral(88, 166, 34, 11, 0, 1.55) }] },
  { name: "LA TRENZA", idol: [64, 163], paths: [{ points: braid() }] },
  {
    name: "EL LABERINTO",
    idol: [64, 126],
    paths: [{ points: rounded([[6, 33], [119, 33], [119, 213], [8, 213], [8, 53], [100, 53], [100, 194], [28, 194], [28, 92]], 10) }],
  },
];

/** Los 24 niveles: cada etapa tiene 4 caminos; las dos últimas recorren caminos ya vistos, al revés y más rápido. */
const LEVELS: Shape[] = [
  SHAPES[0], SHAPES[1], SHAPES[2], SHAPES[3],
  SHAPES[4], SHAPES[5], SHAPES[6], SHAPES[7],
  SHAPES[8], SHAPES[9], SHAPES[10], SHAPES[11],
  SHAPES[12], SHAPES[13], SHAPES[14], SHAPES[15],
  mirror(SHAPES[2], "EL CARACOL ZURDO"), mirror(SHAPES[5], "EL RAYO NEGRO"), mirror(SHAPES[3], "LA GOTA DE PLATA"), mirror(SHAPES[12], "EL PUENTE VIEJO"),
  mirror(SHAPES[8], "EL OCHO DE LUNA"), mirror(SHAPES[13], "LAS LUNAS GEMELAS"), mirror(SHAPES[14], "LA TRENZA FINAL"), mirror(SHAPES[0], "LA ULTIMA VUELTA"),
];

export type Layout = { name: string; idol: Pt; tracks: Track[] };

/** Arma un camino: suaviza los puntos y marca los cruces (un tramo pasa por debajo del otro) y las cuevas. */
function buildTrack(points: readonly Pt[], caves: readonly [number, number][] = []): Track {
  const { xs, ys } = smooth(points);
  const n = xs.length;
  const hidden = new Uint8Array(n);
  const under = new Uint8Array(n);
  const bridge = new Uint8Array(n);
  const cave = new Uint8Array(n);
  // Cruces: el paso que llega después va por debajo del primero.
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < j - 40; i++) {
      const d = Math.hypot(xs[i] - xs[j], ys[i] - ys[j]);
      if (d < 16) under[j] = 1;
      if (d < 6) hidden[j] = 1;
      if (d < 12) bridge[i] = 1;
    }
  }
  for (const [from, to] of caves) {
    for (let i = Math.floor(from * n); i < Math.min(n, Math.ceil(to * n)); i++) {
      cave[i] = 1;
      hidden[i] = 1;
      under[i] = 1;
    }
  }
  return { xs, ys, length: n - 1, hidden, under, bridge, cave };
}

const layouts = new Map<number, Layout>();
/** El tablero del nivel `level` (1, 2, 3...): después del 24 vuelven a salir, más rápidos. */
export function layoutOf(level: number): Layout {
  const index = (level - 1) % LEVEL_COUNT;
  let found = layouts.get(index);
  if (!found) {
    const shape = LEVELS[index];
    found = { name: shape.name, idol: shape.idol, tracks: shape.paths.map((path) => buildTrack(path.points, path.caves)) };
    layouts.set(index, found);
  }
  return found;
}

export const stageOf = (level: number) => Math.floor((level - 1) / PER_STAGE) + 1;
const worldOf = (level: number) => (stageOf(level) - 1) % WORLDS;
const roundOf = (level: number) => Math.floor((level - 1) / LEVEL_COUNT);
/** Cuántos colores hay en juego: 4 al principio, 5 desde la etapa 3, 6 desde la 5. */
export const colorsOf = (level: number) => Math.min(6, 4 + Math.floor((((level - 1) % LEVEL_COUNT) / PER_STAGE) / 2) + roundOf(level));
/** Puntos del nivel que llenan la barra. */
export const targetOf = (level: number) => 1400 + 80 * ((level - 1) % LEVEL_COUNT) + 400 * roundOf(level);
/** Segundos que tardaría una esfera en recorrer todo el camino: cada nivel, un poco menos. */
const crossTime = (level: number) => Math.max(26, 80 - 2.5 * ((level - 1) % LEVEL_COUNT) - 8 * roundOf(level));
const levelLabel = (level: number) => `${stageOf(level)}-${((level - 1) % PER_STAGE) + 1}`;

/* ---------- Estado ---------- */

export type Kind = "" | "back" | "slow" | "aim" | "bomb";
export type Ball = {
  id: number;
  color: number;
  /** Dónde va, en píxeles a lo largo del camino. */
  s: number;
  /** Tamaño mientras entra en la cadena (0 a 1). */
  w: number;
  /** Si tocaba a la esfera de atrás en el paso anterior (para saber cuándo se juntan dos tramos). */
  linked: boolean;
  /** Si este tramo quedó separado por una explosión, de qué combo viene (para contar las reacciones en cadena). */
  combo: number;
  /** Rapidez con que el imán lo arrastra hacia atrás. */
  pull: number;
  kind: Kind;
  kindLife: number;
  /** De dónde viene volando, mientras entra. */
  fx: number;
  fy: number;
};
export type Chain = { track: number; balls: Ball[]; last: number; run: number; rush: boolean; reach: number };
type Shot = { x: number; y: number; vx: number; vy: number; color: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Pop = { x: number; y: number; text: string; life: number; color: string; big: boolean };

export type State = {
  random: number;
  time: number;
  score: number;
  lives: number;
  level: number;
  phase: "play" | "dying" | "bonus" | "card" | "over";
  phaseTime: number;
  angle: number;
  current: number;
  next: number;
  reload: number;
  queued: boolean;
  touchAim: boolean;
  chains: Chain[];
  shots: Shot[];
  sparks: Spark[];
  pops: Pop[];
  levelScore: number;
  full: boolean;
  reverse: number;
  slow: number;
  aim: number;
  powerTimer: number;
  coin: { x: number; y: number; life: number } | null;
  coinTimer: number;
  bonus: { s: number; start: number; end: number; track: number; given: number }[];
  bonusTotal: number;
  banner: number;
  nextLife: number;
  nextId: number;
  /** El combo más alto de esta partida (para las pruebas y el aviso). */
  bestCombo: number;
  cleared: number;
  secretDone: boolean;
  over: boolean;
};

const between = (state: State, count: number) => Math.floor(roll(state) * count);

/** Colores que todavía quedan en las cadenas: solo esos se lanzan. */
function presentColors(state: State): number[] {
  const seen: boolean[] = [];
  for (const chain of state.chains) for (const ball of chain.balls) seen[ball.color] = true;
  const list: number[] = [];
  seen.forEach((yes, color) => yes && list.push(color));
  return list;
}

function pickShot(state: State): number {
  const list = presentColors(state);
  if (list.length === 0) return between(state, colorsOf(state.level));
  return list[between(state, list.length)];
}

/** El color de la próxima esfera que sale al camino: a veces repite el anterior, para que haya tramos del mismo color. */
function spawnColor(state: State, chain: Chain): number {
  const count = colorsOf(state.level);
  let color: number;
  if (chain.run < 2 && chain.last >= 0 && roll(state) < 0.42) color = chain.last;
  else {
    color = between(state, count);
    if (color === chain.last) color = (color + 1 + between(state, count - 1)) % count;
  }
  chain.run = color === chain.last ? chain.run + 1 : 1;
  chain.last = color;
  return color;
}

function newBall(state: State, color: number, s: number): Ball {
  return { id: state.nextId++, color, s, w: 1, linked: true, combo: 0, pull: 0, kind: "", kindLife: 0, fx: 0, fy: 0 };
}

/** Prepara (o repite) el nivel actual: cadenas vacías que entran rodando, ídolo mirando hacia arriba. */
function startLevel(state: State) {
  const layout = layoutOf(state.level);
  state.chains = layout.tracks.map((_, track) => ({ track, balls: [], last: -1, run: 0, rush: true, reach: 0 }));
  state.shots = [];
  state.levelScore = 0;
  state.full = false;
  state.reverse = state.slow = state.aim = 0;
  state.powerTimer = 9 + roll(state) * 5;
  state.coin = null;
  state.coinTimer = 14 + roll(state) * 10;
  state.phase = "play";
  state.phaseTime = 0;
  state.banner = 2.4;
  state.queued = false;
  state.touchAim = false;
  // Antes de que entre la cadena, las esferas del ídolo salen de los colores del nivel.
  for (const chain of state.chains) spawn(state, chain);
  state.current = pickShot(state);
  state.next = pickShot(state);
}

function create(seed: number, mode: string): State {
  // "n7" empieza en el nivel 7 (solo para mirar los niveles mientras se arman).
  const start = /^n\d+$/.test(mode) ? Math.max(1, Number(mode.slice(1))) : 1;
  const state: State = {
    random: seed >>> 0,
    time: 0,
    score: 0,
    lives: 3,
    level: start,
    phase: "play",
    phaseTime: 0,
    angle: -Math.PI / 2,
    current: 0,
    next: 0,
    reload: 0,
    queued: false,
    touchAim: false,
    chains: [],
    shots: [],
    sparks: [],
    pops: [],
    levelScore: 0,
    full: false,
    reverse: 0,
    slow: 0,
    aim: 0,
    powerTimer: 0,
    coin: null,
    coinTimer: 0,
    bonus: [],
    bonusTotal: 0,
    banner: 0,
    nextLife: LIFE_EVERY,
    nextId: 1,
    bestCombo: 0,
    cleared: 0,
    secretDone: false,
    over: false,
  };
  startLevel(state);
  return state;
}

/* ---------- La cadena ---------- */

/** Distancia a la que se tocan las esferas i e i+1 (menor mientras una todavía está entrando). */
const contact = (balls: Ball[], i: number) => ((balls[i].w + balls[i + 1].w) / 2) * BALL;
/** Si las esferas i e i+1 se tocan. */
export const touching = (balls: Ball[], i: number) => balls[i + 1].s - balls[i].s <= contact(balls, i) + 0.6;

export function pointAt(track: Track, s: number): [number, number] {
  const i = Math.max(0, Math.min(track.length, Math.round(s)));
  return [track.xs[i], track.ys[i]];
}
function tangentAt(track: Track, s: number): [number, number] {
  const i = Math.max(2, Math.min(track.length - 2, Math.round(s)));
  const dx = track.xs[i + 2] - track.xs[i - 2];
  const dy = track.ys[i + 2] - track.ys[i - 2];
  const d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
}
const hiddenAt = (track: Track, s: number) => s < 3 || s > track.length || track.hidden[Math.round(s)] === 1;

/** Saca esferas nuevas por el comienzo del camino mientras la barra no esté llena. */
function spawn(state: State, chain: Chain) {
  if (state.full || state.phase !== "play") return;
  for (let guard = 0; guard < 4; guard++) {
    const balls = chain.balls;
    if (balls.length > 0 && balls[0].s <= 0) return;
    const tail = balls[0];
    const s = tail && tail.s - BALL <= 0 ? tail.s - BALL : 0;
    const ball = newBall(state, spawnColor(state, chain), s);
    if (tail) tail.linked = tail.s - s <= BALL + 0.6;
    ball.linked = false;
    balls.unshift(ball);
  }
}

/** Qué tan rápido empuja la cadena desde atrás. */
function pushSpeed(state: State, chain: Chain, track: Track): number {
  if (state.phase === "dying") return DYING_SPEED;
  if (state.reverse > 0) return -REVERSE_SPEED;
  if (chain.rush) return RUSH_SPEED;
  let speed = track.length / crossTime(state.level);
  const head = chain.balls[chain.balls.length - 1];
  // Cerca del pozo la cadena va un poco más despacio, para dar una última oportunidad.
  if (head && head.s > track.length * 0.82) speed *= 0.65;
  if (state.slow > 0) speed *= 0.4;
  return speed;
}

/**
 * Saca de la cadena las esferas marcadas y anota los huecos que quedan: si a los
 * dos lados del hueco hay el mismo color, el tramo de adelante se devolverá atraído.
 */
function removeBalls(state: State, chain: Chain, gone: Set<Ball>, combo: number, out: Out) {
  const track = layoutOf(state.level).tracks[chain.track];
  const keep: Ball[] = [];
  let broke = false;
  let sx = 0;
  let sy = 0;
  const powers: { kind: Kind; x: number; y: number }[] = [];
  for (const ball of chain.balls) {
    if (gone.has(ball)) {
      broke = true;
      const [x, y] = pointAt(track, ball.s);
      sx += x;
      sy += y;
      burst(state, x, y, PAINT[ball.color].body, 5);
      if (ball.kind) powers.push({ kind: ball.kind, x, y });
      continue;
    }
    if (broke && keep.length > 0) {
      ball.linked = false;
      const behind = keep[keep.length - 1];
      ball.combo = behind.color === ball.color ? combo : 0;
      ball.pull = 0;
    }
    broke = false;
    keep.push(ball);
  }
  chain.balls = keep;
  const count = gone.size;
  if (count === 0) return;
  const points = count * 10 * combo + (combo > 1 ? 40 * combo : 0);
  addScore(state, points, true, out);
  state.pops.push({ x: sx / count, y: sy / count - 4, text: `+${points}`, life: 0.9, color: INK, big: false });
  if (combo > 1) {
    state.pops.push({ x: sx / count, y: sy / count - 14, text: `COMBO X${combo}`, life: 1.2, color: GOLD, big: true });
    state.bestCombo = Math.max(state.bestCombo, combo);
  }
  out.sound(combo > 1 ? "clear2" : "clear");
  for (const power of powers) usePower(state, power.kind, power.x, power.y, combo, out);
}

/** Mira si alrededor de `ball` hay 3 o más del mismo color juntas; si las hay, explotan. */
function matchAt(state: State, chain: Chain, ball: Ball, combo: number, out: Out): boolean {
  const balls = chain.balls;
  const index = balls.indexOf(ball);
  if (index < 0 || ball.w < 1) return false;
  let lo = index;
  let hi = index;
  while (lo > 0 && touching(balls, lo - 1) && balls[lo - 1].color === ball.color && balls[lo - 1].w >= 1) lo--;
  while (hi < balls.length - 1 && touching(balls, hi) && balls[hi + 1].color === ball.color && balls[hi + 1].w >= 1) hi++;
  if (hi - lo + 1 < 3) return false;
  removeBalls(state, chain, new Set(balls.slice(lo, hi + 1)), combo, out);
  return true;
}

const POWER_TEXT: Record<Exclude<Kind, "">, string> = { back: "RETROCESO", slow: "LENTITUD", aim: "PUNTERIA", bomb: "BOMBA" };

function usePower(state: State, kind: Kind, x: number, y: number, combo: number, out: Out) {
  if (!kind) return;
  out.sound("level");
  state.pops.push({ x, y: y - 22, text: POWER_TEXT[kind], life: 1.3, color: "#8ff3ff", big: false });
  if (kind === "back") state.reverse = 2.6;
  else if (kind === "slow") state.slow = 7;
  else if (kind === "aim") state.aim = 14;
  else if (kind === "bomb") {
    // La bomba se lleva todas las esferas cercanas, de cualquier color y de cualquier camino.
    const layout = layoutOf(state.level);
    for (let flash = 0; flash < 14; flash++) burst(state, x, y, flash % 2 ? GOLD : INK, 1);
    for (const chain of state.chains) {
      const track = layout.tracks[chain.track];
      const near = new Set(chain.balls.filter((ball) => !hiddenAt(track, ball.s) && Math.hypot(pointAt(track, ball.s)[0] - x, pointAt(track, ball.s)[1] - y) < 28));
      if (near.size > 0) removeBalls(state, chain, near, combo, out);
    }
  }
}

function addScore(state: State, points: number, forBar: boolean, out: Out) {
  state.score = Math.min(999_999, state.score + Math.round(points));
  if (forBar && state.phase === "play") {
    state.levelScore += points;
    if (!state.full && state.levelScore >= targetOf(state.level)) {
      state.full = true;
      out.sound("letter");
      out.say("Luna llena: ya no salen más esferas.");
      state.pops.push({ x: 64, y: 110, text: "LUNA LLENA", life: 1.8, color: GOLD, big: true });
    }
  }
  while (state.score >= state.nextLife) {
    state.nextLife += LIFE_EVERY;
    if (state.lives < 6) {
      state.lives += 1;
      out.sound("level");
      out.say(`${UI.lives}: ${state.lives}`);
      state.pops.push({ x: 64, y: 130, text: "VIDA EXTRA", life: 1.6, color: HEART, big: true });
    }
  }
}

function burst(state: State, x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count && state.sparks.length < 160; i++) {
    const a = roll(state) * Math.PI * 2;
    const v = 20 + roll(state) * 50;
    state.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + roll(state) * 0.35, color });
  }
}

/** Un paso de una cadena: crecer las esferas que entran, empujar desde atrás, el imán y los choques entre tramos. */
function stepChain(state: State, chain: Chain, dt: number, out: Out) {
  const track = layoutOf(state.level).tracks[chain.track];
  let balls = chain.balls;
  const grown: Ball[] = [];
  for (const ball of balls) {
    if (ball.w < 1) {
      ball.w = Math.min(1, ball.w + dt / INSERT_TIME);
      if (ball.w >= 1) grown.push(ball);
    }
  }
  if (balls.length > 0) {
    // El tramo de atrás lo empuja el camino.
    const speed = pushSpeed(state, chain, track);
    if (state.phase === "dying") for (const ball of balls) ball.s += speed * dt;
    else {
      let end = 0;
      while (end < balls.length - 1 && touching(balls, end)) end++;
      for (let i = 0; i <= end; i++) balls[i].s += speed * dt;
      // Al retroceder, las esferas que vuelven a entrar por el comienzo se guardan (después saldrán otras).
      if (speed < 0) {
        while (balls.length > 0 && balls[0].s < -BALL) balls.shift();
        if (balls.length > 0) balls[0].linked = false;
      }
      // Imán: si a los dos lados de un hueco hay el mismo color, el tramo de adelante se devuelve.
      for (let i = balls.length - 2; i >= 0; i--) {
        const front = balls[i + 1];
        if (touching(balls, i)) continue;
        if (balls[i].color === front.color && balls[i].w >= 1 && front.w >= 1) {
          front.pull = Math.min(MAGNET_MAX, front.pull + MAGNET_ACCEL * dt);
          let j = i + 1;
          do {
            balls[j].s -= front.pull * dt;
            j++;
          } while (j < balls.length && touching(balls, j - 1));
        } else front.pull = 0;
      }
    }
    // Nadie se encima: cada esfera empuja a la de adelante.
    for (let i = 0; i < balls.length - 1; i++) {
      const need = balls[i].s + contact(balls, i);
      if (balls[i + 1].s < need) balls[i + 1].s = need;
    }
    // Dos tramos que se juntan: si se unen colores iguales, puede haber reacción en cadena.
    const joins: { ball: Ball; combo: number }[] = [];
    for (let i = 0; i < balls.length - 1; i++) {
      const now = touching(balls, i);
      const front = balls[i + 1];
      if (now && !front.linked) {
        if (front.color === balls[i].color) {
          joins.push({ ball: front, combo: front.combo + 1 });
          if (state.phase === "play") out.sound("drop");
        }
        front.combo = 0;
        front.pull = 0;
      }
      front.linked = now;
    }
    if (balls.length > 0) balls[0].linked = false;
    for (const join of joins) matchAt(state, chain, join.ball, Math.max(1, join.combo), out);
    for (const ball of grown) matchAt(state, chain, ball, 1, out);
    balls = chain.balls;
  }
  // Los poderes de las esferas especiales se apagan solos al rato.
  for (const ball of balls) {
    if (ball.kind) {
      ball.kindLife -= dt;
      if (ball.kindLife <= 0) ball.kind = "";
    }
  }
  const head = balls[balls.length - 1];
  if (head) chain.reach = Math.max(chain.reach, Math.min(track.length, head.s));
  if (chain.rush && (!head || head.s >= track.length * RUSH_PART || state.reverse > 0)) chain.rush = !head ? chain.rush : false;
  if (state.phase === "dying") {
    const before = balls.length;
    chain.balls = balls.filter((ball) => ball.s < track.length);
    if (chain.balls.length < before && Math.floor(state.phaseTime * 8) % 3 === 0) out.sound("move");
    return;
  }
  if (balls.length === 0 && !state.full) chain.rush = true;
  spawn(state, chain);
}

/* ---------- Lanzar ---------- */

const idolOf = (state: State) => layoutOf(state.level).idol;
const mouthOf = (state: State): [number, number] => {
  const [x, y] = idolOf(state);
  return [x + Math.cos(state.angle) * 5, y + Math.sin(state.angle) * 5];
};

function fire(state: State, out: Out) {
  if (state.reload > 0) {
    state.queued = true;
    return;
  }
  const [x, y] = mouthOf(state);
  const speed = state.aim > 0 ? AIM_SPEED : SHOT_SPEED;
  state.shots.push({ x, y, vx: Math.cos(state.angle) * speed, vy: Math.sin(state.angle) * speed, color: state.current });
  state.current = state.next;
  state.next = pickShot(state);
  state.reload = RELOAD;
  state.queued = false;
  out.sound("rotate");
}

function swap(state: State, out: Out) {
  [state.current, state.next] = [state.next, state.current];
  out.sound("move");
}

/** Mete la esfera lanzada en la cadena, junto a la esfera `hit`, del lado por donde llegó. */
function insert(state: State, chain: Chain, hit: Ball, shot: Shot) {
  const track = layoutOf(state.level).tracks[chain.track];
  const balls = chain.balls;
  const index = balls.indexOf(hit);
  const [hx, hy] = pointAt(track, hit.s);
  const [tx, ty] = tangentAt(track, hit.s);
  const ahead = (shot.x - hx) * tx + (shot.y - hy) * ty >= 0;
  const ball = newBall(state, shot.color, hit.s + (ahead ? BALL / 2 : -BALL / 2));
  ball.w = 0;
  ball.fx = shot.x;
  ball.fy = shot.y;
  if (ahead) {
    ball.linked = true;
    balls.splice(index + 1, 0, ball);
  } else {
    ball.linked = hit.linked;
    hit.linked = true;
    ball.combo = hit.combo;
    hit.combo = 0;
    balls.splice(index, 0, ball);
  }
}

function stepShots(state: State, dt: number, out: Out) {
  const layout = layoutOf(state.level);
  state.shots = state.shots.filter((shot) => {
    const dist = Math.hypot(shot.vx, shot.vy) * dt;
    const parts = Math.max(1, Math.ceil(dist / 2));
    for (let part = 0; part < parts; part++) {
      shot.x += (shot.vx * dt) / parts;
      shot.y += (shot.vy * dt) / parts;
      const coin = state.coin;
      if (coin && Math.hypot(coin.x - shot.x, coin.y - shot.y) < 8) {
        state.coin = null;
        const points = 300 + 100 * Math.min(5, stageOf(state.level) - 1);
        addScore(state, points, false, out);
        state.pops.push({ x: coin.x, y: coin.y - 8, text: `+${points}`, life: 1.2, color: GOLD, big: true });
        for (let i = 0; i < 3; i++) burst(state, coin.x, coin.y, i % 2 ? GOLD : INK, 4);
        out.sound("clear2");
      }
      let best: { chain: Chain; ball: Ball; d: number } | null = null;
      for (const chain of state.chains) {
        const track = layout.tracks[chain.track];
        for (const ball of chain.balls) {
          if (hiddenAt(track, ball.s)) continue;
          const [x, y] = pointAt(track, ball.s);
          const d = (x - shot.x) ** 2 + (y - shot.y) ** 2;
          if (d < (BALL - 1) ** 2 && (!best || d < best.d)) best = { chain, ball, d };
        }
      }
      if (best) {
        insert(state, best.chain, best.ball, shot);
        out.sound("drop");
        return false;
      }
      if (shot.x < -6 || shot.x > WIDTH + 6 || shot.y < 16 || shot.y > HEIGHT + 6) return false;
    }
    return true;
  });
}

/* ---------- Los pasos del juego ---------- */

function stepPlay(state: State, dt: number, out: Out) {
  state.reload = Math.max(0, state.reload - dt);
  if (state.queued && state.reload <= 0) fire(state, out);
  state.reverse = Math.max(0, state.reverse - dt);
  state.slow = Math.max(0, state.slow - dt);
  state.aim = Math.max(0, state.aim - dt);
  state.banner = Math.max(0, state.banner - dt);
  stepShots(state, dt, out);
  for (const chain of state.chains) stepChain(state, chain, dt, out);
  // Las esferas del ídolo solo son de colores que quedan en la cadena.
  const present = presentColors(state);
  if (present.length > 0) {
    if (!present.includes(state.current)) state.current = present[between(state, present.length)];
    if (!present.includes(state.next)) state.next = present[between(state, present.length)];
  }

  // De vez en cuando, una esfera de la cadena trae un poder.
  state.powerTimer -= dt;
  if (state.powerTimer <= 0) {
    state.powerTimer = 10 + roll(state) * 6;
    const layout = layoutOf(state.level);
    const options: Ball[] = [];
    for (const chain of state.chains) {
      const track = layout.tracks[chain.track];
      for (const ball of chain.balls) if (!ball.kind && ball.s > track.length * 0.1 && ball.s < track.length * 0.85 && !hiddenAt(track, ball.s)) options.push(ball);
    }
    if (options.length > 0) {
      const ball = options[between(state, options.length)];
      const kinds: Kind[] = ["back", "slow", "aim", "bomb"];
      ball.kind = kinds[between(state, kinds.length)];
      ball.kindLife = 14;
    }
  }
  // Y a veces aparece una gema-luna en el tablero, por un momento: dispárale para un bono.
  if (state.coin) {
    state.coin.life -= dt;
    if (state.coin.life <= 0) state.coin = null;
  } else {
    state.coinTimer -= dt;
    if (state.coinTimer <= 0) {
      state.coinTimer = 18 + roll(state) * 12;
      const [ix, iy] = idolOf(state);
      for (let tries = 0; tries < 20; tries++) {
        const x = 16 + roll(state) * 96;
        const y = 40 + roll(state) * 164;
        if (Math.hypot(x - ix, y - iy) > 24) {
          state.coin = { x, y, life: 6 };
          break;
        }
      }
    }
  }

  // ¿Llegó alguna cadena al pozo?
  const layout = layoutOf(state.level);
  for (const chain of state.chains) {
    const head = chain.balls[chain.balls.length - 1];
    if (head && head.s >= layout.tracks[chain.track].length) {
      state.phase = "dying";
      state.phaseTime = 0;
      state.shots = [];
      out.sound("lock");
      return;
    }
  }
  // ¿Se vació todo con la barra llena? Nivel completo.
  if (state.full && state.chains.every((chain) => chain.balls.length === 0)) {
    state.phase = "bonus";
    state.phaseTime = 0;
    state.shots = [];
    state.bonusTotal = 0;
    state.bonus = state.chains.map((chain) => {
      const end = layout.tracks[chain.track].length;
      return { s: chain.reach, start: chain.reach, end, track: chain.track, given: 0 };
    });
    state.cleared += 1;
    out.sound("level");
    out.say(`${UI.level} ${state.level} completo.`);
    if (state.level >= SECRET_LEVEL && !state.secretDone) {
      state.secretDone = true;
      out.secret();
    }
  }
}

function nextLevel(state: State, out: Out) {
  state.level += 1;
  startLevel(state);
  out.sound("start");
  out.say(`${UI.level} ${levelLabel(state.level)}: ${layoutOf(state.level).name.toLowerCase()}.`);
}

function step(state: State, dt: number, input: Input, out: Out) {
  if (state.over) return;
  dt = Math.max(0, Math.min(0.05, dt));
  state.time += dt;
  state.phaseTime += dt;
  for (const spark of state.sparks) {
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vy += 60 * dt;
    spark.life -= dt;
  }
  state.sparks = state.sparks.filter((spark) => spark.life > 0);
  for (const pop of state.pops) {
    pop.y -= 14 * dt;
    pop.life -= dt;
  }
  state.pops = state.pops.filter((pop) => pop.life > 0);

  const go = input.pressed.includes("fire") || input.pressed.includes("up") || input.taps.length > 0;
  if (state.phase === "card") {
    if ((go && state.phaseTime > 0.8) || state.phaseTime > 6) nextLevel(state, out);
    return;
  }
  if (state.phase === "bonus") {
    // La luz del bono recorre lo que quedó del camino, sumando 10 puntos cada 4 píxeles.
    let running = false;
    const layout = layoutOf(state.level);
    for (const part of state.bonus) {
      if (part.s >= part.end) continue;
      running = true;
      const before = Math.floor((part.s - part.start) / 32);
      part.s = Math.min(part.end, part.s + 200 * dt);
      const owed = Math.floor((part.s - part.start) / 8) * 10;
      if (owed > part.given) {
        addScore(state, owed - part.given, false, out);
        state.bonusTotal += owed - part.given;
        part.given = owed;
      }
      if (Math.floor((part.s - part.start) / 32) > before) {
        const [x, y] = pointAt(layout.tracks[part.track], part.s);
        state.pops.push({ x, y: y - 6, text: "+80", life: 0.6, color: GOLD, big: false });
        out.sound("move");
      }
    }
    if (!running && state.phaseTime > 0.5) {
      state.phase = "card";
      state.phaseTime = 0;
    }
    return;
  }
  if (state.phase === "dying") {
    for (const chain of state.chains) stepChain(state, chain, dt, out);
    if (state.chains.every((chain) => chain.balls.length === 0) && state.phaseTime > 0.6) {
      state.lives -= 1;
      if (state.lives <= 0) {
        state.lives = 0;
        state.over = true;
        state.phase = "over";
        out.sound("over");
        out.say(UI.gameOver);
      } else {
        out.say(`${UI.lives}: ${state.lives}`);
        startLevel(state);
        out.sound("start");
      }
    }
    return;
  }

  // Apuntar: con las flechas gira el ídolo; con el dedo, mira hacia el toque y lanza al soltar.
  const [ix, iy] = idolOf(state);
  const turn = (input.held.has("right") ? 1 : 0) - (input.held.has("left") ? 1 : 0);
  state.angle += turn * TURN_SPEED * dt;
  const onIdol = (p: { x: number; y: number }) => Math.hypot(p.x - ix, p.y - iy) <= IDOL_R + 3;
  const aimAt = (p: { x: number; y: number }) => {
    if (Math.hypot(p.x - ix, p.y - iy) > 2) state.angle = Math.atan2(p.y - iy, p.x - ix);
  };
  for (const tap of input.taps) {
    if (onIdol(tap)) {
      swap(state, out);
      state.touchAim = false;
    } else {
      aimAt(tap);
      state.touchAim = true;
    }
  }
  const touch = input.touches[0];
  if (touch && !onIdol(touch) && (state.touchAim || input.taps.length === 0)) {
    aimAt(touch);
    state.touchAim = true;
  }
  if (!touch && state.touchAim) {
    state.touchAim = false;
    fire(state, out);
  }
  if (input.pressed.includes("fire") || input.pressed.includes("up")) fire(state, out);
  if (input.pressed.includes("down")) swap(state, out);
  state.angle = Math.atan2(Math.sin(state.angle), Math.cos(state.angle));
  stepPlay(state, dt, out);
}

export { create as createGame, step as stepGame };

/* ---------- Dibujo ---------- */

/** El dibujo de una esfera (9 × 9 con su sombra), con franjas que ruedan en una de 4 direcciones. */
function ballPixels(color: number, orient: number, phase: number): (string | null)[][] {
  const paint = PAINT[color];
  const [ox, oy] = [[1, 0], [1, 1], [0, 1], [-1, 1]][orient];
  const grid: (string | null)[][] = Array.from({ length: 9 }, () => Array<string | null>(9).fill(null));
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < 8 && y < 8 && (x - 3.5) ** 2 + (y - 3.5) ** 2 <= 16;
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      if (inside(x, y)) {
        const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        if (edge) grid[y][x] = NIGHT;
        else {
          const lean = x - 3.5 + (y - 3.5);
          let tone: string = lean < -2.5 ? paint.light : lean > 2.5 ? paint.dark : paint.body;
          // Las franjas que ruedan con la esfera.
          if ((((x * ox + y * oy - phase) % 4) + 4) % 4 === 0 && lean > -2.5) tone = lean > 2.5 ? paint.mark : paint.dark;
          grid[y][x] = tone;
        }
      } else if (inside(x - 1, y - 1)) grid[y][x] = "rgba(0, 0, 0, 0.45)";
    }
  }
  SYMBOLS[color].forEach((row, y) => {
    for (let x = 0; x < 4; x++) if (row[x] === "#") grid[y + 2][x + 2] = paint.mark;
  });
  // El brillo: la luz viene de arriba a la izquierda.
  grid[1][2] = "#ffffff";
  grid[2][1] = "#ffffff";
  grid[1][3] = paint.light;
  return grid;
}

const sheet: { canvas: HTMLCanvasElement | null; tried: boolean } = { canvas: null, tried: false };
/** Todas las esferas ya pintadas en una hoja (6 colores × 4 direcciones × 4 fases), para dibujar rápido. */
function ballSheet(): HTMLCanvasElement | null {
  if (!sheet.tried) {
    sheet.tried = true;
    try {
      const canvas = makeCanvas(16 * 9, 6 * 9);
      const c = canvas.getContext("2d") as Ctx;
      for (let color = 0; color < 6; color++) {
        for (let orient = 0; orient < 4; orient++) {
          for (let phase = 0; phase < 4; phase++) {
            const grid = ballPixels(color, orient, phase);
            const left = (orient * 4 + phase) * 9;
            grid.forEach((row, y) => row.forEach((tone, x) => tone && rect(c, left + x, color * 9 + y, 1, 1, tone)));
          }
        }
      }
      sheet.canvas = canvas;
    } catch {
      sheet.canvas = null;
    }
  }
  return sheet.canvas;
}

/** Pinta una esfera con su centro en (x, y). `dirX`, `dirY` es hacia dónde rueda y `roll` cuánto ha rodado. */
function drawBall(c: Ctx, color: number, x: number, y: number, dirX: number, dirY: number, rolled: number) {
  const left = Math.round(x - 3.5);
  const top = Math.round(y - 3.5);
  const ready = ballSheet();
  if (!ready) {
    const paint = PAINT[color];
    rect(c, left + 1, top, 6, 8, NIGHT);
    rect(c, left, top + 1, 8, 6, NIGHT);
    rect(c, left + 1, top + 1, 6, 6, paint.body);
    rect(c, left + 3, top + 3, 2, 2, paint.mark);
    rect(c, left + 2, top + 1, 1, 1, "#ffffff");
    return;
  }
  const a = Math.atan2(dirY, dirX);
  let step8 = Math.round(a / (Math.PI / 4));
  step8 = ((step8 % 8) + 8) % 8;
  // Las direcciones opuestas usan el mismo dibujo con las franjas corriendo al revés.
  const orient = step8 % 4;
  const sign = step8 < 4 ? 1 : -1;
  const phase = ((Math.floor(rolled * sign) % 4) + 4) % 4;
  c.drawImage(ready, (orient * 4 + phase) * 9, color * 9, 9, 9, left, top, 9, 9);
}

const ICONS: Record<Exclude<Kind, "">, readonly string[]> = {
  back: ["..#.#", ".#.#.", "#.#..", ".#.#.", "..#.#"],
  slow: ["#####", ".#.#.", "..#..", ".#.#.", "#####"],
  aim: ["..#..", "..#..", "##.##", "..#..", "..#.."],
  bomb: ["#.#.#", ".###.", "##.##", ".###.", "#.#.#"],
};

function drawIcon(c: Ctx, kind: Exclude<Kind, "">, x: number, y: number, color: string) {
  const left = Math.round(x) - 2;
  const top = Math.round(y) - 2;
  rect(c, left - 1, top - 1, 7, 7, NIGHT);
  paintSprite(c, ICONS[kind], { "#": color }, left, top);
}

/** La moneda-luna que aparece para dispararle: un disco de oro con una luna grabada, que gira. */
function drawCoin(c: Ctx, x: number, y: number, frame: number) {
  const half = [5, 3, 1][frame];
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let dy = -5; dy <= 5; dy++) {
    const w = Math.round(half * Math.sqrt(Math.max(0, 1 - (dy * dy) / 30)));
    rect(c, cx - w - 1, cy + dy, w * 2 + 3, 1, "#3a2408");
  }
  for (let dy = -4; dy <= 4; dy++) {
    const w = Math.round(half * Math.sqrt(Math.max(0, 1 - (dy * dy) / 22)));
    if (w <= 0 && half > 1) continue;
    rect(c, cx - w, cy + dy, w * 2 + 1, 1, "#ffcf3a");
    rect(c, cx + Math.max(0, w - 1), cy + dy, w > 0 ? 1 : 0, 1, "#c6860e");
    if (w > 1) rect(c, cx - w, cy + dy, 1, 1, "#fff3a8");
  }
  if (frame === 0) {
    // La luna grabada en la cara de la moneda.
    rect(c, cx - 2, cy - 2, 1, 5, "#c6860e");
    rect(c, cx - 1, cy - 3, 2, 1, "#c6860e");
    rect(c, cx - 1, cy + 3, 2, 1, "#c6860e");
  }
}

/* Lo que no se mueve (los caminos de piedra) se pinta una vez y se guarda. */
const layers: { key: string; base: HTMLCanvasElement | null; top: HTMLCanvasElement | null } = { key: "", base: null, top: null };

/** Un disco relleno hecho con tiras (rápido). */
function blob(c: Ctx, x: number, y: number, r: number, color: string) {
  c.fillStyle = color;
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r + r * 0.8 - dy * dy));
    c.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

/** El canal de piedra por donde ruedan las esferas, en los puntos de `track` que diga `keep`. */
function paintTrack(c: Ctx, track: Track, look: Look, keep: (i: number) => boolean, every = 1) {
  if (every > 1) {
    // Sin lienzo guardado (pruebas), un camino sencillo y barato.
    for (let i = 0; i <= track.length; i += every) if (keep(i)) rect(c, Math.round(track.xs[i]) - 4, Math.round(track.ys[i]) - 4, 9, 9, look.edge);
    return;
  }
  const passes: [number, string][] = [
    [5, NIGHT],
    [4, look.edge],
    [3, look.wall],
    [1, look.ground],
  ];
  for (const [r, color] of passes) for (let i = 0; i <= track.length; i += every) if (keep(i)) blob(c, track.xs[i], track.ys[i], r, color);
  // Unas piedras claras cada tanto en el borde, como baldosas del canal.
  for (let i = 4; i <= track.length; i += 8) {
    if (!keep(i)) continue;
    const [tx, ty] = tangentAt(track, i);
    for (const k of [-3, 3]) rect(c, Math.round(track.xs[i] - ty * k), Math.round(track.ys[i] + tx * k), 1, 1, look.wall);
  }
}

/** La cueva: un lomo de roca encima del camino, con piedras de distintos tonos y una boca oscura en cada punta. */
function paintCave(c: Ctx, track: Track, look: Look) {
  const inCave = (i: number) => track.cave[i] === 1;
  for (let i = 0; i <= track.length; i++) if (inCave(i)) blob(c, track.xs[i], track.ys[i], 8, NIGHT);
  for (let i = 0; i <= track.length; i++) if (inCave(i)) blob(c, track.xs[i] - 1, track.ys[i] - 1, 7, look.edge);
  for (let i = 0; i <= track.length; i++) if (inCave(i)) blob(c, track.xs[i], track.ys[i], 6, look.wall);
  // Piedras sueltas encima, cada una con su brillo y su sombra.
  for (let i = 4; i <= track.length; i += 6) {
    if (!inCave(i)) continue;
    const [tx, ty] = tangentAt(track, i);
    const side = ((i * 7) % 5) - 2;
    const x = Math.round(track.xs[i] - ty * side * 1.8);
    const y = Math.round(track.ys[i] + tx * side * 1.8);
    rect(c, x - 2, y - 1, 4, 3, NIGHT);
    rect(c, x - 1, y - 1, 3, 2, look.ground);
    rect(c, x - 1, y - 1, 2, 1, look.edge);
  }
  for (let i = 1; i <= track.length; i++) {
    if (inCave(i) === inCave(i - 1)) continue;
    const at = inCave(i) ? i : i - 1;
    blob(c, track.xs[at], track.ys[at], 5, NIGHT);
    blob(c, track.xs[at], track.ys[at], 4, "#05030a");
  }
}

function paintBase(c: Ctx, layout: Layout, look: Look, every = 1) {
  if (every === 1) {
    // Un cielo de puntitos y, alrededor del ídolo, un círculo de piedras de altar.
    const random = seeded(layout.name.length * 977 + layout.tracks[0].length);
    c.globalAlpha = 0.5;
    for (let k = 0; k < 70; k++) rect(c, 2 + Math.floor(random() * 124), 26 + Math.floor(random() * 196), 1, 1, k % 5 === 0 ? look.light : look.edge);
    for (let k = 0; k < 6; k++) {
      const x = 8 + Math.floor(random() * 112);
      const y = 32 + Math.floor(random() * 184);
      rect(c, x - 1, y, 3, 1, look.light);
      rect(c, x, y - 1, 1, 3, look.light);
    }
    const [ix, iy] = layout.idol;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      rect(c, Math.round(ix + Math.cos(a) * 17) - (k % 2), Math.round(iy + Math.sin(a) * 17) - (k % 2), 1 + (k % 2), 1 + (k % 2), look.edge);
    }
    c.globalAlpha = 1;
  }
  for (const track of layout.tracks) paintTrack(c, track, look, (i) => track.under[i] === 1, every);
  for (const track of layout.tracks) paintTrack(c, track, look, (i) => track.under[i] !== 1, every);
}

function paintTop(c: Ctx, layout: Layout, look: Look) {
  for (const track of layout.tracks) {
    paintCave(c, track, look);
    // El puente: el tramo de arriba se vuelve a pintar encima, con barandas.
    let any = false;
    for (let i = 0; i <= track.length; i++) if (track.bridge[i]) any = true;
    if (!any) continue;
    for (let i = 0; i <= track.length; i++) if (track.bridge[i]) blob(c, track.xs[i], track.ys[i], 6, NIGHT);
    paintTrack(c, { ...track, length: track.length }, look, (i) => track.bridge[i] === 1);
    for (let i = 0; i <= track.length; i += 2) {
      if (!track.bridge[i]) continue;
      const [tx, ty] = tangentAt(track, i);
      for (const k of [-5, 5]) rect(c, Math.round(track.xs[i] - ty * k), Math.round(track.ys[i] + tx * k), 1, 1, look.light);
    }
  }
}

function cachedLayers(level: number, world: number) {
  const key = `${(level - 1) % LEVEL_COUNT}:${world}:${lookOf(world).wall}`;
  if (layers.key !== key) {
    layers.key = key;
    try {
      const layout = layoutOf(level);
      const look = lookOf(world);
      const base = makeCanvas(WIDTH, HEIGHT);
      const top = makeCanvas(WIDTH, HEIGHT);
      paintBase(base.getContext("2d") as Ctx, layout, look);
      paintTop(top.getContext("2d") as Ctx, layout, look);
      layers.base = base;
      layers.top = top;
    } catch {
      layers.base = layers.top = null;
    }
  }
  return layers.base && layers.top ? layers : null;
}

/** El pozo del final: una luna nueva, oscura, con un hilo de luz. Se pone roja si la cadena se acerca. */
function drawHole(c: Ctx, track: Track, look: Look, danger: boolean, time: number, still: boolean) {
  const x = Math.round(track.xs[track.length]);
  const y = Math.round(track.ys[track.length]);
  const hot = danger && (still || Math.floor(time * 6) % 2 === 0);
  blob(c, x, y, 8, NIGHT);
  blob(c, x, y, 7, hot ? HEART : look.light);
  blob(c, x + 1, y - 1, 6, NIGHT);
  blob(c, x + 1, y, 5, "#120a22");
  rect(c, x - 1, y - 1, 3, 3, "#000000");
}

/** La entrada del camino: una pequeña boca de piedra por donde salen las esferas. */
function drawGate(c: Ctx, track: Track, look: Look) {
  const x = Math.round(track.xs[0]);
  const y = Math.round(track.ys[0]);
  blob(c, x, y, 7, NIGHT);
  blob(c, x, y, 6, look.edge);
  blob(c, x, y, 4, "#05030a");
  rect(c, x - 1, y - 7, 3, 2, look.light);
}

const STONE = { k: NIGHT, l: "#cfc8e4", m: "#9a93b8", d: "#68628a", s: "#4a4568" };
const MOONSTONE = { light: "#fff6d0", body: "#efdc9a", dark: "#b89a52" };
const idolCache: { canvas: HTMLCanvasElement | null; tried: boolean } = { canvas: null, tried: false };

/** El pedestal del ídolo: un disco de piedra con muescas talladas (siempre igual, así que se guarda). */
function paintIdolBody(c: Ctx, cx: number, cy: number) {
  blob(c, cx + 1, cy + 2, IDOL_R + 1, "rgba(0, 0, 0, 0.5)");
  blob(c, cx, cy, IDOL_R + 1, STONE.k);
  blob(c, cx, cy, IDOL_R, STONE.d);
  blob(c, cx - 1, cy - 1, IDOL_R - 1, STONE.m);
  blob(c, cx - 1, cy - 1, IDOL_R - 3, "#857ea6");
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const x = Math.round(cx - 0.5 + Math.cos(a) * (IDOL_R - 1.5));
    const y = Math.round(cy - 0.5 + Math.sin(a) * (IDOL_R - 1.5));
    rect(c, x, y, 1, 1, k % 2 ? STONE.s : STONE.l);
  }
}

/**
 * El ídolo: sobre el pedestal, una luna creciente de piedra que gira hacia donde
 * apuntas. En su hueco lleva la esfera que vas a lanzar; la siguiente espera a un costado.
 */
function drawIdol(c: Ctx, state: State, look: Look, time: number, still: boolean) {
  const [cx, cy] = idolOf(state);
  if (!idolCache.tried) {
    idolCache.tried = true;
    try {
      const canvas = makeCanvas(32, 32);
      paintIdolBody(canvas.getContext("2d") as Ctx, 15, 15);
      idolCache.canvas = canvas;
    } catch {
      idolCache.canvas = null;
    }
  }
  if (idolCache.canvas) c.drawImage(idolCache.canvas, cx - 15, cy - 15);
  else paintIdolBody(c, cx, cy);
  const dx = Math.cos(state.angle);
  const dy = Math.sin(state.angle);
  // La luna creciente: un disco al que le falta un mordisco del lado hacia donde apunta.
  const inMoon = (x: number, y: number) => x * x + y * y <= 72 && (x - dx * 4.5) ** 2 + (y - dy * 4.5) ** 2 > 36;
  for (let y = -9; y <= 9; y++) {
    for (let x = -9; x <= 9; x++) {
      if (!inMoon(x, y)) continue;
      const edge = !inMoon(x - 1, y) || !inMoon(x + 1, y) || !inMoon(x, y - 1) || !inMoon(x, y + 1);
      const lean = x + y;
      rect(c, cx + x, cy + y, 1, 1, edge ? NIGHT : lean < -6 ? MOONSTONE.light : lean > 4 ? MOONSTONE.dark : MOONSTONE.body);
    }
  }
  // El ojo de la luna, en la parte gruesa, mirando hacia donde apuntas.
  const ex = Math.round(cx - dx * 5.5);
  const ey = Math.round(cy - dy * 5.5);
  const blinkNow = !still && Math.floor(time * 10) % 41 === 0;
  rect(c, ex - 1, ey - 1, 2, 2, NIGHT);
  if (!blinkNow) rect(c, ex - 1 + (dx > 0.4 ? 1 : 0), ey - 1 + (dy > 0.4 ? 1 : 0), 1, 1, look.light);
  // La esfera que vas a lanzar, en el hueco de la luna.
  if (state.reload <= RELOAD * 0.5 || still) drawBall(c, state.current, cx + dx * 4, cy + dy * 4, dx, dy, 0);
  // La siguiente, chiquita, a un costado del pedestal.
  const nx = cx + 10;
  const ny = cy + 9;
  const next = PAINT[state.next];
  rect(c, nx - 2, ny - 3, 5, 7, NIGHT);
  rect(c, nx - 3, ny - 2, 7, 5, NIGHT);
  rect(c, nx - 1, ny - 2, 3, 5, next.body);
  rect(c, nx - 2, ny - 1, 5, 3, next.body);
  rect(c, nx - 1, ny - 1, 1, 1, next.light);
  rect(c, nx + 1, ny + 1, 1, 1, next.dark);
}

/** La línea de puntería: desde la boca hasta la primera esfera que tocaría (o el borde). */
function drawGuide(c: Ctx, state: State, full: boolean, time: number, still: boolean) {
  const [mx, my] = mouthOf(state);
  const dx = Math.cos(state.angle);
  const dy = Math.sin(state.angle);
  const layout = layoutOf(state.level);
  const color = PAINT[state.current].light;
  const limit = full ? 240 : 26;
  const shift = still ? 0 : Math.floor(time * 30) % 6;
  for (let d = 6 + shift; d < limit; d += 6) {
    const x = mx + dx * d;
    const y = my + dy * d;
    if (x < 2 || x > WIDTH - 3 || y < 24 || y > HEIGHT - 3) break;
    let blocked = false;
    for (const chain of state.chains) {
      const track = layout.tracks[chain.track];
      for (const ball of chain.balls) {
        if (hiddenAt(track, ball.s)) continue;
        const [bx, by] = pointAt(track, ball.s);
        if ((bx - x) ** 2 + (by - y) ** 2 < 36) blocked = true;
      }
    }
    if (blocked) break;
    if (full) rect(c, Math.round(x) - 1, Math.round(y) - 1, 2, 2, color);
    else if (d < limit) rect(c, Math.round(x), Math.round(y), 1, 1, color);
  }
}

function drawBalls(c: Ctx, state: State, layout: Layout, under: boolean, still: boolean, time: number) {
  for (const chain of state.chains) {
    const track = layout.tracks[chain.track];
    for (const ball of chain.balls) {
      if (ball.s < 1 || ball.s > track.length) continue;
      const i = Math.round(ball.s);
      if ((track.under[i] === 1) !== under) continue;
      if (track.hidden[i] && track.cave[i]) continue;
      let [x, y] = pointAt(track, ball.s);
      if (ball.w < 1) {
        x = ball.fx + (x - ball.fx) * ball.w;
        y = ball.fy + (y - ball.fy) * ball.w;
      }
      const [tx, ty] = tangentAt(track, ball.s);
      drawBall(c, ball.color, x, y, tx, ty, ball.s);
      if (ball.kind) {
        if (still || Math.floor(time * 4) % 2 === 0) {
          const hx = Math.round(x) - 5;
          const hy = Math.round(y) - 5;
          rect(c, hx + 2, hy, 7, 1, "#ffffff");
          rect(c, hx + 2, hy + 10, 7, 1, "#ffffff");
          rect(c, hx, hy + 2, 1, 7, "#ffffff");
          rect(c, hx + 10, hy + 2, 1, 7, "#ffffff");
        }
        const fading = ball.kindLife < 3 && !still && Math.floor(time * 6) % 2 === 0;
        drawIcon(c, ball.kind, x, y, fading ? PAINT[ball.color].light : "#ffffff");
      }
    }
  }
}

function drawHud(c: Ctx, state: State, look: Look, time: number, still: boolean) {
  drawTop(c, state.score, state.lives);
  const end = write(c, `${UI.level.toUpperCase()} ${levelLabel(state.level)}`, 5, 15, INK);
  // La barra de la luna: se llena con los puntos del nivel.
  const left = end + 5;
  const right = WIDTH - 12;
  const fill = Math.min(1, state.levelScore / targetOf(state.level));
  rect(c, left, 15, right - left, 7, NIGHT);
  rect(c, left + 1, 16, right - left - 2, 5, look.ground);
  const glowing = state.full && !still && Math.floor(time * 4) % 2 === 0;
  rect(c, left + 1, 16, Math.round((right - left - 2) * fill), 5, glowing ? "#ffffff" : look.light);
  rect(c, left + 1, 16, Math.round((right - left - 2) * fill), 1, "#ffffff");
  // La luna al final de la barra: llena cuando la barra se llena.
  paintSprite(c, [".kkk.", "kyyyk", "kyyyk", "kyyyk", ".kkk."], { k: NIGHT, y: state.full ? GOLD : "#3a3458" }, right + 2, 16);
  // Poderes activos.
  let x = 5;
  for (const [kind, left2] of [["back", state.reverse], ["slow", state.slow], ["aim", state.aim]] as const) {
    if (left2 <= 0) continue;
    if (left2 > 2 || still || Math.floor(time * 6) % 2 === 0) drawIcon(c, kind, x + 3, 28, "#8ff3ff");
    x += 9;
  }
}

/** La pantalla entre niveles: el nombre del nivel que viene, su etapa y el bono ganado. */
function drawCard(c: Ctx, state: State, look: Look) {
  rect(c, 6, 58, WIDTH - 12, 112, NIGHT);
  rect(c, 7, 59, WIDTH - 14, 110, look.wall);
  rect(c, 8, 60, WIDTH - 16, 108, NIGHT);
  center(c, "¡NIVEL COMPLETO!", 66, GOLD);
  center(c, `BONO ${state.bonusTotal}`, 80, INK);
  const next = state.level + 1;
  const newStage = stageOf(next) !== stageOf(state.level);
  center(c, newStage ? "NUEVA ETAPA" : "SIGUE", 100, newStage ? GOLD : "#8ff3ff");
  center(c, `ETAPA ${stageOf(next)}`, 112, INK);
  const place = worldName(worldOf(next));
  center(c, place, 122, look.light);
  center(c, `${UI.level.toUpperCase()} ${levelLabel(next)}`, 138, INK);
  center(c, layoutOf(next).name, 148, GOLD);
  if (state.phaseTime > 0.8) center(c, "TOCA PARA SEGUIR", 160, "#8a84b8");
}

function draw(c: Ctx, state: State, time: number, still: boolean) {
  const world = worldOf(state.level);
  const look = lookOf(world);
  const layout = layoutOf(state.level);
  drawFrame(c, world);
  const ready = cachedLayers(state.level, world);
  if (ready) c.drawImage(ready.base as HTMLCanvasElement, 0, 0);
  else paintBase(c, layout, look, 3);
  layout.tracks.forEach((track, index) => {
    const chain = state.chains[index];
    const head = chain?.balls[chain.balls.length - 1];
    drawHole(c, track, look, state.phase === "dying" || (!!head && head.s > track.length * 0.8), time, still);
  });
  drawBalls(c, state, layout, true, still, time);
  if (ready) c.drawImage(ready.top as HTMLCanvasElement, 0, 0);
  else for (const track of layout.tracks) for (let i = 0; i <= track.length; i += 4) if (track.cave[i]) blob(c, track.xs[i], track.ys[i], 7, look.ground);
  drawBalls(c, state, layout, false, still, time);
  for (const track of layout.tracks) drawGate(c, track, look);

  // La luz del bono que recorre el camino.
  if (state.phase === "bonus") {
    for (const part of state.bonus) {
      if (part.s >= part.end) continue;
      const track = layout.tracks[part.track];
      for (let k = 0; k < 4; k++) {
        const [x, y] = pointAt(track, part.s - k * 5);
        rect(c, Math.round(x) - 2 + (k > 0 ? 1 : 0), Math.round(y) - 2 + (k > 0 ? 1 : 0), k > 0 ? 3 : 5, k > 0 ? 3 : 5, k === 0 ? "#ffffff" : GOLD);
      }
    }
  }
  if (state.coin) {
    const frame = still ? 0 : [0, 0, 0, 1, 2, 1][Math.floor(time * 10) % 6];
    if (state.coin.life > 1.5 || still || Math.floor(time * 8) % 2 === 0) {
      drawCoin(c, state.coin.x, state.coin.y, frame);
      if (!still && Math.floor(time * 3) % 2 === 0) {
        const sx = Math.round(state.coin.x) + 5;
        const sy = Math.round(state.coin.y) - 6;
        rect(c, sx - 2, sy, 5, 1, "#ffffff");
        rect(c, sx, sy - 2, 1, 5, "#ffffff");
      }
    }
  }
  if (state.phase === "play") drawGuide(c, state, state.aim > 0, time, still);
  for (const shot of state.shots) drawBall(c, shot.color, shot.x, shot.y, shot.vx, shot.vy, 0);
  if (!still) for (const spark of state.sparks) rect(c, Math.round(spark.x), Math.round(spark.y), spark.life > 0.3 ? 2 : 1, spark.life > 0.3 ? 2 : 1, spark.color);
  drawIdol(c, state, look, time, still);
  for (const pop of state.pops) {
    const scale = 1;
    const width = widthOf(pop.text, scale);
    const x = Math.max(3, Math.min(WIDTH - 3 - width, Math.round(pop.x - width / 2)));
    outlined(c, pop.text, x, Math.max(32, Math.round(pop.y)), pop.color, scale);
  }

  drawHud(c, state, look, time, still);
  if (state.phase === "play" && state.banner > 0) {
    const y = 96;
    rect(c, 10, y - 4, WIDTH - 20, 34, "rgba(6, 4, 14, 0.82)");
    center(c, `${UI.level.toUpperCase()} ${levelLabel(state.level)}`, y, INK);
    center(c, layout.name, y + 11, GOLD);
    center(c, worldName(world), y + 21, look.light);
  }
  if (state.phase === "card") drawCard(c, state, look);
}

export default defineGame<State>({
  help: "Flechas izquierda y derecha para girar el ídolo, espacio o flecha arriba para lanzar la esfera y flecha abajo para cambiarla por la siguiente. Junta tres o más del mismo color antes de que la cadena llegue al pozo. También puedes tocar donde quieres lanzar.",
  create,
  pad: () => [
    [
      { key: "left", glyph: "←", label: "Girar a la izquierda" },
      { key: "right", glyph: "→", label: "Girar a la derecha" },
    ],
    [
      { key: "down", glyph: "↻", label: "Cambiar esfera" },
      { key: "fire", glyph: "★", label: "Lanzar", main: true },
    ],
  ],
  step,
  draw,
  status: (state) => ({
    score: state.score,
    lives: state.lives,
    level: state.level,
    letters: 0,
    world: worldOf(state.level),
    over: state.over,
  }),
});
