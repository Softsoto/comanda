/**
 * "Muro de Faroles": abajo, Natha sostiene un abanico de papel y hace rebotar
 * una pelota de luz. Arriba cuelga un muro de faroles con la forma de una letra
 * de NATHALIA; al apagarlos todos, esa letra queda juntada. Después de la A
 * final vuelve a empezar, con faroles más duros y la luz más rápida.
 */

import { paintSprite, rect, type Ctx } from "../art";
import { UI } from "../texts";
import { worldName } from "../worlds";
import {
  DIM,
  FLOWER,
  FLOWER_COLORS,
  GOLD,
  HEIGHT,
  INK,
  LETTER_SHAPES,
  NAME,
  NINJA,
  NINJA_COLORS,
  NIGHT,
  WIDTH,
  center,
  drawFrame,
  drawName,
  drawTop,
  lookOf,
  outlined,
  widthOf,
} from "./kit";
import { WORLDS } from "./kit";
import { defineGame, roll, type Out } from "./types";

/* ---------- Medidas ---------- */

/** Techo: la luz rebota aquí, justo debajo del marcador. */
const CEIL = 26;
/** Cada farol mide 17 × 8, con un píxel de aire entre uno y otro. */
const BRICK_W = 17;
const BRICK_H = 8;
const PITCH_X = 18;
const PITCH_Y = 9;
const WALL_LEFT = Math.round((WIDTH - 5 * PITCH_X + 1) / 2);
const WALL_TOP = 40;
/** Borde de arriba del abanico; Natha va justo debajo. */
const PADDLE_Y = 200;
const PADDLE_H = 4;
const GROUND = 213;
const NARROW = 24;
const WIDE = 36;
const BALL_R = 2;
const PADDLE_SPEED = 120;
/** Ángulo máximo de salida desde el abanico (desde la vertical). Así la luz nunca va casi horizontal. */
const MAX_ANGLE = (60 * Math.PI) / 180;
const MIN_ANGLE = (6 * Math.PI) / 180;
const WIDE_TIME = 10;
const PAUSE = 1.8;

/* ---------- Estado ---------- */

type Lantern = { x: number; y: number; hp: number; tint: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; tint: number };
type Flash = { x: number; y: number; life: number };

type State = {
  random: number;
  time: number;
  score: number;
  lives: number;
  level: number;
  /** Letras de NATHALIA juntadas en esta vuelta (0 a 8). */
  letters: number;
  paddle: number;
  facing: number;
  wide: number;
  ball: { x: number; y: number; vx: number; vy: number; stuck: boolean; offset: number };
  /** Faroles apagados en este nivel: la luz se apura un poco con cada uno. */
  broken: number;
  lanterns: Lantern[];
  flower: { x: number; y: number } | null;
  sparks: Spark[];
  flashes: Flash[];
  /** Pausa después de juntar una letra (en segundos). */
  wait: number;
  secretDone: boolean;
  over: boolean;
};

const roundOf = (level: number) => Math.floor((level - 1) / NAME.length);
const letterIndex = (level: number) => (level - 1) % NAME.length;
const worldOf = (level: number) => (level - 1) % WORLDS;
const widthOf_ = (state: State) => (state.wide > 0 ? WIDE : NARROW);
const pointsOf = (level: number) => 10 + 5 * roundOf(level);

/** Rapidez de la luz: sube con cada letra, con cada vuelta y un poco con cada farol apagado. */
function speedOf(state: State) {
  const base = 82 + 5 * letterIndex(state.level) + 22 * roundOf(state.level);
  return Math.min(200, base + Math.min(20, state.broken));
}

/** Arma el muro con la forma de la letra del nivel. */
function buildWall(state: State) {
  const shape = LETTER_SHAPES[NAME[letterIndex(state.level)]];
  const round = roundOf(state.level);
  state.lanterns = [];
  shape.forEach((line, row) => {
    for (let column = 0; column < line.length; column++) {
      if (line[column] !== "#") continue;
      // En la segunda vuelta, uno de cada dos faroles es más duro; desde la tercera, todos.
      const hard = round >= 2 || (round === 1 && (row + column) % 2 === 0);
      state.lanterns.push({
        x: WALL_LEFT + column * PITCH_X,
        y: WALL_TOP + row * PITCH_Y,
        hp: hard ? 2 : 1,
        tint: (row * 2 + column * 3 + state.level) % TINTS.length,
      });
    }
  });
  state.broken = 0;
}

