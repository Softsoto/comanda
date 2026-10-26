/**
 * Reglas de "Laberinto Lunar", el segundo juego escondido.
 *
 * Natha (la ninja) recorre un laberinto recogiendo luces mientras la persiguen
 * tres espíritus. Con una flor de cerezo los espíritus se asustan un rato y se
 * les puede atrapar. De vez en cuando aparece una letra: juntas forman NATHALIA.
 * Aquí solo está la lógica; no dibuja nada, así que se puede probar sola.
 */

export const MAZE = [
  "###############",
  "#o.....#.....o#",
  "#.###.###.###.#",
  "#.............#",
  "#.#.###.###.#.#",
  "#.#.... ....#.#",
  "#.####.#.####.#",
  "#......#......#",
  "#.##.#####.##.#",
  "#.............#",
  "#.##.#.#.#.##.#",
  "#....#.#.#....#",
  "####.#...#.####",
  "#......#......#",
  "#.####.#.####.#",
  "#o..... .....o#",
  "###############",
] as const;

export const MAZE_COLS = MAZE[0].length;
export const MAZE_ROWS = MAZE.length;
import { GAME_NAME as NAME } from "./game-name";
export { NAME };
const PLAYER_START = { x: 7, y: 15 };
const SPIRIT_START = [
  { x: 6, y: 5 },
  { x: 7, y: 5 },
  { x: 8, y: 5 },
];

export type Dir = "left" | "right" | "up" | "down";
const STEP: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const BACK: Record<Dir, Dir> = { left: "right", right: "left", up: "down", down: "up" };
const DIRS: Dir[] = ["up", "left", "down", "right"];

export type Walker = { x: number; y: number; dir: Dir | null; t: number };
export type Spirit = Walker & { home: number; away: number };
export type MazeEvent = "dot" | "flower" | "catch" | "letter" | "name" | "hit" | "level" | "over";

export type MazeState = {
  /** Lo que queda por recoger: "." luz, "o" flor, " " nada. Mismas medidas que MAZE. */
  items: string[][];
  left: number;
  player: Walker;
  spirits: Spirit[];
  /** Segundos que les quedan asustados a los espíritus. */
  scared: number;
  /** La letra a la vista (o null) y cuántas letras del nombre van recogidas. */
  letter: { x: number; y: number; time: number } | null;
  letters: number;
  nextLetter: number;
  score: number;
  lives: number;
  level: number;
  /** Pausa corta al empezar y después de un golpe. */
  wait: number;
  over: boolean;
  random: number;
};

export const isWall = (x: number, y: number) => MAZE[y]?.[x] === "#" || MAZE[y]?.[x] === undefined;

