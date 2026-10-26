/**
 * Reglas del juego escondido de bloques que caen ("Dos Lunas").
 *
 * Aquí solo está la lógica: tablero, piezas, giros, líneas, puntaje y niveles.
 * No dibuja nada ni usa el navegador, así que se puede probar sola. Cada función
 * recibe el estado de la partida y devuelve uno nuevo, sin tocar el que recibió.
 */

export const COLS = 10;
export const ROWS = 18;

export const KINDS = ["I", "O", "T", "S", "Z", "J", "L"] as const;
export type PieceKind = (typeof KINDS)[number];

/** Líneas que hay que completar para desbloquear el mensaje. */
export const MESSAGE_LINES = 10;
/** Cada cuántas líneas se sube de nivel. Con cada nivel cambia también el mundo del fondo. */
export const LINES_PER_LEVEL = 5;
export const LINES_PER_WORLD = LINES_PER_LEVEL;
export const MAX_LEVEL = 15;

/** Puntos por borrar 1, 2, 3 o 4 líneas de una vez (se multiplican por el nivel). */
const LINE_POINTS = [0, 100, 250, 450, 750];

/** Forma de cada pieza en su primer giro: "#" es una celda ocupada. */
const BASE_SHAPES: Record<PieceKind, string[]> = {
  I: ["....", "####", "....", "...."],
  O: ["##", "##"],
  T: [".#.", "###", "..."],
  S: [".##", "##.", "..."],
  Z: ["##.", ".##", "..."],
  J: ["#..", "###", "..."],
  L: ["..#", "###", "..."],
};

type Cell = readonly [x: number, y: number];

/** Las celdas de cada pieza en sus cuatro giros (en el sentido del reloj), dentro de su caja. */
const SHAPES: Record<PieceKind, { size: number; turns: Cell[][] }> = Object.fromEntries(
  KINDS.map((kind) => {
    const rows = BASE_SHAPES[kind];
    const size = rows.length;
    let cells: Cell[] = [];
    rows.forEach((row, y) => [...row].forEach((mark, x) => mark === "#" && cells.push([x, y])));
    const turns: Cell[][] = [];
    for (let turn = 0; turn < 4; turn++) {
      turns.push([...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]));
      // Un cuarto de vuelta: (x, y) pasa a (tamaño − 1 − y, x).
      cells = cells.map(([x, y]) => [size - 1 - y, x] as const);
    }
    return [kind, { size, turns }];
  }),
) as Record<PieceKind, { size: number; turns: Cell[][] }>;

export type Piece = {
  kind: PieceKind;
  /** Giro actual, de 0 a 3. */
  turn: number;
  /** Esquina superior izquierda de su caja en el tablero. */
  x: number;
  y: number;
};

export type GameState = {
  /** ROWS filas (la 0 es la de arriba) por COLS columnas. 0 = vacío; 1 a 7 = tipo de pieza. */
  board: number[][];
  /** Pieza que está cayendo; null mientras se borran líneas o al terminar. */
  piece: Piece | null;
  /** Las próximas piezas; la primera es la que sigue. */
  queue: PieceKind[];
  /** Estado del generador de azar: la misma semilla da siempre la misma partida. */
  random: number;
  score: number;
  lines: number;
  level: number;
  /** Piezas ya colocadas. */
  pieces: number;
  /** Filas completas que se están borrando (para animarlas). Vacío si no hay. */
  clearing: number[];
  over: boolean;
};

/** Número que identifica cada tipo de pieza dentro del tablero (1 a 7). */
export const kindNumber = (kind: PieceKind) => KINDS.indexOf(kind) + 1;
export const kindOf = (value: number): PieceKind | null => KINDS[value - 1] ?? null;

/** Celdas del tablero que ocupa una pieza. */
export function cellsOf(piece: Piece): Cell[] {
  return SHAPES[piece.kind].turns[piece.turn & 3].map(([x, y]) => [piece.x + x, piece.y + y] as const);
}

/** Celdas de un tipo de pieza en su primer giro, dentro de su caja (para dibujar "la que sigue"). */
export function previewOf(kind: PieceKind): { size: number; cells: Cell[] } {
  return { size: SHAPES[kind].size, cells: SHAPES[kind].turns[0] };
}

/* ---------- Azar con semilla ---------- */

/** Generador sencillo (mulberry32): devuelve un número entre 0 y 1 y el siguiente estado. */
function nextRandom(state: number): [value: number, state: number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/**
 * Rellena la cola de piezas. Las piezas salen por "bolsas": cada bolsa trae las
 * siete, revueltas. Así ninguna tarda demasiado en aparecer.
 */
function refill(queue: PieceKind[], random: number): [PieceKind[], number] {
  const filled = [...queue];
  let state = random;
  while (filled.length < 4) {
    const bag: PieceKind[] = [...KINDS];
    for (let index = bag.length - 1; index > 0; index--) {
      let value: number;
      [value, state] = nextRandom(state);
      const other = Math.floor(value * (index + 1));
      [bag[index], bag[other]] = [bag[other], bag[index]];
    }
    filled.push(...bag);
  }
  return [filled, state];
}

/* ---------- Tablero ---------- */

const emptyBoard = () => Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0));

/** True si la pieza se sale del tablero o pisa una celda ocupada. Por encima del borde superior sí cabe. */
export function collides(board: number[][], piece: Piece): boolean {
  return cellsOf(piece).some(([x, y]) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x] !== 0));
}

function spawn(kind: PieceKind): Piece {
  const { size } = SHAPES[kind];
  // La pieza larga tiene su fila ocupada en la segunda de su caja: sube una para aparecer arriba del todo.
  return { kind, turn: 0, x: Math.floor((COLS - size) / 2), y: kind === "I" ? -1 : 0 };
}

