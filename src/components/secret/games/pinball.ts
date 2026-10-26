/**
 * "Pinball de las Lunas": una mesa de pinball moderna bajo la noche de faroles,
 * con misiones, rangos y tres pisos. Se dibuja con el doble de detalle
 * (256 × 448 píxeles) y toda la mesa (paredes, física, toques) usa esas medidas.
 *
 * LA MESA PRINCIPAL. La bola sale por el carril de la derecha (el resorte se
 * carga mientras se mantiene apretado; con la fuerza justa cae en el farol que
 * parpadea y es un tiro perfecto). Tiene:
 * - Cuatro rampas: la RAMPA DEL CIELO (izquierda) sube y cruza por encima de la
 *   mesa hasta el pasillo derecho; la ESPIRAL (centro) gira alrededor de los
 *   bumpers y baja por un alambre al pasillo izquierdo (o, con la escalera
 *   encendida, sube a la cámara de las estrellas); el RULO da una vuelta
 *   completa y deja la bola en los faroles; y la RAMPA DE ALAMBRE (derecha)
 *   devuelve la bola al carril de entrada para otro tiro perfecto. Todas piden
 *   un buen golpe: si la bola llega lenta, no alcanza la cima y cae de vuelta.
 * - Órbitas izquierda y derecha (la izquierda con girador), tres bumpers, un
 *   espíritu guardián que pasea, tres faroles arriba, un banco de tres
 *   objetivos que caen de verdad, las tres campanas del gato (objetivos fijos),
 *   una bola cautiva que enciende el imán, un disco giratorio tramposo que
 *   desvía la bola, y la LUNA con cara: abre la boca para tragarse la bola
 *   (empieza misiones y guarda bolas para la multibola) y la escupe. Delante de
 *   la luna hay una muralla que sube y baja: dos golpes la tumban.
 * - Pasillos de salida con la patada del gato, compuertas, salvavidas y un poste
 *   de luz entre las paletas.
 *
 * LA CÁMARA DE LAS ESTRELLAS (piso de arriba). Tiene sus propias paletas,
 * bumpers que se mueven, un imán y cinco estrellas: con las cinco se abre la
 * puerta secreta al JARDÍN DE LAS LUNAS, un tercer piso con tiempo contado.
 * Si la bola cae entre las paletas de arriba no se pierde: baja por el tubo y
 * la luna la escupe en la mesa principal.
 *
 * MISIONES Y RANGOS. Al pasar por los faroles se elige misión; la luna la
 * empieza. Cada misión tiene pasos (y algunas, reloj). Al cumplirla se sube de
 * nivel (cambia el paisaje) y, cada tanto, de rango: de APRENDIZ DE FAROLERO a
 * GUARDIÁN DE LAS LUNAS. El rango final sale en el resultado.
 *
 * La física avanza en pasos fijos muy cortos (1/600 s) para que la bola nunca
 * atraviese una pared, aunque el cuadro dure más. Lo que no se mueve (fondos,
 * plásticos, rieles, rampas) se pinta una sola vez por piso y paisaje en
 * lienzos guardados; en cada cuadro sólo se pinta lo que se mueve y las luces.
 */

import { dither, makeCanvas, rect, seeded, type Ctx } from "../art";
import { shownWorld } from "../../../lib/world-list";
import { worldName } from "../worlds";
import { GOLD, HEART, HEIGHT, INK, NAME, NIGHT, SPIRIT, SPIRIT_COLORS, WIDTH, WORLDS, lookOf, scaleSprite, widthOf, write, type Look } from "./kit";
import { defineGame, roll, type Input, type Out } from "./types";

/* ---------- Medidas generales ---------- */

/** Píxeles del lienzo por cada píxel del tablero: el pinball se dibuja con el doble de detalle. */
export const RES = 2;
/** Medidas del lienzo de este juego. */
export const W = WIDTH * RES;
export const HT = HEIGHT * RES;
/** Paso fijo de la física: así la bola avanza alrededor de un píxel por paso. */
const H = 1 / 600;
/** Gravedad de la mesa inclinada (píxeles por segundo al cuadrado). */
const G = 300;
export const R = 5;
const MAX_SPEED = 680;
/** La pantalla de puntos ocupa la franja de arriba. */
const DMD_H = 54;
const SAVE_TIME = 8;
const GARDEN_TIME = 20;
const COMBO_TIME = 4;

/** Los tres pisos: 0 la mesa, 1 la cámara de las estrellas, 2 el jardín secreto. */
export type Floor = 0 | 1 | 2;

/* ---------- Mesa principal ---------- */

/** El arco de arriba es media elipse. */
const CX = 128;
const CY = 172;
const RX = 120;
const RY = 112;
const LEFT = 8;
const RIGHT = 248;
/** Carril de lanzamiento: entre la pared x=228 y la de afuera x=248. */
const LANE_WALL = 228;
const LANE_X = 238;
const PLUNGER_Y = 432;
const REST_Y = PLUNGER_Y - R;
const PULL = 16;
const DRAIN_Y = 462;
/** Paredes de adentro de las órbitas. */
const ORBIT_L = 32;
const ORBIT_R = 206;

/* ---------- Pisos de arriba ---------- */

const UCX = 128;
const UCY = 140;
const URX = 100;
const URY = 80;
const UL = 28;
const UR = 228;
/** Si la bola baja de aquí en un piso de arriba, se va por el tubo a la mesa. */
const UPPER_DRAIN = 428;

type Kind = "wall" | "sling" | "gate" | "door" | "flap" | "drop" | "cat" | "mwall";
export type Seg = { ax: number; ay: number; bx: number; by: number; r: number; kind: Kind; id: number; face: number; x0: number; x1: number; y0: number; y1: number };

/** Las paredes de cada piso (las pruebas revisan que la bola nunca quede dentro de una). */
export const FLOOR_SEGS: Seg[][] = [[], [], []];
/** Las paredes de la mesa principal. */
export const SEGS = FLOOR_SEGS[0];

const side = (ax: number, ay: number, bx: number, by: number, x: number, y: number) => Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax));

function seg(floor: Floor, ax: number, ay: number, bx: number, by: number, kind: Kind = "wall", id = 0, r = 1.5) {
  const pad = r + R + 1;
  FLOOR_SEGS[floor].push({ ax, ay, bx, by, r, kind, id, face: 0, x0: Math.min(ax, bx) - pad, x1: Math.max(ax, bx) + pad, y0: Math.min(ay, by) - pad, y1: Math.max(ay, by) + pad });
}
/** Una pared que sólo frena del lado del punto (rx, ry): del otro lado la bola la cruza. */
function oneWay(floor: Floor, ax: number, ay: number, bx: number, by: number, kind: Kind, id: number, rx: number, ry: number) {
  seg(floor, ax, ay, bx, by, kind, id);
  FLOOR_SEGS[floor][FLOOR_SEGS[floor].length - 1].face = side(ax, ay, bx, by, rx, ry);
}
/** Una pared hecha de varios tramos seguidos. */
function chain(floor: Floor, points: [number, number][], kind: Kind = "wall", r = 1.5) {
  for (let i = 1; i < points.length; i++) seg(floor, points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], kind, 0, r);
}

/** Un punto del arco de arriba de la mesa, de 0 (izquierda) a 1 (derecha). */
const arcAt = (t: number): [number, number] => [CX + RX * Math.cos(Math.PI + Math.PI * t), CY + RY * Math.sin(Math.PI + Math.PI * t)];
const upperArcAt = (t: number): [number, number] => [UCX + URX * Math.cos(Math.PI + Math.PI * t), UCY + URY * Math.sin(Math.PI + Math.PI * t)];

/** Los objetivos que caen (izquierda, sobre la pared de la órbita) y las campanas del gato (derecha). */
export const DROPS = [0, 1, 2].map((i) => ({ x: ORBIT_L + 3.5, y0: 200 + i * 17, y1: 214 + i * 17 }));
export const CATS = [0, 1, 2].map((i) => ({ x: ORBIT_R - 3.5, y0: 166 + i * 17, y1: 180 + i * 17 }));
/** La muralla delante de la luna. */
export const WALL = { ax: 34, bx: 86, y: 190 };

/** Las bocas de las rampas: la bola que cruza la línea de entrada hacia arriba se sube. */
export type MouthId = "lramp" | "cramp" | "loop" | "rramp";
export const MOUTHS: { id: MouthId; x0: number; x1: number; y: number; back: number; label: string }[] = [
  { id: "lramp", x0: 85, x1: 105, y: 246, back: 230, label: "RAMPA DEL CIELO" },
  { id: "cramp", x0: 120, x1: 140, y: 240, back: 222, label: "ESPIRAL" },
  { id: "loop", x0: 155, x1: 173, y: 246, back: 228, label: "RULO" },
  { id: "rramp", x0: 188, x1: ORBIT_R, y: 240, back: 222, label: "RAMPA DE ALAMBRE" },
];

// --- Mesa principal.
for (let i = 0; i < 40; i++) {
  const [ax, ay] = arcAt(i / 40);
  const [bx, by] = arcAt((i + 1) / 40);
  seg(0, ax, ay, bx, by);
}
// Paredes de los lados (abajo quedan abiertas: por ahí se pierde la bola).
seg(0, LEFT, CY, LEFT, DRAIN_Y + 8);
seg(0, RIGHT, CY, RIGHT, DRAIN_Y + 8);
seg(0, LANE_WALL, 178, LANE_WALL, DRAIN_Y + 8);
// Compuerta de un solo sentido arriba del carril: la bola sale, pero no vuelve a entrar.
oneWay(0, LANE_WALL, 178, 246.5, 158, "gate", 0, 240, 140);
// Órbitas: paredes de adentro y guías de la salida (la de la izquierda deja pasar la patada del gato).
chain(0, [
  [40, 124],
  [ORBIT_L, 140],
  [ORBIT_L, 254],
]);
oneWay(0, LEFT, 262, 22, 280, "flap", 0, 10, 250);
seg(0, 22, 280, 42, 292);
seg(0, ORBIT_R, 104, ORBIT_R, 254);
chain(0, [
  [LANE_WALL, 262],
  [214, 280],
  [194, 292],
]);
// Compuertas de los pasillos de salida: cerradas, mandan la bola al pasillo de regreso.
oneWay(0, LEFT, 316, 28, 330, "door", 0, 12, 300);
oneWay(0, LANE_WALL, 316, 208, 330, "door", 1, 224, 300);
// Pasillos de abajo: separador entre salida y regreso, y riel hasta la paleta.
seg(0, 28, 330, 28, 360);
seg(0, 28, 360, 72, 387);
seg(0, 208, 330, 208, 360);
seg(0, 208, 360, 164, 387);
// Rebotadores triangulares: sólo el lado largo patea.
chain(0, [
  [48, 318],
  [48, 354],
  [70, 368],
]);
seg(0, 48, 318, 70, 368, "sling", 0);
chain(0, [
  [188, 318],
  [188, 354],
  [166, 368],
]);
seg(0, 188, 318, 166, 368, "sling", 1);
// Separadores de los faroles de arriba.
export const LANES = [104, 128, 152];
const DIVIDERS = [92, 116, 140, 164];
for (const x of DIVIDERS) seg(0, x, 88, x, 104, "wall", 0, 3);
// Bocas de las rampas: dos paredes, y un fondo que nunca se toca (la bola ya va por la rampa).
for (const m of MOUTHS) {
  seg(0, m.x0, m.y + 16, m.x0, m.back);
  if (m.id !== "rramp") seg(0, m.x1, m.y + 16, m.x1, m.back);
  seg(0, m.x0, m.back, m.x1, m.back);
}
// Bolsillo de la luna: la muralla (sube y baja) y su costado derecho.
seg(0, WALL.ax, WALL.y, WALL.bx, WALL.y, "mwall", 0, 2.5);
seg(0, WALL.bx, WALL.y, WALL.bx, 156);
// Objetivos que caen y campanas del gato.
DROPS.forEach((d, i) => seg(0, d.x, d.y0, d.x, d.y1, "drop", i, 2));
CATS.forEach((d, i) => seg(0, d.x, d.y0, d.x, d.y1, "cat", i, 2));
// El canal de la bola cautiva, con dos postes en la boca.
export const CAPTIVE = { x: 188, top: 112, rest: 149, stopY: 100 };
seg(0, 178, 100, 178, 152);
seg(0, 198, 100, 198, 152);
seg(0, 178, 100, 198, 100);
seg(0, 198, 100, ORBIT_R, 104);
seg(0, 181, 156, 181, 156.1, "wall", 0, 2);
seg(0, 195, 156, 195, 156.1, "wall", 0, 2);

// --- Los dos pisos de arriba comparten el mismo mueble.
for (const floor of [1, 2] as const) {
  for (let i = 0; i < 32; i++) {
    const [ax, ay] = upperArcAt(i / 32);
    const [bx, by] = upperArcAt((i + 1) / 32);
    seg(floor, ax, ay, bx, by);
  }
  // Los lados llegan hasta abajo: la bola que pasa bajo una paleta igual cae al tubo.
  seg(floor, UL, UCY, UL, HT + 8);
  seg(floor, UR, UCY, UR, HT + 8);
  seg(floor, UL, 348, 84, 385);
  seg(floor, UR, 348, 172, 385);
  chain(floor, [
    [44, 296],
    [44, 332],
    [66, 348],
  ]);
  seg(floor, 44, 296, 66, 348, "sling", 2);
  chain(floor, [
    [212, 296],
    [212, 332],
    [190, 348],
  ]);
  seg(floor, 212, 296, 190, 348, "sling", 3);
}

/* Una rejilla por piso: cada celda sabe qué paredes tiene cerca (así cada paso revisa pocas). */
const CELL = 32;
const GRID_COLS = Math.ceil(W / CELL);
const GRID_ROWS = Math.ceil((HT + 48) / CELL);
const GRIDS: Seg[][][] = [0, 1, 2].map((floor) => {
  const grid: Seg[][] = Array.from({ length: GRID_COLS * GRID_ROWS }, () => []);
  for (const s of FLOOR_SEGS[floor]) {
    for (let cy = Math.max(0, Math.floor(s.y0 / CELL)); cy <= Math.min(GRID_ROWS - 1, Math.floor(s.y1 / CELL)); cy++) {
      for (let cx = Math.max(0, Math.floor(s.x0 / CELL)); cx <= Math.min(GRID_COLS - 1, Math.floor(s.x1 / CELL)); cx++) grid[cy * GRID_COLS + cx].push(s);
    }
  }
  return grid;
});
const segsNear = (floor: Floor, x: number, y: number) => {
  const cx = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(x / CELL)));
  const cy = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(y / CELL)));
  return GRIDS[floor][cy * GRID_COLS + cx];
};

/** Bordes de la mesa principal en una fila (para pintar el fondo y para las pruebas). */
export function tableSpan(y: number): [number, number] {
  if (y >= CY) return [LEFT, RIGHT];
  const k = (y - CY) / RY;
  if (k <= -1) return [CX, CX];
  const half = RX * Math.sqrt(1 - k * k);
  return [CX - half, CX + half];
}

/** Bordes de cualquier piso en una fila. */
export function spanOf(floor: Floor, y: number): [number, number] {
  if (floor === 0) return tableSpan(y);
  if (y >= UCY) return [UL, UR];
  const k = (y - UCY) / URY;
  if (k <= -1) return [UCX, UCX];
  const half = URX * Math.sqrt(1 - k * k);
  return [UCX - half, UCX + half];
}

/* ---------- Cosas redondas: bumpers, espíritu, estrellas, lunas, la cara de la luna ---------- */

type BumperKind = "pop" | "spirit" | "star" | "moon" | "toy";
export type Bumper = { floor: Floor; kind: BumperKind; x: number; y: number; r: number; ax: number; w: number; phase: number; index: number };
/** Todas las cosas redondas de todos los pisos. `ax` es cuánto se mecen de lado a lado. */
export const BUMPERS: Bumper[] = [];
const bumper = (floor: Floor, kind: BumperKind, x: number, y: number, r: number, ax = 0, w = 0, phase = 0) => {
  BUMPERS.push({ floor, kind, x, y, r, ax, w, phase, index: BUMPERS.length });
};
bumper(0, "pop", 104, 134, 12);
bumper(0, "pop", 152, 134, 12);
bumper(0, "pop", 128, 162, 12, 7, 0.9);
/** El espíritu guardián pasea delante de las rampas. */
bumper(0, "spirit", 118, 276, 10, 28, 0.75);
const SPIRIT_INDEX = 3;
/** La cara de la luna: una piedra redonda que no patea (la boca está abajo). */
bumper(0, "toy", 62, 142, 20);
export const MOON_FACE = BUMPERS[4];
/** La boca de la luna. */
export const MOUTH = { x: 62, y: 168 };
// Estrellas de la cámara.
const STAR_SPOTS: [number, number][] = [
  [52, 164],
  [80, 114],
  [128, 88],
  [176, 114],
  [204, 164],
];
const FIRST_STAR = BUMPERS.length;
for (const [x, y] of STAR_SPOTS) bumper(1, "star", x, y, 8);
bumper(1, "pop", 88, 196, 12, 16, 1.1);
bumper(1, "pop", 168, 196, 12, 16, 1.1, Math.PI);
// Lunas del jardín secreto.
bumper(2, "moon", 80, 128, 10);
bumper(2, "moon", 128, 104, 10);
bumper(2, "moon", 176, 128, 10);
bumper(2, "moon", 92, 188, 10);
bumper(2, "moon", 164, 188, 10);
bumper(2, "moon", 128, 244, 10, 20, 1.3);

/** Dónde está una cosa redonda en este momento y a qué velocidad se mueve. */
export function bumperAt(b: Bumper, clock: number): [number, number, number] {
  if (!b.ax) return [b.x, b.y, 0];
  const angle = clock * b.w + b.phase;
  return [b.x + b.ax * Math.sin(angle), b.y, b.ax * b.w * Math.cos(angle)];
}

/* ---------- Lugares de la mesa principal ---------- */

export const DISC = { x: 128, y: 197, r: 13 };
export const MAGNET = { x: 118, y: 306, pull: 22 };
const POST = { x: 118, y: 414, r: 5 };
/** Girador (en la órbita izquierda) y sensores de las dos órbitas. */
const SPIN_Y = 226;
const ORBIT_Y = 200;
/** Pisos de arriba. */
const DOOR = { x: 128, y: 132 };
const UPPER_MAGNET = { x: 128, y: 268, pull: 26 };

type Flipper = { x: number; y: number; rest: number; up: number; len: number };
export const FLIPS: Flipper[][] = [
  [
    { x: 80, y: 392, rest: 0.5, up: -0.45, len: 30 },
    { x: 156, y: 392, rest: Math.PI - 0.5, up: Math.PI + 0.45, len: 30 },
  ],
];
FLIPS[1] = [
  { x: 84, y: 392, rest: 0.5, up: -0.45, len: 28 },
  { x: 172, y: 392, rest: Math.PI - 0.5, up: Math.PI + 0.45, len: 28 },
];
FLIPS[2] = FLIPS[1];
const FLIP_R0 = 6;
const FLIP_R1 = 4;
/** Dónde se separan la paleta izquierda y la derecha en cada piso. */
export const MIDDLE = [118, 128, 128];

/* ---------- Recorridos (rampas, alambres y tubos) ---------- */

/**
 * Un recorrido: la bola avanza por él con su propia rapidez. Hasta `climb` va
 * de subida y pierde `rise` de rapidez por segundo: si llega lenta no alcanza
 * la cima y vuelve rodando a la boca. Después de la cima baja y nunca va más
 * lenta que `min`.
 */
export type Path = {
  floor: Floor;
  points: [number, number][];
  /** Distancia recorrida hasta cada punto. */
  at: number[];
  total: number;
  climb: number;
  rise: number;
  fall: number;
  min: number;
  /** Cómo se ve: plástico, alambre, tubo o nada (va por debajo). Y a qué altura pasa (para la sombra). */
  look: "plastic" | "wire" | "tube" | "none";
  level: number;
};

/** Suaviza una línea quebrada con una curva que pasa por todos sus puntos. */
function smooth(points: [number, number][], step = 5): [number, number][] {
  const out: [number, number][] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

/**
 * Arma un recorrido. `top` es el número del punto (de los que se dan) donde
 * termina la subida, y `need` la rapidez que hace falta en la boca para llegar.
 */
function makePath(floor: Floor, raw: [number, number][], opts: { top?: number; need?: number; speed?: number; look: Path["look"]; level?: number; fall?: number; bend?: boolean }): Path {
  const points = opts.bend === false ? raw : smooth(raw);
  const at = [0];
  for (let i = 1; i < points.length; i++) at.push(at[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const total = at[at.length - 1];
  let climb = 0;
  if (opts.top !== undefined) {
    // Dónde quedó el punto de la cima en la curva suavizada.
    const [tx, ty] = raw[opts.top];
    let best = 0;
    for (let i = 0; i < points.length; i++) if (Math.hypot(points[i][0] - tx, points[i][1] - ty) < Math.hypot(points[best][0] - tx, points[best][1] - ty)) best = i;
    climb = at[best];
  }
  const need = opts.need ?? 0;
  return {
    floor,
    points,
    at,
    total,
    climb,
    rise: climb > 0 ? (need * need) / (2 * climb) : 0,
    fall: opts.fall ?? 260,
    min: opts.speed ?? 150,
    look: opts.look,
    level: opts.level ?? 1,
  };
}

/** El riel del lanzador: corre bajo el arco y deja caer la bola en un farol según la fuerza del lanzamiento. */
const wireAt = (t: number): [number, number] => [CX + (RX - 10) * Math.cos(Math.PI + Math.PI * t), CY + (RY - 8) * Math.sin(Math.PI + Math.PI * t)];
function wirePath(endX: number, endY: number): [number, number][] {
  const points: [number, number][] = [[LANE_X, 172]];
  for (let t = 0.97; t >= 0.03; t -= 0.04) {
    const point = wireAt(t);
    if (point[0] < endX + 2) break;
    points.push(point);
  }
  const last = points[points.length - 1];
  const [hx, hy] = wireAt(Math.acos(Math.min(1, (CX - endX) / (RX - 10))) / Math.PI);
  if (Math.abs(last[0] - hx) > 1) points.push([hx, hy]);
  points.push([endX, endY]);
  return points;
}
/** Fuerza del resorte desde la que la bola toma cada salida del riel: farol 2, 1, 0 y la órbita. */
export const WIRE_BANDS = [0.5, 0.64, 0.78, 0.92];
const WIRE_SPEED = 320;
const wire = (points: [number, number][]) => makePath(0, points, { speed: WIRE_SPEED, look: "wire", level: 1, bend: false });

/** El principio de la espiral (lo comparten la vuelta normal y la escalera a la cámara). */
const SPIRAL: [number, number][] = [
  [130, 240],
  [134, 222],
  [149, 210],
  [153, 193],
  [144, 179],
  [128, 174],
  [112, 180],
  [104, 195],
  [108, 210],
];

export const PATHS = {
  wire2: wire(wirePath(LANES[2], 84)),
  wire1: wire(wirePath(LANES[1], 84)),
  wire0: wire(wirePath(LANES[0], 84)),
  wireOrbit: wire(wirePath(LEFT + 12, 168)),
  /** Rampa del cielo: sube por la izquierda, cruza por arriba y baja al pasillo derecho. */
  lramp: makePath(
    0,
    [
      [95, 246],
      [94, 222],
      [90, 196],
      [86, 170],
      [84, 140],
      [86, 112],
      [96, 90],
      [118, 76],
      [146, 72],
      [176, 78],
      [200, 96],
      [214, 122],
      [218, 160],
      [217, 220],
      [212, 270],
      [204, 304],
      [198, 330],
    ],
    { top: 5, need: 400, look: "plastic", level: 2, speed: 200 },
  ),
  /** La espiral: rodea los bumpers y baja por un alambre al pasillo izquierdo. */
  cramp: makePath(
    0,
    [
      ...SPIRAL,
      [92, 216],
      [74, 222],
      [58, 232],
      [46, 250],
      [40, 274],
      [38, 300],
      [38, 330],
    ],
    { top: 5, need: 430, look: "plastic", level: 1, speed: 170 },
  ),
  /** La misma espiral, pero con la escalera encendida sube a la cámara de las estrellas. */
  stairs: makePath(0, [...SPIRAL.slice(0, 6), [127, 150], [126, 110], [124, 80], [122, 56]], { top: 5, need: 430, look: "plastic", level: 1, speed: 200 }),
  /** El rulo: una vuelta completa que deja la bola en los faroles. */
  loop: makePath(
    0,
    [
      [164, 246],
      [164, 224],
      [168, 206],
      [180, 196],
      [182, 180],
      [170, 170],
      [156, 176],
      [154, 192],
      [162, 204],
      [170, 186],
      [172, 150],
      [170, 116],
      [162, 94],
      [152, 84],
    ],
    { top: 5, need: 440, look: "wire", level: 2, speed: 160 },
  ),
  /** Rampa de alambre: devuelve la bola al carril de entrada. */
  rramp: makePath(
    0,
    [
      [197, 240],
      [197, 212],
      [198, 172],
      [202, 130],
      [212, 104],
      [228, 94],
      [238, 106],
      [238, 140],
      [238, 200],
      [238, 300],
    ],
    { top: 4, need: 380, look: "wire", level: 2, speed: 200 },
  ),
  /** El tubo que baja de los pisos de arriba hasta la panza de la luna. */
  drop: makePath(
    0,
    [
      [40, 56],
      [44, 80],
      [56, 104],
      [62, 132],
    ],
    { speed: 180, look: "tube", level: 2 },
  ),
  upperIn: makePath(
    1,
    [
      [60, 52],
      [72, 88],
    ],
    { speed: 220, look: "none", bend: false },
  ),
  secretIn: makePath(
    2,
    [
      [128, 52],
      [128, 76],
    ],
    { speed: 180, look: "none", bend: false },
  ),
};
export type PathId = keyof typeof PATHS;
/** Los recorridos que se ven en la mesa principal (para pintarlos). */
const RAMP_IDS: PathId[] = ["cramp", "lramp", "loop", "rramp"];

export function pathPoint(path: Path, s: number): [number, number] {
  if (s <= 0) return path.points[0];
  if (s >= path.total) return path.points[path.points.length - 1];
  let lo = 0;
  let hi = path.at.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path.at[mid] <= s) lo = mid;
    else hi = mid;
  }
  const t = (s - path.at[lo]) / (path.at[hi] - path.at[lo] || 1);
  const [ax, ay] = path.points[lo];
  const [bx, by] = path.points[hi];
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

/** Hacia dónde apunta el recorrido en un punto (un vector de largo 1). */
function pathDir(path: Path, s: number): [number, number] {
  const [ax, ay] = pathPoint(path, Math.max(0, s - 2));
  const [bx, by] = pathPoint(path, Math.min(path.total, s + 2));
  const len = Math.hypot(bx - ax, by - ay) || 1;
  return [(bx - ax) / len, (by - ay) / len];
}

/** Rapidez que hace falta en la boca de una rampa para llegar a la cima. */
export const needOf = (id: PathId) => Math.sqrt(2 * PATHS[id].rise * PATHS[id].climb);

/* ---------- Misiones y rangos ---------- */

type Ev =
  | "bumper"
  | "ramp"
  | "loop"
  | "orbit"
  | "moon"
  | "lane"
  | "lanes"
  | "drops"
  | "cat"
  | "spirit"
  | "spin"
  | "upper"
  | "star"
  | "disc"
  | "captive"
  | "magnet"
  | "combo"
  | "wall";
type Mission = { name: string; time?: number; steps: { ev: Ev; n: number; label: string }[]; story: string };
/** Las misiones, con sus pasos en orden. Las que tienen `time` van contra el reloj. */
export const MISSIONS: Mission[] = [
  { name: "LUZ DEL CAMINO", story: "Golpea 6 bumpers y luego sube una rampa.", steps: [{ ev: "bumper", n: 6, label: "BUMPERS" }, { ev: "ramp", n: 1, label: "RAMPA" }] },
  { name: "RULO VELOZ", time: 30, story: "Da 2 vueltas por el rulo en 30 segundos.", steps: [{ ev: "loop", n: 2, label: "RULO" }] },
  { name: "TRES FAROLES", story: "Enciende los 3 faroles y dale de comer a la luna.", steps: [{ ev: "lanes", n: 1, label: "FAROLES" }, { ev: "moon", n: 1, label: "LUNA" }] },
  { name: "ESPÍRITU PERDIDO", story: "Pasa por el disco, golpea 2 veces al espíritu y llévalo a la luna.", steps: [{ ev: "disc", n: 1, label: "DISCO" }, { ev: "spirit", n: 2, label: "ESPÍRITU" }, { ev: "moon", n: 1, label: "LUNA" }] },
  { name: "VUELTA AL LAGO", time: 40, story: "Haz 3 órbitas en 40 segundos.", steps: [{ ev: "orbit", n: 3, label: "ÓRBITAS" }] },
  { name: "CAMPANAS DEL GATO", story: "Toca las 3 campanas del gato y sube una rampa.", steps: [{ ev: "cat", n: 3, label: "GATO" }, { ev: "ramp", n: 1, label: "RAMPA" }] },
  { name: "CÁMARA DE ESTRELLAS", story: "Sube por la espiral a la cámara de las estrellas y enciende 3 estrellas.", steps: [{ ev: "upper", n: 1, label: "SUBE" }, { ev: "star", n: 3, label: "ESTRELLAS" }] },
  { name: "GIRADOR LOCO", story: "Haz girar el girador de la órbita 25 veces.", steps: [{ ev: "spin", n: 25, label: "GIROS" }] },
  { name: "COMBO DE LUNA", story: "Encadena 2 combos de tiros seguidos.", steps: [{ ev: "combo", n: 2, label: "COMBOS" }] },
  { name: "CARRERA NOCTURNA", time: 45, story: "Rampa, rulo y órbita en 45 segundos.", steps: [{ ev: "ramp", n: 1, label: "RAMPA" }, { ev: "loop", n: 1, label: "RULO" }, { ev: "orbit", n: 1, label: "ÓRBITA" }] },
  { name: "LLUVIA DE CHISPAS", time: 25, story: "Golpea 15 bumpers en 25 segundos.", steps: [{ ev: "bumper", n: 15, label: "BUMPERS" }] },
  { name: "MURALLA DEL TEMPLO", story: "Tumba la muralla, baja los 3 objetivos y entra a la luna.", steps: [{ ev: "wall", n: 2, label: "MURALLA" }, { ev: "drops", n: 1, label: "OBJETIVOS" }, { ev: "moon", n: 1, label: "LUNA" }] },
  { name: "GUARDIÁN DORMIDO", story: "Despierta al espíritu con 3 golpes y sube 2 rampas.", steps: [{ ev: "spirit", n: 3, label: "ESPÍRITU" }, { ev: "ramp", n: 2, label: "RAMPAS" }] },
  { name: "NOCHE DE LUNAS", story: "Empuja la bola cautiva, deja que el imán te atrape y haz 2 órbitas.", steps: [{ ev: "captive", n: 1, label: "CAUTIVA" }, { ev: "magnet", n: 1, label: "IMÁN" }, { ev: "orbit", n: 2, label: "ÓRBITAS" }] },
];
/** Los rangos, de menor a mayor. */
export const RANKS = [
  "APRENDIZ DE FAROLERO",
  "GUÍA DE SENDEROS",
  "VIGÍA DEL BAMBÚ",
  "CAPITÁN DE FAROLES",
  "SABIO DEL SANTUARIO",
  "CAZADOR DE ESTRELLAS",
  "SEÑOR DEL LAGO",
  "ALMA DE LA CUMBRE",
  "GUARDIÁN DE LAS LUNAS",
];
/** Misiones cumplidas que pide cada rango. */
export const RANK_AT = [0, 1, 2, 4, 6, 8, 10, 13, 16];
export const rankFor = (done: number) => {
  let rank = 0;
  while (rank + 1 < RANK_AT.length && done >= RANK_AT[rank + 1]) rank += 1;
  return rank;
};

const EXTRA_AT = [40000, 120000, 250000, 450000, 700000];

/* ---------- Estado ---------- */

type HoldKind = "magnet";
export type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** "free" rueda, "plunger" espera en el resorte, "path" va por una rampa o un tubo, "held" está atrapada. */
  mode: "free" | "plunger" | "path" | "held";
  floor: Floor;
  path: PathId;
  /** Por dónde va en el recorrido y con qué rapidez (negativa: rueda de vuelta). */
  s: number;
  v: number;
  /** Ya pasó la cima de la rampa. */
  made: boolean;
  holdKind: HoldKind;
  hold: number;
  /** Tiempo sin premios de órbita (recién pateada por el gato). */
  quiet: number;
  /** Tiempo sin poder volver a entrar a una rampa (recién caída de una). */
  rampOff: number;
  /** Con qué fuerza salió del resorte (0 si no viene de un lanzamiento). */
  power: number;
  /** Para saber si quedó quieta: dónde estaba y cuánto lleva ahí. */
  ax: number;
  ay: number;
  stuck: number;
  /** Tiempo sin volver a contar el disco. */
  discOff: number;
};
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: number };
type Pop = { x: number; y: number; text: string; life: number; big: boolean };
type Ring = { x: number; y: number; life: number; color: number; size: number };
/** Lo que muestra la pantalla de puntos con dibujo propio. */
export type Show = "none" | "mission" | "rank" | "jackpot" | "super" | "multi" | "extra" | "name" | "upper" | "garden" | "skill" | "lock" | "tilt";

