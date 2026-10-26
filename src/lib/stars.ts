/**
 * Reglas de "Lluvia de Espíritus", el tercer juego escondido.
 *
 * Natha defiende la aldea lanzando estrellas hacia arriba. Los espíritus bajan
 * en formación, y cada formación dibuja una letra del nombre (NATHALIA, si no se cambia).
 * Aquí solo está la lógica; no dibuja nada, así que se puede probar sola.
 */

import { GAME_NAME as NAME, shapeOf } from "./game-name";
export { NAME };
export const WIDTH = 128;
export const HEIGHT = 224;
export const GROUND = 204;
const CELL_X = 11;
const CELL_Y = 10;



export type Shot = { x: number; y: number };
export type Foe = { column: number; row: number; alive: boolean };
export type StarsEvent = "throw" | "pop" | "letter" | "name" | "hit" | "over";

export type StarsState = {
  player: number;
  cooldown: number;
  shots: Shot[];
  drops: Shot[];
  foes: Foe[];
  alive: number;
  /** Esquina de la formación y hacia dónde se mueve. */
  fx: number;
  fy: number;
  heading: 1 | -1;
  dropTimer: number;
  /** Oleadas superadas: la letra actual es NAME[wave % NAME.length]. */
  wave: number;
  score: number;
  lives: number;
  wait: number;
  over: boolean;
  random: number;
};

function roll(state: StarsState): number {
  state.random = (state.random + 0x6d2b79f5) >>> 0;
  let t = state.random;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const letterOf = (wave: number) => NAME[wave % NAME.length];
/** Cuántas veces se ha completado el nombre entero. */
export const roundOf = (wave: number) => Math.floor(wave / NAME.length);

function muster(state: StarsState) {
  const shape = shapeOf(letterOf(state.wave));
  state.foes = shape.flatMap((line, row) => [...line].flatMap((mark, column) => (mark === "#" ? [{ column, row, alive: true }] : [])));
  state.alive = state.foes.length;
  state.fx = (WIDTH - CELL_X * 5) / 2;
  state.fy = 30;
  state.heading = 1;
  state.shots = [];
  state.drops = [];
  state.dropTimer = 1.5;
  state.wait = 1.4;
}

export function createStars(seed: number): StarsState {
  const state = { player: WIDTH / 2, cooldown: 0, wave: 0, score: 0, lives: 3, over: false, random: seed >>> 0 } as StarsState;
  muster(state);
  return state;
}

/** Centro de un espíritu en la pantalla. */
export const foeAt = (state: StarsState, foe: Foe): [number, number] => [state.fx + foe.column * CELL_X + 5, state.fy + foe.row * CELL_Y + 4];

/** Avanza la partida `dt` segundos. `move`: -1, 0 o 1. `fire`: si se está lanzando. Devuelve lo que pasó. */
export function stepStars(state: StarsState, dt: number, move: number, fire: boolean): StarsEvent[] {
  const events: StarsEvent[] = [];
  if (state.over) return events;
  state.player = Math.min(WIDTH - 10, Math.max(10, state.player + move * 78 * dt));
  if (state.wait > 0) {
    state.wait -= dt;
    return events;
  }
  const round = roundOf(state.wave);

  state.cooldown -= dt;
  if (fire && state.cooldown <= 0 && state.shots.length < 3) {
    state.shots.push({ x: state.player, y: GROUND - 12 });
    state.cooldown = 0.32;
    events.push("throw");
  }

  // La formación va de lado a lado y baja un poco en cada borde; con menos espíritus, más rápido.
  const hurry = 1 + (1 - state.alive / state.foes.length) * 1.6;
  state.fx += state.heading * (12 + state.wave * 1.5 + round * 6) * hurry * dt;
  const columns = state.foes.filter((foe) => foe.alive).map((foe) => foe.column);
  const left = state.fx + Math.min(...columns) * CELL_X;
  const right = state.fx + Math.max(...columns) * CELL_X + 10;
  if ((state.heading === 1 && right >= WIDTH - 4) || (state.heading === -1 && left <= 4)) {
    state.heading = state.heading === 1 ? -1 : 1;
    state.fy += 5;
  }

  for (const shot of state.shots) shot.y -= 150 * dt;
  state.shots = state.shots.filter((shot) => shot.y > 18);
  for (const shot of state.shots) {
    for (const foe of state.foes) {
      if (!foe.alive) continue;
      const [x, y] = foeAt(state, foe);
      if (Math.abs(shot.x - x) < 6 && Math.abs(shot.y - y) < 6) {
        foe.alive = false;
        state.alive -= 1;
        shot.y = -99;
        state.score += 10 + round * 5;
        events.push("pop");
        break;
      }
    }
  }
  state.shots = state.shots.filter((shot) => shot.y > 18);

  state.dropTimer -= dt;
  if (state.dropTimer <= 0 && state.alive > 0) {
    const living = state.foes.filter((foe) => foe.alive);
    const [x, y] = foeAt(state, living[Math.floor(roll(state) * living.length)]);
    state.drops.push({ x, y: y + 5 });
    state.dropTimer = Math.max(0.45, 1.5 - state.wave * 0.08 - round * 0.2) * (0.6 + roll(state) * 0.8);
  }
  for (const drop of state.drops) drop.y += (58 + round * 14) * dt;
  state.drops = state.drops.filter((drop) => drop.y < GROUND);

  const struck = state.drops.some((drop) => Math.abs(drop.x - state.player) < 6 && drop.y > GROUND - 13);
  const landed = state.foes.some((foe) => foe.alive && foeAt(state, foe)[1] > GROUND - 16);
  if (struck || landed) {
    state.lives -= 1;
    if (state.lives <= 0) {
      state.over = true;
      events.push("over");
      return events;
    }
    events.push("hit");
    if (landed) muster(state);
    else {
      state.drops = [];
      state.wait = 1;
    }
    return events;
  }

  if (state.alive === 0) {
    state.wave += 1;
    state.score += 100;
    events.push("letter");
    if (state.wave % NAME.length === 0) {
      state.score += 1000;
      state.lives = Math.min(5, state.lives + 1);
      events.push("name");
    }
    muster(state);
  }
  return events;
}
