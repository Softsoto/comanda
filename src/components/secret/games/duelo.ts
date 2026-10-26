/**
 * "Duelo de Lunas": dos faroles de papel se pasan una lunita de un lado al otro.
 * El farol de abajo es tuyo; el de arriba es de la máquina (modo "1") o de otra
 * persona en el mismo aparato (modo "2"). La luna rebota en las paredes de los
 * lados y sale torcida según dónde toque el farol. Gana quien llegue a 7.
 */

import { paintSprite, rect, type Ctx } from "../art";
import { DIM, GOLD, HEART, HEIGHT, INK, MOON, MOON_COLORS, WIDTH, center, drawFrame, lookOf, outlined, widthOf, write } from "./kit";
import { WORLDS } from "./kit";
import { defineGame, roll, type Input, type Out } from "./types";

/* ---------- Medidas ---------- */

/** Hasta dónde llega el marcador; de aquí para abajo está la cancha. */
export const FIELD_TOP = 24;
/** Fila de arriba de cada farol (miden 20 × 5). */
export const TOP_Y = 32;
export const BOTTOM_Y = 198;
export const PADDLE_W = 20;
export const PADDLE_H = 5;
const HALF = PADDLE_W / 2;
/** La luna mide 5 × 5; guardamos su centro. */
const MOON_R = 2;
/** La raya del medio y donde espera la luna antes de salir. */
export const MIDDLE = Math.round((TOP_Y + BOTTOM_Y + PADDLE_H) / 2);
export const TARGET = 7;
/** Los faroles no pasan de aquí (centro del farol). */
export const PADDLE_MIN = 1 + HALF + 1;
export const PADDLE_MAX = WIDTH - 1 - HALF - 1;
/** La luna rebota en estas columnas (centro de la luna). */
export const BALL_MIN = 1 + MOON_R + 0.5;
export const BALL_MAX = WIDTH - 1 - MOON_R - 0.5;

/** Velocidades en píxeles por segundo. */
const KEY_SPEED = 115;
const FINGER_SPEED = 320;
/** Lo más torcida que sale la luna de un golpe (en radianes; 1 ≈ 57°). */
const MAX_ANGLE = 1.05;
const SERVE_WAIT = 1;
const START_WAIT = 1.6;

/* ---------- Estado ---------- */

type Side = "bottom" | "top";

type State = {
  mode: string;
  random: number;
  time: number;
  level: number;
  score: number;
  /** Faroles: la x de su centro. */
  bottom: number;
  top: number;
  /** Puntos del partido: [abajo, arriba]. */
  points: [number, number];
  ball: { x: number; y: number; vx: number; vy: number; speed: number };
  /** Segundos que la luna espera en el centro; 0 = en juego. */
  wait: number;
  /** Hacia dónde sale la luna: 1 = hacia abajo, -1 = hacia arriba. */
  serveTo: 1 | -1;
  /** Si es el saque que abre un partido (para mostrar de quién es cada lado). */
  opening: boolean;
  /** Error con el que apunta la máquina en este golpe (se sortea en cada golpe tuyo). */
  aiError: number;
  /** Últimas posiciones de la luna (estela). */
  trail: { x: number; y: number }[];
  /** Destello del último golpe: dónde y hace cuánto. */
  flash: { x: number; y: number; age: number; side: Side } | null;
  secretGiven: boolean;
  over: boolean;
  result?: string;
};

const twoPlayers = (mode: string) => mode === "2";
const worldOf = (state: State) => (twoPlayers(state.mode) ? 0 : (state.level - 1) % WORLDS);
const clampX = (x: number) => Math.min(PADDLE_MAX, Math.max(PADDLE_MIN, x));

/** Rapidez de la luna al salir, y su tope, según el nivel. */
const baseSpeed = (level: number) => Math.min(130, 72 + 9 * (level - 1));
const maxSpeed = (level: number) => Math.min(230, baseSpeed(level) * 1.75);
/** La máquina: qué tan rápido se mueve, cuánto se equivoca y cuánto adivina hacia dónde va la luna. */
const aiSpeed = (level: number) => Math.min(160, 58 + 14 * (level - 1));
const aiErrorMax = (level: number) => Math.max(2, 8 - 1.2 * (level - 1));
/** Probabilidad de que la máquina se distraiga y apunte fuera (así los peloteos no son eternos). */
const aiMissChance = (level: number) => Math.max(0.04, 0.2 - 0.03 * (level - 1));