type State = {
  random: number;
  time: number;
  /** Reloj de la física: mueve el espíritu y los bumpers que se mecen. */
  clock: number;
  acc: number;
  score: number;
  /** Bolas que quedan, contando la que se está jugando. */
  lives: number;
  ballNumber: number;
  level: number;
  mult: number;
  letters: number;
  /** Pausa con el nombre completo antes de apagar las letras para otra vuelta. */
  nameTime: number;
  secretDone: boolean;
  over: boolean;
  phase: "play" | "drain" | "over";
  phaseTime: number;
  balls: Ball[];
  flip: { angle: number; omega: number }[];
  held: [boolean, boolean];
  pull: number;
  saveLeft: number;
  tiltMeter: number;
  tilted: boolean;
  locked: number;
  lockLit: boolean;
  /** Bolas que la luna tiene en la panza y va a escupir. */
  spitQueue: number;
  spitTime: number;
  autoPlunge: number;
  plungeTime: number;
  multiball: boolean;
  pendingMulti: boolean;
  /** Misiones: la elegida, la que corre (-1 si ninguna), su paso y su reloj. */
  selected: number;
  active: number;
  stepIndex: number;
  stepCount: number;
  missionTime: number;
  done: boolean[];
  round: number;
  missionsDone: number;
  rank: number;
  lanes: boolean[];
  targetsLit: boolean[];
  /** Objetivos que caen: cuáles están abajo y cuánto falta para que vuelvan a subir. */
  drops: boolean[];
  dropReset: number;
  dropSets: number;
  /** La muralla: dónde está (0 abajo, 1 arriba), adónde va, golpes y cuándo vuelve a subir. */
  wall: { pos: number; up: boolean; hits: number; timer: number };
  /** La boca de la luna (0 cerrada, 1 abierta) y cuánto le queda masticando. */
  mouth: number;
  chew: number;
  /** La bola cautiva. */
  captive: { y: number; vy: number };
  magnetLit: boolean;
  disc: { angle: number; dir: number; flip: number };
  stars: boolean[];
  secretOpen: boolean;
  garden: number;
  stairs: boolean;
  kickback: boolean;
  doors: [number, number];
  post: number;
  extraLit: boolean;
  spiritHits: number;
  jackpot: number;
  jackpots: number;
  /** En la multibola, las rampas dan jackpot si está encendido; el rulo o una órbita lo vuelven a encender. */
  jackpotLit: boolean;
  superLit: boolean;
  laneSets: number;
  /** Modo luces: todas las luces corren un rato (multibola, jackpot, misión). */
  party: number;
  partyKind: "chase" | "sweep" | "strobe";
  combo: number;
  comboTime: number;
  /** El último tiro grande: el combo pide tiros distintos. */
  lastShot: string;
  skillLane: number;
  skillTime: number;
  magnetOff: number;
  spin: { angle: number; speed: number; counted: number };
  bonus: number;
  bonusShown: number;
  bonusMult: number;
  nextExtra: number;
  message: string;
  messageTime: number;
  messageAge: number;
  /** Cartel grande sobre la mesa (misión cumplida, rango, jackpot...). */
  banner: { text: string; sub: string; time: number; age: number };
  show: Show;
  showTime: number;
  /** Sacudida de la pantalla tras un golpe fuerte. */
  shake: number;
  flash: {
    bumpers: number[];
    slings: number[];
    targets: number[];
    drops: number[];
    lanes: number[];
    moon: number;
    ramps: Record<MouthId, number>;
    orbit: [number, number];
    disc: number;
    wall: number;
    door: number;
    magnet: number;
    captive: number;
    floor: number;
    spinner: number;
  };
  cool: { bumpers: number[]; slings: number[]; targets: number[]; lanes: number[]; wall: number; captive: number };
  sparks: Spark[];
  pops: Pop[];
  rings: Ring[];
  /** Bolas que se fueron por abajo en este cuadro. */
  drained: number;
};

const freshBall = (x: number, y: number, mode: Ball["mode"], floor: Floor = 0): Ball => ({
  x,
  y,
  vx: 0,
  vy: 0,
  mode,
  floor,
  path: "lramp",
  s: 0,
  v: 0,
  made: false,
  holdKind: "magnet",
  hold: 0,
  quiet: 0,
  rampOff: 0,
  power: 0,
  ax: x,
  ay: y,
  stuck: 0,
  discOff: 0,
});

function create(seed: number): State {
  const state: State = {
    random: seed >>> 0,
    time: 0,
    clock: 0,
    acc: 0,
    score: 0,
    lives: 3,
    ballNumber: 1,
    level: 1,
    mult: 1,
    letters: 0,
    nameTime: 0,
    secretDone: false,
    over: false,
    phase: "play",
    phaseTime: 0,
    balls: [],
    flip: FLIPS[0].map((f) => ({ angle: f.rest, omega: 0 })),
    held: [false, false],
    pull: 0,
    saveLeft: SAVE_TIME,
    tiltMeter: 0,
    tilted: false,
    locked: 0,
    lockLit: false,
    spitQueue: 0,
    spitTime: 0,
    autoPlunge: 0,
    plungeTime: 0,
    multiball: false,
    pendingMulti: false,
    selected: 0,
    active: -1,
    stepIndex: 0,
    stepCount: 0,
    missionTime: 0,
    done: MISSIONS.map(() => false),
    round: 0,
    missionsDone: 0,
    rank: 0,
    lanes: [false, false, false],
    targetsLit: [false, false, false],
    drops: [false, false, false],
    dropReset: 0,
    dropSets: 0,
    wall: { pos: 0, up: false, hits: 0, timer: 0 },
    mouth: 1,
    chew: 0,
    captive: { y: CAPTIVE.rest, vy: 0 },
    magnetLit: false,
    disc: { angle: 0, dir: 1, flip: 9 },
    stars: STAR_SPOTS.map(() => false),
    secretOpen: false,
    garden: 0,
    stairs: false,
    kickback: true,
    doors: [0, 0],
    post: 0,
    extraLit: false,
    spiritHits: 0,
    jackpot: 6000,
    jackpots: 0,
    jackpotLit: false,
    superLit: false,
    laneSets: 0,
    party: 0,
    partyKind: "chase",
    combo: 0,
    comboTime: 0,
    lastShot: "",
    skillLane: 0,
    skillTime: 0,
    magnetOff: 0,
    spin: { angle: 0, speed: 0, counted: 0 },
    bonus: 0,
    bonusShown: 0,
    bonusMult: 1,
    nextExtra: 0,
    message: "LANZA LA BOLA",
    messageTime: 3,
    messageAge: 0,
    banner: { text: "", sub: "", time: 0, age: 0 },
    show: "none",
    showTime: 0,
    shake: 0,
    flash: {
      bumpers: BUMPERS.map(() => 0),
      slings: [0, 0, 0, 0],
      targets: [0, 0, 0],
      drops: [0, 0, 0],
      lanes: [0, 0, 0],
      moon: 0,
      ramps: { lramp: 0, cramp: 0, loop: 0, rramp: 0 },
      orbit: [0, 0],
      disc: 0,
      wall: 0,
      door: 0,
      magnet: 0,
      captive: 0,
      floor: 0,
      spinner: 0,
    },
    cool: { bumpers: BUMPERS.map(() => 0), slings: [0, 0, 0, 0], targets: [0, 0, 0], lanes: [0, 0, 0], wall: 0, captive: 0 },
    sparks: [],
    pops: [],
    rings: [],
    drained: 0,
  };
  serve(state);
  return state;
}

/** Pone una bola nueva sobre el resorte y elige el farol del tiro perfecto. */
function serve(state: State) {
  state.balls.push(freshBall(LANE_X, REST_Y, "plunger"));
  state.pull = 0;
  state.skillLane = Math.floor(roll(state) * 3);
  state.skillTime = 0;
}

const say = (state: State, text: string, time = 2) => {
  state.message = text;
  state.messageTime = time;
  state.messageAge = 0;
};

/** Un cartel grande sobre la mesa y un dibujo en la pantalla de puntos. */
function banner(state: State, text: string, sub: string, show: Show, time = 2.2) {
  state.banner = { text, sub, time: Math.min(time, 1.8), age: 0 };
  state.show = show;
  state.showTime = time;
}

/** Luces de fiesta por un rato. */
function party(state: State, seconds: number, kind: State["partyKind"]) {
  if (state.party <= 0 || seconds >= state.party) state.partyKind = kind;
  state.party = Math.max(state.party, seconds);
}

/** El piso que se ve: el de la bola (en los pisos de arriba sólo juega una). */
export function viewOf(state: { balls: { floor: Floor }[] }): Floor {
  return state.balls.length ? state.balls[0].floor : 0;
}

/* ---------- Puntos y reglas ---------- */

/** Suma puntos; los premios grandes (rampa, órbita, bono) van por el multiplicador. Devuelve lo que sumó. */
function addScore(state: State, points: number, out: Out, multiplied = false) {
  const before = state.score;
  state.score = Math.min(999999, Math.round(state.score + points * (multiplied ? state.mult : 1)));
  while (state.nextExtra < EXTRA_AT.length && state.score >= EXTRA_AT[state.nextExtra]) {
    state.nextExtra += 1;
    state.lives += 1;
    say(state, "BOLA EXTRA", 2.5);
    banner(state, "BOLA EXTRA", "", "extra");
    out.sound("clear2");
    out.say(`Bola extra. Bolas: ${state.lives}`);
  }
  return state.score - before;
}

/** Un número que sube desde donde fue el golpe. */
function pop(state: State, x: number, y: number, points: number) {
  if (points <= 0) return;
  if (state.pops.length >= 10) state.pops.shift();
  state.pops.push({ x, y, text: String(points), life: 1, big: points >= 2000 });
}

/** Suma y además muestra el número en la mesa. */
function award(state: State, points: number, out: Out, x: number, y: number, multiplied = false) {
  pop(state, x, y, addScore(state, points, out, multiplied));
}

function sparks(state: State, x: number, y: number, count: number, color: number) {
  for (let i = 0; i < count && state.sparks.length < 64; i++) {
    const angle = roll(state) * Math.PI * 2;
    const speed = 60 + roll(state) * 110;
    state.sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.25 + roll(state) * 0.25, color });
  }
}

/** Una onda de luz que se abre desde un golpe. */
function ring(state: State, x: number, y: number, color: number, size = 1) {
  if (state.rings.length >= 12) state.rings.shift();
  state.rings.push({ x, y, life: 1, color, size });
}

/** Cuánto pide el paso actual de la misión (en cada vuelta de misiones, un poco más). */
export function stepGoal(state: { active: number; stepIndex: number; round: number }) {
  if (state.active < 0) return 0;
  const step = MISSIONS[state.active].steps[state.stepIndex];
  return step.n > 1 ? Math.ceil(step.n * (1 + 0.5 * state.round)) : step.n;
}

/** La siguiente misión que falta en esta vuelta. */
function selectNext(state: State) {
  for (let k = 1; k <= MISSIONS.length; k++) {
    const i = (state.selected + k) % MISSIONS.length;
    if (!state.done[i]) {
      state.selected = i;
      return;
    }
  }
}

/** Lo que pide un paso al empezar: abrir la escalera o subir la muralla. */
function prepareStep(state: State, ev: Ev) {
  if (ev === "upper") state.stairs = true;
  if (ev === "wall") state.wall.timer = 0;
}

function startMission(state: State, out: Out) {
  const mission = MISSIONS[state.selected];
  state.active = state.selected;
  state.stepIndex = 0;
  state.stepCount = 0;
  state.missionTime = mission.time ?? 0;
  prepareStep(state, mission.steps[0].ev);
  say(state, mission.name, 3);
  banner(state, "MISIÓN", mission.name, "mission", 2.4);
  out.sound("start");
  out.say(`Misión: ${mission.name.toLowerCase()}. ${mission.story}`);
}

function failMission(state: State, out: Out) {
  state.active = -1;
  state.missionTime = 0;
  say(state, "SE ACABÓ EL TIEMPO", 2.5);
  out.sound("lock");
  out.say("Se acabó el tiempo de la misión. Vuelve a la luna para intentarlo otra vez.");
}

/** Algo pasó en la mesa: si es lo que pide el paso actual de la misión, cuenta. */
function event(state: State, ev: Ev, out: Out, amount = 1) {
  if (state.active < 0 || state.tilted) return;
  const mission = MISSIONS[state.active];
  if (mission.steps[state.stepIndex].ev !== ev) return;
  state.stepCount += amount;
  if (state.stepCount < stepGoal(state)) return;
  state.stepIndex += 1;
  state.stepCount = 0;
  if (state.stepIndex < mission.steps.length) {
    const next = mission.steps[state.stepIndex];
    prepareStep(state, next.ev);
    addScore(state, 1000 * state.level, out);
    say(state, `AHORA: ${next.label}`, 2);
    out.sound("clear");
    out.say(`Paso cumplido. Ahora: ${next.label.toLowerCase()}.`);
    return;
  }
  completeMission(state, out);
}

function completeMission(state: State, out: Out) {
  const name = MISSIONS[state.active].name;
  state.done[state.active] = true;
  state.active = -1;
  state.missionTime = 0;
  state.missionsDone += 1;
  const value = addScore(state, 5000 * state.level, out);
  state.level += 1;
  state.mult = Math.min(5, state.mult + 1);
  state.lockLit = true;
  if (state.missionsDone % 3 === 0) state.extraLit = true;
  if (state.done.every(Boolean)) {
    // Todas cumplidas: otra vuelta, con metas más grandes.
    state.done = MISSIONS.map(() => false);
    state.round += 1;
  }
  selectNext(state);
  party(state, 2.5, "sweep");
  state.shake = Math.max(state.shake, 0.3);
  lightLetter(state, out);
  const rank = rankFor(state.missionsDone);
  const world = worldName((state.level - 1) % WORLDS);
  if (rank > state.rank) {
    state.rank = rank;
    say(state, RANKS[rank], 3.5);
    banner(state, "NUEVO RANGO", RANKS[rank], "rank", 3);
    out.sound("letter");
    out.say(`Misión cumplida: ${name.toLowerCase()}. Nuevo rango: ${RANKS[rank].toLowerCase()}. Nivel ${state.level}, ${world.toLowerCase()}.`);
    return;
  }
  say(state, "MISIÓN CUMPLIDA", 2.5);
  banner(state, "MISIÓN CUMPLIDA", `+${value}`, "mission", 2.5);
  out.sound("level");
  out.say(`Misión cumplida: ${name.toLowerCase()}. Nivel ${state.level}, ${world.toLowerCase()}, multiplicador ${state.mult}.`);
}

function lightLetter(state: State, out: Out) {
  // Durante la multibola no se juntan letras: el nombre es el camino para llegar a ella.
  if (state.nameTime > 0 || state.multiball) return;
  const total = NAME.length;
  if (state.letters >= total) return;
  state.letters += 1;
  addScore(state, 250, out);
  if (state.letters < total) {
    out.sound("clear");
    return;
  }
  // El nombre completo: premio grande, mensaje secreto (una vez) y multibola.
  state.nameTime = 3;
  addScore(state, 10000, out);
  say(state, NAME, 3);
  banner(state, NAME, "MULTIBOLA", "name", 3);
  party(state, 3, "strobe");
  out.sound("letter");
  out.say(`${NAME}: nombre completo. Multibola.`);
  if (!state.secretDone) {
    state.secretDone = true;
    out.secret();
  }
  startMultiball(state, out);
}

function startMultiball(state: State, out: Out) {
  if (state.balls.some((ball) => ball.floor !== 0 || (ball.mode === "path" && (ball.path === "stairs" || ball.path === "drop")))) {
    // Arriba sólo juega una bola: la multibola espera a que vuelva a la mesa.
    state.pendingMulti = true;
    return;
  }
  state.pendingMulti = false;
  const inPlay = state.balls.length + state.spitQueue + state.autoPlunge;
  if (state.multiball && inPlay >= 3) {
    addScore(state, 5000, out);
    return;
  }
  const missing = Math.max(0, 3 - inPlay);
  const fromMoon = Math.min(state.locked, missing);
  state.locked -= fromMoon;
  state.spitQueue += fromMoon;
  state.autoPlunge += missing - fromMoon;
  state.spitTime = Math.min(state.spitTime, 0.4);
  state.multiball = true;
  state.jackpots = 0;
  state.jackpotLit = true;
  state.superLit = false;
  state.stairs = false;
  state.saveLeft = Math.max(state.saveLeft, 10);
  state.post = Math.max(state.post, 10);
  if (state.message !== NAME) {
    say(state, "MULTIBOLA", 3);
    banner(state, "MULTIBOLA", "LAS RAMPAS DAN JACKPOT", "multi", 2.5);
  }
  party(state, 4, "chase");
  out.sound("level");
  out.say("Multibola: tres bolas en la mesa. Las rampas dan jackpot.");
}

function jackpot(state: State, out: Out, x: number, y: number, superJackpot = false) {
  const value = state.jackpot * (superJackpot ? 2 : 1);
  award(state, value, out, x, y);
  party(state, 3, superJackpot ? "strobe" : "sweep");
  state.shake = Math.max(state.shake, superJackpot ? 0.5 : 0.35);
  sparks(state, x, y, 14, 2);
  ring(state, x, y, 2, 2);
  if (superJackpot) {
    state.superLit = false;
    state.jackpots = 0;
    say(state, `SÚPER JACKPOT ${value}`, 3);
    banner(state, "SÚPER JACKPOT", String(value), "super", 2.8);
    out.sound("letter");
    out.say(`Súper jackpot: ${value} puntos.`);
  } else {
    say(state, `JACKPOT ${value}`, 3);
    banner(state, "JACKPOT", String(value), "jackpot", 2.4);
    out.sound("clear2");
    out.say(`Jackpot: ${value} puntos.`);
    if (state.multiball) {
      state.jackpots += 1;
      if (state.jackpots >= 2 && !state.superLit) {
        state.superLit = true;
        lowerWall(state);
        out.say("Súper jackpot encendido en la luna.");
      }
    }
  }
  // En la multibola cada jackpot vale más; fuera de ella vuelve a su base.
  state.jackpot = state.multiball ? Math.min(25000, state.jackpot + 1500) : jackpotBase(state);
}

const jackpotBase = (state: State) => 6000 + 500 * Math.min(20, state.level - 1);

/** Un tiro grande (órbita, rampa, rulo): seguidos y rápido hacen combo. */
function shot(state: State, out: Out, kind: string) {
  const relight = kind === "loop" || kind.startsWith("orbit");
  if (relight && state.multiball && !state.jackpotLit) {
    state.jackpotLit = true;
    say(state, "JACKPOT LISTO", 1.5);
  }
  if (state.comboTime > 0 && kind !== state.lastShot) {
    state.combo = Math.min(6, state.combo + 1);
    const value = 1500 * state.combo;
    addScore(state, value, out);
    say(state, `COMBO X${state.combo}`, 1.5);
    event(state, "combo", out);
  } else state.combo = 1;
  state.comboTime = COMBO_TIME;
  state.lastShot = kind;
}

/* ---------- La muralla y la luna ---------- */

/** ¿Hay una bola en el bolsillo de la luna o encima de la muralla? Entonces no sube. */
const pocketBusy = (state: State) => state.balls.some((b) => b.floor === 0 && b.mode === "free" && b.x > WALL.ax - R && b.x < WALL.bx + R && b.y > 146 && b.y < WALL.y + R + 4);

function raiseWall(state: State) {
  if (state.wall.up) return;
  state.wall.up = true;
  state.wall.hits = 0;
  state.wall.timer = 0;
}

function lowerWall(state: State) {
  state.wall.up = false;
  state.wall.hits = 0;
  // Baja un rato largo; después vuelve a subir sola.
  state.wall.timer = 18;
}

function hitWall(state: State, out: Out, x: number) {
  state.cool.wall = 0.25;
  state.flash.wall = 0.3;
  state.wall.hits += 1;
  award(state, 400, out, x, WALL.y - 8);
  state.bonus += 20;
  sparks(state, x, WALL.y, 6, 1);
  state.shake = Math.max(state.shake, 0.15);
  event(state, "wall", out);
  if (state.wall.hits >= 2) {
    lowerWall(state);
    say(state, "MURALLA ABAJO", 1.8);
    out.sound("clear2");
    out.say("La muralla bajó: la boca de la luna está abierta.");
  } else {
    say(state, "MURALLA 1/2", 1.2);
    out.sound("lock");
  }
}