function roll(state: MazeState): number {
  state.random = (state.random + 0x6d2b79f5) >>> 0;
  let t = state.random;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function place(state: MazeState) {
  state.player = { ...PLAYER_START, dir: null, t: 0 };
  state.spirits = SPIRIT_START.map((start, home) => ({ ...start, dir: null, t: 0, home, away: 0 }));
  state.scared = 0;
  state.wait = 1.2;
}

function fill(state: MazeState) {
  state.items = MAZE.map((row) => [...row].map((cell) => (cell === "." || cell === "o" ? cell : " ")));
  state.left = state.items.flat().filter((cell) => cell !== " ").length;
}

export function createMaze(seed: number): MazeState {
  const state = {
    items: [],
    left: 0,
    scared: 0,
    letter: null,
    letters: 0,
    nextLetter: 6,
    score: 0,
    lives: 3,
    level: 1,
    wait: 0,
    over: false,
    random: seed >>> 0,
  } as unknown as MazeState;
  fill(state);
  place(state);
  return state;
}

/** Dónde está de verdad un caminante, contando lo que lleva andado hacia la casilla siguiente. */
export function positionOf(walker: Walker): [number, number] {
  if (!walker.dir) return [walker.x, walker.y];
  const [dx, dy] = STEP[walker.dir];
  return [walker.x + dx * walker.t, walker.y + dy * walker.t];
}

const open = (walker: Walker, dir: Dir) => !isWall(walker.x + STEP[dir][0], walker.y + STEP[dir][1]);

/** Avanza un caminante; en cada casilla le pregunta a `choose` hacia dónde seguir. */
function walk(walker: Walker, distance: number, choose: () => Dir | null, arrive?: () => void) {
  let rest = distance;
  for (let guard = 0; guard < 8 && rest > 0; guard++) {
    if (walker.t === 0) {
      walker.dir = choose();
      if (!walker.dir) return;
    }
    const dir = walker.dir as Dir;
    const move = Math.min(rest, 1 - walker.t);
    walker.t += move;
    rest -= move;
    if (walker.t >= 1 - 1e-9) {
      walker.x += STEP[dir][0];
      walker.y += STEP[dir][1];
      walker.t = 0;
      arrive?.();
    }
  }
}

const playerSpeed = (level: number) => 5.2 + Math.min(level - 1, 6) * 0.25;
const spiritSpeed = (level: number) => 3.6 + Math.min(level - 1, 8) * 0.35;

/** Avanza la partida `dt` segundos. `wanted` es hacia dónde quiere ir el jugador. Devuelve lo que pasó. */
export function stepMaze(state: MazeState, dt: number, wanted: Dir | null): MazeEvent[] {
  const events: MazeEvent[] = [];
  if (state.over) return events;
  if (state.wait > 0) {
    state.wait -= dt;
    return events;
  }
  const { player } = state;

  // Dar media vuelta se puede en cualquier momento, sin esperar a la casilla.
  if (wanted && player.dir && player.t > 0 && wanted === BACK[player.dir]) {
    player.x += STEP[player.dir][0];
    player.y += STEP[player.dir][1];
    player.t = 1 - player.t;
    player.dir = wanted;
  }
  walk(
    player,
    playerSpeed(state.level) * dt,
    () => (wanted && open(player, wanted) ? wanted : player.dir && open(player, player.dir) ? player.dir : null),
    () => {
      const item = state.items[player.y][player.x];
      if (item !== " ") {
        state.items[player.y][player.x] = " ";
        state.left -= 1;
        if (item === "o") {
          state.scared = Math.max(3, 7 - state.level * 0.5);
          state.score += 50;
          events.push("flower");
        } else {
          state.score += 10;
          events.push("dot");
        }
      }
      if (state.letter && state.letter.x === player.x && state.letter.y === player.y) {
        state.letter = null;
        state.letters += 1;
        state.score += 100;
        events.push("letter");
        if (state.letters % NAME.length === 0) {
          state.score += 1000;
          state.lives = Math.min(5, state.lives + 1);
          events.push("name");
        }
      }
    },
  );

  // Las letras del nombre aparecen de una en una, en una casilla libre.
  if (state.letter) {
    state.letter.time -= dt;
    if (state.letter.time <= 0) state.letter = null;
  } else {
    state.nextLetter -= dt;
    if (state.nextLetter <= 0) {
      for (let tries = 0; tries < 40 && !state.letter; tries++) {
        const x = 1 + Math.floor(roll(state) * (MAZE_COLS - 2));
        const y = 1 + Math.floor(roll(state) * (MAZE_ROWS - 2));
        if (!isWall(x, y) && Math.abs(x - player.x) + Math.abs(y - player.y) > 3) state.letter = { x, y, time: 9 };
      }
      state.nextLetter = 7;
    }
  }

  if (state.scared > 0) state.scared = Math.max(0, state.scared - dt);
  const [px, py] = positionOf(player);
  for (const spirit of state.spirits) {
    if (spirit.away > 0) {
      spirit.away -= dt;
      continue;
    }
    const speed = spiritSpeed(state.level) * (state.scared > 0 ? 0.55 : 1) * (1 - spirit.home * 0.06);
    walk(spirit, speed * dt, () => {
      const ways = DIRS.filter((dir) => open(spirit, dir) && (!spirit.dir || dir !== BACK[spirit.dir]));
      const choices = ways.length > 0 ? ways : DIRS.filter((dir) => open(spirit, dir));
      if (choices.length === 0) return null;
      // Cada espíritu tiene su manera: uno persigue, otro se adelanta y otro va a su aire.
      if (spirit.home === 2 && roll(state) < 0.5) return choices[Math.floor(roll(state) * choices.length)];
      const ahead = spirit.home === 1 && player.dir ? 3 : 0;
      const tx = player.x + (player.dir ? STEP[player.dir][0] * ahead : 0);
      const ty = player.y + (player.dir ? STEP[player.dir][1] * ahead : 0);
      const far = (dir: Dir) => Math.hypot(spirit.x + STEP[dir][0] - tx, spirit.y + STEP[dir][1] - ty);
      return [...choices].sort((a, b) => (state.scared > 0 ? far(b) - far(a) : far(a) - far(b)))[0];
    });
    const [sx, sy] = positionOf(spirit);
    if (Math.hypot(sx - px, sy - py) < 0.6) {
      if (state.scared > 0) {
        Object.assign(spirit, SPIRIT_START[spirit.home], { dir: null, t: 0, away: 3 });
        state.score += 200;
        events.push("catch");
      } else {
        state.lives -= 1;
        if (state.lives <= 0) {
          state.over = true;
          events.push("over");
        } else {
          place(state);
          events.push("hit");
        }
        return events;
      }
    }
  }

  if (state.left === 0) {
    state.level += 1;
    state.score += 500;
    fill(state);
    place(state);
    events.push("level");
  }
  return events;
}