/** Sortea cuánto se va a equivocar la máquina al devolver la próxima luna. */
function aimAi(state: State) {
  if (roll(state) < aiMissChance(state.level)) {
    const side = roll(state) < 0.5 ? -1 : 1;
    state.aiError = side * (HALF + MOON_R + 2 + roll(state) * 5);
  } else state.aiError = (roll(state) * 2 - 1) * aiErrorMax(state.level);
}
const aiSkill = (level: number) => Math.min(1, 0.25 + 0.15 * (level - 1));

function create(seed: number, mode: string): State {
  const state: State = {
    mode: mode === "2" ? "2" : "1",
    random: seed >>> 0,
    time: 0,
    level: 1,
    score: 0,
    bottom: WIDTH / 2,
    top: WIDTH / 2,
    points: [0, 0],
    ball: { x: WIDTH / 2, y: MIDDLE, vx: 0, vy: 0, speed: baseSpeed(1) },
    wait: START_WAIT,
    serveTo: 1,
    opening: true,
    aiError: 0,
    trail: [],
    flash: null,
    secretGiven: false,
    over: false,
  };
  // En dos jugadores, la suerte decide quién recibe primero; contra la máquina, siempre tú.
  if (state.mode === "2") state.serveTo = roll(state) < 0.5 ? 1 : -1;
  return state;
}

/** Pone la luna en el centro a esperar, para salir luego hacia `to`. */
function resetBall(state: State, to: 1 | -1, wait: number) {
  state.ball = { x: WIDTH / 2, y: MIDDLE, vx: 0, vy: 0, speed: baseSpeed(state.level) };
  state.serveTo = to;
  state.wait = wait;
  state.trail = [];
}

function serve(state: State, out: Out) {
  const angle = (roll(state) * 2 - 1) * 0.6;
  const { ball } = state;
  ball.vx = ball.speed * Math.sin(angle);
  ball.vy = state.serveTo * ball.speed * Math.cos(angle);
  state.opening = false;
  out.sound("rotate");
}

/** Dónde cruzará la luna la fila `y`, contando los rebotes en las paredes. */
function landingX(state: State, y: number): number {
  const { ball } = state;
  if (ball.vy === 0) return ball.x;
  const time = (y - ball.y) / ball.vy;
  if (time < 0) return ball.x;
  const span = BALL_MAX - BALL_MIN;
  let x = ball.x + ball.vx * time - BALL_MIN;
  x = ((x % (2 * span)) + 2 * span) % (2 * span);
  return BALL_MIN + (x > span ? 2 * span - x : x);
}

/** Mueve un farol hacia `target` sin pasar de `speed`. */
const approach = (from: number, target: number, speed: number, dt: number) =>
  clampX(from + Math.max(-speed * dt, Math.min(speed * dt, target - from)));

function moveBottom(state: State, dt: number, input: Input) {
  const finger = twoPlayers(state.mode) ? input.touches.find((t) => t.y >= MIDDLE) : input.touches[0];
  if (finger) state.bottom = approach(state.bottom, finger.x, FINGER_SPEED, dt);
  else state.bottom = clampX(state.bottom + ((input.held.has("right") ? 1 : 0) - (input.held.has("left") ? 1 : 0)) * KEY_SPEED * dt);
}

function moveTop(state: State, dt: number, input: Input) {
  if (twoPlayers(state.mode)) {
    const finger = input.touches.find((t) => t.y < MIDDLE);
    if (finger) state.top = approach(state.top, finger.x, FINGER_SPEED, dt);
    else state.top = clampX(state.top + ((input.held.has("right2") ? 1 : 0) - (input.held.has("left2") ? 1 : 0)) * KEY_SPEED * dt);
    return;
  }
  // La máquina: si la luna viene, va a su encuentro (adivinando mejor con el nivel); si se aleja, vuelve al centro.
  const { ball, level } = state;
  let target = WIDTH / 2;
  if (state.wait <= 0 && ball.vy < 0) {
    const skill = aiSkill(level);
    target = ball.x * (1 - skill) + landingX(state, TOP_Y + PADDLE_H + MOON_R) * skill + state.aiError;
  } else if (state.wait <= 0) target = WIDTH / 2 + (ball.x - WIDTH / 2) * 0.3;
  state.top = approach(state.top, target, aiSpeed(level), dt);
}

/** La luna sale del farol más torcida cuanto más lejos del centro lo toca, y un poco más rápida. */
function bounce(state: State, paddleX: number, dir: 1 | -1) {
  const { ball } = state;
  const offset = Math.max(-1, Math.min(1, (ball.x - paddleX) / (HALF + MOON_R)));
  ball.speed = Math.min(maxSpeed(state.level), ball.speed * 1.05 + 2);
  const angle = offset * MAX_ANGLE;
  ball.vx = ball.speed * Math.sin(angle);
  ball.vy = dir * ball.speed * Math.cos(angle);
}