/** La luna se tragó una bola. */
function swallow(state: State, ball: Ball, out: Out) {
  state.balls.splice(state.balls.indexOf(ball), 1);
  state.flash.moon = 1;
  state.chew = 1.4;
  award(state, 1500, out, MOUTH.x, MOUTH.y - 24);
  state.bonus += 200;
  state.spitTime = 1.4;
  sparks(state, MOUTH.x, MOUTH.y, 8, 2);
  ring(state, MOUTH.x, MOUTH.y, 1, 1.5);
  state.shake = Math.max(state.shake, 0.2);
  if (state.extraLit) {
    state.extraLit = false;
    state.lives += 1;
    say(state, "BOLA EXTRA", 2.5);
    banner(state, "BOLA EXTRA", "", "extra");
    out.sound("clear2");
    out.say(`Bola extra. Bolas: ${state.lives}`);
  }
  if (state.multiball) {
    // Durante la multibola la luna da premio (o el súper jackpot) y devuelve la bola.
    if (state.superLit) jackpot(state, out, MOUTH.x, MOUTH.y, true);
    else {
      award(state, 3000, out, MOUTH.x, MOUTH.y - 12);
      say(state, "PREMIO 3000");
      out.sound("clear2");
    }
    state.spitQueue += 1;
    return;
  }
  const wasActive = state.active >= 0;
  event(state, "moon", out);
  if (!wasActive) startMission(state, out);
  else if (state.active >= 0) out.sound("clear");
  if (state.lockLit) {
    state.lockLit = false;
    state.locked += 1;
    if (state.locked >= 2) {
      startMultiball(state, out);
      return;
    }
    if (wasActive) {
      say(state, "BOLA GUARDADA", 2.5);
      banner(state, "BOLA GUARDADA", "GUARDA OTRA", "lock", 2);
    }
    out.sound("clear2");
    out.say("Bola guardada en la luna. Guarda otra para la multibola.");
    if (state.balls.length + state.autoPlunge + state.spitQueue === 0) serve(state);
    return;
  }
  state.spitQueue += 1;
}

/** La luna escupe una bola hacia las paletas. */
function spit(state: State, out: Out) {
  const ball = freshBall(MOUTH.x + 2, MOUTH.y + 6, "free");
  ball.vx = 40 + roll(state) * 90;
  ball.vy = 140 + roll(state) * 60;
  state.balls.push(ball);
  state.chew = Math.max(state.chew, 0.4);
  sparks(state, ball.x, ball.y, 6, 0);
  out.sound("rotate");
}

/* ---------- Golpes ---------- */

function hitBumper(state: State, b: Bumper, out: Out) {
  const i = b.index;
  state.flash.bumpers[i] = 0.18;
  const [x, y] = bumperAt(b, state.clock);
  if (b.kind === "pop") {
    state.cool.bumpers[i] = 0.06;
    award(state, b.floor ? 150 : 100, out, x, y - 14);
    state.bonus += 5;
    out.sound("drop");
    sparks(state, x, y, 6, 0);
    ring(state, x, y, 0);
    state.shake = Math.max(state.shake, 0.12);
    event(state, "bumper", out);
    return;
  }
  if (b.kind === "moon") {
    state.cool.bumpers[i] = 0.08;
    award(state, 2500, out, x, y - 14);
    state.bonus += 50;
    out.sound("clear");
    sparks(state, x, y, 8, 2);
    ring(state, x, y, 2);
    event(state, "bumper", out);
    return;
  }
  if (b.kind === "spirit") {
    state.cool.bumpers[i] = 0.4;
    state.flash.bumpers[i] = 0.6;
    state.spiritHits += 1;
    award(state, 500, out, x, y - 16);
    state.bonus += 40;
    sparks(state, x, y, 8, 1);
    ring(state, x, y, 1);
    event(state, "spirit", out);
    if (state.spiritHits >= 3) {
      state.spiritHits = 0;
      state.post = Math.max(state.post, 15);
      jackpot(state, out, x, y);
      lightLetter(state, out);
    } else {
      say(state, `ESPÍRITU ${state.spiritHits}/3`, 1.5);
      out.sound("clear");
    }
    return;
  }
  // Una estrella de la cámara.
  state.cool.bumpers[i] = 0.3;
  const star = i - FIRST_STAR;
  event(state, "star", out);
  if (state.stars[star]) {
    award(state, 200, out, x, y - 12);
    out.sound("move");
    return;
  }
  state.stars[star] = true;
  award(state, 1000, out, x, y - 12);
  state.bonus += 60;
  sparks(state, x, y, 8, 2);
  ring(state, x, y, 2);
  lightLetter(state, out);
  if (state.stars.every(Boolean) && !state.secretOpen) {
    state.secretOpen = true;
    addScore(state, 5000, out);
    say(state, "PUERTA SECRETA", 2.5);
    banner(state, "PUERTA SECRETA", "BUSCA EL CENTRO", "upper", 2.4);
    out.sound("clear2");
    out.say("Las cinco estrellas: se abre la puerta secreta.");
  } else out.sound("clear");
}

const SLING_SPOTS: [number, number][] = [
  [59, 343],
  [177, 343],
  [55, 322],
  [201, 322],
];

function hitSling(state: State, index: number, out: Out) {
  state.flash.slings[index] = 0.15;
  state.cool.slings[index] = 0.08;
  const [x, y] = SLING_SPOTS[index];
  award(state, 30, out, x, y);
  state.bonus += 2;
  out.sound("move");
  sparks(state, x, y, 4, 1);
  state.shake = Math.max(state.shake, 0.1);
}

function hitCat(state: State, index: number, out: Out) {
  state.flash.targets[index] = 0.5;
  state.cool.targets[index] = 0.3;
  const spot = CATS[index];
  award(state, 300, out, spot.x - 14, (spot.y0 + spot.y1) / 2);
  state.bonus += 30;
  sparks(state, spot.x, (spot.y0 + spot.y1) / 2, 4, 2);
  event(state, "cat", out);
  // Con las tres campanas encendidas, el gato de la suerte ayuda y da una letra.
  if (state.targetsLit[index]) {
    out.sound("move");
    return;
  }
  state.targetsLit[index] = true;
  out.sound("clear");
  if (state.targetsLit.every(Boolean)) {
    state.targetsLit = [false, false, false];
    lightLetter(state, out);
    state.kickback = true;
    state.doors = [20, 20];
    addScore(state, 2000, out);
    say(state, "GATO DE LA SUERTE", 2.5);
    out.sound("clear2");
    out.say("Gato de la suerte: patada de rescate lista y pasillos de salida cerrados.");
  }
}

function hitDrop(state: State, index: number, out: Out) {
  state.drops[index] = true;
  state.flash.drops[index] = 0.5;
  const spot = DROPS[index];
  award(state, 500, out, spot.x + 14, (spot.y0 + spot.y1) / 2);
  state.bonus += 40;
  sparks(state, spot.x, (spot.y0 + spot.y1) / 2, 5, 1);
  state.shake = Math.max(state.shake, 0.1);
  if (!state.drops.every(Boolean)) {
    out.sound("drop");
    return;
  }
  // El banco completo: letra, premio y la muralla baja.
  state.dropSets += 1;
  state.dropReset = 1.5;
  addScore(state, 3000, out);
  lowerWall(state);
  lightLetter(state, out);
  party(state, 1.5, "chase");
  say(state, "OBJETIVOS 3000", 2);
  out.sound("clear2");
  out.say("Los tres objetivos abajo: la muralla baja.");
  event(state, "drops", out);
}

function passLane(state: State, index: number, out: Out) {
  state.cool.lanes[index] = 0.5;
  state.flash.lanes[index] = 0.4;
  if (state.skillTime > 0) {
    state.skillTime = 0;
    if (index === state.skillLane) {
      const value = 5000 * (1 + state.round);
      award(state, value, out, LANES[index], 70);
      state.flash.lanes = [1, 1, 1];
      say(state, `TIRO PERFECTO ${value}`, 2.5);
      banner(state, "TIRO PERFECTO", String(value), "skill", 2);
      out.sound("clear2");
      out.say(`Tiro perfecto: ${value} puntos.`);
    }
  }
  event(state, "lane", out);
  if (state.active < 0) {
    // Sin misión en marcha, cada farol cambia la misión elegida.
    selectNext(state);
    if (state.messageTime <= 0 || !state.message.startsWith("TIRO")) say(state, MISSIONS[state.selected].name, 1.8);
  }
  if (state.lanes[index]) {
    addScore(state, 100, out);
    return;
  }
  state.lanes[index] = true;
  award(state, 500, out, LANES[index], 72);
  state.bonus += 50;
  out.sound("clear");
  if (state.lanes.every(Boolean)) {
    state.lanes = [false, false, false];
    lightLetter(state, out);
    state.flash.lanes = [0.8, 0.8, 0.8];
    addScore(state, 3000, out);
    if (!state.multiball) state.stairs = true;
    state.laneSets += 1;
    // Cada tres vueltas de faroles, la luna guarda una bola.
    if (state.laneSets % 3 === 0) {
      state.lockLit = true;
      lowerWall(state);
    }
    party(state, 1.2, "chase");
    say(state, state.multiball ? "FAROLES 3000" : "ESCALERA ABIERTA", 2.5);
    out.sound("clear2");
    out.say(state.lockLit ? "Tres faroles: la espiral sube a la cámara de las estrellas y la luna guarda una bola." : "Tres faroles: la espiral sube a la cámara de las estrellas.");
    event(state, "lanes", out);
  }
}

/** La bola subió una rampa hasta la cima. */
function madeRamp(state: State, ball: Ball, out: Out) {
  const id = ball.path === "stairs" ? "cramp" : (ball.path as MouthId);
  state.flash.ramps[id] = 1;
  const live = !state.tilted;
  if (!live) return;
  const [x, y] = ball.path === "lramp" ? [78, 100] : ball.path === "rramp" ? [214, 104] : ball.path === "loop" ? [170, 170] : [128, 116];
  if (ball.path === "loop") {
    award(state, 2000, out, x, y, true);
    state.bonus += 150;
    say(state, `RULO ${2000 * state.mult}`, 1.5);
    out.sound("clear2");
    sparks(state, x, y, 10, 1);
    ring(state, x, y, 1, 1.5);
    lightLetter(state, out);
    event(state, "loop", out);
    shot(state, out, "loop");
    return;
  }
  award(state, ball.path === "rramp" ? 750 : 1000, out, x, y, true);
  state.bonus += 100;
  sparks(state, x, y, 8, 0);
  if (ball.path === "stairs") {
    state.stairs = false;
    say(state, "SUBE LA ESCALERA", 1.5);
    out.sound("clear2");
  } else if (state.multiball && state.jackpotLit) {
    state.jackpotLit = false;
    jackpot(state, out, x, y);
  } else {
    const label = MOUTHS.find((m) => m.id === id)!.label;
    say(state, `${label} ${(ball.path === "rramp" ? 750 : 1000) * state.mult}`, 1.5);
    out.sound("clear2");
  }
  event(state, "ramp", out);
  shot(state, out, id);
}

/* ---------- Física ---------- */

/** Rebote contra una superficie con normal (nx, ny) que se mueve a (sx, sy). Devuelve con qué rapidez llegó la bola. */
function bounce(ball: Ball, nx: number, ny: number, pen: number, sx: number, sy: number, e: number, mu: number) {
  ball.x += nx * pen;
  ball.y += ny * pen;
  const rx = ball.vx - sx;
  const ry = ball.vy - sy;
  const vn = rx * nx + ry * ny;
  if (vn >= 0) return 0;
  const j = -(1 + e) * vn;
  ball.vx += nx * j;
  ball.vy += ny * j;
  // Roce: frena un poco el deslizamiento a lo largo de la superficie.
  const tx = -ny;
  const ty = nx;
  const vt = rx * tx + ry * ty;
  const cut = Math.sign(vt) * Math.min(Math.abs(vt), mu * j);
  ball.vx -= tx * cut;
  ball.vy -= ty * cut;
  return -vn;
}

function kick(ball: Ball, nx: number, ny: number, strength: number) {
  ball.vx += nx * strength;
  ball.vy += ny * strength;
}

/** ¿Esta pared está ahí ahora? (objetivos caídos, muralla abajo, compuertas abiertas no cuentan). */
function solid(state: State, s: Seg) {
  if (s.kind === "drop") return !state.drops[s.id];
  if (s.kind === "mwall") return state.wall.pos > 0.5;
  if (s.kind === "door") return state.doors[s.id] > 0;
  return true;
}

function collideSegment(state: State, ball: Ball, s: Seg, out: Out) {
  if (ball.x < s.x0 || ball.x > s.x1 || ball.y < s.y0 || ball.y > s.y1) return;
  if (!solid(state, s)) return;
  const ex = s.bx - s.ax;
  const ey = s.by - s.ay;
  const len2 = ex * ex + ey * ey;
  let t = ((ball.x - s.ax) * ex + (ball.y - s.ay) * ey) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = s.ax + ex * t;
  const py = s.ay + ey * t;
  let dx = ball.x - px;
  let dy = ball.y - py;
  const reach = R + s.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach) return;
  // Las paredes de un solo sentido sólo frenan del lado que les toca.
  if (s.face && side(s.ax, s.ay, s.bx, s.by, ball.x, ball.y) !== s.face) return;
  let d = Math.sqrt(d2);
  const pen = reach - d;
  if (d < 1e-6) {
    const len = Math.sqrt(len2);
    dx = ey / len;
    dy = -ex / len;
    if (s.face ? side(s.ax, s.ay, s.bx, s.by, s.ax + dx, s.ay + dy) !== s.face : dy > 0) {
      dx = -dx;
      dy = -dy;
    }
    d = 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  const live = !state.tilted;
  if (s.kind === "sling") {
    const speed = bounce(ball, nx, ny, pen, 0, 0, 0.5, 0.05);
    if (live && speed > 30 && state.cool.slings[s.id] <= 0) {
      kick(ball, nx, ny, 210);
      hitSling(state, s.id, out);
    }
    return;
  }
  const soft = s.kind === "cat" || s.kind === "drop";
  const speed = bounce(ball, nx, ny, pen, 0, 0, soft ? 0.3 : 0.45, 0.08);
  if (!live) return;
  if (s.kind === "cat" && speed > 50 && state.cool.targets[s.id] <= 0) hitCat(state, s.id, out);
  else if (s.kind === "drop" && speed > 60) hitDrop(state, s.id, out);
  else if (s.kind === "mwall" && speed > 60 && state.cool.wall <= 0 && ny > 0) hitWall(state, out, px);
}

function collideFlipper(state: State, ball: Ball, index: number) {
  const f = FLIPS[ball.floor][index];
  const { angle, omega } = state.flip[index];
  if (Math.abs(ball.x - f.x) > f.len + 14 || Math.abs(ball.y - f.y) > f.len + 14) return;
  const ex = Math.cos(angle) * f.len;
  const ey = Math.sin(angle) * f.len;
  let t = ((ball.x - f.x) * ex + (ball.y - f.y) * ey) / (f.len * f.len);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = f.x + ex * t;
  const py = f.y + ey * t;
  const radius = FLIP_R0 + (FLIP_R1 - FLIP_R0) * t;
  let dx = ball.x - px;
  let dy = ball.y - py;
  const reach = R + radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach) return;
  let d = Math.sqrt(d2);
  const pen = reach - d;
  if (d < 1e-6) {
    dx = 0;
    dy = -1;
    d = 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  // Velocidad de la paleta justo donde toca la bola: más rápida cerca de la punta.
  const cx = px + nx * radius;
  const cy = py + ny * radius;
  const sx = -omega * (cy - f.y);
  const sy = omega * (cx - f.x);
  bounce(ball, nx, ny, pen, sx, sy, 0.25, 0.12);
}

function collideBumpers(state: State, ball: Ball, out: Out) {
  for (const b of BUMPERS) {
    if (b.floor !== ball.floor) continue;
    const [bx, by, bvx] = bumperAt(b, state.clock);
    const dx = ball.x - bx;
    const dy = ball.y - by;
    const reach = R + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= reach * reach) continue;
    const d = Math.sqrt(d2) || 1;
    const nx = d2 > 0 ? dx / d : 0;
    const ny = d2 > 0 ? dy / d : -1;
    if (b.kind === "toy") {
      bounce(ball, nx, ny, reach - d, 0, 0, 0.4, 0.06);
      continue;
    }
    const passive = b.kind === "star";
    bounce(ball, nx, ny, reach - d, bvx, 0, passive ? 0.4 : 0.5, 0.05);
    if (!state.tilted && state.cool.bumpers[b.index] <= 0) {
      kick(ball, nx, ny, b.kind === "pop" ? 240 : b.kind === "moon" ? 260 : b.kind === "spirit" ? 140 : 70);
      hitBumper(state, b, out);
    }
  }
  if (ball.floor !== 0) return;
  if (state.post > 0) {
    // El poste de luz entre las paletas.
    const dx = ball.x - POST.x;
    const dy = ball.y - POST.y;
    const reach = R + POST.r;
    const d2 = dx * dx + dy * dy;
    if (d2 < reach * reach) {
      const d = Math.sqrt(d2) || 1;
      bounce(ball, d2 > 0 ? dx / d : 0, d2 > 0 ? dy / d : -1, reach - d, 0, 0, 0.5, 0.05);
    }
  }
  // La bola cautiva: sólo se mueve por su canal, de arriba abajo.
  const cdx = ball.x - CAPTIVE.x;
  const cdy = ball.y - state.captive.y;
  const cd2 = cdx * cdx + cdy * cdy;
  if (cd2 < 4 * R * R && cd2 > 1e-9) {
    const d = Math.sqrt(cd2);
    const nx = cdx / d;
    const ny = cdy / d;
    // Choque entre dos bolas iguales, pero la cautiva sólo puede moverse en vertical.
    const vn = (ball.vx - 0) * nx + (ball.vy - state.captive.vy) * ny;
    ball.x += nx * (2 * R - d);
    ball.y += ny * (2 * R - d);
    if (vn < 0) {
      const j = -1.7 * vn;
      ball.vx += nx * j * 0.55;
      ball.vy += ny * j * 0.55;
      state.captive.vy -= ny * j * 0.6;
    }
  }
}

function collideBalls(state: State) {
  const balls = state.balls;
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.mode !== "free") continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.mode !== "free" || b.floor !== a.floor) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 4 * R * R || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const pen = (2 * R - d) / 2;
      a.x -= nx * pen;
      a.y -= ny * pen;
      b.x += nx * pen;
      b.y += ny * pen;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn < 0) {
        const j2 = (-(1 + 0.8) * vn) / 2;
        a.vx -= nx * j2;
        a.vy -= ny * j2;
        b.vx += nx * j2;
        b.vy += ny * j2;
      }
    }
  }
}

/** Pone la bola a recorrer una rampa o un tubo, con la rapidez que trae. */
function enterPath(ball: Ball, path: PathId, speed?: number) {
  const p = PATHS[path];
  ball.mode = "path";
  ball.path = path;
  ball.s = 0;
  ball.v = speed ?? p.min;
  ball.made = p.climb === 0;
  ball.floor = p.floor;
  [ball.x, ball.y] = pathPoint(p, 0);
}

/** La bola no llegó a la cima: vuelve a la mesa por la boca, hacia abajo. */
function fallBack(state: State, ball: Ball, out: Out) {
  const p = PATHS[ball.path];
  const [dx, dy] = pathDir(p, 0);
  ball.mode = "free";
  [ball.x, ball.y] = pathPoint(p, 0);
  const speed = Math.max(60, Math.abs(ball.v));
  ball.vx = -dx * speed;
  ball.vy = -dy * speed;
  ball.rampOff = 0.5;
  ball.ax = ball.x;
  ball.ay = ball.y;
  ball.stuck = 0;
  if (!state.tilted) {
    say(state, "¡CASI!", 0.8);
    out.sound("move");
  }
}

/** La bola llegó al final de su recorrido. */
function exitPath(state: State, ball: Ball, out: Out) {
  const path = PATHS[ball.path];
  if (ball.path === "stairs") {
    // Arriba de la escalera: aparece en la cámara de las estrellas.
    enterPath(ball, "upperIn");
    state.flash.floor = 0.5;
    return;
  }
  if (ball.path === "drop") {
    // Del tubo a la panza de la luna, que la escupe.
    state.balls.splice(state.balls.indexOf(ball), 1);
    state.spitQueue += 1;
    state.spitTime = Math.min(state.spitTime, 0.5) || 0.5;
    state.chew = 1;
    return;
  }
  const [x, y] = path.points[path.points.length - 1];
  const [dx, dy] = pathDir(path, path.total);
  ball.mode = "free";
  ball.x = x;
  ball.y = y;
  ball.ax = x;
  ball.ay = y;
  ball.stuck = 0;
  ball.rampOff = 0.3;
  const speed = Math.max(60, Math.min(260, ball.v));
  ball.vx = dx * speed;
  ball.vy = dy * speed;
  if (ball.path.startsWith("wire")) ball.vx = 0;
  if (ball.path === "upperIn") {
    addScore(state, 5000, out);
    state.bonus += 300;
    say(state, "CÁMARA DE ESTRELLAS", 3);
    banner(state, "CÁMARA DE", "LAS ESTRELLAS", "upper", 2.4);
    out.sound("level");
    out.say("La cámara de las estrellas: si la bola cae, baja por el tubo a la mesa.");
    event(state, "upper", out);
  } else if (ball.path === "secretIn") {
    state.garden = GARDEN_TIME;
    addScore(state, 15000, out);
    say(state, "JARDÍN DE LAS LUNAS", 3);
    banner(state, "JARDÍN", "DE LAS LUNAS", "garden", 2.6);
    party(state, 2, "sweep");
    out.sound("letter");
    out.say(`El jardín secreto de las lunas: ${GARDEN_TIME} segundos para golpear lunas.`);
  }
}

/** La bola de un piso de arriba baja por el tubo a la mesa principal. */
function sendDown(state: State, ball: Ball, out: Out) {
  if (ball.floor === 2) {
    state.garden = 0;
    state.secretOpen = false;
  }
  enterPath(ball, "drop");
  state.flash.floor = 0.5;
  say(state, "DE VUELTA A LA MESA", 2);
  out.sound("drop");
  out.say("La bola baja por el tubo a la mesa.");
}

function release(state: State, ball: Ball, out: Out) {
  ball.mode = "free";
  ball.stuck = 0;
  // El imán suelta la bola hacia una de las paletas.
  const spot = ball.floor === 0 ? MAGNET : UPPER_MAGNET;
  const dir = roll(state) < 0.5 ? -1 : 1;
  ball.x = spot.x;
  ball.y = spot.y;
  ball.vx = dir * (100 + roll(state) * 80);
  ball.vy = 60;
  ball.ax = ball.x;
  ball.ay = ball.y;
  state.magnetOff = 1.5;
  out.sound("rotate");
}

/** Un paso fijo de física para todas las bolas. */
function substep(state: State, out: Out) {
  state.clock += H;
  for (let i = 0; i < 2; i++) {
    const f = FLIPS[0][i];
    const flip = state.flip[i];
    const target = state.held[i] ? f.up : f.rest;
    const diff = target - flip.angle;
    if (Math.abs(diff) < 1e-9) flip.omega = 0;
    else {
      const speed = state.held[i] ? 32 : 18;
      const move = Math.sign(diff) * Math.min(Math.abs(diff), speed * H);
      flip.omega = move / H;
      flip.angle += move;
    }
  }
  // La bola cautiva vuelve sola a su lugar; arriba del canal toca el objetivo.
  const captive = state.captive;
  if (captive.y < CAPTIVE.rest || captive.vy !== 0) {
    captive.vy += G * H;
    captive.vy *= 0.999;
    captive.y += captive.vy * H;
    if (captive.y <= CAPTIVE.top) {
      captive.y = CAPTIVE.top;
      if (captive.vy < -60 && state.cool.captive <= 0 && !state.tilted) hitCaptive(state, out);
      captive.vy = Math.abs(captive.vy) * 0.3;
    }
    if (captive.y >= CAPTIVE.rest) {
      captive.y = CAPTIVE.rest;
      captive.vy = captive.vy > 20 ? -captive.vy * 0.2 : 0;
    }
  }
  for (const ball of [...state.balls]) {
    if (ball.mode === "plunger") {
      ball.x = LANE_X;
      ball.y = REST_Y + state.pull * PULL;
      ball.vx = 0;
      ball.vy = 0;
      continue;
    }
    if (ball.mode === "path") {
      movePath(state, ball, out);
      continue;
    }
    if (ball.mode === "held") {
      ball.hold -= H;
      if (ball.hold <= 0) release(state, ball, out);
      continue;
    }
    const oldX = ball.x;
    const oldY = ball.y;
    ball.vy += G * H;
    pull(state, ball, out);
    if (ball.mode !== "free") continue;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > MAX_SPEED) {
      ball.vx *= MAX_SPEED / speed;
      ball.vy *= MAX_SPEED / speed;
    }
    ball.x += ball.vx * H;
    ball.y += ball.vy * H;
    if (ball.quiet > 0) ball.quiet -= H;
    if (ball.rampOff > 0) ball.rampOff -= H;
    if (ball.discOff > 0) ball.discOff -= H;

    for (const s of segsNear(ball.floor, ball.x, ball.y)) collideSegment(state, ball, s, out);
    collideBumpers(state, ball, out);
    collideFlipper(state, ball, 0);
    collideFlipper(state, ball, 1);
    if (ball.floor === 0) sensors(state, ball, oldX, oldY, out);
    else upperSensors(state, ball, out);
    if (ball.mode !== "free") continue;
    if (ball.floor === 0) {
      if (ball.power > 0 && ball.x > LANE_WALL && ball.y < 176 && ball.vy < 0) {
        // Arriba del carril la bola toma el riel del lanzador; la fuerza decide en qué farol cae.
        const band = WIRE_BANDS.filter((edge) => ball.power >= edge).length;
        ball.power = 0;
        if (band > 0) {
          enterPath(ball, (["wire2", "wire2", "wire1", "wire0", "wireOrbit"] as const)[band]);
          continue;
        }
      }
      if (ball.x > LANE_WALL && ball.y >= REST_Y && ball.vy >= 0) {
        // Volvió a caer en el carril: espera otra vez sobre el resorte (en la multibola sale sola).
        ball.mode = "plunger";
        ball.y = REST_Y;
        ball.power = 0;
        if (state.multiball || state.tilted) launch(state, ball, 0.55 + roll(state) * 0.4);
        else {
          state.skillLane = Math.floor(roll(state) * 3);
          state.skillTime = 0;
        }
      }
      if (ball.y > DRAIN_Y) {
        state.balls.splice(state.balls.indexOf(ball), 1);
        state.drained += 1;
      }
    } else if (ball.y > UPPER_DRAIN) sendDown(state, ball, out);
  }
  if (state.balls.length > 1) collideBalls(state);
}