/** La luz vuelve a quedar pegada al abanico, esperando que se lance. */
function attach(state: State) {
  state.ball = { x: state.paddle, y: PADDLE_Y - BALL_R, vx: 0, vy: 0, stuck: true, offset: 0 };
}

function create(seed: number): State {
  const state: State = {
    random: seed >>> 0,
    time: 0,
    score: 0,
    lives: 3,
    level: 1,
    letters: 0,
    paddle: WIDTH / 2,
    facing: 1,
    wide: 0,
    ball: { x: 0, y: 0, vx: 0, vy: 0, stuck: true, offset: 0 },
    broken: 0,
    lanterns: [],
    flower: null,
    sparks: [],
    flashes: [],
    wait: 0,
    secretDone: false,
    over: false,
  };
  buildWall(state);
  attach(state);
  return state;
}

/** Lanza la luz hacia arriba, un poco ladeada al azar. */
function launch(state: State) {
  const side = roll(state) < 0.5 ? -1 : 1;
  const angle = side * (0.25 + roll(state) * 0.3);
  const speed = speedOf(state);
  state.ball.vx = Math.sin(angle) * speed;
  state.ball.vy = -Math.cos(angle) * speed;
  state.ball.stuck = false;
}

/** Apaga (o agrieta) un farol: puntos, destello, chispas y a veces una flor. */
function hitLantern(state: State, index: number, out: Out) {
  const lantern = state.lanterns[index];
  lantern.hp -= 1;
  if (lantern.hp > 0) {
    out.sound("drop");
    state.flashes.push({ x: lantern.x, y: lantern.y, life: 0.12 });
    return;
  }
  state.lanterns.splice(index, 1);
  state.broken += 1;
  state.score = Math.min(999999, state.score + pointsOf(state.level));
  out.sound("clear");
  state.flashes.push({ x: lantern.x, y: lantern.y, life: 0.2 });
  for (let i = 0; i < 6; i++) {
    state.sparks.push({
      x: lantern.x + 3 + roll(state) * (BRICK_W - 6),
      y: lantern.y + 2 + roll(state) * 4,
      vx: (roll(state) - 0.5) * 50,
      vy: -20 - roll(state) * 30,
      life: 0.5 + roll(state) * 0.4,
      tint: lantern.tint,
    });
  }
  if (!state.flower && state.lanterns.length > 0 && roll(state) < 0.12) {
    state.flower = { x: lantern.x + (BRICK_W - 5) / 2, y: lantern.y + 2 };
  }
}

/** Se juntó la letra del nivel. */
function finishLetter(state: State, out: Out) {
  state.score = Math.min(999999, state.score + 200);
  state.letters = letterIndex(state.level) + 1;
  state.wait = PAUSE;
  state.flower = null;
  state.ball.stuck = true;
  if (state.letters === NAME.length) {
    state.lives = Math.min(6, state.lives + 1);
    out.sound("letter");
    out.say(`${NAME}. ${UI.lives}: ${state.lives}`);
    if (!state.secretDone) {
      state.secretDone = true;
      out.secret();
    }
  } else {
    out.sound("clear2");
    out.say(`${NAME[letterIndex(state.level)]}.`);
  }
}