function point(state: State, winner: Side, out: Out) {
  const solo = !twoPlayers(state.mode);
  state.points[winner === "bottom" ? 0 : 1] += 1;
  const [down, up] = state.points;
  state.flash = null;
  if (solo && winner === "bottom") state.score = Math.min(999999, state.score + 100);

  if (down >= TARGET || up >= TARGET) {
    if (!solo) {
      state.over = true;
      state.result = down >= TARGET ? "¡Gana el farol de abajo!" : "¡Gana el farol de arriba!";
      out.sound("over");
      out.say(state.result);
      resetBall(state, 1, 0);
      return;
    }
    if (up >= TARGET) {
      state.over = true;
      out.sound("over");
      out.say(`La máquina gana ${up} a ${down}.`);
      resetBall(state, 1, 0);
      return;
    }
    // Ganaste el partido: premio, el secreto la primera vez y un partido nuevo más difícil.
    state.score = Math.min(999999, state.score + 500);
    if (!state.secretGiven) {
      state.secretGiven = true;
      out.secret();
    }
    state.level += 1;
    state.points = [0, 0];
    state.top = WIDTH / 2;
    out.sound("level");
    out.say(`¡Ganaste ${down} a ${up}! Nivel ${state.level}.`);
    resetBall(state, 1, START_WAIT);
    state.opening = true;
    return;
  }

  out.sound(solo && winner === "top" ? "lock" : "clear");
  out.say(solo ? `Tú ${down}, máquina ${up}.` : `Abajo ${down}, arriba ${up}.`);
  // La luna sale hacia quien perdió el punto.
  resetBall(state, winner === "bottom" ? -1 : 1, SERVE_WAIT);
}

/** Un pasito corto de la luna (así no atraviesa los faroles aunque vaya rápido). */
function moveBall(state: State, dt: number, out: Out) {
  const { ball } = state;
  const before = ball.y;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.x < BALL_MIN) {
    ball.x = 2 * BALL_MIN - ball.x;
    ball.vx = Math.abs(ball.vx);
    out.sound("drop");
  } else if (ball.x > BALL_MAX) {
    ball.x = 2 * BALL_MAX - ball.x;
    ball.vx = -Math.abs(ball.vx);
    out.sound("drop");
  }

  // Farol de abajo: la luna lo toca cuando su borde de abajo cruza la fila de arriba del farol.
  const bottomEdge = BOTTOM_Y - MOON_R;
  if (ball.vy > 0 && before <= bottomEdge && ball.y > bottomEdge && Math.abs(ball.x - state.bottom) <= HALF + MOON_R) {
    ball.y = bottomEdge - (ball.y - bottomEdge);
    bounce(state, state.bottom, -1);
    state.flash = { x: ball.x, y: BOTTOM_Y, age: 0, side: "bottom" };
    if (!twoPlayers(state.mode)) {
      state.score = Math.min(999999, state.score + 10);
      aimAi(state);
    }
    out.sound("move");
  }

  // Farol de arriba: igual, con el borde de arriba de la luna y la fila de abajo del farol.
  const topEdge = TOP_Y + PADDLE_H + MOON_R;
  if (ball.vy < 0 && before >= topEdge && ball.y < topEdge && Math.abs(ball.x - state.top) <= HALF + MOON_R) {
    ball.y = topEdge + (topEdge - ball.y);
    bounce(state, state.top, 1);
    state.flash = { x: ball.x, y: TOP_Y + PADDLE_H, age: 0, side: "top" };
    out.sound("move");
  }

  if (ball.y > HEIGHT + 4) point(state, "top", out);
  else if (ball.y < FIELD_TOP - 4) point(state, "bottom", out);
}

function step(state: State, dt: number, input: Input, out: Out) {
  if (state.over) return;
  dt = Math.max(0, Math.min(0.05, dt));
  state.time += dt;
  moveBottom(state, dt, input);
  moveTop(state, dt, input);
  if (state.flash) {
    state.flash.age += dt;
    if (state.flash.age > 0.3) state.flash = null;
  }

  if (state.wait > 0) {
    state.wait -= dt;
    if (state.wait <= 0) {
      state.wait = 0;
      serve(state, out);
    }
    return;
  }

  // Pasitos de 1/120 s como mucho.
  const parts = Math.max(1, Math.ceil(dt * 120));
  for (let part = 0; part < parts && state.wait <= 0 && !state.over; part++) moveBall(state, dt / parts, out);
  if (state.wait <= 0 && dt > 0) {
    state.trail.unshift({ x: state.ball.x, y: state.ball.y });
    if (state.trail.length > 9) state.trail.length = 9;
  }
}