/** La bola por una rampa: sube perdiendo rapidez, y si no llega, vuelve. */
function movePath(state: State, ball: Ball, out: Out) {
  const p = PATHS[ball.path];
  if (ball.s < p.climb) ball.v -= p.rise * H;
  else ball.v = Math.max(p.min, Math.min(MAX_SPEED * 0.6, ball.v + p.fall * H));
  ball.s += ball.v * H;
  if (!ball.made && ball.s >= p.climb) {
    ball.made = true;
    madeRamp(state, ball, out);
  }
  if (ball.s <= 0 && ball.v <= 0) {
    fallBack(state, ball, out);
    return;
  }
  if (ball.s >= p.total) exitPath(state, ball, out);
  else [ball.x, ball.y] = pathPoint(p, ball.s);
}

/** El imán (de la mesa, si está encendido, o el de la cámara) tira de la bola y la atrapa. */
function pull(state: State, ball: Ball, out: Out) {
  if (state.tilted || state.magnetOff > 0 || ball.floor === 2) return;
  if (ball.floor === 0 && !state.magnetLit) return;
  const spot = ball.floor === 0 ? MAGNET : UPPER_MAGNET;
  const dx = spot.x - ball.x;
  const dy = spot.y - ball.y;
  const d = Math.hypot(dx, dy);
  if (d >= spot.pull) return;
  const speed = Math.hypot(ball.vx, ball.vy);
  if (d < 5 && speed < 440) {
    ball.mode = "held";
    ball.x = spot.x;
    ball.y = spot.y;
    ball.vx = ball.vy = 0;
    ball.holdKind = "magnet";
    ball.hold = 1.2;
    state.flash.magnet = 1.2;
    award(state, 500, out, spot.x, spot.y - 14);
    say(state, "IMÁN", 1.2);
    out.sound("lock");
    ring(state, spot.x, spot.y, 1, 1.5);
    if (ball.floor === 0) {
      state.magnetLit = false;
      event(state, "magnet", out);
    }
    return;
  }
  // Tira hacia el centro con más fuerza cuanto más cerca.
  const k = (1 - d / spot.pull) * 900 * H;
  ball.vx += (dx / d) * k;
  ball.vy += (dy / d) * k;
}

function hitCaptive(state: State, out: Out) {
  state.cool.captive = 0.5;
  state.flash.captive = 0.8;
  award(state, 2500, out, CAPTIVE.x, CAPTIVE.stopY + 2);
  state.bonus += 120;
  sparks(state, CAPTIVE.x, CAPTIVE.top - 6, 8, 2);
  ring(state, CAPTIVE.x, CAPTIVE.top - 6, 2);
  state.shake = Math.max(state.shake, 0.2);
  event(state, "captive", out);
  if (!state.magnetLit) {
    state.magnetLit = true;
    say(state, "IMÁN ENCENDIDO", 1.8);
    out.say("Bola cautiva: el imán del centro está encendido.");
  }
  out.sound("clear2");
}

/** Lo que la bola pisa sin chocar en la mesa principal. */
function sensors(state: State, ball: Ball, oldX: number, oldY: number, out: Out) {
  const live = !state.tilted;
  // Faroles de arriba.
  if (ball.y > 84 && ball.y < 108) {
    for (let i = 0; i < LANES.length; i++) {
      if (Math.abs(ball.x - LANES[i]) < 9 && state.cool.lanes[i] <= 0 && live) passLane(state, i, out);
    }
  }
  // Órbitas: cuentan al subir por su canal.
  const inLeft = ball.x < ORBIT_L;
  const inRight = ball.x > ORBIT_R && ball.x < LANE_WALL;
  if (inLeft && (oldY - SPIN_Y) * (ball.y - SPIN_Y) <= 0 && oldY !== ball.y) {
    state.spin.speed = Math.max(state.spin.speed, Math.min(16, Math.abs(ball.vy) * 0.03));
    state.flash.spinner = 0.3;
  }
  if ((inLeft || inRight) && oldY > ORBIT_Y && ball.y <= ORBIT_Y && ball.vy < -100 && live && ball.quiet <= 0) {
    const index = inLeft ? 0 : 1;
    state.flash.orbit[index] = 0.8;
    award(state, 750, out, inLeft ? 20 : 217, ORBIT_Y - 10, true);
    state.bonus += 100;
    say(state, `ÓRBITA ${750 * state.mult}`, 1.5);
    out.sound("clear2");
    event(state, "orbit", out);
    shot(state, out, inLeft ? "orbitL" : "orbitR");
  }
  // La patada del gato: devuelve la bola por el pasillo de salida izquierdo.
  if (state.kickback && live && ball.x < 28 && ball.y > 372 && ball.vy > 0) {
    state.kickback = false;
    ball.vy = -560;
    ball.vx = 0;
    ball.x = 14;
    ball.quiet = 1.5;
    say(state, "PATADA DEL GATO", 2);
    state.shake = Math.max(state.shake, 0.25);
    sparks(state, 18, 380, 8, 2);
    out.sound("rotate");
    out.say("El gato de la suerte devolvió la bola.");
  }
  // Bocas de las rampas.
  if (ball.vy < 0 && ball.rampOff <= 0) {
    for (const m of MOUTHS) {
      if (oldY > m.y && ball.y <= m.y && ball.x > m.x0 && ball.x < m.x1) {
        let id: PathId = m.id;
        if (m.id === "cramp") {
          const solo = state.balls.length === 1 && state.spitQueue + state.autoPlunge === 0 && !state.multiball;
          if (live && state.stairs && solo) id = "stairs";
        }
        const p = PATHS[id];
        const [dx, dy] = pathDir(p, 0);
        const along = Math.max(0, ball.vx * dx + ball.vy * dy);
        enterPath(ball, id, along);
        return;
      }
    }
  }
  // El disco giratorio: empuja la bola de lado y la desvía (a veces se lleva una luz).
  const ddx = ball.x - DISC.x;
  const ddy = ball.y - DISC.y;
  const dd = Math.hypot(ddx, ddy);
  if (dd < DISC.r && dd > 0.5) {
    const k = 1300 * H * state.disc.dir;
    ball.vx += (-ddy / dd) * k + (ddx / dd) * 300 * H;
    ball.vy += (ddx / dd) * k + (ddy / dd) * 300 * H;
    if (ball.discOff <= 0 && live) {
      ball.discOff = 1.2;
      state.flash.disc = 0.6;
      award(state, 250, out, DISC.x, DISC.y - 18);
      state.bonus += 20;
      out.sound("rotate");
      event(state, "disc", out);
      if (roll(state) < 0.15) steal(state, out);
    }
  }
  // La boca de la luna.
  if (live && state.mouth > 0.6 && state.chew <= 0) {
    const dx = ball.x - MOUTH.x;
    const dy = ball.y - MOUTH.y;
    if (dx * dx + dy * dy < 8 * 8) swallow(state, ball, out);
  }
}

/** El disco tramposo apaga una luz: un farol, el poste o la patada del gato. */
function steal(state: State, out: Out) {
  const lit = state.lanes.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
  if (state.post > 0) state.post = 0;
  else if (lit.length) state.lanes[lit[Math.floor(roll(state) * lit.length)]] = false;
  else if (state.kickback) state.kickback = false;
  else return;
  say(state, "SE APAGÓ UNA LUZ", 1.8);
  out.say("El disco apagó una luz.");
}

/** Lo que la bola pisa en los pisos de arriba: la puerta secreta. */
function upperSensors(state: State, ball: Ball, out: Out) {
  if (ball.floor !== 1 || !state.secretOpen || state.tilted) return;
  const dx = ball.x - DOOR.x;
  const dy = ball.y - DOOR.y;
  if (dx * dx + dy * dy < 8 * 8 && Math.hypot(ball.vx, ball.vy) < 560) {
    state.secretOpen = false;
    state.stars = STAR_SPOTS.map(() => false);
    state.flash.door = 1;
    enterPath(ball, "secretIn");
    state.flash.floor = 0.5;
    out.sound("clear2");
  }
}

/* ---------- Un cuadro ---------- */

function launch(state: State, ball: Ball, power: number) {
  ball.mode = "free";
  ball.y = REST_Y;
  ball.vx = 0;
  ball.vy = -(160 + power * 460);
  ball.power = power;
}

function loseBall(state: State, out: Out) {
  state.phase = "drain";
  state.phaseTime = 0;
  state.multiball = false;
  state.superLit = false;
  state.pendingMulti = false;
  state.jackpot = jackpotBase(state);
  if (state.active >= 0 && MISSIONS[state.active].time) {
    state.active = -1;
    state.missionTime = 0;
  }
  state.bonusMult = state.mult;
  const total = state.tilted ? 0 : state.bonus * state.mult;
  state.bonusShown = total;
  addScore(state, total, out);
  out.sound("lock");
  out.say(state.tilted ? "Bola perdida por falta." : `Bola perdida. Bono: ${state.bonus} por ${state.mult}, ${total}.`);
}

function nextBall(state: State, out: Out) {
  state.lives -= 1;
  state.bonus = 0;
  state.tilted = false;
  state.tiltMeter = 0;
  state.combo = 0;
  state.comboTime = 0;
  if (state.lives <= 0) {
    state.lives = 0;
    state.phase = "over";
    state.over = true;
    say(state, "FIN DEL JUEGO", 999);
    out.sound("over");
    out.say(`Fin del juego. Puntos: ${state.score}. Rango: ${RANKS[state.rank].toLowerCase()}.`);
    return;
  }
  state.phase = "play";
  state.ballNumber += 1;
  state.saveLeft = SAVE_TIME;
  serve(state);
  say(state, `BOLA ${state.ballNumber}`, 2);
  out.sound("start");
  out.say(`Bola ${state.ballNumber}. Quedan ${state.lives}.`);
}

function step(state: State, dt: number, input: Input, out: Out) {
  if (!(dt > 0)) return;
  dt = Math.min(dt, 0.05);
  state.time += dt;
  if (state.messageTime > 0) state.messageTime -= dt;
  state.messageAge += dt;
  if (state.over) return;

  // Timers de luces y esperas.
  const fade = (list: number[]) => list.forEach((value, i) => (list[i] = Math.max(0, value - dt)));
  const { flash, cool } = state;
  fade(flash.bumpers);
  fade(flash.slings);
  fade(flash.targets);
  fade(flash.drops);
  fade(flash.lanes);
  fade(flash.orbit);
  fade(cool.bumpers);
  fade(cool.slings);
  fade(cool.targets);
  fade(cool.lanes);
  fade(state.doors);
  for (const key of ["moon", "disc", "wall", "door", "magnet", "captive", "floor", "spinner"] as const) flash[key] = Math.max(0, flash[key] - dt);
  for (const m of MOUTHS) flash.ramps[m.id] = Math.max(0, flash.ramps[m.id] - dt);
  cool.wall = Math.max(0, cool.wall - dt);
  cool.captive = Math.max(0, cool.captive - dt);
  state.post = Math.max(0, state.post - dt);
  state.party = Math.max(0, state.party - dt);
  state.comboTime = Math.max(0, state.comboTime - dt);
  state.skillTime = Math.max(0, state.skillTime - dt);
  state.magnetOff = Math.max(0, state.magnetOff - dt);
  state.tiltMeter = Math.max(0, state.tiltMeter - 0.45 * dt);
  state.shake = Math.max(0, state.shake - dt);
  state.chew = Math.max(0, state.chew - dt);
  state.banner.age += dt;
  state.banner.time = Math.max(0, state.banner.time - dt);
  state.showTime = Math.max(0, state.showTime - dt);
  if (state.showTime <= 0) state.show = "none";
  for (const spark of state.sparks) {
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vy += 200 * dt;
    spark.life -= dt;
  }
  state.sparks = state.sparks.filter((spark) => spark.life > 0);
  for (const p of state.pops) {
    p.y -= 34 * dt;
    p.life -= dt;
  }
  state.pops = state.pops.filter((p) => p.life > 0);
  for (const r of state.rings) r.life -= dt * 2.5;
  state.rings = state.rings.filter((r) => r.life > 0);
  if (state.nameTime > 0) {
    state.nameTime -= dt;
    if (state.nameTime <= 0) state.letters = 0;
  }

  if (state.phase === "drain") {
    state.phaseTime += dt;
    if (state.phaseTime >= 2.6) nextBall(state, out);
    return;
  }

  // Controles: teclas y dedos (el tablero mide 256 × 448).
  const onPlunger = state.balls.find((ball) => ball.mode === "plunger");
  let left = input.held.has("left");
  let right = input.held.has("right");
  let charge = input.held.has("down") || input.held.has("fire");
  for (const touch of input.touches) {
    if (onPlunger && touch.x >= 192 && touch.y >= 120) charge = true;
    else if (touch.x < W / 2) left = true;
    else right = true;
  }
  if (state.tilted) left = right = false;
  // Apretar una paleta corre las luces de los faroles (para completar los que faltan).
  if (left && !state.held[0]) {
    out.sound("move");
    state.lanes = [state.lanes[1], state.lanes[2], state.lanes[0]];
  }
  if (right && !state.held[1]) {
    out.sound("move");
    state.lanes = [state.lanes[2], state.lanes[0], state.lanes[1]];
  }
  state.held = [left, right];

  if (onPlunger) {
    if (charge) state.pull = Math.min(1, state.pull + dt / 0.9);
    else if (state.pull > 0) {
      launch(state, onPlunger, state.pull);
      state.pull = 0;
      state.skillTime = 4;
      out.sound("rotate");
    }
  } else state.pull = 0;

  // Empujón de mesa: ayuda, pero si se abusa es falta.
  if ((input.pressed.includes("up") || input.swipes.includes("up")) && !state.tilted) {
    for (const ball of state.balls) {
      if (ball.mode !== "free") continue;
      ball.vx += (roll(state) - 0.5) * 120;
      ball.vy -= 90;
    }
    state.tiltMeter += 1;
    state.shake = Math.max(state.shake, 0.2);
    if (state.tiltMeter >= 2.8) {
      state.tilted = true;
      state.saveLeft = 0;
      state.held = [false, false];
      say(state, "FALTA", 99);
      state.show = "tilt";
      state.showTime = 99;
      out.sound("lock");
      out.say("Falta: la mesa queda muerta hasta perder la bola.");
    } else if (state.tiltMeter >= 1.7) {
      say(state, "CUIDADO", 1.5);
      out.sound("move");
      out.say("Cuidado con los empujones.");
    } else out.sound("move");
  }

  // Bolas que salen solas: de la luna y del carril durante la multibola.
  if (state.spitQueue > 0) {
    state.spitTime -= dt;
    if (state.spitTime <= 0) {
      state.spitQueue -= 1;
      state.spitTime = 0.8;
      spit(state, out);
    }
  }
  if (state.autoPlunge > 0 && !state.balls.some((ball) => ball.mode === "plunger" || (ball.floor === 0 && ball.mode === "free" && ball.x > LANE_WALL && ball.y > 300))) {
    state.plungeTime -= dt;
    if (state.plungeTime <= 0) {
      state.autoPlunge -= 1;
      state.plungeTime = 0.8;
      const ball = freshBall(LANE_X, REST_Y, "plunger");
      launch(state, ball, 0.8 + roll(state) * 0.15);
      state.balls.push(ball);
      out.sound("rotate");
    }
  }

  // La muralla cuida la boca de la luna mientras corre una misión (salvo que la luna
  // tenga algo que dar); dos golpes la tumban un rato. La boca se abre cuando la muralla baja.
  const wall = state.wall;
  if (wall.timer > 0) wall.timer = Math.max(0, wall.timer - dt);
  const guarded = wantsNow(state, "wall") || (state.active >= 0 && !state.lockLit && !state.superLit && !state.extraLit && !state.multiball);
  if (!guarded) wall.up = false;
  else if (!wall.up && wall.timer <= 0 && state.chew <= 0 && state.spitQueue === 0 && !pocketBusy(state)) raiseWall(state);
  const target = wall.up ? 1 : 0;
  if (wall.pos !== target) wall.pos = target > wall.pos ? Math.min(1, wall.pos + dt * 3) : Math.max(0, wall.pos - dt * 3);
  const mouthTarget = wall.pos < 0.5 || state.chew > 0 ? 1 : 0;
  state.mouth = mouthTarget > state.mouth ? Math.min(1, state.mouth + dt * 4) : Math.max(0, state.mouth - dt * 4);
  if (state.dropReset > 0) {
    state.dropReset -= dt;
    if (state.dropReset <= 0) {
      state.dropReset = 0;
      if (!state.balls.some((b) => b.mode === "free" && b.x < ORBIT_L + 12 && b.y > 190 && b.y < 262)) state.drops = [false, false, false];
      else state.dropReset = 0.2;
    }
  }
  // El disco cambia de sentido cada tanto.
  state.disc.angle += dt * state.disc.dir * (state.flash.disc > 0 ? 9 : 4);
  state.disc.flip -= dt;
  if (state.disc.flip <= 0) {
    state.disc.flip = 9;
    state.disc.dir = -state.disc.dir;
  }

  // La física, en pasos fijos.
  state.drained = 0;
  state.acc += dt;
  while (state.acc >= H) {
    state.acc -= H;
    substep(state, out);
  }
  if (state.pendingMulti && state.balls.every((ball) => ball.floor === 0 && !(ball.mode === "path" && (ball.path === "stairs" || ball.path === "drop")))) startMultiball(state, out);

  if (state.spin.speed > 0) {
    state.spin.angle += state.spin.speed * dt;
    state.spin.speed = Math.max(0, state.spin.speed - 5 * dt);
    while (state.spin.counted < Math.floor(state.spin.angle)) {
      state.spin.counted += 1;
      if (!state.tilted) {
        addScore(state, 50, out);
        state.bonus += 2;
        event(state, "spin", out);
      }
    }
  }

  // El jardín secreto tiene tiempo contado.
  if (state.garden > 0) {
    state.garden -= dt;
    if (state.garden <= 0) {
      state.garden = 0;
      for (const ball of state.balls) if (ball.floor === 2 && ball.mode !== "path") sendDown(state, ball, out);
    }
  }

  // El reloj de la misión corre sólo con la bola en juego.
  const hasFree = state.balls.some((ball) => ball.mode !== "plunger");
  if (state.active >= 0 && state.missionTime > 0 && hasFree) {
    state.missionTime -= dt;
    if (state.missionTime <= 0) failMission(state, out);
  }

  // Bolas quietas: si no se mueven en varios segundos, un empujoncito.
  for (const ball of state.balls) {
    if (ball.mode !== "free") continue;
    // Sostener la bola con la paleta arriba es a propósito: eso no cuenta como atascada.
    const index = ball.x < MIDDLE[ball.floor] ? 0 : 1;
    const cradled = ball.y > 352 && state.held[index] && state.flip[index].omega === 0;
    if (Math.abs(ball.x - ball.ax) > 6 || Math.abs(ball.y - ball.ay) > 6) {
      ball.ax = ball.x;
      ball.ay = ball.y;
      ball.stuck = 0;
    } else if (!cradled) {
      ball.stuck += dt;
      if (ball.stuck > 4) {
        ball.stuck = 0;
        ball.vy = -180;
        ball.vx = (roll(state) - 0.5) * 160;
        out.sound("move");
      }
    }
  }

  if (hasFree && state.saveLeft > 0) state.saveLeft = Math.max(0, state.saveLeft - dt);

  const lost = state.drained;
  const remaining = state.balls.length + state.spitQueue + state.autoPlunge;
  if (lost > 0) {
    if (state.saveLeft > 0 && !state.tilted) {
      // Salvavidas: la bola vuelve.
      if (state.multiball) state.autoPlunge += lost;
      else {
        if (remaining === 0) serve(state);
        say(state, "BOLA SALVADA", 2);
        out.sound("clear");
        out.say("Bola salvada.");
      }
      return;
    }
    if (remaining <= 1 && state.multiball) {
      state.multiball = false;
      state.superLit = false;
      state.jackpot = jackpotBase(state);
      if (remaining === 1) say(state, "FIN MULTIBOLA", 1.5);
    }
    if (remaining === 0) loseBall(state, out);
  }
}

/** ¿Qué pide ahora la misión? Para encender la flecha de ese tiro. */
function wantsNow(state: State, ev: Ev) {
  return state.active >= 0 && MISSIONS[state.active].steps[state.stepIndex].ev === ev;
}

/* =====================================================================
 * Dibujo
 * ===================================================================== */

/* ---------- Colores ---------- */

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
/** Mezcla dos colores (#rrggbb): t=0 es el primero, t=1 el segundo. */
const mixCache = new Map<string, string>();
export function mix(a: string, b: string, t: number) {
  const key = `${a}${b}${t.toFixed(3)}`;
  let found = mixCache.get(key);
  if (!found) {
    const A = hexRgb(a);
    const B = hexRgb(b);
    found = toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
    if (mixCache.size > 4000) mixCache.clear();
    mixCache.set(key, found);
  }
  return found;
}
const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
const BLACK = "#000000";
const WHITE = "#ffffff";
const STEEL = "#a7b0c6";
const STEEL_HI = "#f2f6ff";
const STEEL_LO = "#454b63";
const RUBBER = "#1b1420";
const DMD_ON = "#ff8a1e";
const DMD_HOT = "#ffe0a8";
const DMD_MID = "#a04e0c";
/** Colores de cada tiro (las flechas de colores de la mesa). */
const SHOT_COLORS = {
  lorbit: "#ffb04a",
  lramp: "#ff6fb5",
  cramp: "#ffd684",
  loop: "#7ff6ff",
  rramp: "#9dff7a",
  rorbit: "#b996ff",
  moon: "#fff1b8",
} as const;

/** Los colores de la mesa en un paisaje, sacados de los del paisaje. */
type Pal = { look: Look; skyTop: string; skyBottom: string; far: string; mid: string; near: string; ink: string; floor: string };
function paletteOf(look: Look): Pal {
  return {
    look,
    skyTop: mix(look.ground, BLACK, 0.62),
    skyBottom: mix(look.wall, look.ground, 0.35),
    far: mix(mix(look.wall, look.edge, 0.25), BLACK, 0.15),
    mid: mix(look.wall, BLACK, 0.35),
    near: mix(look.ground, BLACK, 0.55),
    ink: mix(look.ground, BLACK, 0.8),
    floor: mix(look.ground, BLACK, 0.3),
  };
}

/* ---------- Pinceles de píxeles (para los lienzos guardados) ---------- */

function disc(c: Ctx, cx: number, cy: number, r: number, color: string) {
  c.fillStyle = color;
  const top = Math.ceil(cy - r - 0.5);
  const bottom = Math.floor(cy + r - 0.5);
  for (let y = top; y <= bottom; y++) {
    const dy = y + 0.5 - cy;
    const w = Math.sqrt(Math.max(0, r * r - dy * dy));
    const x0 = Math.round(cx - w);
    const x1 = Math.round(cx + w);
    if (x1 > x0) c.fillRect(x0, y, x1 - x0, 1);
  }
}

function ellipse(c: Ctx, cx: number, cy: number, rx: number, ry: number, color: string) {
  c.fillStyle = color;
  for (let y = Math.ceil(cy - ry - 0.5); y <= Math.floor(cy + ry - 0.5); y++) {
    const dy = (y + 0.5 - cy) / ry;
    const w = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
    const x0 = Math.round(cx - w);
    const x1 = Math.round(cx + w);
    if (x1 > x0) c.fillRect(x0, y, x1 - x0, 1);
  }
}

/** Un anillo: lo que queda entre dos círculos. */
function annulus(c: Ctx, cx: number, cy: number, r0: number, r1: number, color: string) {
  c.fillStyle = color;
  for (let y = Math.ceil(cy - r1 - 0.5); y <= Math.floor(cy + r1 - 0.5); y++) {
    const dy = y + 0.5 - cy;
    const wo = Math.sqrt(Math.max(0, r1 * r1 - dy * dy));
    const wi = Math.sqrt(Math.max(0, r0 * r0 - dy * dy));
    const a0 = Math.round(cx - wo);
    const a1 = Math.round(cx - wi);
    const b0 = Math.round(cx + wi);
    const b1 = Math.round(cx + wo);
    if (wi <= 0) {
      if (b1 > a0) c.fillRect(a0, y, b1 - a0, 1);
      continue;
    }
    if (a1 > a0) c.fillRect(a0, y, a1 - a0, 1);
    if (b1 > b0) c.fillRect(b0, y, b1 - b0, 1);
  }
}

/** Rellena un polígono cualquiera, fila por fila. */
function poly(c: Ctx, points: readonly (readonly [number, number])[], color: string) {
  c.fillStyle = color;
  let top = Infinity;
  let bottom = -Infinity;
  for (const [, y] of points) {
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  const xs: number[] = [];
  for (let y = Math.floor(top); y <= Math.ceil(bottom); y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % points.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) * (bx - ax)) / (by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.round(xs[k]);
      const x1 = Math.round(xs[k + 1]);
      if (x1 > x0) c.fillRect(x0, y, x1 - x0, 1);
    }
  }
}

/** Una línea gruesa con puntas redondas. */
function thick(c: Ctx, ax: number, ay: number, bx: number, by: number, width: number, color: string) {
  const len = Math.hypot(bx - ax, by - ay);
  const half = width / 2;
  if (len > 0.01) {
    const nx = (-(by - ay) / len) * half;
    const ny = ((bx - ax) / len) * half;
    poly(
      c,
      [
        [ax + nx, ay + ny],
        [bx + nx, by + ny],
        [bx - nx, by - ny],
        [ax - nx, ay - ny],
      ],
      color,
    );
  }
  if (half >= 1) {
    disc(c, ax, ay, half, color);
    disc(c, bx, by, half, color);
  } else {
    c.fillStyle = color;
    c.fillRect(Math.round(ax), Math.round(ay), 1, 1);
    c.fillRect(Math.round(bx), Math.round(by), 1, 1);
  }
}

/** Una línea fina de un píxel (sin huecos). */
function hair(c: Ctx, ax: number, ay: number, bx: number, by: number, color: string) {
  c.fillStyle = color;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
  for (let i = 0; i <= n; i++) c.fillRect(Math.round(ax + ((bx - ax) * i) / n), Math.round(ay + ((by - ay) * i) / n), 1, 1);
}

/** Recorre una línea quebrada con un pincel grueso. */
function strokePath(c: Ctx, points: readonly (readonly [number, number])[], width: number, color: string, dx = 0, dy = 0) {
  for (let i = 1; i < points.length; i++) thick(c, points[i - 1][0] + dx, points[i - 1][1] + dy, points[i][0] + dx, points[i][1] + dy, width, color);
}