/** Saca la siguiente pieza de la cola. Si no cabe, la partida termina. */
function bringNext(state: GameState): GameState {
  const [queue, random] = refill(state.queue.slice(1), state.random);
  const piece = spawn(state.queue[0]);
  const blocked = collides(state.board, piece);
  return { ...state, queue, random, piece: blocked ? null : piece, over: blocked, clearing: [] };
}

/* ---------- Partida ---------- */

export const levelFor = (lines: number) => Math.min(MAX_LEVEL, 1 + Math.floor(lines / LINES_PER_LEVEL));

/** Paisaje del fondo (0 la aldea, 1 el santuario, 2 el bosque, 3 el lago, 4 la cumbre, 5 el cuarto del jacuzzi). Cambia cada LINES_PER_WORLD líneas. */
/** Cuántos paisajes hay (deben coincidir con WORLD_NAMES del juego). */
export const WORLDS = 6;
export const worldFor = (lines: number) => Math.floor(lines / LINES_PER_WORLD) % WORLDS;

/** Milisegundos que tarda la pieza en bajar una fila sola, según el nivel. */
export const dropInterval = (level: number) => Math.max(80, 860 - (Math.min(level, MAX_LEVEL) - 1) * 55);

export function createGame(seed: number): GameState {
  const [queue, random] = refill([], seed >>> 0);
  return bringNext({
    board: emptyBoard(),
    piece: null,
    queue,
    random,
    score: 0,
    lines: 0,
    level: 1,
    pieces: 0,
    clearing: [],
    over: false,
  });
}

/** True cuando la pieza se puede mover (no se están borrando líneas ni terminó la partida). */
const active = (state: GameState): state is GameState & { piece: Piece } =>
  state.piece !== null && !state.over && state.clearing.length === 0;

/** Mueve la pieza a la izquierda (−1) o a la derecha (+1), si cabe. */
export function move(state: GameState, dx: number): GameState {
  if (!active(state)) return state;
  const piece = { ...state.piece, x: state.piece.x + dx };
  return collides(state.board, piece) ? state : { ...state, piece };
}

/** Desplazamientos que se prueban cuando la pieza no cabe al girar junto a una pared o a otras piezas. */
const KICKS: Cell[] = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [-2, 0],
  [2, 0],
];

/** Gira la pieza un cuarto de vuelta: 1 en el sentido del reloj, −1 al contrario. */
export function rotate(state: GameState, direction: 1 | -1 = 1): GameState {
  if (!active(state)) return state;
  const turn = (state.piece.turn + direction + 4) & 3;
  for (const [dx, dy] of KICKS) {
    const piece = { ...state.piece, turn, x: state.piece.x + dx, y: state.piece.y + dy };
    if (!collides(state.board, piece)) return { ...state, piece };
  }
  return state;
}

/** Cuántas filas puede bajar todavía la pieza (para dibujar dónde va a caer). */
export function dropDistance(state: GameState): number {
  if (!state.piece) return 0;
  let distance = 0;
  while (!collides(state.board, { ...state.piece, y: state.piece.y + distance + 1 })) distance += 1;
  return distance;
}

/** Deja la pieza fija en el tablero. Si completa filas, quedan marcadas para borrarse. */
function lock(state: GameState & { piece: Piece }): GameState {
  const cells = cellsOf(state.piece);
  // Una pieza que queda fija asomando por encima del tablero termina la partida.
  if (cells.some(([, y]) => y < 0)) return { ...state, piece: null, over: true };

  const board = state.board.map((row) => [...row]);
  const value = kindNumber(state.piece.kind);
  for (const [x, y] of cells) board[y][x] = value;

  const full = board.flatMap((row, y) => (row.every((cell) => cell !== 0) ? [y] : []));
  const placed = { ...state, board, pieces: state.pieces + 1 };
  if (full.length > 0) return { ...placed, piece: null, clearing: full };
  return bringNext(placed);
}

/** Paso de gravedad: la pieza baja una fila o, si no puede, queda fija. */
export function tick(state: GameState): GameState {
  if (!active(state)) return state;
  const piece = { ...state.piece, y: state.piece.y + 1 };
  return collides(state.board, piece) ? lock(state) : { ...state, piece };
}

/** Bajar a mano una fila: da un punto. Si ya no puede bajar, queda fija. */
export function softDrop(state: GameState): GameState {
  if (!active(state)) return state;
  const piece = { ...state.piece, y: state.piece.y + 1 };
  return collides(state.board, piece) ? lock(state) : { ...state, piece, score: state.score + 1 };
}

/** Dejar caer la pieza hasta el fondo: dos puntos por fila. */
export function hardDrop(state: GameState): GameState {
  if (!active(state)) return state;
  const distance = dropDistance(state);
  return lock({ ...state, piece: { ...state.piece, y: state.piece.y + distance }, score: state.score + distance * 2 });
}

/** Borra las filas marcadas, suma los puntos y trae la siguiente pieza. */
export function finishClear(state: GameState): GameState {
  if (state.clearing.length === 0 || state.over) return state;
  const kept = state.board.filter((_, y) => !state.clearing.includes(y));
  const board = [...Array.from({ length: ROWS - kept.length }, () => Array<number>(COLS).fill(0)), ...kept];
  const lines = state.lines + state.clearing.length;
  return bringNext({
    ...state,
    board,
    lines,
    level: levelFor(lines),
    score: state.score + LINE_POINTS[Math.min(state.clearing.length, 4)] * state.level,
  });
}