/* ---------- Dibujo ---------- */

/** Colores de cada farol: papel, papel oscuro (franjas y sombra), luz de adentro y brillo alrededor. */
const PAPER = {
  bottom: { paper: "#ee4f2c", rib: "#a8301c", light: "#ffe58c", core: "#ffa23f", glow: "rgba(255, 170, 80, 0.09)" },
  top: { paper: "#d9508f", rib: "#8e2a5c", light: "#ffe0ef", core: "#ff9cc6", glow: "rgba(255, 150, 200, 0.09)" },
} as const;
const CAP = "#1a0f14";

function drawLantern(c: Ctx, x: number, y: number, side: Side, lit: boolean, still: boolean, time: number) {
  const p = PAPER[side];
  const left = Math.round(x) - HALF;
  // Luz cálida alrededor, en capas para que se vea redondeada (más fuerte justo después de un golpe).
  const glow = lit ? "rgba(255, 214, 132, 0.3)" : p.glow;
  // El halo no se sale del marco del tablero.
  const halo = (x: number, top: number, width: number, height: number, color: string) => {
    const from = Math.max(1, x);
    rect(c, from, top, Math.min(WIDTH - 1, x + width) - from, height, color);
  };
  halo(left - 1, y - 3, PADDLE_W + 2, PADDLE_H + 6, glow);
  halo(left - 4, y - 1, PADDLE_W + 8, PADDLE_H + 2, glow);
  rect(c, left + 3, y - 5, PADDLE_W - 6, PADDLE_H + 10, p.glow);
  // Papel: arriba su color, al medio la luz de adentro, abajo un tono de sombra.
  rect(c, left + 1, y + 1, PADDLE_W - 2, 1, p.paper);
  rect(c, left + 1, y + 2, PADDLE_W - 2, 1, p.core);
  rect(c, left + 1, y + 3, PADDLE_W - 2, 1, p.rib);
  const flicker = still ? 0 : Math.floor(time * 4) % 2;
  rect(c, left + 6 + flicker, y + 2, PADDLE_W - 13, 1, lit ? "#ffffff" : p.light);
  // Varillas del papel (no tapan la franja de luz).
  for (const rib of [4, 8, 11, 15]) {
    rect(c, left + rib, y + 1, 1, 1, p.rib);
    rect(c, left + rib, y + 3, 1, 1, CAP);
  }
  // Aros de arriba y abajo, y tapas oscuras en los extremos.
  rect(c, left + 2, y, PADDLE_W - 4, 1, CAP);
  rect(c, left + 2, y + PADDLE_H - 1, PADDLE_W - 4, 1, CAP);
  rect(c, left, y, 2, PADDLE_H, CAP);
  rect(c, left + PADDLE_W - 2, y, 2, PADDLE_H, CAP);
  rect(c, left + 1, y + 1, 1, PADDLE_H - 2, p.rib);
  rect(c, left + PADDLE_W - 2, y + 1, 1, PADDLE_H - 2, p.rib);
}

/** Escribe girado 180° alrededor del centro de la cancha, para quien juega del otro lado. */
function flipped(c: Ctx, paint: () => void, enabled: boolean) {
  if (!enabled) return paint();
  c.save();
  c.translate(WIDTH, 2 * MIDDLE);
  c.rotate(Math.PI);
  paint();
  c.restore();
}