/** Un dibujo de texto: cada letra un color; el punto es transparente. */
function sprite(c: Ctx, rows: readonly string[], colors: Readonly<Record<string, string>>, x: number, y: number, scale = 1, flip = false) {
  for (let row = 0; row < rows.length; row++) {
    const line = rows[row];
    for (let col = 0; col < line.length; col++) {
      const color = colors[line[flip ? line.length - 1 - col : col]];
      if (!color) continue;
      c.fillStyle = color;
      c.fillRect(x + col * scale, y + row * scale, scale, scale);
    }
  }
}

/** Tramado de un color sobre un rectángulo (para texturas y plásticos). */
function ditherRect(c: Ctx, x: number, y: number, w: number, h: number, amount: number, color: string) {
  c.fillStyle = color;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (dither(x + i, y + j, amount)) c.fillRect(x + i, y + j, 1, 1);
}

/* ---------- Lienzos guardados ---------- */

const store = new Map<string, HTMLCanvasElement | null>();
const hasCanvas = () => typeof document !== "undefined";

/** Un dibujo hecho una vez y guardado (null si no hay navegador: entonces no se usa). */
function cached(key: string, w: number, h: number, paint: (c: Ctx) => void): HTMLCanvasElement | null {
  if (!hasCanvas()) return null;
  const found = store.get(key);
  if (found !== undefined) return found;
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = makeCanvas(w, h);
    const c = canvas.getContext("2d") as Ctx;
    paint(c);
  } catch {
    canvas = null;
  }
  if (store.size > 900) store.clear();
  store.set(key, canvas);
  return canvas;
}

/** Pone un dibujo guardado con su centro en (x, y). */
function blit(c: Ctx, image: HTMLCanvasElement | null, x: number, y: number) {
  if (image) c.drawImage(image, Math.round(x - image.width / 2), Math.round(y - image.height / 2));
}

/** Un halo de luz suave (se suma a lo que hay debajo). */
function glow(c: Ctx, x: number, y: number, radius: number, color: string, strength = 1) {
  const r = Math.max(4, Math.round(radius / 2) * 2);
  const image = cached(`glow:${color}:${r}`, r * 2, r * 2, (g) => {
    const gradient = g.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, rgba(color, 0.75));
    gradient.addColorStop(0.35, rgba(color, 0.32));
    gradient.addColorStop(1, rgba(color, 0));
    g.fillStyle = gradient;
    g.fillRect(0, 0, r * 2, r * 2);
  });
  if (!image) return;
  c.save();
  c.globalCompositeOperation = "lighter";
  c.globalAlpha = Math.max(0, Math.min(1, strength));
  c.drawImage(image, Math.round(x - r), Math.round(y - r));
  c.restore();
}

/** Texto ya pintado (con borde oscuro) y guardado: así no se repinta letra por letra. */
function textImage(text: string, color: string, scale: number, outline: string | null) {
  const pad = outline ? scale : 0;
  const w = widthOf(text, scale) + pad * 2 + 1;
  const h = 9 * scale + pad * 2;
  return cached(`text:${text}:${color}:${scale}:${outline}`, w, h, (c) => {
    const y = 2 * scale + pad;
    if (outline) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]]) write(c, text, pad + dx * scale, y + dy * scale, outline, scale);
    write(c, text, pad, y, color, scale);
  });
}

/** Escribe un texto centrado en x (o desde x con `left`), con borde. Sin navegador, sin borde. */
function label(c: Ctx, text: string, x: number, y: number, color: string, scale = 1, outline: string | null = NIGHT, left = false) {
  const width = widthOf(text, scale);
  const x0 = left ? x : Math.round(x - width / 2);
  const image = textImage(text, color, scale, outline);
  if (image) c.drawImage(image, x0 - (outline ? scale : 0), y - 2 * scale - (outline ? scale : 0));
  else write(c, text, x0, y, color, scale);
}

/* ---------- Piezas pequeñas: bola, paletas, bumpers ---------- */

/** La bola de metal: degradado, brillo y el reflejo del color de la mesa. */
function ballImage(look: Look) {
  return cached(`ball:${look.light}`, 13, 13, (c) => {
    const tones = ["#2c3044", "#5a6180", "#8f97b2", "#c3c9dc", "#e9edf7", WHITE];
    for (let y = 0; y < 13; y++) {
      for (let x = 0; x < 13; x++) {
        const dx = x + 0.5 - 6.5;
        const dy = y + 0.5 - 6.5;
        const d = Math.hypot(dx, dy);
        if (d > 5.6) continue;
        if (d > 4.9) {
          c.fillStyle = "#14121c";
          c.fillRect(x, y, 1, 1);
          continue;
        }
        const nz = Math.sqrt(Math.max(0, 25 - d * d)) / 5;
        const light = (-dx * 0.55 - dy * 0.7) / 5 + nz * 0.55;
        let tone = Math.round(Math.max(0, Math.min(5, light * 4 + 1.6)));
        if (dither(x, y, ((light * 4 + 1.6) % 1) * 0.9) && tone < 5) tone += 1;
        c.fillStyle = tones[Math.max(0, Math.min(5, tone))];
        // Abajo refleja la luz de la mesa.
        if (dy > 2.2 && d > 3.2 && d <= 4.9) c.fillStyle = mix(look.light, "#5a6180", 0.35);
        c.fillRect(x, y, 1, 1);
      }
    }
    c.fillStyle = WHITE;
    c.fillRect(4, 3, 2, 2);
    c.fillRect(3, 4, 1, 1);
  });
}

function shadowImage(r: number) {
  return cached(`shadow:${r}`, r * 2 + 4, r * 2 + 4, (c) => {
    c.globalAlpha = 0.45;
    ellipse(c, r + 2, r + 2, r + 1, r * 0.8 + 1, BLACK);
  });
}

function drawBall(c: Ctx, x: number, y: number, look: Look, lift = 0) {
  const shadow = shadowImage(5);
  if (shadow) blit(c, shadow, x + 2 + lift * 3, y + 3 + lift * 4);
  const image = ballImage(look);
  if (image) c.drawImage(image, Math.round(x - 6.5), Math.round(y - 6.5));
  else {
    rect(c, Math.round(x) - 4, Math.round(y) - 4, 9, 9, "#c3c9dc");
    rect(c, Math.round(x) - 2, Math.round(y) - 3, 2, 2, WHITE);
  }
}

const FLIP_FRAMES = 20;

/** Una paleta ya pintada en uno de sus 20 ángulos (goma, cuerpo con brillo y la franja del paisaje). */
function flipperImage(f: Flipper, index: number, frame: number, look: Look, dead: boolean) {
  const size = Math.ceil(f.len + FLIP_R0) * 2 + 6;
  return cached(`flip:${f.len}:${index}:${frame}:${look.edge}:${dead}`, size, size, (c) => {
    const angle = f.up + ((f.rest - f.up) * frame) / (FLIP_FRAMES - 1);
    const o = size / 2;
    const ex = Math.cos(angle) * f.len;
    const ey = Math.sin(angle) * f.len;
    const rubber = dead ? "#3a3448" : "#c8324a";
    const body = dead ? "#6d6880" : "#f6f1e4";
    const shade = dead ? "#4e4a60" : "#c9c0aa";
    const stripe = dead ? "#5d5790" : look.edge;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = x + 0.5 - o;
        const py = y + 0.5 - o;
        let t = (px * ex + py * ey) / (f.len * f.len);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = px - ex * t;
        const qy = py - ey * t;
        const d = Math.hypot(qx, qy);
        const radius = FLIP_R0 + (FLIP_R1 - FLIP_R0) * t;
        if (d > radius + 0.6) continue;
        let color = body;
        if (d > radius - 0.9) color = "#120c16";
        else if (d > radius - 2.2) color = rubber;
        else {
          // Luz de arriba a la izquierda: el borde de abajo queda en sombra.
          const lit = -(qx * 0.4 + qy * 0.9) / radius;
          color = lit < -0.25 ? shade : lit > 0.45 ? WHITE : body;
          if (Math.abs(d) < 1.1 && t > 0.15 && t < 0.85) color = stripe;
        }
        c.fillStyle = color;
        c.fillRect(x, y, 1, 1);
      }
    }
    // El eje de metal.
    disc(c, o, o, 2.6, STEEL_LO);
    disc(c, o, o, 1.8, STEEL);
    c.fillStyle = STEEL_HI;
    c.fillRect(Math.floor(o) - 1, Math.floor(o) - 1, 1, 1);
  });
}

function drawFlipper(c: Ctx, f: Flipper, index: number, angle: number, look: Look, dead: boolean) {
  const frame = Math.max(0, Math.min(FLIP_FRAMES - 1, Math.round(((angle - f.up) / (f.rest - f.up)) * (FLIP_FRAMES - 1))));
  const image = flipperImage(f, index, frame, look, dead);
  if (image) {
    const shadow = flipperImage(f, index, frame, look, true);
    if (shadow) {
      c.save();
      c.globalAlpha = 0.35;
      c.globalCompositeOperation = "multiply";
      c.drawImage(shadow, Math.round(f.x - image.width / 2) + 2, Math.round(f.y - image.height / 2) + 3);
      c.restore();
    }
    c.drawImage(image, Math.round(f.x - image.width / 2), Math.round(f.y - image.height / 2));
    return;
  }
  // Sin navegador: una paleta sencilla.
  c.fillStyle = INK;
  for (let i = 0; i <= f.len; i += 3) c.fillRect(Math.round(f.x + Math.cos(angle) * i) - 2, Math.round(f.y + Math.sin(angle) * i) - 2, 5, 5);
}

/** Un bumper visto desde arriba: falda de metal, goma, sombrero de plástico con una luna. */
function bumperImage(r: number, look: Look, lit: boolean, kind: "pop" | "moon") {
  const size = r * 2 + 8;
  return cached(`bumper:${r}:${look.edge}:${lit}:${kind}`, size, size, (c) => {
    const o = size / 2;
    disc(c, o, o, r + 3, "#0c0912");
    annulus(c, o, o, r + 0.5, r + 2.5, STEEL_LO);
    annulus(c, o, o, r + 1, r + 2, STEEL);
    // Brillo de la falda arriba a la izquierda.
    for (let a = 3.6; a < 4.9; a += 0.05) c.fillRect(Math.round(o + Math.cos(a) * (r + 1.5)), Math.round(o + Math.sin(a) * (r + 1.5)), 1, 1);
    c.fillStyle = STEEL_HI;
    for (let a = 3.8; a < 4.6; a += 0.05) c.fillRect(Math.round(o + Math.cos(a) * (r + 1.5)), Math.round(o + Math.sin(a) * (r + 1.5)), 1, 1);
    disc(c, o, o, r + 0.5, RUBBER);
    const capColor = kind === "moon" ? (lit ? "#ffd0ea" : "#b44a86") : lit ? look.light : look.edge;
    const capDark = kind === "moon" ? (lit ? "#ff8ac4" : "#6a2450") : lit ? mix(look.light, look.edge, 0.5) : mix(look.edge, BLACK, 0.45);
    disc(c, o, o, r - 1, capDark);
    disc(c, o - 0.6, o - 0.8, r - 2.2, capColor);
    // Plástico translúcido: un tramado claro encima.
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y < (r - 3) * (r - 3) && dither(x + 8, y + 8, 0.18)) {
      c.fillStyle = lit ? WHITE : mix(capColor, WHITE, 0.35);
      c.fillRect(Math.round(o + x), Math.round(o + y), 1, 1);
    }
    // Una luna creciente en el centro.
    disc(c, o, o, r * 0.45, lit ? WHITE : "#fff1b8");
    disc(c, o + r * 0.18, o - r * 0.12, r * 0.38, lit ? mix(look.light, WHITE, 0.4) : capColor);
    // Brillo.
    ellipse(c, o - r * 0.42, o - r * 0.5, r * 0.28, r * 0.16, rgba(WHITE, 0.85));
  });
}

function drawBumper(c: Ctx, x: number, y: number, r: number, look: Look, lit: boolean, kind: "pop" | "moon") {
  const shadow = shadowImage(r + 2);
  if (shadow) blit(c, shadow, x + 3, y + 4);
  const image = bumperImage(r, look, lit, kind);
  if (image) blit(c, image, x, y);
  else disc(c, x, y, r, lit ? look.light : look.edge);
  if (lit) glow(c, x, y, r * 3, kind === "moon" ? "#ff8ac4" : look.light, 0.9);
}

/** El dibujo del compañero (puede ser el que hizo el dueño), al doble de tamaño. */
let spiritCache: { source: readonly string[] | null; big: string[] } = { source: null, big: [] };
function bigSpirit() {
  const source = SPIRIT[0];
  if (spiritCache.source !== source) spiritCache = { source, big: scaleSprite(source, 2) };
  return spiritCache.big;
}

/* ---------- Luces de la mesa (insertos) ---------- */

type LampShape = "arrow" | "dot" | "heart" | "star" | "cat";
type Lamp = { id: string; x: number; y: number; shape: LampShape; color: string; angle: number; size: number };
const LAMPS: Lamp[] = [
  { id: "lorbit", x: 50, y: 284, shape: "arrow", color: SHOT_COLORS.lorbit, angle: -2.25, size: 9 },
  { id: "lramp", x: 95, y: 278, shape: "arrow", color: SHOT_COLORS.lramp, angle: -Math.PI / 2, size: 9 },
  { id: "cramp", x: 130, y: 272, shape: "arrow", color: SHOT_COLORS.cramp, angle: -Math.PI / 2, size: 9 },
  { id: "loop", x: 164, y: 278, shape: "arrow", color: SHOT_COLORS.loop, angle: -Math.PI / 2, size: 9 },
  { id: "rramp", x: 197, y: 272, shape: "arrow", color: SHOT_COLORS.rramp, angle: -Math.PI / 2, size: 9 },
  { id: "rorbit", x: 186, y: 284, shape: "arrow", color: SHOT_COLORS.rorbit, angle: -0.9, size: 9 },
  { id: "moon", x: 62, y: 212, shape: "arrow", color: SHOT_COLORS.moon, angle: -Math.PI / 2, size: 9 },
  ...DROPS.map((d, i) => ({ id: `drop${i}`, x: 47, y: (d.y0 + d.y1) / 2, shape: "dot" as const, color: "#ff7a8a", angle: 0, size: 3.5 })),
  { id: "lock0", x: 54, y: 238, shape: "dot", color: "#8ff3ff", angle: 0, size: 3.5 },
  { id: "lock1", x: 64, y: 238, shape: "dot", color: "#8ff3ff", angle: 0, size: 3.5 },
  { id: "extra", x: 75, y: 238, shape: "heart", color: HEART, angle: 0, size: 4 },
  { id: "captive", x: 188, y: 172, shape: "arrow", color: SHOT_COLORS.rramp, angle: -Math.PI / 2, size: 6 },
  { id: "stairs", x: 130, y: 292, shape: "star", color: GOLD, angle: 0, size: 6 },
  { id: "kick", x: 18, y: 352, shape: "cat", color: GOLD, angle: 0, size: 6 },
  { id: "magnet", x: MAGNET.x, y: MAGNET.y, shape: "dot", color: "#8ff3ff", angle: 0, size: 4 },
];

/** Una luz pintada: apagada se ve como vidrio de color oscuro (no negro); encendida, brillante. */
function lampImage(lamp: Lamp, on: boolean) {
  const s = Math.ceil(lamp.size) * 2 + 6;
  return cached(`lamp:${lamp.shape}:${lamp.color}:${lamp.angle.toFixed(2)}:${lamp.size}:${on}`, s, s, (c) => {
    const o = s / 2;
    const base = on ? lamp.color : mix(lamp.color, "#100a18", 0.68);
    const hi = on ? mix(lamp.color, WHITE, 0.65) : mix(lamp.color, "#100a18", 0.45);
    const edge = "#0a0610";
    const z = lamp.size;
    if (lamp.shape === "arrow") {
      const ca = Math.cos(lamp.angle);
      const sa = Math.sin(lamp.angle);
      const at = (u: number, v: number): [number, number] => [o + ca * u - sa * v, o + sa * u + ca * v];
      const shape = (k: number) => [at(z + k, 0), at(-z * 0.15, z * 0.95 + k), at(-z * 0.15, z * 0.4 + k * 0.6), at(-z - k, z * 0.4 + k * 0.6), at(-z - k, -z * 0.4 - k * 0.6), at(-z * 0.15, -z * 0.4 - k * 0.6), at(-z * 0.15, -z * 0.95 - k)];
      poly(c, shape(1.2), edge);
      poly(c, shape(0), base);
      poly(c, [at(z * 0.6, 0), at(-z * 0.05, z * 0.5), at(-z * 0.05, -z * 0.15)], hi);
    } else if (lamp.shape === "dot") {
      disc(c, o, o, z + 1, edge);
      disc(c, o, o, z, base);
      disc(c, o - z * 0.3, o - z * 0.3, z * 0.4, hi);
    } else if (lamp.shape === "heart") {
      const rows = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."];
      sprite(c, rows, { "#": edge }, Math.round(o - 3.5) - 1, Math.round(o - 3), 1);
      sprite(c, rows, { "#": edge }, Math.round(o - 3.5) + 1, Math.round(o - 3), 1);
      sprite(c, rows, { "#": base }, Math.round(o - 3.5), Math.round(o - 3), 1);
      c.fillStyle = hi;
      c.fillRect(Math.round(o - 2.5), Math.round(o - 2), 1, 1);
    } else if (lamp.shape === "star") {
      const pts: [number, number][] = [];
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? z * 0.45 : z;
        pts.push([o + Math.cos(a) * rr, o + Math.sin(a) * rr]);
      }
      disc(c, o, o, z * 0.55, edge);
      poly(c, pts, base);
      disc(c, o, o - 1, z * 0.25, hi);
    } else {
      // La carita del gato.
      const rows = ["k...k", "kk.kk", "kwkwk", "kkpkk", ".kkk."];
      sprite(c, rows, { k: edge, w: edge, p: edge }, Math.round(o - 5) - 1, Math.round(o - 5), 2);
      sprite(c, rows, { k: base, w: on ? "#06040e" : base, p: on ? HEART : base }, Math.round(o - 5), Math.round(o - 5), 2);
    }
  });
}

function drawLamp(c: Ctx, lamp: Lamp, on: boolean, strength = 1) {
  if (on) glow(c, lamp.x, lamp.y, lamp.size * 4.5, lamp.color, 0.85 * strength);
  const image = lampImage(lamp, on);
  if (image) blit(c, image, lamp.x, lamp.y);
  else if (on) rect(c, Math.round(lamp.x) - 2, Math.round(lamp.y) - 2, 4, 4, lamp.color);
}

/* ---------- Fondo de cada piso: el mueble, el cielo y el paisaje ---------- */

/** El mueble: rieles de madera con borde de metal y el marco de la pantalla de puntos. */
function paintCabinet(c: Ctx, pal: Pal) {
  rect(c, 0, 0, W, HT, "#0d0710");
  const random = seeded(4242);
  // Madera a los costados, con vetas.
  for (const [x0, x1] of [
    [0, LEFT - 2],
    [RIGHT + 2, W],
  ]) {
    for (let x = x0; x < x1; x++) {
      const t = (x - x0) / Math.max(1, x1 - x0 - 1);
      rect(c, x, DMD_H, 1, HT - DMD_H, mix("#7a3f18", "#3e1c0a", Math.abs(t - 0.35) * 1.4));
    }
    for (let i = 0; i < 70; i++) {
      const x = x0 + Math.floor(random() * (x1 - x0));
      const y = DMD_H + Math.floor(random() * (HT - DMD_H));
      rect(c, x, y, 1, 4 + Math.floor(random() * 14), random() < 0.5 ? "#2c1407" : "#9a5626");
    }
  }
  // Borde de metal por dentro de la madera.
  for (const x of [LEFT - 3, RIGHT + 1]) {
    rect(c, x, DMD_H, 2, HT - DMD_H, STEEL);
    rect(c, x, DMD_H, 1, HT - DMD_H, STEEL_HI);
  }
  // Las esquinas de arriba, fuera del arco: paneles con tornillos.
  for (let y = DMD_H; y < CY; y++) {
    const [x0, x1] = tableSpan(y);
    rect(c, LEFT - 1, y, Math.max(0, Math.floor(x0) - LEFT + 1), 1, mix(pal.ink, "#1a1222", 0.5));
    rect(c, Math.ceil(x1), y, Math.max(0, RIGHT + 1 - Math.ceil(x1)), 1, mix(pal.ink, "#1a1222", 0.5));
  }
  for (const [x, y] of [
    [14, 66],
    [242, 66],
    [12, 112],
    [244, 112],
  ]) {
    disc(c, x, y, 2.5, STEEL_LO);
    disc(c, x - 0.5, y - 0.5, 1.6, STEEL);
  }
  // Marco de la pantalla de puntos.
  rect(c, 0, 0, W, DMD_H, "#141018");
  rect(c, 0, DMD_H - 2, W, 2, STEEL_LO);
  rect(c, 0, DMD_H - 2, W, 1, STEEL);
  rect(c, 3, 2, W - 6, DMD_H - 6, "#050304");
  rect(c, 3, 2, W - 6, 1, "#2a2230");
}

/** El cielo pintado dentro del borde de la mesa, en franjas con tramado entre ellas. */
function paintSky(c: Ctx, floor: Floor, top: string, bottom: string) {
  const steps = 14;
  for (let y = DMD_H; y < HT; y++) {
    const [x0, x1] = spanOf(floor, y);
    if (x1 - x0 < 1) continue;
    const t = Math.max(0, Math.min(1, (y - DMD_H) / (HT - DMD_H)));
    const level = t * steps;
    const band = Math.floor(level);
    const a = Math.round(x0);
    const b = Math.round(x1);
    rect(c, a, y, b - a, 1, mix(top, bottom, band / steps));
    // Junto al borde de la franja siguiente, un tramado que la anuncia.
    const frac = level - band;
    if (frac > 0.6) {
      c.fillStyle = mix(top, bottom, Math.min(1, (band + 1) / steps));
      for (let x = a; x < b; x++) if (dither(x, y, (frac - 0.6) * 2.4)) c.fillRect(x, y, 1, 1);
    }
  }
}

/** Una luna grande pintada en el fondo, con cráteres y sombra tramada. */
function paintMoon(c: Ctx, x: number, y: number, r: number, color: string, shade: string, alpha: number) {
  c.save();
  c.globalAlpha = alpha * 0.4;
  disc(c, x, y, r + 6, color);
  c.globalAlpha = alpha;
  disc(c, x, y, r, color);
  c.fillStyle = shade;
  for (let j = -r; j <= r; j++) {
    for (let i = -r; i <= r; i++) {
      const d = i * i + j * j;
      if (d > r * r) continue;
      // Sombra hacia abajo a la derecha, tramada.
      const k = (i * 0.6 + j * 0.8) / r;
      if (k > 0.15 && dither(Math.round(x + i), Math.round(y + j), Math.min(1, (k - 0.15) * 1.6))) c.fillRect(Math.round(x + i), Math.round(y + j), 1, 1);
    }
  }
  const random = seeded(Math.round(x * 31 + y));
  for (let i = 0; i < Math.round(r / 5); i++) {
    const a = random() * Math.PI * 2;
    const d = random() * r * 0.7;
    const cr = 1.5 + random() * r * 0.12;
    disc(c, x + Math.cos(a) * d, y + Math.sin(a) * d, cr, shade);
    disc(c, x + Math.cos(a) * d - 0.6, y + Math.sin(a) * d - 0.6, cr * 0.6, mix(color, shade, 0.4));
  }
  c.restore();
}

/** Estrellas y una constelación. */
function paintStars(c: Ctx, floor: Floor, seed: number, count: number, look: Look, yTop: number, yBottom: number) {
  const random = seeded(seed);
  for (let i = 0; i < count; i++) {
    const x = 10 + Math.floor(random() * (W - 20));
    const y = yTop + Math.floor(random() * (yBottom - yTop));
    const [x0, x1] = spanOf(floor, y);
    if (x < x0 + 3 || x > x1 - 3) continue;
    const big = random() < 0.12;
    const color = random() < 0.35 ? look.light : mix(look.edge, WHITE, 0.3);
    if (big) {
      rect(c, x - 1, y, 3, 1, rgba(color, 0.7));
      rect(c, x, y - 1, 1, 3, rgba(color, 0.7));
    }
    rect(c, x, y, 1, 1, color);
  }
}

/** Una rama de cerezo con flores. */
function paintBranch(c: Ctx, x: number, y: number, dir: number, length: number, pal: Pal, seed: number) {
  const random = seeded(seed);
  const wood = mix(pal.ink, "#3a1c12", 0.5);
  const tips: [number, number][] = [];
  const grow = (ax: number, ay: number, angle: number, len: number, width: number, depth: number) => {
    const bx = ax + Math.cos(angle) * len;
    const by = ay + Math.sin(angle) * len;
    thick(c, ax, ay, bx, by, width, wood);
    if (depth <= 0 || len < 6) {
      tips.push([bx, by]);
      return;
    }
    grow(bx, by, angle + (random() - 0.3) * 0.7 * dir, len * 0.68, Math.max(1, width * 0.65), depth - 1);
    if (random() < 0.8) grow(bx, by, angle - (0.5 + random() * 0.5) * dir, len * 0.55, Math.max(1, width * 0.6), depth - 1);
  };
  grow(x, y, dir > 0 ? -0.35 : Math.PI + 0.35, length, 4, 4);
  for (const [tx, ty] of tips) {
    for (let k = 0; k < 6; k++) {
      const fx = tx + (random() - 0.5) * 12;
      const fy = ty + (random() - 0.5) * 9;
      disc(c, fx, fy, 2.2, "#c9578f");
      disc(c, fx - 0.4, fy - 0.4, 1.5, "#f58fbd");
      c.fillStyle = "#ffd6ea";
      c.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 1, 1);
    }
  }
}

/** Una tira de faroles de papel colgando entre dos puntos. */
function paintLanternString(c: Ctx, ax: number, bx: number, y: number, sag: number, count: number, look: Look) {
  const at = (t: number): [number, number] => [ax + (bx - ax) * t, y + Math.sin(Math.PI * t) * sag];
  for (let i = 0; i < 80; i++) {
    const [x, yy] = at(i / 80);
    rect(c, Math.round(x), Math.round(yy), 1, 1, "#2a1a10");
  }
  for (let k = 1; k <= count; k++) {
    const [x, yy] = at(k / (count + 1));
    rect(c, Math.round(x), Math.round(yy), 1, 3, "#2a1a10");
    c.save();
    c.globalAlpha = 0.35;
    disc(c, x, yy + 7, 7, look.light);
    c.restore();
    sprite(c, [".kkk.", "rrorr", "royor", "royor", "rrorr", ".kkk."], { k: "#1a0f14", r: "#ee4f2c", o: "#ffa23f", y: "#ffe58c" }, Math.round(x) - 2, Math.round(yy) + 3);
  }
}