/** Mueve la luz en pasos de un píxel o menos, para que no atraviese nada aunque vaya rápido. */
function moveBall(state: State, dt: number, out: Out) {
  const ball = state.ball;
  const half = widthOf_(state) / 2;
  const distance = Math.hypot(ball.vx, ball.vy) * dt;
  const steps = Math.max(1, Math.ceil(distance));
  for (let step = 0; step < steps; step++) {
    const px = ball.x;
    const py = ball.y;
    ball.x += (ball.vx * dt) / steps;
    ball.y += (ball.vy * dt) / steps;

    // Paredes y techo.
    if (ball.x < 1 + BALL_R) {
      ball.x = 1 + BALL_R;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x > WIDTH - 1 - BALL_R) {
      ball.x = WIDTH - 1 - BALL_R;
      ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y < CEIL + BALL_R) {
      ball.y = CEIL + BALL_R;
      ball.vy = Math.abs(ball.vy);
    }

    // Faroles: se mira de qué lado venía la luz para saber hacia dónde rebota.
    const index = state.lanterns.findIndex(
      (l) => ball.x + BALL_R > l.x && ball.x - BALL_R < l.x + BRICK_W && ball.y + BALL_R > l.y && ball.y - BALL_R < l.y + BRICK_H,
    );
    if (index >= 0) {
      const l = state.lanterns[index];
      const wasBeside = px + BALL_R <= l.x || px - BALL_R >= l.x + BRICK_W;
      const wasAbove = py + BALL_R <= l.y || py - BALL_R >= l.y + BRICK_H;
      if (wasAbove || !wasBeside) ball.vy = py < l.y + BRICK_H / 2 ? -Math.abs(ball.vy) : Math.abs(ball.vy);
      else ball.vx = px < l.x + BRICK_W / 2 ? -Math.abs(ball.vx) : Math.abs(ball.vx);
      ball.x = px;
      ball.y = py;
      hitLantern(state, index, out);
      if (state.lanterns.length === 0) {
        finishLetter(state, out);
        return;
      }
    }

    // El abanico: el ángulo depende de dónde toca la luz (en el centro sale casi derecha).
    if (ball.vy > 0 && py + BALL_R <= PADDLE_Y && ball.y + BALL_R >= PADDLE_Y && Math.abs(ball.x - state.paddle) <= half + BALL_R) {
      const offset = Math.max(-1, Math.min(1, (ball.x - state.paddle) / (half + BALL_R)));
      let angle = offset * MAX_ANGLE;
      if (Math.abs(angle) < MIN_ANGLE) angle = (offset < 0 ? -1 : offset > 0 ? 1 : roll(state) < 0.5 ? -1 : 1) * MIN_ANGLE;
      const speed = speedOf(state);
      ball.vx = Math.sin(angle) * speed;
      ball.vy = -Math.cos(angle) * speed;
      ball.y = PADDLE_Y - BALL_R;
      out.sound("move");
    }

    if (ball.y - BALL_R > GROUND + 2) {
      loseBall(state, out);
      return;
    }
  }
  keepAngle(ball);
}

/** Por si acaso: la luz nunca queda yendo casi de lado (rebotaría de pared a pared para siempre). */
function keepAngle(ball: State["ball"]) {
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed === 0) return;
  const least = speed * Math.cos(MAX_ANGLE + 0.05);
  if (Math.abs(ball.vy) < least) {
    ball.vy = (ball.vy < 0 ? -1 : 1) * least;
    ball.vx = (ball.vx < 0 ? -1 : 1) * Math.sqrt(speed * speed - least * least);
  }
}

function loseBall(state: State, out: Out) {
  state.lives -= 1;
  state.wide = 0;
  state.flower = null;
  if (state.lives <= 0) {
    state.lives = 0;
    state.over = true;
    state.ball.stuck = true;
    out.sound("over");
    out.say(UI.gameOver);
    return;
  }
  out.sound("lock");
  out.say(`${UI.lives}: ${state.lives}`);
  attach(state);
}

/* ---------- Dibujo ---------- */

/** Colores cálidos de los faroles: cuerpo, sombra y luz de adentro. */
const TINTS = [
  ["#ee4f2c", "#a8301f", "#ffd27a"],
  ["#ff8a3a", "#b8551c", "#fff0a8"],
  ["#f2678f", "#a83a62", "#ffe0e8"],
  ["#f2b33d", "#a8711c", "#fff6c8"],
  ["#d9364a", "#8a1f33", "#ffb08a"],
] as const;
const OUTLINE = "#1a0f14";

function drawLantern(c: Ctx, l: Lantern) {
  const [body, shade, light] = TINTS[l.tint];
  // Contorno con esquinas redondeadas.
  rect(c, l.x + 1, l.y, BRICK_W - 2, BRICK_H, OUTLINE);
  rect(c, l.x, l.y + 1, BRICK_W, BRICK_H - 2, OUTLINE);
  rect(c, l.x + 1, l.y + 1, BRICK_W - 2, BRICK_H - 2, body);
  rect(c, l.x + 1, l.y + BRICK_H - 2, BRICK_W - 2, 1, shade);
  // La luz de la vela, por dentro.
  rect(c, l.x + 5, l.y + 2, BRICK_W - 10, 3, light);
  rect(c, l.x + 7, l.y + 3, BRICK_W - 14, 1, "#ffffff");
  // Franjas de bambú del farol.
  for (const dx of [3, 8, 13]) rect(c, l.x + dx, l.y + 1, 1, BRICK_H - 2, shade);
  if (l.hp > 1) {
    // Faroles duros: tapas de laca oscura con clavitos dorados.
    rect(c, l.x + 1, l.y + 1, BRICK_W - 2, 1, OUTLINE);
    rect(c, l.x + 1, l.y + BRICK_H - 2, BRICK_W - 2, 1, OUTLINE);
    for (const dx of [2, 8, 14]) {
      rect(c, l.x + dx, l.y + 1, 1, 1, GOLD);
      rect(c, l.x + dx, l.y + BRICK_H - 2, 1, 1, GOLD);
    }
  }
}