function draw(c: Ctx, state: State, time: number, still: boolean) {
  const world = worldOf(state);
  const look = lookOf(world);
  const solo = !twoPlayers(state.mode);
  drawFrame(c, world);

  // Marcador de arriba.
  if (solo) {
    write(c, String(state.score), 5, 5, INK);
    const hearts = "♥".repeat(Math.max(0, TARGET - state.points[1]));
    write(c, hearts, WIDTH - 5 - widthOf(hearts), 5, HEART);
    center(c, `NIVEL ${state.level}`, 14, GOLD);
  } else {
    center(c, `PRIMERO A ${TARGET}`, 5, INK);
    center(c, "TOCA TU MITAD", 14, DIM);
  }
  rect(c, 1, FIELD_TOP - 1, WIDTH - 2, 1, look.edge);

  // Raya punteada del medio.
  for (let x = 3; x < WIDTH - 2; x += 8) rect(c, x, MIDDLE, 4, 1, look.edge);

  // Puntos grandes, cada uno cerca de su campo.
  const [down, up] = state.points;
  write(c, String(down), 7, MIDDLE + 6, PAPER.bottom.rib, 2);
  if (solo) write(c, String(up), 7, MIDDLE - 19, PAPER.top.rib, 2);
  else flipped(c, () => write(c, String(up), 7, MIDDLE + 6, PAPER.top.rib, 2), true);

  // Al empezar un partido, de quién es cada lado.
  if (state.opening && state.wait > 0) {
    if (solo) {
      center(c, "TÚ", BOTTOM_Y - 14, INK);
      center(c, "MÁQUINA", TOP_Y + 12, INK);
      if (state.level > 1) outlined(c, `NIVEL ${state.level}`, Math.round((WIDTH - widthOf(`NIVEL ${state.level}`, 2)) / 2), MIDDLE - 30, GOLD, 2);
    } else {
      center(c, "ABAJO", BOTTOM_Y - 14, INK);
      flipped(c, () => center(c, "ARRIBA", BOTTOM_Y - 14, INK), true);
    }
  }

  const lit = !still && state.flash !== null && state.flash.age < 0.12;
  drawLantern(c, state.top, TOP_Y, "top", lit && state.flash?.side === "top", still, time);
  drawLantern(c, state.bottom, BOTTOM_Y, "bottom", lit && state.flash?.side === "bottom", still, time + 0.5);

  // La luna (y su estela), recortada para que no tape el marcador.
  c.save();
  c.beginPath();
  c.rect(1, FIELD_TOP, WIDTH - 2, HEIGHT - FIELD_TOP - 1);
  c.clip();
  if (!still) {
    // Estela: puntos que se apagan y se achican detrás de la luna.
    state.trail.slice(2).forEach((spot, index) => {
      const size = index < 3 ? 3 : index < 5 ? 2 : 1;
      const alpha = [0.5, 0.42, 0.34, 0.28, 0.22, 0.16, 0.12][index] ?? 0.1;
      rect(c, Math.round(spot.x - size / 2), Math.round(spot.y - size / 2), size, size, `rgba(255, 228, 150, ${alpha})`);
    });
  }
  const { ball } = state;
  const blink = !still && state.wait > 0 && Math.floor(time * 4) % 2 === 1;
  if (!state.over) {
    rect(c, Math.round(ball.x) - 3, Math.round(ball.y) - 2, 7, 5, "rgba(255, 241, 184, 0.12)");
    rect(c, Math.round(ball.x) - 2, Math.round(ball.y) - 3, 5, 7, "rgba(255, 241, 184, 0.12)");
    if (!blink) paintSprite(c, MOON, MOON_COLORS, Math.round(ball.x) - 2, Math.round(ball.y) - 2);
  }
  c.restore();

  // Destello al golpear: chispitas que se abren en abanico desde donde tocó.
  if (!still && state.flash) {
    const { x, y, age, side } = state.flash;
    const reach = 3 + age * 40;
    const dir = side === "bottom" ? -1 : 1;
    const color = age < 0.12 ? "#ffffff" : GOLD;
    const size = age < 0.18 ? 2 : 1;
    for (const angle of [-1.3, -0.65, 0, 0.65, 1.3]) {
      const sx = Math.round(x + Math.sin(angle) * reach);
      const sy = Math.round(y + dir * Math.cos(angle) * reach * 0.8);
      rect(c, sx - (size >> 1), sy - (size >> 1), size, size, color);
    }
  }

  if (state.over) {
    const text = solo ? "FIN" : state.points[0] >= TARGET ? "GANA ABAJO" : "GANA ARRIBA";
    outlined(c, text, Math.round((WIDTH - widthOf(text, 2)) / 2), MIDDLE - 7, GOLD, 2);
  }
}

export default defineGame<State>({
  help: "Mueve tu farol con las flechas o con el dedo para devolver la luna; según dónde la toques sale más torcida. Gana quien llegue primero a 7 puntos. Entre dos personas, el farol de arriba se mueve con A y D o tocando la mitad de arriba.",
  create,
  step,
  draw,
  pad: (mode) =>
    mode === "2"
      ? [[], []]
      : [
          [
            { key: "left", glyph: "←", label: "Izquierda", main: true },
            { key: "right", glyph: "→", label: "Derecha", main: true },
          ],
          [],
        ],
  twoPlayers,
  status: (state) => ({
    score: twoPlayers(state.mode) ? 0 : state.score,
    lives: twoPlayers(state.mode) ? 0 : TARGET - state.points[1],
    level: state.level,
    letters: 0,
    world: worldOf(state),
    over: state.over,
    result: state.result,
  }),
});