/** Lo que cambia con cada paisaje, pintado detrás de todo en la parte de abajo de la mesa. */
function paintMotif(c: Ctx, motif: number, pal: Pal, floor: Floor) {
  const look = pal.look;
  const random = seeded(motif * 97 + floor * 13 + 5);
  const far = pal.far;
  const mid = pal.mid;
  const glowColor = look.light;
  if (motif === 0) {
    // La aldea: tejados con ventanas encendidas.
    const roofs: [number, number, number][] = [
      [30, 300, 26],
      [74, 292, 30],
      [118, 304, 24],
      [160, 290, 32],
      [204, 300, 24],
    ];
    for (const [x, y, w] of roofs) {
      poly(c, [[x - w / 2 - 6, y], [x, y - 14], [x + w / 2 + 6, y]], far);
      rect(c, Math.round(x - w / 2), y, w, 34, mix(far, BLACK, 0.2));
      for (let k = 0; k < 2; k++) rect(c, Math.round(x - w / 4 + k * (w / 2) - 2), y + 8, 4, 5, rgba(glowColor, 0.75));
    }
  } else if (motif === 1) {
    // El santuario: un gran portal y faroles de piedra.
    const red = mix(look.grass, BLACK, 0.35);
    rect(c, 86, 254, 6, 80, red);
    rect(c, 146, 254, 6, 80, red);
    poly(c, [[70, 252], [168, 252], [172, 244], [66, 244]], red);
    rect(c, 80, 262, 78, 4, red);
    rect(c, 66, 244, 106, 2, mix(red, WHITE, 0.2));
    for (const x of [40, 196]) {
      rect(c, x - 3, 300, 6, 24, far);
      rect(c, x - 6, 296, 12, 4, far);
      rect(c, x - 2, 302, 4, 4, rgba(glowColor, 0.8));
    }
  } else if (motif === 2) {
    // El bosque de bambú.
    for (const x of [20, 38, 54, 182, 200, 216, 120]) {
      const color = x === 120 ? mix(far, pal.skyBottom, 0.5) : far;
      rect(c, x - 2, 230, 5, 160, color);
      for (let y = 240; y < 390; y += 22) rect(c, x - 3, y, 7, 2, mix(color, BLACK, 0.3));
      for (let k = 0; k < 4; k++) {
        const y = 236 + Math.floor(random() * 140);
        const d = random() < 0.5 ? -1 : 1;
        poly(c, [[x, y], [x + d * 14, y + 3], [x + d * 4, y + 5]], mix(color, look.grass, 0.25));
      }
    }
  } else if (motif === 3) {
    // El lago de los faroles: agua con reflejos y faroles flotando.
    for (let y = 300; y < 400; y += 3) {
      const [x0, x1] = spanOf(floor, y);
      rect(c, Math.round(x0), y, Math.round(x1 - x0), 1, rgba(look.edge, 0.12 + ((y / 3) % 2) * 0.06));
    }
    for (let i = 0; i < 26; i++) {
      const x = 16 + random() * 210;
      const y = 304 + random() * 90;
      rect(c, Math.round(x), Math.round(y), 4 + Math.floor(random() * 8), 1, rgba(glowColor, 0.45));
    }
    for (const [x, y] of [
      [40, 314],
      [96, 330],
      [150, 316],
      [196, 336],
    ]) {
      disc(c, x, y + 2, 6, rgba(glowColor, 0.25));
      rect(c, x - 3, y - 4, 6, 6, "#ee4f2c");
      rect(c, x - 2, y - 3, 4, 4, "#ffa23f");
      rect(c, x - 4, y + 2, 8, 1, "#2a1a10");
    }
  } else if (motif === 4) {
    // La cumbre nevada: montañas con nieve.
    const peaks: [number, number, number][] = [
      [40, 230, 60],
      [118, 206, 80],
      [196, 236, 60],
    ];
    for (const [x, y, w] of peaks) {
      poly(c, [[x - w, 340], [x, y], [x + w, 340]], far);
      poly(c, [[x - w * 0.28, y + 22], [x, y], [x + w * 0.28, y + 22], [x + 6, y + 16], [x - 4, y + 20]], mix(look.edge, WHITE, 0.55));
    }
    for (let i = 0; i < 40; i++) rect(c, 12 + Math.floor(random() * 220), 180 + Math.floor(random() * 200), 1, 1, rgba(WHITE, 0.7));
  } else {
    // El cuarto del jacuzzi: azulejos, burbujas y vapor.
    for (let y = 280; y < 400; y += 12) {
      const [x0, x1] = spanOf(floor, y);
      rect(c, Math.round(x0), y, Math.round(x1 - x0), 1, rgba(look.edge, 0.22));
    }
    for (let x = 16; x < 230; x += 12) rect(c, x, 280, 1, 120, rgba(look.edge, 0.18));
    for (let i = 0; i < 30; i++) {
      const x = 16 + random() * 210;
      const y = 250 + random() * 140;
      const r = 1.5 + random() * 3;
      annulus(c, x, y, r - 1, r, rgba(look.light, 0.55));
    }
  }
}

/* ---------- La mesa principal: lo que no se mueve ---------- */

const APRON_L: [number, number][] = [
  [28, 361],
  [72, 388],
  [80, 402],
  [94, 412],
  [100, 448],
  [28, 448],
];
const APRON_R: [number, number][] = APRON_L.map(([x, y]) => [236 - x, y]);

/** Una guía de metal: sombra, borde oscuro, cuerpo de acero y un brillo arriba. */
function metalGuide(c: Ctx, s: { ax: number; ay: number; bx: number; by: number; r: number }, pass: number) {
  const w = Math.max(3, s.r * 2 + 1);
  if (pass === 0) {
    c.save();
    c.globalAlpha = 0.4;
    thick(c, s.ax + 2, s.ay + 3, s.bx + 2, s.by + 3, w + 1, BLACK);
    c.restore();
  } else if (pass === 1) thick(c, s.ax, s.ay, s.bx, s.by, w + 1.6, "#0a0710");
  else if (pass === 2) thick(c, s.ax, s.ay, s.bx, s.by, w, STEEL);
  else {
    const len = Math.hypot(s.bx - s.ax, s.by - s.ay) || 1;
    const nx = -(s.by - s.ay) / len;
    const ny = (s.bx - s.ax) / len;
    // El brillo va del lado que mira hacia arriba a la izquierda.
    const k = nx * -0.6 + ny * -0.8 > 0 ? 1 : -1;
    hair(c, s.ax + nx * k * (w / 2 - 1), s.ay + ny * k * (w / 2 - 1), s.bx + nx * k * (w / 2 - 1), s.by + ny * k * (w / 2 - 1), STEEL_HI);
  }
}

/** Un poste de goma con centro de metal. */
function rubberPost(c: Ctx, x: number, y: number, r = 3) {
  disc(c, x + 1, y + 2, r + 1, rgba(BLACK, 0.4));
  disc(c, x, y, r + 1, "#0a0710");
  disc(c, x, y, r, "#e8e2d4");
  disc(c, x, y, r - 1.2, STEEL);
  c.fillStyle = WHITE;
  c.fillRect(Math.round(x - r * 0.5), Math.round(y - r * 0.5), 1, 1);
}

/** El plástico de un rebotador: color translúcido con un dibujo, y la goma blanca. */
function slingPlastic(c: Ctx, a: [number, number], b: [number, number], d: [number, number], look: Look, star: boolean) {
  poly(c, [a, b, d], "#0a0710");
  const inset = (p: [number, number]): [number, number] => [p[0] + ((a[0] + b[0] + d[0]) / 3 - p[0]) * 0.18, p[1] + ((a[1] + b[1] + d[1]) / 3 - p[1]) * 0.18];
  const ia = inset(a);
  const ib = inset(b);
  const id = inset(d);
  poly(c, [ia, ib, id], mix(look.edge, BLACK, 0.25));
  // Tramado de luz dentro del plástico.
  const minX = Math.floor(Math.min(ia[0], ib[0], id[0]));
  const maxX = Math.ceil(Math.max(ia[0], ib[0], id[0]));
  const minY = Math.floor(Math.min(ia[1], ib[1], id[1]));
  const maxY = Math.ceil(Math.max(ia[1], ib[1], id[1]));
  c.fillStyle = mix(look.edge, WHITE, 0.4);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const inside = side(ia[0], ia[1], ib[0], ib[1], x, y) === side(ia[0], ia[1], ib[0], ib[1], id[0], id[1]) && side(ib[0], ib[1], id[0], id[1], x, y) === side(ib[0], ib[1], id[0], id[1], ia[0], ia[1]) && side(id[0], id[1], ia[0], ia[1], x, y) === side(id[0], id[1], ia[0], ia[1], ib[0], ib[1]);
      if (inside && dither(x, y, 0.22 + ((y - minY) / (maxY - minY + 1)) * 0.2)) c.fillRect(x, y, 1, 1);
    }
  }
  // El dibujo: una estrella o una flor en el medio.
  const cx = (ia[0] + ib[0] + id[0]) / 3;
  const cy = (ia[1] + ib[1] + id[1]) / 3;
  if (star) sprite(c, ["...#...", "..###..", "#######", ".#####.", ".##.##."], { "#": look.light }, Math.round(cx) - 3, Math.round(cy) - 2);
  else sprite(c, [".p.p.", "ppppp", ".pyp.", "ppppp", ".p.p."], { p: "#f58fbd", y: "#ffd95e" }, Math.round(cx) - 2, Math.round(cy) - 2);
}

function paintMainBase(c: Ctx, world: number) {
  const look = lookOf(world);
  const pal = paletteOf(look);
  const motif = shownWorld(world);
  paintCabinet(c, pal);
  paintSky(c, 0, pal.skyTop, pal.skyBottom);
  paintStars(c, 0, 900 + motif, 150, look, 62, 300);
  // Constelación arriba a la derecha.
  const constellation: [number, number][] = [
    [150, 96],
    [168, 112],
    [186, 104],
    [200, 122],
    [214, 116],
  ];
  for (let i = 1; i < constellation.length; i++) hair(c, constellation[i - 1][0], constellation[i - 1][1], constellation[i][0], constellation[i][1], rgba(look.edge, 0.5));
  for (const [x, y] of constellation) {
    rect(c, x - 1, y, 3, 1, look.light);
    rect(c, x, y - 1, 1, 3, look.light);
  }
  // Las dos lunas del fondo: una grande detrás de los bumpers y otra chica.
  paintMoon(c, 126, 150, 48, mix(look.light, "#fff7e0", 0.55), mix(look.edge, pal.skyTop, 0.35), 0.38);
  paintMoon(c, 214, 84, 9, "#ffd0e8", mix("#ff8ac4", pal.skyTop, 0.5), 0.7);
  paintMotif(c, motif, pal, 0);
  // Ramas de cerezo a los lados.
  paintBranch(c, LEFT + 1, 300, 1, 22, pal, 71 + motif);
  paintBranch(c, LANE_WALL - 1, 292, -1, 22, pal, 33 + motif);
  paintLanternString(c, ORBIT_L + 4, ORBIT_R - 4, 112, 7, 7, look);

  // Pisos de las órbitas y del carril: más oscuros, con flechas pintadas.
  for (let y = DMD_H; y < 262; y++) {
    const [x0, x1] = tableSpan(y);
    if (y >= 104) rect(c, Math.ceil(Math.max(x0, LEFT)), y, Math.max(0, ORBIT_L - Math.ceil(Math.max(x0, LEFT))), 1, rgba(BLACK, 0.28));
    if (y >= 104) rect(c, ORBIT_R, y, Math.max(0, Math.min(x1, LANE_WALL) - ORBIT_R), 1, rgba(BLACK, 0.28));
  }
  rect(c, LANE_WALL, 178, RIGHT - LANE_WALL, HT - 178, "#0b0812");
  for (let y = 200; y < 410; y += 18) poly(c, [[LANE_X, y], [LANE_X - 5, y + 6], [LANE_X + 5, y + 6]], rgba(look.edge, 0.35));
  // Faroles de arriba: el piso de cada carril y su botón.
  for (let i = 0; i < LANES.length; i++) {
    rect(c, LANES[i] - 9, 86, 18, 22, rgba(BLACK, 0.3));
  }
  // Los anillos del imán.
  for (let r = 18; r > 6; r -= 4) annulus(c, MAGNET.x, MAGNET.y, r - 1.5, r, rgba(look.edge, 0.35));
  disc(c, MAGNET.x, MAGNET.y, 7, "#0a0710");
  disc(c, MAGNET.x, MAGNET.y, 6, mix(STEEL_LO, look.edge, 0.3));
  // La base del disco giratorio.
  disc(c, DISC.x + 2, DISC.y + 3, DISC.r + 2, rgba(BLACK, 0.4));
  disc(c, DISC.x, DISC.y, DISC.r + 2, "#0a0710");
  annulus(c, DISC.x, DISC.y, DISC.r, DISC.r + 1.5, STEEL);
  // La placa del templo: nombre, multiplicador y rangos.
  paintPlaque(c, pal);
  // Plataformas de abajo: metal con remaches y las palabras de la mesa.
  for (const plate of [APRON_L, APRON_R]) {
    poly(c, plate.map(([x, y]) => [x + 2, y + 3] as [number, number]), rgba(BLACK, 0.4));
    poly(c, plate, "#0a0710");
    const inner = plate.map(([x, y]) => [x + (x < 118 ? 1.5 : -1.5), y + 1.5] as [number, number]);
    poly(c, inner, "#3a3248");
    for (let y = 392; y < 448; y += 2) {
      const [x0, x1] = [Math.min(...inner.map((p) => p[0])), Math.max(...inner.map((p) => p[0]))];
      for (let x = Math.round(x0); x < x1; x += 2) if (dither(x, y, 0.3)) rect(c, x, y, 1, 1, "#4c4460");
    }
  }
  rect(c, 100, 440, 36, 8, "#0a0710");
  label(c, "DOS", 58, 424, mix(look.light, WHITE, 0.3), 1, "#0a0710");
  label(c, "LUNAS", 178, 424, mix(look.light, WHITE, 0.3), 1, "#0a0710");
  for (const [x, y] of [
    [40, 438],
    [86, 438],
    [150, 438],
    [196, 438],
  ]) {
    disc(c, x, y, 1.6, STEEL_LO);
    rect(c, x - 1, y - 1, 1, 1, STEEL_HI);
  }
  // Rebotadores con su plástico.
  slingPlastic(c, [48, 318], [48, 354], [70, 368], look, true);
  slingPlastic(c, [188, 318], [188, 354], [166, 368], look, false);
  // Paredes de metal (en cuatro pasadas: sombra, borde, cuerpo, brillo).
  const guides = SEGS.filter((s) => s.kind === "wall" || s.kind === "flap");
  for (let pass = 0; pass < 4; pass++) for (const s of guides) metalGuide(c, s, pass);
  // La compuerta de un solo sentido arriba del carril.
  thick(c, LANE_WALL, 178, 246.5, 158, 3, "#0a0710");
  thick(c, LANE_WALL, 178, 246.5, 158, 1.5, GOLD);
  // Postes de goma en las puntas de las guías.
  for (const m of MOUTHS) {
    rubberPost(c, m.x0, m.y + 16);
    if (m.id !== "rramp") rubberPost(c, m.x1, m.y + 16);
  }
  for (const x of DIVIDERS) rubberPost(c, x, 88, 3);
  for (const [x, y] of [
    [ORBIT_L, 254],
    [ORBIT_R, 254],
    [42, 292],
    [194, 292],
    [28, 330],
    [208, 330],
    [WALL.bx, 156],
    [181, 156],
    [195, 156],
  ] as const)
    rubberPost(c, x, y, x === 181 || x === 195 ? 2 : 3);
  // Gomas blancas de los rebotadores.
  thick(c, 48, 318, 70, 368, 3, "#f1ece0");
  thick(c, 188, 318, 166, 368, 3, "#f1ece0");
  // Bocas: los objetivos que caen tienen su ranura; la muralla, su canaleta.
  for (const d of DROPS) rect(c, Math.round(d.x) - 2, d.y0, 4, d.y1 - d.y0, "#06040a");
  rect(c, WALL.ax, WALL.y - 1, WALL.bx - WALL.ax, 3, "#06040a");
  // El canal de la bola cautiva: vidrio oscuro.
  rect(c, 180, 101, 16, 51, rgba(BLACK, 0.45));
  for (let y = 104; y < 150; y += 6) rect(c, 182, y, 12, 1, rgba(look.edge, 0.25));
  // El girador de la órbita izquierda: su soporte.
  rect(c, LEFT + 1, SPIN_Y - 1, 4, 3, STEEL_LO);
  rect(c, ORBIT_L - 4, SPIN_Y - 1, 3, 3, STEEL_LO);
  // Luces apagadas (vidrio de color oscuro).
  for (const lamp of LAMPS) {
    const image = lampImage(lamp, false);
    if (image) blit(c, image, lamp.x, lamp.y);
  }
  // Letreros de las bocas.
  label(c, "SALVA", 118, 432, mix(look.edge, "#100a18", 0.5), 1, null);
}

/** La placa de madera del templo, con letras, multiplicadores y rangos apagados. */
const PLAQUE = { x: 74, y: 322, w: 88, h: 40 };
function paintPlaque(c: Ctx, pal: Pal) {
  const { x, y, w, h } = PLAQUE;
  rect(c, x + 2, y + 3, w, h, rgba(BLACK, 0.45));
  rect(c, x - 1, y - 1, w + 2, h + 2, "#0a0710");
  rect(c, x, y, w, h, "#4a2410");
  for (let j = 0; j < h; j += 3) rect(c, x, y + j, w, 1, "#5a2e14");
  rect(c, x + 2, y + 2, w - 4, h - 4, "#2a120a");
  rect(c, x + 2, y + 2, w - 4, 1, GOLD);
  rect(c, x + 2, y + h - 3, w - 4, 1, mix(GOLD, BLACK, 0.4));
  // Tejadito encima de la placa.
  poly(c, [[x - 8, y + 1], [x + w / 2, y - 9], [x + w + 8, y + 1]], "#0a0710");
  poly(c, [[x - 5, y], [x + w / 2, y - 7], [x + w + 5, y]], mix(pal.look.grass, BLACK, 0.3));
  for (let i = 2; i <= 5; i++) label(c, `X${i}`, multX(i), 342, mix(GOLD, "#2a120a", 0.65), 1, null);
  for (let i = 0; i < RANKS.length; i++) rect(c, rankX(i), 354, 6, 3, "#3d2a1c");
}
const multX = (i: number) => PLAQUE.x + 14 + (i - 2) * 20;
const rankX = (i: number) => PLAQUE.x + 8 + i * 8.4;

/** Las rampas y alambres que pasan por encima de la mesa (con su sombra). */
function paintMainOver(c: Ctx, world: number) {
  const look = lookOf(world);
  const shadowAll = (id: PathId, width: number) => {
    const p = PATHS[id];
    c.save();
    c.globalAlpha = 0.22;
    strokePath(c, p.points, width, BLACK, 3 + p.level * 2, 4 + p.level * 3);
    c.restore();
  };
  for (const id of RAMP_IDS) shadowAll(id, id === "lramp" || id === "cramp" ? 14 : 8);
  shadowAll("wireOrbit", 6);
  // El riel del lanzador, bajo el arco.
  paintWire(c, PATHS.wireOrbit.points.slice(1), look, 1);
  // La espiral (plástico hasta la cima y alambre de bajada).
  const cramp = PATHS.cramp;
  const cTop = cramp.points.findIndex((_, i) => cramp.at[i] >= cramp.climb);
  paintWire(c, cramp.points.slice(cTop - 2), look, 1);
  paintPlastic(c, cramp.points.slice(0, cTop + 1), look, SHOT_COLORS.cramp);
  // La rampa del cielo: plástico hasta la cima, y un alambre alto que cruza la mesa.
  const lramp = PATHS.lramp;
  const lTop = lramp.points.findIndex((_, i) => lramp.at[i] >= lramp.climb);
  paintPlastic(c, lramp.points.slice(0, lTop + 1), look, SHOT_COLORS.lramp);
  paintWire(c, lramp.points.slice(lTop - 1), look, 2);
  // El rulo y la rampa de alambre.
  paintWire(c, PATHS.loop.points, look, 2, SHOT_COLORS.loop);
  paintWire(c, PATHS.rramp.points, look, 2, SHOT_COLORS.rramp);
  // El tubo de cristal que baja de la cámara a la luna.
  const tube = PATHS.drop.points;
  c.save();
  c.globalAlpha = 0.35;
  strokePath(c, tube, 12, mix(look.edge, WHITE, 0.3));
  c.restore();
  strokePath(c, tube, 2, rgba(WHITE, 0.5), -5, 0);
  // Las entradas de las rampas: un labio de metal y el letrero.
  for (const m of MOUTHS) {
    const y = m.y - 2;
    thick(c, m.x0 + 1, y, m.x1 - 1, y, 3, "#0a0710");
    thick(c, m.x0 + 1, y, m.x1 - 1, y, 1.5, STEEL_HI);
  }
  // Letreros de plástico sobre las rampas.
  label(c, "CIELO", 82, 128, SHOT_COLORS.lramp, 1, "#0a0710");
  label(c, "RULO", 175, 140, SHOT_COLORS.loop, 1, "#0a0710");
}

/** Una rampa de plástico transparente con bordes que brillan y costillas. */
function paintPlastic(c: Ctx, points: [number, number][], look: Look, tint: string, width = 18) {
  // El plástico se pinta parejo en otro lienzo y se pone transparente de una vez (sin manchas).
  const sheet = hasCanvas() ? makeCanvas(W, HT) : null;
  const s = sheet ? (sheet.getContext("2d") as Ctx) : c;
  strokePath(s, points, width, mix(tint, WHITE, 0.25));
  for (let i = 3; i < points.length; i += 3) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (-(by - ay) / len) * (width / 2 - 1);
    const ny = ((bx - ax) / len) * (width / 2 - 1);
    hair(s, bx + nx, by + ny, bx - nx, by - ny, mix(tint, WHITE, 0.3));
  }
  if (sheet) {
    c.save();
    c.globalAlpha = 0.3;
    c.drawImage(sheet, 0, 0);
    c.restore();
  }
  // Bordes: una línea oscura y otra brillante a cada lado.
  for (const k of [-1, 1]) {
    const edge: [number, number][] = points.map((p, i) => {
      const [ax, ay] = points[Math.max(0, i - 1)];
      const [bx, by] = points[Math.min(points.length - 1, i + 1)];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      return [p[0] + (-(by - ay) / len) * (width / 2) * k, p[1] + ((bx - ax) / len) * (width / 2) * k];
    });
    strokePath(c, edge, 3, "#0a0710");
    strokePath(c, edge, 1.4, k < 0 ? mix(tint, WHITE, 0.55) : tint);
  }
}

/** Un riel de dos alambres de metal, con sus soportes. */
function paintWire(c: Ctx, points: [number, number][], look: Look, level: number, tint?: string) {
  const offset = (k: number) =>
    points.map((p, i) => {
      const [ax, ay] = points[Math.max(0, i - 1)];
      const [bx, by] = points[Math.min(points.length - 1, i + 1)];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      return [p[0] + (-(by - ay) / len) * k, p[1] + ((bx - ax) / len) * k] as [number, number];
    });
  const left = offset(-4);
  const right = offset(4);
  // Soportes cada tanto: un poste con sombra.
  for (let i = 4; i < points.length - 2; i += 7) {
    const [x, y] = points[i];
    thick(c, x, y, x + level * 2, y + level * 3, 2, "#2a2436");
  }
  for (const line of [left, right]) strokePath(c, line, 2.6, "#0a0710");
  for (const line of [left, right]) strokePath(c, line, 1.3, tint ? mix(STEEL, tint, 0.35) : STEEL);
  strokePath(c, left, 0.8, STEEL_HI, -0.5, -0.5);
  // Abrazaderas entre los dos alambres.
  for (let i = 2; i < points.length - 1; i += 4) hair(c, left[i][0], left[i][1], right[i][0], right[i][1], rgba(STEEL, 0.75));
  void look;
}

/** La escalera a la cámara, que sigue derecho hacia arriba desde la cima de la espiral (sólo se ve abierta). */
function paintStairs(c: Ctx, world: number) {
  const look = lookOf(world);
  const p = PATHS.stairs;
  const points = p.points.slice(p.points.findIndex((_, i) => p.at[i] >= p.climb));
  c.save();
  c.globalAlpha = 0.16;
  strokePath(c, points, 12, BLACK, 5, 7);
  c.restore();
  paintPlastic(c, points, look, GOLD, 14);
}

/* ---------- Pisos de arriba: lo que no se mueve ---------- */