function drawPaddle(c: Ctx, state: State, time: number, still: boolean) {
  const width = widthOf_(state);
  const left = Math.round(state.paddle - width / 2);
  const ending = state.wide > 0 && state.wide < 2 && !still && Math.floor(time * 8) % 2 === 0;
  const paper = state.wide > 0 && !ending ? "#ffd6e6" : "#f3e3c0";
  // Abanico de papel: contorno, papel, varillas y puntas rojas.
  rect(c, left, PADDLE_Y, width, PADDLE_H, OUTLINE);
  rect(c, left + 1, PADDLE_Y + 1, width - 2, PADDLE_H - 2, paper);
  for (let x = left + 3; x < left + width - 2; x += 4) rect(c, x, PADDLE_Y + 1, 1, PADDLE_H - 2, "#c79a5a");
  rect(c, left + 1, PADDLE_Y + 1, 2, PADDLE_H - 2, "#d5422d");
  rect(c, left + width - 3, PADDLE_Y + 1, 2, PADDLE_H - 2, "#d5422d");
  // Natha debajo, sosteniéndolo.
  paintSprite(c, NINJA[0], NINJA_COLORS, Math.round(state.paddle) - 4, PADDLE_Y + PADDLE_H, state.facing > 0);
}

function drawBall(c: Ctx, x: number, y: number) {
  const bx = Math.round(x) - 2;
  const by = Math.round(y) - 2;
  // Brillo alrededor: una cruz suave del color de la luz.
  c.fillStyle = "rgba(255, 214, 132, 0.45)";
  c.fillRect(bx + 1, by - 1, 2, 6);
  c.fillRect(bx - 1, by + 1, 6, 2);
  rect(c, bx + 1, by, 2, 4, "#fff6c8");
  rect(c, bx, by + 1, 4, 2, "#fff6c8");
  rect(c, bx + 1, by + 1, 1, 1, "#ffffff");
}