function paintUpperBase(c: Ctx, world: number, floor: Floor) {
  const look = lookOf(world);
  const pal = paletteOf(look);
  paintCabinet(c, pal);
  // Los costados de los pisos de arriba son paneles oscuros.
  for (let y = DMD_H; y < HT; y++) {
    const [x0, x1] = spanOf(floor, y);
    rect(c, LEFT - 1, y, Math.max(0, Math.floor(x0) - LEFT + 1), 1, "#120c18");
    rect(c, Math.ceil(x1), y, Math.max(0, RIGHT + 1 - Math.ceil(x1)), 1, "#120c18");
  }
  if (floor === 1) {
    paintSky(c, 1, "#04031a", mix("#1c1a58", look.wall, 0.4));
    // Nebulosa: manchas tramadas de color.
    const random = seeded(world * 131 + 17);
    for (let i = 0; i < 6; i++) {
      const x = 50 + random() * 156;
      const y = 120 + random() * 220;
      const r = 20 + random() * 30;
      c.fillStyle = rgba(i % 2 ? look.edge : "#b996ff", 0.5);
      for (let j = -r; j < r; j++) for (let k = -r; k < r; k++) if (k * k + j * j < r * r && dither(Math.round(x + k), Math.round(y + j), 0.12 * (1 - Math.hypot(k, j) / r))) c.fillRect(Math.round(x + k), Math.round(y + j), 1, 1);
    }
    paintStars(c, 1, world * 7 + 3, 260, look, 60, 420);
    // Las líneas de la constelación entre las estrellas-bumper.
    for (let i = 1; i < STAR_SPOTS.length; i++) {
      const [ax, ay] = STAR_SPOTS[i - 1];
      const [bx, by] = STAR_SPOTS[i];
      hair(c, ax, ay, bx, by, rgba(look.light, 0.35));
    }
    hair(c, STAR_SPOTS[0][0], STAR_SPOTS[0][1], STAR_SPOTS[4][0], STAR_SPOTS[4][1], rgba(look.light, 0.2));
    // Una gran luna creciente abajo.
    paintMoon(c, 128, 330, 34, "#fff1b8", "#3a3470", 0.55);
    disc(c, 142, 318, 30, mix("#1c1a58", look.wall, 0.4));
    // Anillos del imán.
    for (let r = 22; r > 6; r -= 5) annulus(c, UPPER_MAGNET.x, UPPER_MAGNET.y, r - 1.5, r, rgba("#8ff3ff", 0.3));
    disc(c, UPPER_MAGNET.x, UPPER_MAGNET.y, 7, "#0a0710");
    disc(c, UPPER_MAGNET.x, UPPER_MAGNET.y, 6, STEEL_LO);
    // La puerta secreta: un círculo de piedra.
    disc(c, DOOR.x, DOOR.y, 12, "#0a0710");
    annulus(c, DOOR.x, DOOR.y, 9, 11, STEEL);
  } else {
    paintSky(c, 2, "#1a0618", mix("#4a1c4e", look.wall, 0.3));
    paintStars(c, 2, world * 5 + 9, 120, look, 60, 260);
    paintMoon(c, 128, 150, 40, "#ffd0e8", "#7a2a5a", 0.4);
    paintBranch(c, UL + 1, 230, 1, 30, pal, 5);
    paintBranch(c, UR - 1, 210, -1, 30, pal, 9);
    paintBranch(c, UL + 1, 120, 1, 18, pal, 12);
    paintBranch(c, UR - 1, 130, -1, 18, pal, 14);
    // El estanque de abajo.
    ellipse(c, 128, 320, 70, 22, rgba("#7ff6ff", 0.15));
    for (let y = 304; y < 338; y += 4) rect(c, 76 + ((y * 7) % 20), y, 60, 1, rgba("#ffd0e8", 0.35));
  }
  // Rebotadores con plástico.
  slingPlastic(c, [44, 296], [44, 332], [66, 348], look, floor === 1);
  slingPlastic(c, [212, 296], [212, 332], [190, 348], look, floor === 1);
  const guides = FLOOR_SEGS[floor].filter((s) => s.kind === "wall");
  for (let pass = 0; pass < 4; pass++) for (const s of guides) metalGuide(c, s, pass);
  thick(c, 44, 296, 66, 348, 3, "#f1ece0");
  thick(c, 212, 296, 190, 348, 3, "#f1ece0");
  // La salida de abajo: el tubo que baja a la mesa.
  rect(c, 104, 426, 48, 22, "#0a0710");
  rect(c, 108, 428, 40, 20, mix(look.wall, BLACK, 0.3));
  label(c, "↓", 128, 432, look.edge, 1, null);
  // El tubo por donde llega la bola.
  const entry = floor === 1 ? PATHS.upperIn.points : PATHS.secretIn.points;
  thick(c, entry[0][0], DMD_H, entry[1][0], entry[1][1] - 6, 12, "#0a0710");
  thick(c, entry[0][0], DMD_H, entry[1][0], entry[1][1] - 6, 9, mix(look.edge, BLACK, 0.4));
  hair(c, entry[0][0] - 3, DMD_H, entry[1][0] - 3, entry[1][1] - 8, rgba(WHITE, 0.4));
}

/** Las capas quietas ya pintadas, guardadas por piso y paisaje (en la memoria del navegador). */
function layer(name: string, world: number, paint: (c: Ctx) => void) {
  return cached(`layer:${name}:${shownWorld(world)}:${lookOf(world).edge}`, W, HT, paint);
}

/* ---------- Piezas que se mueven: dibujos guardados ---------- */

/** La cara de la luna: boca de 0 (cerrada) a 4 (muy abierta), ojos y cachetes (bolas guardadas). */
function moonImage(open: number, eyes: "open" | "closed" | "happy", cheeks: number, look: Look) {
  return cached(`moonface:${open}:${eyes}:${cheeks}:${look.light}`, 60, 60, (c) => {
    const o = 30;
    const r = 21;
    disc(c, o, o, r + 2, "#0a0710");
    disc(c, o, o, r, "#f3dc8a");
    disc(c, o - 2, o - 2, r - 3, "#fff1b8");
    // Sombra tramada abajo a la derecha y cráteres.
    c.fillStyle = "#e2c87a";
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j < r * r && (i * 0.6 + j * 0.8) / r > 0.35 && dither(i + 40, j + 40, 0.5)) c.fillRect(o + i, o + j, 1, 1);
    for (const [x, y, cr] of [
      [-11, -8, 3],
      [10, -12, 2],
      [13, 4, 2.5],
      [-14, 6, 1.6],
    ] as const) {
      disc(c, o + x, o + y, cr, "#e2c87a");
      disc(c, o + x - 0.5, o + y - 0.5, cr * 0.6, "#f6e3a0");
    }
    disc(c, o - 9, o - 11, 3, WHITE);
    // Ojos.
    const eye = (x: number) => {
      if (eyes === "open") {
        ellipse(c, o + x, o - 4, 2.6, 3.4, "#2a1a10");
        rect(c, o + x - 1, o - 6, 1, 1, WHITE);
      } else if (eyes === "happy") {
        hair(c, o + x - 3, o - 3, o + x, o - 6, "#2a1a10");
        hair(c, o + x, o - 6, o + x + 3, o - 3, "#2a1a10");
      } else {
        hair(c, o + x - 3, o - 4, o + x + 3, o - 4, "#2a1a10");
        hair(c, o + x - 3, o - 3, o + x + 3, o - 3, "#2a1a10");
      }
    };
    eye(-7);
    eye(7);
    // Cachetes: uno encendido por bola guardada.
    for (let k = 0; k < 2; k++) {
      const x = k ? 12 : -12;
      ellipse(c, o + x, o + 3, 3.5, 2, k < cheeks ? "#ff7a8a" : "#f0c08a");
    }
    // La boca.
    if (open === 0) {
      hair(c, o - 5, o + 9, o, o + 11, "#2a1a10");
      hair(c, o, o + 11, o + 5, o + 9, "#2a1a10");
    } else {
      const w = 4 + open * 2;
      const h = 2 + open * 2.2;
      ellipse(c, o, o + 11, w + 1, h + 1, "#2a1a10");
      ellipse(c, o, o + 11, w, h, "#120610");
      ellipse(c, o, o + 11 + h * 0.5, w * 0.6, h * 0.4, "#c8324a");
      rect(c, o - 3, Math.round(o + 11 - h), 2, 2, WHITE);
      rect(c, o + 1, Math.round(o + 11 - h), 2, 2, WHITE);
    }
    void look;
  });
}

/** La muralla de piedra (se ve más o menos según cuánto subió). */
function wallImage(look: Look, hits: number) {
  const w = WALL.bx - WALL.ax + 4;
  return cached(`wall:${look.edge}:${hits}`, w, 16, (c) => {
    rect(c, 0, 0, w, 16, "#0a0710");
    const stone = mix(look.wall, "#8a8478", 0.45);
    for (let row = 0; row < 3; row++) {
      for (let k = -1; k < 8; k++) {
        const x = 1 + k * 8 + (row % 2) * 4;
        const x0 = Math.max(1, x);
        const x1 = Math.min(w - 1, x + 7);
        if (x1 <= x0) continue;
        rect(c, x0, 1 + row * 5, x1 - x0, 4, stone);
        rect(c, x0, 1 + row * 5, x1 - x0, 1, mix(stone, WHITE, 0.35));
      }
    }
    // Tres luces en la cima: los golpes que faltan.
    for (let i = 0; i < 2; i++) {
      disc(c, w / 2 - 6 + i * 12, 3, 2, "#0a0710");
      disc(c, w / 2 - 6 + i * 12, 3, 1.4, i < hits ? GOLD : HEART);
    }
  });
}

/** El disco giratorio: brazos de colores en espiral (8 posiciones). */
function discImage(frame: number, look: Look, lit: boolean) {
  const size = DISC.r * 2 + 2;
  return cached(`disc:${frame}:${look.edge}:${lit}`, size, size, (c) => {
    const o = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - o;
        const dy = y + 0.5 - o;
        const d = Math.hypot(dx, dy);
        if (d > DISC.r) continue;
        const a = Math.atan2(dy, dx) + d * 0.22 + (frame / 8) * (Math.PI / 2);
        const arm = Math.floor(((a % (Math.PI / 2)) + Math.PI / 2) / (Math.PI / 4)) % 2;
        c.fillStyle = d > DISC.r - 1.2 ? "#0a0710" : arm ? (lit ? look.light : look.edge) : mix(look.wall, BLACK, 0.3);
        c.fillRect(x, y, 1, 1);
      }
    }
    disc(c, o, o, 3, STEEL_LO);
    disc(c, o - 0.5, o - 0.5, 2, STEEL_HI);
  });
}

function dropImage(up: boolean, lit: boolean) {
  return cached(`drop:${up}:${lit}`, 10, 18, (c) => {
    if (!up) {
      rect(c, 3, 1, 4, 16, "#2a1a24");
      rect(c, 3, 1, 4, 1, lit ? "#ff7a8a" : "#5a2a3a");
      return;
    }
    rect(c, 1, 0, 8, 18, "#0a0710");
    rect(c, 2, 1, 6, 16, "#ff7a8a");
    rect(c, 2, 1, 2, 16, "#ffb0bc");
    rect(c, 7, 1, 1, 16, "#c8324a");
    rect(c, 2, 8, 6, 2, lit ? WHITE : "#ffe0e4");
  });
}

function catImage(lit: boolean) {
  return cached(`cat:${lit}`, 10, 18, (c) => {
    rect(c, 1, 0, 8, 18, "#0a0710");
    rect(c, 2, 1, 6, 16, lit ? GOLD : "#5d5790");
    rect(c, 7, 1, 1, 16, lit ? "#c89040" : "#3a3460");
    sprite(c, ["k...k", "kk.kk", "kwkwk", ".kpk."], { k: lit ? "#3a2410" : "#2a2450", w: lit ? WHITE : "#5d5790", p: HEART }, 2, 6);
  });
}

function starImage(lit: boolean, on: boolean, r: number) {
  const size = r * 2 + 8;
  return cached(`star:${lit}:${on}:${r}`, size, size, (c) => {
    const o = size / 2;
    const pts = (k: number) => {
      const out: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = (i % 2 ? r * 0.5 : r + 2) + k;
        out.push([o + Math.cos(a) * rr, o + Math.sin(a) * rr]);
      }
      return out;
    };
    poly(c, pts(1.5), "#0a0710");
    poly(c, pts(0), on ? GOLD : lit ? INK : "#2a2860");
    poly(c, pts(-2.5), on ? "#fff1b8" : lit ? WHITE : "#3e3c88");
    disc(c, o - 1, o - 2, 1.5, on || lit ? WHITE : "#5a58a8");
  });
}

function spiritImage(hit: boolean) {
  const rows = bigSpirit();
  const colors = hit ? { "#": GOLD, e: NIGHT } : SPIRIT_COLORS[0];
  return cached(`spirit:${rows.join("")}:${JSON.stringify(colors)}`, 18, 18, (c) => {
    sprite(c, rows, { "#": "#0a0710", e: "#0a0710" }, 0, 1);
    sprite(c, rows, { "#": "#0a0710", e: "#0a0710" }, 2, 1);
    sprite(c, rows, { "#": "#0a0710", e: "#0a0710" }, 1, 0);
    sprite(c, rows, { "#": "#0a0710", e: "#0a0710" }, 1, 2);
    sprite(c, rows, colors, 1, 1);
  });
}

function lanternImage(on: boolean) {
  return cached(`lantern:${on}`, 12, 16, (c) => {
    const awake = [".kkk.", "rrorr", "rkykr", "royor", "rokor", "rrorr", ".kkk."];
    const asleep = [".kkk.", "rrorr", "royor", "rkykr", "royor", "rrorr", ".kkk."];
    const colors = on ? { k: "#1a0f14", r: "#ee4f2c", o: "#ffa23f", y: "#ffe58c" } : { k: "#1a0f14", r: "#5a2a32", o: "#7a4a3c", y: "#8a6a50" };
    sprite(c, on ? awake : asleep, { k: "#0a0710", r: "#0a0710", o: "#0a0710", y: "#0a0710" }, 1, 2, 2);
    sprite(c, on ? awake : asleep, colors, 1, 1, 2);
  });
}

/** Una franja de luz que recorre la mesa en los espectáculos. */
function sweepImage(color: string) {
  return cached(`sweep:${color}`, LANE_WALL - LEFT, 64, (c) => {
    const gradient = c.createLinearGradient(0, 0, 0, 64);
    gradient.addColorStop(0, rgba(color, 0));
    gradient.addColorStop(0.5, rgba(color, 0.32));
    gradient.addColorStop(1, rgba(color, 0));
    c.fillStyle = gradient;
    c.fillRect(0, 0, LANE_WALL - LEFT, 64);
  });
}

/* ---------- Luces encendidas ---------- */

const blinkAt = (time: number, rate: number, still: boolean) => still || Math.floor(time * rate) % 2 === 0;

/** ¿Está encendida esta luz? 0 apagada, 1 encendida. */
function lampLit(state: State, id: string, time: number, still: boolean): boolean {
  const blink = (rate: number) => blinkAt(time, rate, still);
  const want = (ev: Ev) => wantsNow(state, ev) && blink(3);
  const jack = state.multiball && state.jackpotLit;
  const relight = state.multiball && !state.jackpotLit;
  switch (id) {
    case "lorbit":
      return state.flash.orbit[0] > 0 || want("orbit") || want("combo") || want("spin") || (relight && blink(4));
    case "rorbit":
      return state.flash.orbit[1] > 0 || want("orbit") || want("combo") || (relight && blink(4));
    case "lramp":
    case "rramp":
      return state.flash.ramps[id] > 0 || want("ramp") || want("combo") || (jack && blink(5));
    case "cramp":
      return state.flash.ramps.cramp > 0 || want("ramp") || want("upper") || (state.stairs && blink(2)) || (jack && blink(5));
    case "loop":
      return state.flash.ramps.loop > 0 || want("loop") || want("combo") || (relight && blink(4));
    case "moon":
      return state.flash.moon > 0 || ((state.active < 0 && !state.multiball) || wantsNow(state, "moon") || state.lockLit || state.extraLit || state.superLit ? blink(3) : false);
    case "drop0":
    case "drop1":
    case "drop2": {
      const i = Number(id[4]);
      return state.drops[i] || state.flash.drops[i] > 0 || (want("drops") && !state.drops[i]);
    }
    case "lock0":
    case "lock1": {
      const i = Number(id[4]);
      return i < state.locked || (state.lockLit && i === state.locked && blink(3));
    }
    case "extra":
      return state.extraLit && blink(3);
    case "captive":
      return state.flash.captive > 0 || want("captive") || (!state.magnetLit && blink(1));
    case "stairs":
      return state.stairs && blink(2);
    case "kick":
      return state.kickback;
    case "magnet":
      return state.magnetLit || state.flash.magnet > 0 || want("magnet");
    default:
      return false;
  }
}

/** En los espectáculos de luces, ¿esta luz se prende por la fiesta? */
function partyLit(state: State, index: number, y: number, time: number, still: boolean) {
  if (still || !(state.party > 0 || state.multiball)) return false;
  const kind = state.party > 0 ? state.partyKind : "chase";
  if (kind === "strobe") return Math.floor(time * 8) % 2 === 0;
  if (kind === "sweep") return Math.abs(y - sweepY(time)) < 26;
  return Math.floor(time * 12 - index) % 6 === 0;
}
const sweepY = (time: number) => 470 - ((time * 340) % 560);

/* ---------- La mesa principal en cada cuadro ---------- */

function drawMain(c: Ctx, state: State, world: number, time: number, still: boolean) {
  const look = lookOf(world);
  const base = layer("main", world, (g) => paintMainBase(g, world));
  if (base) c.drawImage(base, 0, 0);
  else {
    rect(c, 0, 0, W, HT, "#0d0710");
    rect(c, LEFT, DMD_H, LANE_WALL - LEFT, HT - DMD_H, look.ground);
  }
  const blink = (rate: number) => blinkAt(time, rate, still);

  // Espectáculo: una franja de luz que barre la mesa.
  if (!still && state.party > 0 && state.partyKind === "sweep") {
    const band = sweepImage(look.light);
    if (band) {
      c.save();
      c.globalCompositeOperation = "lighter";
      c.drawImage(band, LEFT, Math.round(sweepY(time) - 32));
      c.restore();
    }
  }
  if (!still && state.party > 0 && state.partyKind === "strobe" && Math.floor(time * 8) % 2 === 0) {
    c.save();
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = 0.08;
    rect(c, LEFT, DMD_H, LANE_WALL - LEFT, HT - DMD_H, look.light);
    c.restore();
  }

  // Luces de la mesa.
  LAMPS.forEach((lamp, i) => {
    const on = lampLit(state, lamp.id, time, still) || partyLit(state, i, lamp.y, time, still);
    if (on) {
      // En la multibola las rampas con jackpot se ponen doradas.
      const jack = state.multiball && state.jackpotLit && (lamp.id === "lramp" || lamp.id === "cramp" || lamp.id === "rramp");
      const superMoon = state.superLit && lamp.id === "moon";
      drawLamp(c, jack || superMoon ? { ...lamp, color: GOLD } : lamp, true);
    }
  });
  // Faroles de arriba (con carita), y el del tiro perfecto.
  const plunging = state.balls.some((ball) => ball.mode === "plunger") || state.skillTime > 0;
  LANES.forEach((x, i) => {
    const lit = state.lanes[i] || state.flash.lanes[i] > 0 || partyLit(state, i + 20, 96, time, still);
    const skill = plunging && i === state.skillLane;
    const wanted = (wantsNow(state, "lane") || wantsNow(state, "lanes")) && !state.lanes[i];
    const on = lit || (skill && blink(4)) || (wanted && blink(3));
    if (on) glow(c, x, 96, 26, "#ffa23f", 0.9);
    const image = lanternImage(on);
    if (image) blit(c, image, x, 96);
    else rect(c, x - 4, 90, 9, 13, on ? "#ffa23f" : "#5a2a32");
    if (skill) rect(c, x - 5, 108, 10, 2, blink(4) ? GOLD : "#5d5790");
  });
  // La placa: nombre, multiplicador y luces de rango.
  drawPlaqueLights(c, state, time, still);
  // Salvavidas.
  const saving = state.saveLeft > 0 && !state.tilted && state.balls.some((ball) => ball.mode !== "plunger");
  if (saving && (state.saveLeft > 2 || blink(4))) {
    glow(c, 118, 435, 30, look.light, 0.7);
    label(c, "SALVA", 118, 432, mix(look.light, WHITE, 0.4), 1, null);
  }

  // Ondas de luz de los golpes.
  if (!still) drawRings(c, state, look);

  // El girador de la órbita.
  const turn = still ? 1 : Math.abs(Math.cos(state.spin.angle * Math.PI));
  const tall = Math.max(1, Math.round(turn * 6));
  rect(c, LEFT + 3, SPIN_Y - Math.floor(tall / 2) - 1, ORBIT_L - LEFT - 6, tall + 2, "#0a0710");
  rect(c, LEFT + 4, SPIN_Y - Math.floor(tall / 2), ORBIT_L - LEFT - 8, tall, state.spin.speed > 0 ? STEEL_HI : STEEL);
  if (state.spin.speed > 2 && !still) glow(c, 20, SPIN_Y, 18, look.light, 0.5);

  // El disco giratorio.
  const frame = still ? 0 : ((Math.floor((state.disc.angle / (Math.PI / 2)) * 8) % 8) + 8) % 8;
  const discLit = state.flash.disc > 0;
  const di = discImage(frame, look, discLit);
  if (di) blit(c, di, DISC.x, DISC.y);
  else disc(c, DISC.x, DISC.y, DISC.r, look.edge);
  if (discLit) glow(c, DISC.x, DISC.y, 36, look.light, 0.8);

  // El imán: brilla encendido; chispas mientras sostiene la bola.
  if (state.magnetLit || state.flash.magnet > 0) {
    const pulse = still ? 0.6 : 0.45 + 0.3 * Math.sin(time * 6);
    glow(c, MAGNET.x, MAGNET.y, 40, "#8ff3ff", pulse);
  }
  if (state.flash.magnet > 0 && !still) {
    for (let k = 0; k < 4; k++) {
      const a = time * 9 + k * 1.57;
      hair(c, MAGNET.x, MAGNET.y, MAGNET.x + Math.cos(a) * 16, MAGNET.y + Math.sin(a) * 16, "#bff8ff");
    }
  }

  // La bola cautiva y su objetivo.
  const capLit = state.flash.captive > 0;
  rect(c, 181, CAPTIVE.top - 10, 14, 4, "#0a0710");
  rect(c, 182, CAPTIVE.top - 9, 12, 2, capLit ? GOLD : "#6a5a30");
  if (capLit) glow(c, CAPTIVE.x, CAPTIVE.top - 8, 22, GOLD, 0.9);
  drawBall(c, CAPTIVE.x, state.captive.y, look);

  // Campanas del gato y objetivos que caen.
  CATS.forEach((d, i) => {
    const lit = state.targetsLit[i] || state.flash.targets[i] > 0 || (wantsNow(state, "cat") && !state.targetsLit[i] && blink(3)) || partyLit(state, i + 30, d.y0, time, still);
    const image = catImage(lit);
    if (image) c.drawImage(image, Math.round(d.x) - 4, d.y0 - 2);
    else rect(c, Math.round(d.x) - 2, d.y0, 4, d.y1 - d.y0, lit ? GOLD : "#5d5790");
    if (lit) glow(c, d.x, (d.y0 + d.y1) / 2, 14, GOLD, 0.6);
  });
  DROPS.forEach((d, i) => {
    const image = dropImage(!state.drops[i], state.flash.drops[i] > 0);
    if (image) c.drawImage(image, Math.round(d.x) - 5, d.y0 - 2);
    else if (!state.drops[i]) rect(c, Math.round(d.x) - 2, d.y0, 4, d.y1 - d.y0, "#ff7a8a");
  });

  // La muralla: sube desde su canaleta.
  if (state.wall.pos > 0.02) {
    const image = wallImage(look, state.wall.hits);
    const h = Math.round(state.wall.pos * 14);
    if (image) {
      c.save();
      c.globalAlpha = 0.45;
      rect(c, WALL.ax, WALL.y + 2, WALL.bx - WALL.ax + 4, 4, BLACK);
      c.restore();
      c.drawImage(image, 0, 0, image.width, h, WALL.ax - 2, WALL.y + 3 - h, image.width, h);
    } else rect(c, WALL.ax, WALL.y - h, WALL.bx - WALL.ax, h, "#8a8478");
    if (state.flash.wall > 0) glow(c, (WALL.ax + WALL.bx) / 2, WALL.y - 4, 30, HEART, 0.8);
  }

  // La luna con cara: abre la boca cuando la muralla baja; mastica cuando come.
  const chewing = state.chew > 0 || state.spitQueue > 0;
  let open = Math.round(state.mouth * 3);
  if (chewing) open = still ? 2 : [0, 2, 4, 2][Math.floor(time * 10) % 4];
  else if (state.mouth > 0.9 && !still && Math.floor(time * 2) % 4 === 0) open = 4;
  const eyes = chewing ? "happy" : state.wall.pos > 0.5 ? "closed" : "open";
  const face = moonImage(open, eyes, Math.min(2, state.locked), look);
  if (state.flash.moon > 0 || (state.mouth > 0.9 && !chewing)) glow(c, MOON_FACE.x, MOON_FACE.y + 4, 50, "#fff1b8", state.flash.moon > 0 ? 1 : 0.35);
  const bob = still || chewing ? 0 : Math.round(Math.sin(time * 2) * 1);
  if (face) blit(c, face, MOON_FACE.x, MOON_FACE.y + bob);
  else disc(c, MOON_FACE.x, MOON_FACE.y, 20, "#fff1b8");

  // Compuertas de los pasillos de salida (parpadean cuando están por abrirse).
  for (const s of SEGS) {
    if (s.kind !== "door") continue;
    const left = state.doors[s.id];
    if (left <= 0 || (left < 3 && !blink(4))) continue;
    thick(c, s.ax, s.ay, s.bx, s.by, 5, "#0a0710");
    thick(c, s.ax, s.ay, s.bx, s.by, 3, GOLD);
    glow(c, (s.ax + s.bx) / 2, (s.ay + s.by) / 2, 18, GOLD, 0.6);
  }
  // El poste de luz entre las paletas.
  if (state.post > 0 && (state.post > 3 || blink(4))) {
    glow(c, POST.x, POST.y, 24, GOLD, 0.8);
    disc(c, POST.x, POST.y, POST.r + 1.5, "#0a0710");
    disc(c, POST.x, POST.y, POST.r, GOLD);
    disc(c, POST.x - 1.5, POST.y - 1.5, 1.5, WHITE);
  }
  // Rebotadores: la goma se enciende al patear.
  for (const [index, a, b] of [
    [0, [48, 318], [70, 368]],
    [1, [188, 318], [166, 368]],
  ] as const) {
    if (state.flash.slings[index] <= 0) continue;
    thick(c, a[0] + (index ? -1 : 1), a[1], b[0] + (index ? -1 : 1), b[1], 3, GOLD);
    glow(c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 30, look.light, 0.8);
  }

  // Bumpers y el espíritu.
  for (const b of BUMPERS) {
    if (b.floor !== 0 || b.kind !== "pop") continue;
    const [x, y] = bumperAt(b, state.clock);
    const lit = state.flash.bumpers[b.index] > 0 || partyLit(state, b.index + 40, y, time, still);
    drawBumper(c, x, y, b.r, look, lit, "pop");
  }
  const spirit = BUMPERS[SPIRIT_INDEX];
  const [sx, sy] = bumperAt(spirit, state.clock);
  const hit = state.flash.bumpers[SPIRIT_INDEX] > 0;
  const float = still ? 0 : Math.round(Math.sin(time * 3) * 2);
  const shadow = shadowImage(7);
  if (shadow) blit(c, shadow, sx + 2, sy + 10);
  glow(c, sx, sy + float, 30, hit ? GOLD : "#c8ffe6", hit ? 1 : 0.4);
  const ghost = spiritImage(hit && blink(10));
  if (ghost) {
    c.save();
    if (sx < spirit.x) {
      c.translate(Math.round(sx) * 2, 0);
      c.scale(-1, 1);
    }
    c.drawImage(ghost, Math.round(sx) - 9, Math.round(sy) - 9 + float);
    c.restore();
  } else rect(c, Math.round(sx) - 8, Math.round(sy) - 8, 16, 16, "#effcff");
  for (let i = 0; i < 3; i++) {
    const on = i < state.spiritHits;
    const color = on ? GOLD : wantsNow(state, "spirit") && blink(3) ? look.light : "#2a2450";
    disc(c, sx - 6 + i * 6, sy + 15, 2, "#0a0710");
    disc(c, sx - 6 + i * 6, sy + 15, 1.4, color);
  }

  // Paletas.
  for (const index of [0, 1]) drawFlipper(c, FLIPS[0][index], index, state.flip[index].angle, look, state.tilted);

  // El resorte, y la barra de fuerza mientras la bola espera.
  const top = Math.round(PLUNGER_Y + state.pull * PULL);
  for (let y = top + 3; y < HT - 4; y += 3) rect(c, LANE_X - 5, y, 10, 1, y % 2 ? STEEL : STEEL_LO);
  rect(c, LANE_X - 6, top, 12, 3, "#0a0710");
  rect(c, LANE_X - 5, top, 10, 2, "#c8324a");
  if (state.balls.some((ball) => ball.mode === "plunger")) {
    if (blink(2)) for (let i = 0; i < 3; i++) poly(c, [[LANE_X, 262 - i * 22], [LANE_X - 6, 272 - i * 22], [LANE_X + 6, 272 - i * 22]], look.light);
    // La barra de fuerza: cada tramo es un farol; el del tiro perfecto, dorado.
    rect(c, LANE_X - 5, 300, 10, 108, "#0a0710");
    const skillBand = 3 - state.skillLane;
    for (let i = 0; i < 26; i++) {
      const power = (i + 0.5) / 26;
      const band = WIRE_BANDS.filter((edge) => power >= edge).length;
      const filled = power <= state.pull;
      const target = band === skillBand;
      const color = filled ? (target ? GOLD : INK) : band === 0 ? "#1a1430" : target ? (blink(3) ? "#c89a40" : "#6a5030") : i % 2 ? look.wall : mix(look.edge, BLACK, 0.3);
      rect(c, LANE_X - 4, 404 - i * 4, 8, 3, color);
    }
  }

  // Bolas sobre la mesa (las que van por rampas se pintan después, encima).
  for (const ball of state.balls) {
    if (ball.floor !== 0) continue;
    if (ball.mode === "path") continue;
    if (ball.mode === "held") {
      const wobble = still ? 0 : Math.sin(time * 40);
      drawBall(c, ball.x + wobble, ball.y, look);
      continue;
    }
    drawBall(c, ball.x, ball.y, look);
  }
  const over = layer("over", world, (g) => paintMainOver(g, world));
  if (over) c.drawImage(over, 0, 0);
  // Luces sobre las rampas cuando una bola las sube.
  for (const m of MOUTHS) if (state.flash.ramps[m.id] > 0 && !still) glow(c, (m.x0 + m.x1) / 2, m.y - 30, 40, SHOT_COLORS[m.id], state.flash.ramps[m.id]);
  for (const ball of state.balls) if (ball.floor === 0 && ball.mode === "path") drawBall(c, ball.x, ball.y, look, PATHS[ball.path].level);
  // La escalera abierta a la cámara, con su letrero.
  const climbing = state.balls.some((ball) => ball.mode === "path" && ball.path === "stairs");
  if (state.stairs || climbing) {
    const stairs = layer("stairs", world, (g) => paintStairs(g, world));
    if (stairs) c.drawImage(stairs, 0, 0);
    for (const ball of state.balls) if (ball.mode === "path" && ball.path === "stairs") drawBall(c, ball.x, ball.y, look, 1);
    label(c, "↑ CÁMARA", 126, 112, blink(3) ? GOLD : "#8a7040", 1, NIGHT);
  }
}

function drawPlaqueLights(c: Ctx, state: State, time: number, still: boolean) {
  const blink = (rate: number) => blinkAt(time, rate, still);
  // El nombre, letra por letra.
  const done = Math.min(state.letters, NAME.length);
  const width = widthOf(NAME);
  let x = Math.round(PLAQUE.x + PLAQUE.w / 2 - width / 2);
  [...NAME].forEach((char, index) => {
    const on = index < done || partyLit(state, index + 50, 330, time, still);
    const next = index === done && state.nameTime <= 0 && blink(3) && !still;
    if (on) glow(c, x + 2, 331, 9, GOLD, 0.6);
    x = write(c, char, x, 327, on ? GOLD : next ? INK : "#7a5a40");
  });
  for (let i = 2; i <= 5; i++) {
    if (i <= state.mult || partyLit(state, i + 60, 342, time, still)) {
      glow(c, multX(i) + 3, 345, 10, GOLD, 0.6);
      label(c, `X${i}`, multX(i), 342, GOLD, 1, null);
    }
  }
  for (let i = 0; i < RANKS.length; i++) {
    if (i > state.rank) continue;
    const top = i === state.rank && blink(2) && !still;
    rect(c, rankX(i), 354, 6, 3, top ? WHITE : GOLD);
  }
}

function drawRings(c: Ctx, state: State, look: Look) {
  c.save();
  c.globalCompositeOperation = "lighter";
  for (const r of state.rings) {
    c.globalAlpha = Math.max(0, r.life) * 0.8;
    c.strokeStyle = [INK, look.light, GOLD][r.color];
    c.lineWidth = 2;
    c.beginPath();
    c.arc(r.x, r.y, 6 + (1 - r.life) * 26 * r.size, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
}

/* ---------- Pisos de arriba en cada cuadro ---------- */

function drawUpper(c: Ctx, state: State, world: number, floor: Floor, time: number, still: boolean) {
  const look = lookOf(world);
  const base = layer(floor === 1 ? "upper" : "garden", world, (g) => paintUpperBase(g, world, floor));
  if (base) c.drawImage(base, 0, 0);
  else {
    rect(c, 0, 0, W, HT, "#0d0710");
    rect(c, UL, DMD_H, UR - UL, HT - DMD_H, floor === 1 ? "#0b0a24" : "#1e0c22");
  }
  const blink = (rate: number) => blinkAt(time, rate, still);
  if (!still) drawRings(c, state, look);
  for (const b of BUMPERS) {
    if (b.floor !== floor) continue;
    const [x, y] = bumperAt(b, state.clock);
    const lit = state.flash.bumpers[b.index] > 0;
    if (b.kind === "star") {
      const on = state.stars[b.index - FIRST_STAR];
      const want = wantsNow(state, "star") && !on && blink(3);
      if (on || lit) glow(c, x, y, 34, GOLD, on ? 0.8 : 1);
      const image = starImage(lit || want, on, b.r);
      if (image) blit(c, image, x, y);
      else disc(c, x, y, b.r, on ? GOLD : "#2a2860");
      continue;
    }
    drawBumper(c, x, y, b.r, look, lit || partyLit(state, b.index, y, time, still), b.kind === "moon" ? "moon" : "pop");
  }
  if (floor === 1) {
    // La puerta secreta: abierta es un remolino de luz.
    if (state.secretOpen) {
      glow(c, DOOR.x, DOOR.y, 46, GOLD, still ? 0.8 : 0.6 + 0.3 * Math.sin(time * 5));
      disc(c, DOOR.x, DOOR.y, 9, GOLD);
      disc(c, DOOR.x, DOOR.y, 6, NIGHT);
      if (!still) for (let k = 0; k < 3; k++) {
        const a = time * 4 + (k * Math.PI * 2) / 3;
        rect(c, Math.round(DOOR.x + Math.cos(a) * 7) - 1, Math.round(DOOR.y + Math.sin(a) * 7) - 1, 2, 2, WHITE);
      }
    } else {
      disc(c, DOOR.x, DOOR.y, 8, mix(look.wall, "#6a6478", 0.5));
      rect(c, DOOR.x - 1, DOOR.y - 3, 3, 6, NIGHT);
    }
    // El imán brilla mientras sostiene la bola.
    if (state.flash.magnet > 0) glow(c, UPPER_MAGNET.x, UPPER_MAGNET.y, 44, "#8ff3ff", 0.9);
    disc(c, UPPER_MAGNET.x, UPPER_MAGNET.y, 3, state.magnetOff > 0 ? "#3a3870" : "#8ff3ff");
    const lit = state.stars.filter(Boolean).length;
    const text = state.secretOpen ? "★ PUERTA ABIERTA" : `★ ${lit}/${STAR_SPOTS.length}`;
    label(c, text, 128, 366, state.secretOpen ? GOLD : "#8a88d8", 1, NIGHT);
  } else {
    // El reloj del jardín, grande en el medio, y pétalos que caen.
    const left = String(Math.max(0, Math.ceil(state.garden)));
    const warn = state.garden < 5 && !blink(4);
    glow(c, 128, 300, 40, warn ? HEART : GOLD, 0.5);
    label(c, left, 128, 290, warn ? HEART : GOLD, 3, NIGHT);
    if (!still) {
      for (let k = 0; k < 14; k++) {
        const x = (k * 53 + time * (12 + (k % 4) * 5)) % 200 + 30;
        const y = (k * 97 + time * (30 + (k % 3) * 12)) % 360 + 60;
        rect(c, Math.round(x), Math.round(y), 2, 1, "#f58fbd");
      }
    }
  }
  for (const index of [0, 1]) drawFlipper(c, FLIPS[floor][index], index, state.flip[index].angle, look, state.tilted);
  for (const ball of state.balls) {
    if (ball.floor !== floor) continue;
    if (ball.mode === "held") {
      const wobble = still ? 0 : Math.sin(time * 40);
      drawBall(c, UPPER_MAGNET.x + wobble, UPPER_MAGNET.y, look);
      continue;
    }
    drawBall(c, ball.x, ball.y, look, ball.mode === "path" ? 1 : 0);
  }
}

/* ---------- La pantalla de puntos (matriz naranja) ---------- */

const DMD_COLS = 122;
const DMD_ROWS = 23;
const DMD_X = 6;
const DMD_Y = 4;

/** Puntos apagados de la pantalla (se pintan una vez). */
function dmdBack() {
  return cached("dmd:back", DMD_COLS * 2, DMD_ROWS * 2, (c) => {
    rect(c, 0, 0, DMD_COLS * 2, DMD_ROWS * 2, "#070302");
    for (let y = 0; y < DMD_ROWS; y++) for (let x = 0; x < DMD_COLS; x++) rect(c, x * 2, y * 2, 1, 1, "#2a1206");
  });
}
/** La rejilla que separa los puntos encendidos. */
function dmdMask() {
  return cached("dmd:mask", DMD_COLS * 2, DMD_ROWS * 2, (c) => {
    c.fillStyle = "rgba(0, 0, 0, 0.62)";
    for (let y = 0; y < DMD_ROWS * 2; y++) {
      if (y % 2) c.fillRect(0, y, DMD_COLS * 2, 1);
      else for (let x = 1; x < DMD_COLS * 2; x += 2) c.fillRect(x, y, 1, 1);
    }
  });
}
let dmdBuf: HTMLCanvasElement | null | undefined;
function dmdBuffer() {
  if (!hasCanvas()) return null;
  if (dmdBuf === undefined) {
    try {
      dmdBuf = makeCanvas(DMD_COLS, DMD_ROWS);
    } catch {
      dmdBuf = null;
    }
  }
  return dmdBuf;
}

function drawDmd(c: Ctx, state: State, time: number, still: boolean) {
  const buffer = dmdBuffer();
  const back = dmdBack();
  if (buffer && back) {
    c.drawImage(back, DMD_X, DMD_Y);
    const d = buffer.getContext("2d") as Ctx;
    d.clearRect(0, 0, DMD_COLS, DMD_ROWS);
    dmdContent(d, state, time, still);
    c.save();
    c.imageSmoothingEnabled = false;
    c.drawImage(buffer, DMD_X, DMD_Y, DMD_COLS * 2, DMD_ROWS * 2);
    const mask = dmdMask();
    if (mask) c.drawImage(mask, DMD_X, DMD_Y);
    // Un poco de resplandor alrededor de los puntos.
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = 0.22;
    c.drawImage(buffer, DMD_X - 1, DMD_Y - 1, DMD_COLS * 2 + 2, DMD_ROWS * 2 + 2);
    c.restore();
    return;
  }
  // Sin navegador: las letras van directo al lienzo, al doble.
  rect(c, DMD_X, DMD_Y, DMD_COLS * 2, DMD_ROWS * 2, "#070302");
  c.save();
  c.translate(DMD_X, DMD_Y);
  c.scale(2, 2);
  dmdContent(c, state, time, still);
  c.restore();
}

/** Puntos con separador de miles: 123.456. */
const fmt = (n: number) => String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const DMD_MOON = ["...#####...", ".#########.", "##.###.####", "###########", "#.#######.#", "###.....###", ".###...###.", "..#######..", "....###...."];
const DMD_LANTERN = ["..#..", ".###.", "#####", "#o#o#", "#ooo#", "#o#o#", "#####", ".###.", "..#.."];
const DMD_BALL = [".###.", "#oo##", "#o###", "#####", ".###."];
const DMD_STAR = ["...#...", "...#...", "#######", ".#####.", "..###..", ".##.##.", ".#...#."];

function dmdContent(d: Ctx, state: State, time: number, still: boolean) {
  const cols = DMD_COLS;
  const mid = (text: string, y: number, color: string, scale = 1) => write(d, text, Math.round((cols - widthOf(text, scale)) / 2), y, color, scale);
  /** Un texto en una línea entera: si no cabe, pasa como letrero (o se corta, sin movimiento). */
  const marquee = (text: string, y: number, color: string, age: number) => {
    const width = widthOf(text);
    if (width <= cols - 2) return mid(text, y, color);
    if (still) {
      let cut = text;
      while (cut.length > 1 && widthOf(cut + "…") > cols - 2) cut = cut.slice(0, -1);
      return write(d, cut + "…", 1, y, color);
    }
    const span = width + 30;
    const offset = Math.floor(Math.max(0, ((age * 34) % (span + 40)) - 40));
    write(d, text, 2 - offset, y, color);
    write(d, text, 2 - offset + span, y, color);
  };
  /** Un texto grande si cabe; si no, chico y en letrero. */
  const big = (text: string, color: string, age: number) => {
    if (widthOf(text, 2) <= cols - 2) mid(text, 6, color, 2);
    else marquee(text, 9, color, age);
  };
  const pic = (rows: readonly string[], x: number, y: number) => sprite(d, rows, { "#": DMD_ON, o: DMD_MID }, x, y);
  const blink = (rate: number) => blinkAt(time, rate, still);

  if (state.over) {
    mid("FIN DEL JUEGO", 2, DMD_HOT);
    marquee(RANKS[state.rank], 13, DMD_ON, time);
    return;
  }
  if (state.phase === "drain") {
    const counting = Math.floor(state.bonusShown * Math.min(1, state.phaseTime / 1.4));
    if (state.tilted) mid("SIN BONO", 8, DMD_ON);
    else if (state.phaseTime < 1.6) {
      mid(`BONO X${state.bonusMult}`, 2, DMD_MID);
      mid(fmt(counting), 13, DMD_HOT);
    } else {
      mid(`BOLA ${state.ballNumber} PERDIDA`, 2, DMD_MID);
      marquee(RANKS[state.rank], 13, DMD_ON, state.phaseTime);
    }
    return;
  }
  if (state.tilted) {
    if (blink(2)) mid("FALTA", 6, DMD_HOT, 2);
    return;
  }
  const age = state.banner.age;
  if (state.show !== "none" && state.showTime > 0) {
    const b = state.banner;
    switch (state.show) {
      case "jackpot":
      case "super": {
        const words = state.show === "super" ? ["SÚPER", "JACKPOT", b.sub] : ["JACKPOT", b.sub];
        const index = Math.min(words.length - 1, Math.floor(age / 0.8));
        if (!still && index === 0)
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2;
            const r = (age * 90) % 70;
            rect(d, Math.round(61 + Math.cos(a) * r), Math.round(11 + Math.sin(a) * r * 0.3), 1, 1, DMD_HOT);
          }
        big(words[index], index === words.length - 1 ? DMD_HOT : DMD_ON, age);
        return;
      }
      case "multi": {
        if (age < 0.9 && !still) {
          for (let i = 0; i < 3; i++) pic(DMD_BALL, 30 + i * 28, Math.round(16 - Math.abs(Math.sin(age * 7 + i)) * 14));
          return;
        }
        big("MULTIBOLA", DMD_HOT, age);
        return;
      }
      case "name": {
        const shown = still ? NAME.length : Math.min(NAME.length, 1 + Math.floor(age * 6));
        const text = [...NAME].slice(0, shown).join("");
        if (widthOf(NAME, 2) <= cols - 2) write(d, text, Math.round((cols - widthOf(NAME, 2)) / 2), 6, DMD_HOT, 2);
        else mid(text, 8, DMD_HOT);
        return;
      }
      case "extra": {
        if (age < 0.7 && !still) {
          mid("♥", 6, DMD_HOT, 2);
          return;
        }
        big("BOLA EXTRA", DMD_HOT, age);
        return;
      }
      case "mission":
      case "rank":
      case "lock":
      case "upper":
      case "garden":
      case "skill": {
        const icon = state.show === "lock" ? DMD_MOON : state.show === "mission" ? DMD_LANTERN : state.show === "skill" ? DMD_BALL : DMD_STAR;
        const swing = still ? 0 : Math.round(Math.sin(time * 5));
        const iw = icon[0].length;
        pic(icon, 2 + swing, Math.round((DMD_ROWS - icon.length) / 2));
        pic(icon, cols - iw - 2 - swing, Math.round((DMD_ROWS - icon.length) / 2));
        if (state.show === "rank" && !still)
          for (let k = 0; k < 10; k++) {
            const x = (k * 37 + Math.floor(time * 20)) % 100 + 11;
            rect(d, x, (k * 7) % 22, 1, 1, DMD_MID);
          }
        const room = cols - (iw + 4) * 2;
        const line = (text: string, y: number, color: string) => {
          if (widthOf(text) <= room) mid(text, y, color);
          else marquee(text, y, color, age);
        };
        line(b.text, 2, DMD_HOT);
        line(b.sub, 13, DMD_ON);
        return;
      }
      default:
        break;
    }
  }
  if (state.messageTime > 0 && state.message) {
    const fresh = state.messageAge < 0.6 && !still && Math.floor(time * 10) % 2 === 0;
    if (widthOf(state.message, 2) <= cols - 2) mid(state.message, 6, fresh ? DMD_HOT : DMD_ON, 2);
    else {
      mid(fmt(state.score), 2, DMD_MID);
      marquee(state.message, 13, fresh ? DMD_HOT : DMD_ON, state.messageAge);
    }
    return;
  }
  // Pantalla normal: el puntaje grande, y cada tanto la misión.
  const timed = state.active >= 0 && MISSIONS[state.active].time !== undefined && state.missionTime > 0;
  if (timed && state.missionTime <= 10) {
    // Cuenta regresiva grande.
    const mission = MISSIONS[state.active];
    const stepNow = mission.steps[state.stepIndex];
    const secs = String(Math.ceil(state.missionTime));
    write(d, secs, cols - 2 - widthOf(secs, 2), 6, state.missionTime < 4 && blink(4) ? DMD_HOT : DMD_ON, 2);
    write(d, stepNow.label, 2, 2, DMD_ON);
    write(d, `${state.stepCount}/${stepGoal(state)}`, 2, 13, DMD_HOT);
    return;
  }
  const view = Math.floor(time / 5) % 3 === 2 ? 1 : 0;
  if (view === 0) {
    const score = fmt(state.score);
    if (widthOf(score, 2) <= 84) write(d, score, 2, 6, DMD_ON, 2);
    else write(d, score, 2, 8, DMD_ON);
    const ball = `BOLA ${state.ballNumber}`;
    write(d, ball, cols - 2 - widthOf(ball), 2, DMD_MID);
    const right = timed ? `${Math.ceil(state.missionTime)} S` : `X${state.mult}`;
    write(d, right, cols - 2 - widthOf(right), 13, timed ? DMD_HOT : DMD_ON);
    return;
  }
  if (state.active >= 0) {
    const mission = MISSIONS[state.active];
    const stepNow = mission.steps[state.stepIndex];
    marquee(mission.name, 2, DMD_MID, time);
    mid(`${stepNow.label} ${state.stepCount}/${stepGoal(state)}`, 13, DMD_HOT);
    return;
  }
  mid(state.multiball ? "MULTIBOLA" : "LA LUNA DA MISIÓN", 2, DMD_MID);
  marquee(state.multiball ? (state.jackpotLit ? "RAMPAS: JACKPOT" : "RULO U ÓRBITA") : `▶${MISSIONS[state.selected].name}`, 13, DMD_ON, time);
}

/** La línea de la misión (para lectores y pruebas). */
export function missionLine(state: State): { text: string; right: string } {
  if (state.active >= 0) {
    const mission = MISSIONS[state.active];
    const stepNow = mission.steps[state.stepIndex];
    const right = mission.time ? String(Math.max(0, Math.ceil(state.missionTime))) : `X${state.mult}`;
    return { text: `${stepNow.label} ${state.stepCount}/${stepGoal(state)}`, right };
  }
  return { text: `▶${MISSIONS[state.selected].name}`, right: "" };
}

/* ---------- Carteles, chispas y números ---------- */

function drawBanner(c: Ctx, state: State, look: Look, still: boolean) {
  const b = state.banner;
  if (b.time <= 0 || !b.text) return;
  const grow = still ? 1 : Math.min(1, b.age / 0.18);
  const fade = Math.min(1, b.time / 0.35);
  const y = 214;
  const h = Math.round(56 * grow);
  c.save();
  c.globalAlpha = 0.6 * fade;
  rect(c, LEFT, y - h / 2, LANE_WALL - LEFT, h, NIGHT);
  c.globalAlpha = fade;
  rect(c, LEFT, y - h / 2, LANE_WALL - LEFT, 2, GOLD);
  rect(c, LEFT, y + h / 2 - 2, LANE_WALL - LEFT, 2, GOLD);
  if (grow >= 1) {
    const scale = widthOf(b.text, 2) <= LANE_WALL - LEFT - 8 ? 2 : 1;
    glow(c, 118, y - 6, 70, look.light, 0.6 * fade);
    label(c, b.text, 118, b.sub ? y - 17 : y - 7, GOLD, scale, NIGHT);
    if (b.sub) {
      const subScale = widthOf(b.sub, 2) <= LANE_WALL - LEFT - 8 && scale === 1 ? 2 : 1;
      label(c, b.sub, 118, y + (subScale === 2 ? 2 : 6), INK, subScale, NIGHT);
    }
  }
  c.restore();
}

function drawEffects(c: Ctx, state: State, look: Look, still: boolean) {
  if (!still) {
    const colors = [INK, look.light, GOLD];
    for (const spark of state.sparks) {
      c.fillStyle = colors[spark.color];
      c.fillRect(Math.round(spark.x), Math.round(spark.y), 2, 2);
    }
  }
  for (const p of state.pops) {
    c.save();
    c.globalAlpha = Math.min(1, p.life * 2.5);
    label(c, p.text, p.x, Math.round(p.y), p.big ? GOLD : INK, 1, NIGHT);
    c.restore();
  }
}

function draw(c: Ctx, state: State, time: number, still: boolean) {
  const world = (state.level - 1) % WORLDS;
  const floor = viewOf(state);
  const look = lookOf(world);
  // Sacudida leve con los golpes fuertes (nunca con menos movimiento).
  const shake = still ? 0 : Math.min(1, state.shake * 4);
  const dx = shake ? Math.round(Math.sin(time * 83) * 2.4 * shake) : 0;
  const dy = shake ? Math.round(Math.cos(time * 71) * 2 * shake) : 0;
  if (dx || dy) rect(c, 0, 0, W, HT, "#0d0710");
  c.save();
  if (dx || dy) c.translate(dx, dy);
  if (floor === 0) drawMain(c, state, world, time, still);
  else drawUpper(c, state, world, floor, time, still);
  drawEffects(c, state, look, still);
  // Un destello al cambiar de piso.
  if (!still && state.flash.floor > 0) {
    c.globalAlpha = Math.min(0.35, state.flash.floor);
    rect(c, LEFT, DMD_H, RIGHT - LEFT, HT - DMD_H, INK);
    c.globalAlpha = 1;
  }
  c.restore();
  drawBanner(c, state, look, still);
  drawDmd(c, state, time, still);

  if (state.tilted && blinkAt(time, 2, still)) label(c, "FALTA", 118, 200, HEART, 3, NIGHT);
  if (state.phase === "drain") label(c, `BOLA ${state.ballNumber}`, 118, 300, INK, 2, NIGHT);
  if (state.over) {
    // Cartel final: FIN y el rango alcanzado.
    c.save();
    c.globalAlpha = 0.85;
    rect(c, LEFT, 150, LANE_WALL - LEFT, 100, NIGHT);
    c.restore();
    rect(c, LEFT, 150, LANE_WALL - LEFT, 2, GOLD);
    rect(c, LEFT, 248, LANE_WALL - LEFT, 2, GOLD);
    glow(c, 118, 180, 60, GOLD, 0.5);
    label(c, "FIN", 118, 162, GOLD, 4, NIGHT);
    label(c, "RANGO", 118, 208, "#8a88d8", 1, NIGHT);
    const rank = RANKS[state.rank];
    label(c, rank, 118, 222, INK, widthOf(rank, 2) <= 210 ? 2 : 1, NIGHT);
  }
}

const pinball = {
  help: "Flecha izquierda y flecha derecha mueven las paletas; mantén abajo o espacio para cargar el resorte y suéltalo para lanzar: con la fuerza justa la bola cae en el farol que parpadea. Flecha arriba empuja la mesa, sin abusar. Las rampas piden un buen golpe: si la bola llega lenta, cae de vuelta. Pasa por los faroles para elegir misión y dale de comer a la luna para empezarla; si la muralla tapa la luna, golpéala dos veces. Cumplir misiones sube tu rango. Con la escalera encendida, la espiral sube a la cámara de las estrellas. Con el dedo, toca cada mitad del tablero para su paleta y mantén el dedo en el carril de la derecha para lanzar.",
  resolution: RES,
  create: (seed: number) => create(seed),
  step(state: State, dt: number, input: Input, out: Out) {
    step(state, dt, input, out);
  },
  draw,
  status: (state: State) => ({
    score: Math.floor(state.score),
    lives: state.lives,
    level: state.level,
    letters: Math.min(state.letters, NAME.length),
    world: (state.level - 1) % WORLDS,
    over: state.over,
    ...(state.over ? { result: `RANGO: ${RANKS[state.rank]}` } : {}),
  }),
  pad: () => [
    [{ key: "left" as const, glyph: "←", label: "Paleta izquierda" }],
    [
      { key: "right" as const, glyph: "→", label: "Paleta derecha" },
      { key: "fire" as const, glyph: "⤓", label: "Lanzar", main: true },
    ],
  ],
};

export default defineGame<State>(pinball);