const game = defineGame<State>({
  help: "Flechas o el dedo para mover el abanico de Natha; espacio o un toque para lanzar la luz. Apaga los faroles: cada muro es una letra de su nombre.",
  create: (seed) => create(seed),
  pad: () => [
    [
      { key: "left", glyph: "←", label: "Izquierda" },
      { key: "right", glyph: "→", label: "Derecha" },
    ],
    [{ key: "fire", glyph: "★", label: "Lanzar", main: true }],
  ],
  step(state, dt, input, out) {
    if (state.over) return;
    dt = Math.max(0, Math.min(0.05, dt));
    state.time += dt;

    // El abanico: con flechas va a velocidad fija; con el dedo, sigue la x del dedo.
    const half = widthOf_(state) / 2;
    const touch = input.touches[0];
    const before = state.paddle;
    if (touch) {
      const reach = 400 * dt;
      state.paddle += Math.max(-reach, Math.min(reach, touch.x - state.paddle));
    } else {
      const move = (input.held.has("right") ? 1 : 0) - (input.held.has("left") ? 1 : 0);
      state.paddle += move * PADDLE_SPEED * dt;
    }
    state.paddle = Math.max(1 + half, Math.min(WIDTH - 1 - half, state.paddle));
    if (state.paddle !== before) state.facing = state.paddle > before ? 1 : -1;

    // Chispas y destellos (también siguen durante la pausa).
    for (const spark of state.sparks) {
      spark.vy += 140 * dt;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.life -= dt;
    }
    state.sparks = state.sparks.filter((s) => s.life > 0 && s.y < GROUND);
    for (const flash of state.flashes) flash.life -= dt;
    state.flashes = state.flashes.filter((f) => f.life > 0);

    if (state.wait > 0) {
      state.wait -= dt;
      if (state.wait <= 0) {
        state.wait = 0;
        state.level += 1;
        if (state.letters >= NAME.length) state.letters = 0;
        buildWall(state);
        attach(state);
        out.sound("level");
        out.say(`${UI.level} ${state.level}. ${worldName(worldOf(state.level))}.`);
      }
      return;
    }

    if (state.wide > 0) state.wide = Math.max(0, state.wide - dt);

    // La flor de cerezo cae; si el abanico la toca, se ensancha un rato.
    if (state.flower) {
      state.flower.y += 40 * dt;
      const f = state.flower;
      const halfNow = widthOf_(state) / 2;
      if (f.y + 5 >= PADDLE_Y && f.y <= PADDLE_Y + PADDLE_H && f.x + 5 >= state.paddle - halfNow && f.x <= state.paddle + halfNow) {
        state.flower = null;
        state.wide = WIDE_TIME;
        state.paddle = Math.max(1 + WIDE / 2, Math.min(WIDTH - 1 - WIDE / 2, state.paddle));
        out.sound("level");
      } else if (f.y > GROUND) state.flower = null;
    }

    const ball = state.ball;
    if (ball.stuck) {
      ball.x = state.paddle;
      ball.y = PADDLE_Y - BALL_R;
      if (input.pressed.includes("fire") || input.taps.length > 0) {
        launch(state);
        out.sound("rotate");
      }
      return;
    }
    moveBall(state, dt, out);
  },
  draw(c, state, time, still) {
    const world = worldOf(state.level);
    const look = lookOf(world);
    drawFrame(c, world);
    drawTop(c, state.score, state.lives);
    drawName(c, 15, state.letters, 1, !still && !state.over && state.wait <= 0, time);
    rect(c, 1, CEIL - 1, WIDTH - 2, 1, look.wall);

    // Cuerdas: cada columna de faroles cuelga del techo.
    for (let column = 0; column < 5; column++) {
      const x = WALL_LEFT + column * PITCH_X;
      let top = Infinity;
      for (const l of state.lanterns) if (l.x === x) top = Math.min(top, l.y);
      if (top < Infinity) rect(c, x + Math.floor(BRICK_W / 2), CEIL, 1, top - CEIL, look.edge);
    }
    for (const l of state.lanterns) drawLantern(c, l);

    if (!still) {
      for (const f of state.flashes) {
        c.fillStyle = `rgba(255, 246, 200, ${Math.min(1, f.life * 5).toFixed(2)})`;
        c.fillRect(f.x - 1, f.y - 1, BRICK_W + 2, BRICK_H + 2);
      }
      for (const s of state.sparks) rect(c, Math.round(s.x), Math.round(s.y), 1, s.life > 0.25 ? 2 : 1, TINTS[s.tint][2]);
    }
    if (state.flower) paintSprite(c, FLOWER, FLOWER_COLORS, Math.round(state.flower.x), Math.round(state.flower.y));

    // Suelo y nivel.
    rect(c, 1, GROUND, WIDTH - 2, HEIGHT - GROUND - 1, look.ground);
    rect(c, 1, GROUND, WIDTH - 2, 1, look.grass);
    center(c, `${UI.level} ${state.level}`, GROUND + 3, roundOf(state.level) > 0 ? GOLD : INK);

    drawPaddle(c, state, time, still);
    if (state.wait <= 0 && !state.over) drawBall(c, state.ball.x, state.ball.y);

    if (state.wait > 0) {
      if (state.letters === NAME.length) {
        outlined(c, NAME, Math.round((WIDTH - widthOf(NAME, 2)) / 2), 120, GOLD, 2);
        outlined(c, "+1 VIDA", Math.round((WIDTH - widthOf("+1 VIDA")) / 2), 142, INK);
      } else {
        const char = NAME[state.letters - 1];
        outlined(c, char, Math.round((WIDTH - widthOf(char, 4)) / 2), 108, GOLD, 4);
        outlined(c, "+200", Math.round((WIDTH - widthOf("+200")) / 2), 144, INK);
      }
    } else if (state.ball.stuck && !state.over && (still || Math.floor(time * 2) % 2 === 0)) {
      const hint = "LANZAR";
      outlined(c, hint, Math.round((WIDTH - widthOf(hint)) / 2), 160, DIM);
    }
    if (state.over) {
      rect(c, 1, 112, WIDTH - 2, 15, NIGHT);
      center(c, "FIN", 116, INK);
    }
  },
  status: (state) => ({
    score: Math.min(999999, Math.round(state.score)),
    lives: state.lives,
    level: state.level,
    letters: state.letters,
    world: worldOf(state.level),
    over: state.over,
  }),
});

export default game;
