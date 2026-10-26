import assert from "node:assert/strict";
import { test } from "node:test";
import pinball, { BUMPERS, CAPTIVE, CATS, DISC, DROPS, FLOOR_SEGS, HT, MAGNET, MIDDLE, MISSIONS, MOUTH, MOUTHS, PATHS, R, RANKS, RANK_AT, RES, W, WALL, needOf, rankFor, spanOf, stepGoal, viewOf, type Ball, type Floor, type Seg } from "../src/components/secret/games/pinball";
import { WORLDS } from "../src/components/secret/games/kit";
import { noInput, quietOut, type Input, type Key } from "../src/components/secret/games/types";
import { GAME_NAME, setGameName } from "../src/lib/game-name";

type State = {
  score: number;
  lives: number;
  level: number;
  mult: number;
  letters: number;
  over: boolean;
  phase: "play" | "drain" | "over";
  balls: Ball[];
  flip: { angle: number; omega: number }[];
  pull: number;
  saveLeft: number;
  tilted: boolean;
  locked: number;
  lockLit: boolean;
  multiball: boolean;
  pendingMulti: boolean;
  spitQueue: number;
  autoPlunge: number;
  selected: number;
  active: number;
  stepIndex: number;
  stepCount: number;
  missionTime: number;
  missionsDone: number;
  rank: number;
  round: number;
  done: boolean[];
  lanes: boolean[];
  targetsLit: boolean[];
  drops: boolean[];
  dropSets: number;
  wall: { pos: number; up: boolean; hits: number; timer: number };
  mouth: number;
  chew: number;
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
  jackpotLit: boolean;
  superLit: boolean;
  combo: number;
  skillLane: number;
  magnetOff: number;
  bonus: number;
  bonusShown: number;
  ballNumber: number;
  message: string;
  messageTime: number;
  clock: number;
  shake: number;
  pops: unknown[];
  banner: { text: string; time: number };
};

const DT = 1 / 60;
const fresh = (seed = 7) => pinball.create(seed, "1") as State;
const step = (state: State, input: Input = noInput(), log?: string[], dt = DT) => pinball.step(state, dt, input, quietOut(log));
const keys = (...names: Key[]) => noInput({ held: new Set(names) });
const run = (state: State, seconds: number, input: Input = noInput(), log?: string[]) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) step(state, input, log);
};
/** Corre hasta que se cumpla algo (o se acabe el tiempo). Devuelve los segundos que tomó. */
const until = (state: State, done: () => boolean, seconds: number, input: Input = noInput(), log?: string[]) => {
  let frames = 0;
  while (!done() && frames < seconds / DT) {
    step(state, input, log);
    frames += 1;
  }
  return frames * DT;
};
/** Una bola suelta puesta a mano en un piso. */
const ballAt = (x: number, y: number, vx = 0, vy = 0, floor: Floor = 0): Ball => ({
  x,
  y,
  vx,
  vy,
  mode: "free",
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
const says = (log: string[], start: string) => log.some((entry) => entry.startsWith(`say:${start}`));
const random = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) >>> 0;
  return seed / 4294967296;
};

/** Lanza la bola del resorte manteniendo "fire" un rato. */
function plunge(state: State, hold = 0.7, log?: string[]) {
  run(state, hold, keys("fire"), log);
  step(state, noInput(), log);
}

/** Tiros a cada lugar de la mesa (para las misiones y las pruebas). */
const SHOTS = {
  lramp: () => ballAt(95, 262, 0, -650),
  cramp: () => ballAt(130, 256, 0, -650),
  loop: () => ballAt(164, 262, 0, -650),
  rramp: () => ballAt(197, 256, 0, -650),
  orbit: () => ballAt(20, 244, 0, -520),
  spin: () => ballAt(20, 250, 0, -640),
  bumper: () => ballAt(152, 112, 0, 120),
  disc: () => ballAt(128, 216, 0, -160),
  captive: () => ballAt(CAPTIVE.x, 176, 0, -620),
  moon: () => ballAt(MOUTH.x, 184, 0, -160),
  lane: (x = 152) => ballAt(x, 80, 0, 60),
};

/** Abre la boca de la luna (muralla abajo) para poder tirar a ella. */
function openMoon(state: State) {
  state.wall.up = false;
  state.wall.pos = 0;
  state.wall.timer = 0;
  state.mouth = 1;
  state.chew = 0;
}

/** Paletas automáticas sencillas: golpean cuando una bola llega cerca y sueltan enseguida (en cualquier piso). */
function makeBot(charge = 0.7) {
  const hold = [0, 0];
  const rest = [0, 0];
  let pull = 0;
  return (state: State): Input => {
    const held = new Set<Key>();
    for (const side of [0, 1]) {
      if (hold[side] > 0) {
        hold[side] -= DT;
        held.add(side ? "right" : "left");
        if (hold[side] <= 0) rest[side] = 0.25;
        continue;
      }
      if (rest[side] > 0) {
        rest[side] -= DT;
        continue;
      }
      if (state.balls.some((b) => b.mode === "free" && b.y > 352 && b.y < 400 && (side ? b.x >= MIDDLE[b.floor] : b.x < MIDDLE[b.floor]))) hold[side] = 0.2;
    }
    if (state.balls.some((b) => b.mode === "plunger")) {
      pull += DT;
      if (pull < charge) held.add("fire");
      else pull = 0;
    }
    return noInput({ held });
  };
}

function distanceToSegment(x: number, y: number, s: Seg) {
  const ex = s.bx - s.ax;
  const ey = s.by - s.ay;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * ex + (y - s.ay) * ey) / (ex * ex + ey * ey)));
  return Math.hypot(x - (s.ax + ex * t), y - (s.ay + ey * t));
}

/** La bola está dentro de su piso y no metida en ninguna pared. */
function assertInside(state: State, ball: Ball, where: string) {
  assert.ok(Number.isFinite(ball.x) && Number.isFinite(ball.y), `${where}: posición rota`);
  assert.ok([0, 1, 2].includes(ball.floor), `${where}: piso raro`);
  // En una rampa o en un tubo la bola va por encima de la mesa.
  if (ball.mode === "path") return;
  const at = `${where} piso ${ball.floor} (${ball.x.toFixed(1)}, ${ball.y.toFixed(1)}) ${ball.mode}`;
  const [left, right] = ball.floor === 0 ? [8, 248] : [28, 228];
  assert.ok(ball.x >= left + R - 0.5 && ball.x <= right - R + 0.5, `${at}: x fuera`);
  assert.ok(ball.y >= 56, `${at}: se salió por arriba`);
  if (ball.y < 172) {
    const [x0, x1] = spanOf(ball.floor, ball.y);
    assert.ok(ball.x > x0 && ball.x < x1, `${at}: fuera del arco`);
  }
  for (const s of FLOOR_SEGS[ball.floor]) {
    // Compuertas y aletas dejan pasar la bola de un lado; los objetivos caídos y la muralla abajo no están.
    if (s.face || s.kind === "door") continue;
    if (s.kind === "drop" && state.drops[s.id]) continue;
    if (s.kind === "mwall" && state.wall.pos <= 0.5) continue;
    assert.ok(distanceToSegment(ball.x, ball.y, s) > R + s.r - 1.5, `${at}: bola dentro de una pared (${s.kind} ${s.ax},${s.ay}-${s.bx},${s.by})`);
  }
}

/** Empieza la misión número `index` como si se hubiera elegido y se hubiera dado de comer a la luna. */
function startMission(state: State, index: number, log?: string[]) {
  state.selected = index;
  state.lockLit = false;
  openMoon(state);
  state.balls = [SHOTS.moon()];
  run(state, 0.3, noInput(), log);
  assert.equal(state.active, index, `no empezó la misión ${MISSIONS[index].name}`);
  run(state, 2.2, noInput(), log);
}

/** ¿Llegó a la cima de una rampa? Corre hasta que la bola suba o vuelva. */
function rampResult(state: State, seconds = 2.5): "made" | "fell" | "none" {
  let entered = false;
  for (let i = 0; i < seconds / DT; i++) {
    step(state);
    const ball = state.balls[0];
    if (!ball) return "none";
    if (ball.mode === "path" && !ball.path.startsWith("wire") && ball.path !== "drop") {
      entered = true;
      if (ball.made) return "made";
    } else if (entered) return "fell";
  }
  return entered ? "fell" : "none";
}

test("pinball: dibuja con el doble de detalle y empieza con 3 bolas, la bola sobre el resorte y los botones pedidos", () => {
  assert.equal(pinball.resolution, 2);
  assert.equal(RES, 2);
  assert.equal(W, 256);
  assert.equal(HT, 448);
  const state = fresh();
  assert.deepEqual(pinball.status(state), { score: 0, lives: 3, level: 1, letters: 0, world: 0, over: false });
  assert.equal(state.balls.length, 1);
  assert.equal(state.balls[0].mode, "plunger");
  run(state, 3);
  assert.equal(state.balls[0].mode, "plunger", "sin lanzar, la bola espera");
  assert.equal(state.saveLeft, 8, "el salvavidas no corre mientras la bola espera");
  assert.deepEqual(pinball.pad("1"), [
    [{ key: "left", glyph: "←", label: "Paleta izquierda" }],
    [
      { key: "right", glyph: "→", label: "Paleta derecha" },
      { key: "fire", glyph: "⤓", label: "Lanzar", main: true },
    ],
  ]);
  assert.ok(pinball.help.length > 20);
});

test("pinball: la mesa tiene cuatro rampas, dos órbitas, bumpers, objetivos, bola cautiva, disco, imán, luna y muralla", () => {
  assert.deepEqual(
    MOUTHS.map((m) => m.id),
    ["lramp", "cramp", "loop", "rramp"],
  );
  for (const id of ["lramp", "cramp", "loop", "rramp"] as const) assert.ok(PATHS[id].climb > 40 && needOf(id) > 300, `${id}: la rampa tiene subida`);
  assert.ok(BUMPERS.filter((b) => b.floor === 0 && b.kind === "pop").length >= 3);
  assert.equal(DROPS.length, 3);
  assert.equal(CATS.length, 3);
  assert.ok(FLOOR_SEGS[0].some((s) => s.kind === "mwall"));
  assert.ok(DISC.r > 8 && MAGNET.pull > 10);
  // Hay rampas a dos alturas (una pasa por encima de la otra).
  assert.ok(new Set(Object.values(PATHS).map((p) => p.level)).size >= 2);
});

test("pinball: hay al menos 12 misiones con pasos, 8 rangos o más", () => {
  assert.ok(MISSIONS.length >= 12);
  assert.ok(MISSIONS.filter((m) => m.time).length >= 3, "varias misiones van contra el reloj");
  assert.ok(MISSIONS.some((m) => m.steps.length >= 3), "hay misiones de varios pasos");
  assert.equal(new Set(MISSIONS.map((m) => m.name)).size, MISSIONS.length, "nombres distintos");
  assert.ok(RANKS.length >= 8);
  assert.equal(RANK_AT.length, RANKS.length);
  assert.equal(rankFor(0), 0);
  assert.equal(rankFor(1), 1);
  assert.equal(rankFor(999), RANKS.length - 1);
  for (let i = 1; i < RANK_AT.length; i++) assert.ok(RANK_AT[i] > RANK_AT[i - 1]);
});

test("pinball: las paletas suben mientras se aprieta y bajan al soltar, con teclas o con el dedo", () => {
  const state = fresh();
  const [leftRest, rightRest] = state.flip.map((f) => f.angle);
  run(state, 0.1, keys("left"));
  assert.ok(state.flip[0].angle < leftRest - 0.8, "la paleta izquierda sube");
  assert.equal(state.flip[1].angle, rightRest, "la derecha no se mueve");
  run(state, 0.2);
  assert.equal(state.flip[0].angle, leftRest, "al soltar vuelve abajo");
  run(state, 0.1, keys("right"));
  assert.ok(state.flip[1].angle > rightRest + 0.8, "la paleta derecha sube");
  run(state, 0.2);
  run(state, 0.1, noInput({ touches: [{ x: 40, y: 300 }] }));
  assert.ok(state.flip[0].angle < leftRest - 0.8, "el dedo a la izquierda mueve la paleta izquierda");
  run(state, 0.2);
  run(state, 0.1, noInput({ touches: [{ x: 160, y: 300 }] }));
  assert.ok(state.flip[1].angle > rightRest + 0.8, "el dedo a la derecha mueve la paleta derecha");
  assert.equal(state.balls[0].mode, "plunger", "fuera del carril, el dedo no lanza");
});

test("pinball: el resorte carga mientras se mantiene y lanza al soltar; más carga, más alto", () => {
  const log: string[] = [];
  const state = fresh();
  run(state, 0.5, keys("down"), log);
  assert.ok(state.pull > 0.4 && state.pull < 0.7);
  assert.ok(state.balls[0].y > 420, "la bola baja con el resorte");
  step(state, noInput(), log);
  assert.equal(state.balls[0].mode, "free");
  assert.ok(state.balls[0].vy < -300);
  assert.ok(log.includes("sound:rotate"));

  const height = (input: Input, hold: number) => {
    const s = fresh();
    run(s, hold, input);
    step(s);
    let top = 999;
    for (let i = 0; i < 60; i++) {
      step(s);
      top = Math.min(top, s.balls[0].y);
    }
    return top;
  };
  const weak = height(keys("fire"), 0.1);
  const strong = height(keys("fire"), 0.9);
  assert.ok(strong < weak - 120, `el lanzamiento fuerte sube más (${strong} contra ${weak})`);
  assert.ok(strong < 140, "con toda la fuerza llega arriba");
  const touched = height(noInput({ touches: [{ x: 236, y: 400 }] }), 0.9);
  assert.ok(touched < 140, "con el dedo en el carril también se carga y se lanza");
});

test("pinball: tiro perfecto: con la fuerza justa la bola cae en el farol que parpadea, y cada farol se puede alcanzar", () => {
  const reached = new Set<number>();
  for (let hold = 0.3; hold <= 0.95; hold += 0.025) {
    for (let lane = 0; lane < 3; lane++) {
      const log: string[] = [];
      const state = fresh();
      state.skillLane = lane;
      plunge(state, hold, log);
      run(state, 3, noInput(), log);
      if (says(log, "Tiro perfecto")) reached.add(lane);
    }
  }
  assert.deepEqual([...reached].sort(), [0, 1, 2], `faroles alcanzados: ${[...reached]}`);
  // Con toda la fuerza, el riel sigue de largo y deja la bola en la órbita de la izquierda.
  const state = fresh();
  plunge(state, 1.2);
  until(state, () => state.balls[0].mode === "free" && state.balls[0].x < 32, 4);
  assert.ok(state.balls[0].x < 32 && state.balls[0].y < 240, "la bola baja por la órbita");
});

test("pinball: cada rampa se sube con un tiro fuerte y se falla con uno flojo (la bola cae de vuelta por la boca)", () => {
  for (const m of MOUTHS) {
    const x = (m.x0 + m.x1) / 2;
    const strong = fresh();
    plunge(strong);
    strong.balls = [ballAt(x, m.y + 14, 0, -650)];
    assert.equal(rampResult(strong), "made", `${m.id}: el tiro fuerte sube`);
    const weak = fresh();
    plunge(weak);
    weak.balls = [ballAt(x, m.y + 14, 0, -260)];
    const log: string[] = [];
    assert.equal(rampResult(weak), "fell", `${m.id}: el tiro flojo no llega`);
    const ball = weak.balls[0];
    assert.equal(ball.mode, "free");
    assert.ok(ball.vy > 0 && ball.y > m.y - 10, `${m.id}: vuelve hacia abajo, por la boca`);
    run(weak, 0.5, noInput(), log);
    assert.ok(weak.balls[0].mode !== "path" || weak.balls[0].path !== m.id, `${m.id}: no vuelve a entrar enseguida`);
  }
});

test("pinball: con golpes de paleta reales, algunos tiros suben rampas y otros se quedan cortos", () => {
  let made = 0;
  let fell = 0;
  const reached = new Set<string>();
  for (const [side, x0] of [
    [0, 38],
    [1, 198],
  ] as const) {
    for (let k = 0; k < 30; k += 0.5) {
      const state = fresh();
      plunge(state);
      state.saveLeft = 99;
      // La bola baja por el pasillo de regreso, rueda por la paleta y se le pega en distintos puntos.
      state.balls = [ballAt(x0, 336, 0, 40)];
      const pivot = [80, 156][side];
      until(state, () => !state.balls.length || (side ? state.balls[0].x <= pivot - k : state.balls[0].x >= pivot + k), 4);
      let entered = "";
      for (let i = 0; i < 120 && state.balls.length; i++) {
        step(state, i < 12 ? keys(side ? "right" : "left") : noInput());
        const ball = state.balls[0];
        if (!ball) break;
        if (ball.mode === "path" && ["lramp", "cramp", "loop", "rramp", "stairs"].includes(ball.path)) {
          entered = ball.path;
          if (ball.made) {
            made += 1;
            reached.add(ball.path);
            break;
          }
        } else if (entered) {
          fell += 1;
          break;
        }
      }
    }
  }
  assert.ok(made >= 3, `pocos tiros subieron (${made})`);
  assert.ok(fell >= 1, `ningún tiro se quedó corto (${fell})`);
  assert.ok(reached.size >= 2, `se subieron pocas rampas distintas: ${[...reached]}`);
});

test("pinball: la bola nunca sale de la mesa ni se mete en las paredes en miles de lanzamientos al azar", () => {
  const next = random(12345);
  for (let launch = 0; launch < 2000; launch++) {
    const state = fresh(launch);
    // Algunas mesas con compuertas cerradas, poste arriba, muralla arriba o el imán encendido.
    if (launch % 4 === 1) state.doors = [30, 30];
    if (launch % 5 === 2) state.post = 30;
    if (launch % 3 === 0) state.stairs = true;
    if (launch % 7 === 3) state.magnetLit = true;
    if (launch % 2 === 0) run(state, 0.05 + next() * 1.1, keys("fire"));
    else {
      // La mitad empieza con la bola tirada en cualquier parte de la mesa.
      plunge(state, 0.2);
      let x = 0;
      let y = 0;
      do {
        x = 12 + next() * 212;
        y = 70 + next() * 330;
      } while (FLOOR_SEGS[0].some((s) => distanceToSegment(x, y, s) < R + s.r + 1) || BUMPERS.some((b) => b.floor === 0 && Math.hypot(b.x - x, b.y - y) < b.r + R + b.ax + 1) || x > 228 || spanOf(0, y)[0] > x - 8 || spanOf(0, y)[1] < x + 8 || Math.hypot(x - CAPTIVE.x, y - 130) < 26);
      state.balls = [ballAt(x, y, (next() - 0.5) * 900, (next() - 0.5) * 900)];
    }
    let held = new Set<Key>();
    const idle = new Map<Ball, { x: number; y: number; time: number }>();
    for (let frame = 0; frame < 240 && !state.over; frame++) {
      if (frame % 9 === 0) {
        held = new Set<Key>();
        if (next() < 0.5) held.add("left");
        if (next() < 0.5) held.add("right");
      }
      const dt = next() * 0.05;
      pinball.step(state, dt, noInput({ held, pressed: next() < 0.01 ? ["up"] : [] }), quietOut());
      for (const ball of state.balls) {
        assertInside(state, ball, `lanzamiento ${launch}`);
        if (ball.mode !== "free") continue;
        const mark = idle.get(ball);
        if (!mark || Math.hypot(ball.x - mark.x, ball.y - mark.y) > 6) idle.set(ball, { x: ball.x, y: ball.y, time: 0 });
        else if (!held.size) {
          mark.time += dt;
          assert.ok(mark.time < 6, `lanzamiento ${launch}: bola quieta en (${ball.x.toFixed(1)}, ${ball.y.toFixed(1)})`);
        }
      }
    }
  }
});

test("pinball: en los pisos de arriba la bola tampoco sale nunca, y siempre vuelve a la mesa", () => {
  const next = random(777);
  let returned = 0;
  for (let launch = 0; launch < 1500; launch++) {
    const state = fresh(launch);
    plunge(state, 0.3);
    const floor = (1 + (launch % 2)) as Floor;
    if (floor === 2) state.garden = 20;
    if (launch % 3 === 0) state.secretOpen = true;
    const x = 40 + next() * 176;
    const y = 160 + next() * 110;
    state.balls = [ballAt(x, y, (next() - 0.5) * 600, (next() - 0.5) * 600, floor)];
    let held = new Set<Key>();
    for (let frame = 0; frame < 300; frame++) {
      if (frame % 7 === 0) {
        held = new Set<Key>();
        if (next() < 0.5) held.add("left");
        if (next() < 0.5) held.add("right");
      }
      pinball.step(state, next() * 0.05, noInput({ held }), quietOut());
      for (const ball of state.balls) assertInside(state, ball, `arriba ${launch}`);
      if (state.balls[0]?.floor === 0 || state.spitQueue > 0) {
        returned += 1;
        break;
      }
    }
    assert.ok(state.lives >= 3 && state.phase === "play", "caer de un piso de arriba no cuesta una bola");
  }
  assert.ok(returned > 500, `pocas bolas volvieron a la mesa (${returned})`);
});

test("pinball: con paletas automáticas sencillas se juega varios minutos y se ganan puntos", () => {
  let total = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const state = fresh(seed);
    const bot = makeBot(0.55 + seed * 0.07);
    let frames = 0;
    let score = 0;
    while (!state.over && frames < 60 * 600) {
      step(state, bot(state));
      for (const ball of state.balls) assertInside(state, ball, `semilla ${seed}`);
      assert.ok(state.score >= score, "el puntaje nunca baja");
      assert.ok(state.balls.every((ball) => ball.floor === 0) || state.balls.length === 1, "arriba juega una sola bola");
      score = state.score;
      frames += 1;
    }
    total += frames / 60;
    assert.ok(state.score > 1000, `semilla ${seed}: casi sin puntos`);
  }
  assert.ok(total / 6 > 100, `las partidas duran poco (${(total / 6).toFixed(0)} s en promedio)`);
});

test("pinball: sin tocar las paletas la partida termina, con bono por cada bola y el rango en el resultado", () => {
  const log: string[] = [];
  const state = fresh(3);
  let frames = 0;
  let lives = state.lives;
  while (!state.over && frames < 60 * 600) {
    step(state, state.balls.some((b) => b.mode === "plunger") && frames % 80 < 40 ? keys("fire") : noInput(), log);
    assert.ok(state.lives <= lives || state.lives === lives + 1);
    lives = state.lives;
    frames += 1;
  }
  assert.ok(state.over, "la partida debería terminar");
  const status = pinball.status(state);
  assert.equal(status.lives, 0);
  assert.equal(status.result, `RANGO: ${RANKS[state.rank]}`);
  assert.equal(log.filter((entry) => entry === "sound:over").length, 1);
  assert.ok(says(log, "Bola perdida"));
  assert.ok(log.some((entry) => entry.startsWith("say:Fin del juego") && entry.includes("Rango")));
  const frozen = JSON.stringify({ ...state, time: 0, messageTime: 0, messageAge: 0 });
  run(state, 2, keys("left", "fire"));
  assert.equal(JSON.stringify({ ...state, time: 0, messageTime: 0, messageAge: 0 }), frozen);
});

test("pinball: el salvavidas devuelve la bola si cae en los primeros segundos", () => {
  const log: string[] = [];
  const state = fresh();
  plunge(state, 0.7, log);
  run(state, 1, noInput(), log);
  state.balls = [ballAt(118, 430, 0, 240)];
  run(state, 0.3, noInput(), log);
  assert.equal(state.lives, 3);
  assert.equal(state.balls.length, 1);
  assert.equal(state.balls[0].mode, "plunger");
  assert.ok(log.includes("say:Bola salvada."));
  // Pasado el tiempo del salvavidas, la bola se pierde de verdad, con su bono multiplicado.
  plunge(state);
  run(state, 1);
  state.saveLeft = 0;
  state.bonus = 100;
  state.mult = 3;
  const before = state.score;
  state.balls = [ballAt(118, 430, 0, 240)];
  run(state, 0.3);
  assert.equal(state.phase, "drain");
  assert.equal(state.bonusShown, 300);
  assert.ok(state.score >= before + 300);
  run(state, 3);
  assert.equal(state.lives, 2);
  assert.equal(state.ballNumber, 2);
});

test("pinball: los bumpers patean, suman, sacuden la pantalla y muestran los puntos", () => {
  const log: string[] = [];
  const state = fresh();
  plunge(state);
  state.balls = [SHOTS.bumper()];
  run(state, 0.15, noInput(), log);
  assert.ok(state.score >= 100, "el bumper da puntos");
  assert.ok(log.includes("sound:drop"));
  assert.ok(state.balls[0].vy < 0, "el bumper patea la bola hacia arriba");
  assert.ok(state.shake > 0, "la pantalla se sacude");
  assert.ok(state.pops.length > 0, "aparece el número de puntos");
  const moving = BUMPERS.filter((b) => b.ax > 0);
  assert.ok(moving.some((b) => b.floor === 0 && b.kind === "pop"), "un bumper de la mesa se mece");
  assert.ok(moving.some((b) => b.kind === "spirit"), "el espíritu pasea");
  assert.ok(moving.some((b) => b.floor === 1), "arriba también se mueven");
});

test("pinball: el espíritu guardián da el jackpot con tres golpes", () => {
  const log: string[] = [];
  const state = fresh();
  plunge(state);
  const spirit = BUMPERS.find((b) => b.kind === "spirit")!;
  for (let hit = 0; hit < 3; hit++) {
    const x = spirit.x + spirit.ax * Math.sin(state.clock * spirit.w + spirit.phase);
    state.balls = [ballAt(x, spirit.y + 30, 0, -400)];
    run(state, 0.5, noInput(), log);
  }
  assert.ok(says(log, "Jackpot"), "tres golpes dan jackpot");
  assert.equal(state.spiritHits, 0);
  assert.ok(state.post > 0, "y sube el poste de luz entre las paletas");
});

test("pinball: las misiones se eligen con los faroles, empiezan en la luna y van por pasos", () => {
  const log: string[] = [];
  const state = fresh();
  plunge(state);
  run(state, 2);
  assert.equal(state.active, -1);
  assert.ok(state.wall.pos < 0.5 && state.mouth > 0.5, "sin misión, la boca de la luna está abierta");
  const before = state.selected;
  state.balls = [SHOTS.lane(104)];
  run(state, 0.4, noInput(), log);
  assert.notEqual(state.selected, before, "pasar por un farol cambia la misión elegida");
  startMission(state, 0, log);
  assert.ok(says(log, "Misión: luz del camino"));
  assert.ok(state.wall.up, "con una misión en marcha, la muralla tapa la luna");
  assert.equal(stepGoal(state), 6);
  for (let i = 0; i < 6; i++) {
    state.balls = [SHOTS.bumper()];
    run(state, 0.15, noInput(), log);
  }
  assert.equal(state.stepIndex, 1, "con 6 bumpers pasa al paso de la rampa");
  assert.ok(says(log, "Paso cumplido"));
  const level = state.level;
  state.balls = [SHOTS.lramp()];
  run(state, 0.8, noInput(), log);
  assert.equal(state.active, -1, "la rampa cumple la misión");
  assert.equal(state.level, level + 1);
  assert.equal(pinball.status(state).world, (state.level - 1) % WORLDS);
  assert.equal(state.mult, 2);
  assert.equal(state.missionsDone, 1);
  assert.equal(state.rank, 1, "la primera misión sube de rango");
  assert.ok(state.lockLit, "y la luna guarda la próxima bola");
  assert.ok(state.banner.time > 0, "con un cartel grande");
  assert.ok(says(log, "Misión cumplida"));
  assert.ok(log.some((entry) => entry.includes("Nuevo rango")));
  assert.notEqual(state.selected, 0, "se elige otra misión que falte");
});

/** Qué hacer para que pase cada evento: poner la bola donde ocurre. */
function actions() {
  let catHit = 0;
  let combo = 0;
  return {
    bumper: (s: State) => (s.balls = [SHOTS.bumper()]),
    ramp: (s: State) => (s.balls = [SHOTS.lramp()]),
    loop: (s: State) => (s.balls = [SHOTS.loop()]),
    orbit: (s: State) => (s.balls = [SHOTS.orbit()]),
    moon: (s: State) => {
      openMoon(s);
      s.balls = [SHOTS.moon()];
    },
    lane: (s: State) => (s.balls = [SHOTS.lane()]),
    lanes: (s: State) => {
      s.lanes = [true, true, false];
      s.balls = [SHOTS.lane(152)];
    },
    drops: (s: State) => {
      s.drops = [true, false, true];
      s.balls = [ballAt(62, (DROPS[1].y0 + DROPS[1].y1) / 2, -420, 0)];
    },
    cat: (s: State) => {
      const d = CATS[catHit++ % 3];
      s.balls = [ballAt(186, (d.y0 + d.y1) / 2, 420, 0)];
    },
    spirit: (s: State) => {
      const spirit = BUMPERS.find((b) => b.kind === "spirit")!;
      s.balls = [ballAt(spirit.x + spirit.ax * Math.sin(s.clock * spirit.w + spirit.phase), spirit.y + 30, 0, -400)];
    },
    spin: (s: State) => (s.balls = [SHOTS.spin()]),
    upper: (s: State) => {
      s.stairs = true;
      s.balls = [SHOTS.cramp()];
    },
    star: (s: State) => {
      const star = BUMPERS.find((b) => b.kind === "star")!;
      s.balls = [ballAt(star.x, star.y + 18, 0, -300, 1)];
    },
    disc: (s: State) => (s.balls = [SHOTS.disc()]),
    captive: (s: State) => (s.balls = [SHOTS.captive()]),
    magnet: (s: State) => {
      s.magnetLit = true;
      s.magnetOff = 0;
      s.balls = [ballAt(MAGNET.x, MAGNET.y - 14, 0, 30)];
    },
    // Tiros distintos seguidos: rulo, rampa, rulo...
    combo: (s: State) => (s.balls = [combo++ % 2 ? SHOTS.lramp() : SHOTS.loop()]),
    wall: (s: State) => {
      s.wall.up = true;
      s.wall.pos = 1;
      s.balls = [ballAt(60, WALL.y + 18, 0, -320)];
    },
  };
}

test("pinball: cada misión se puede cumplir haciendo sus pasos", () => {
  for (let index = 0; index < MISSIONS.length; index++) {
    const act = actions();
    const log: string[] = [];
    const state = fresh(index + 1);
    plunge(state);
    startMission(state, index, log);
    let tries = 0;
    while (state.active === index && tries < 80) {
      state.saveLeft = 99;
      if (state.missionTime) state.missionTime = 30;
      const ev = MISSIONS[index].steps[state.stepIndex].ev;
      act[ev](state);
      run(state, ev === "upper" || ev === "combo" || ev === "moon" || ev === "magnet" ? 2 : 0.8, noInput(), log);
      tries += 1;
    }
    assert.equal(state.active, -1, `${MISSIONS[index].name}: no se cumplió (paso ${state.stepIndex}, ${state.stepCount}/${stepGoal(state)})`);
    assert.ok(says(log, "Misión cumplida"), `${MISSIONS[index].name}: sin aviso`);
    assert.equal(state.missionsDone, 1);
  }
});

test("pinball: las misiones con reloj cuentan el tiempo y fallan si se acaba", () => {
  const log: string[] = [];
  const state = fresh();
  plunge(state);
  const timed = MISSIONS.findIndex((m) => m.time);
  startMission(state, timed, log);
  assert.ok(state.missionTime > 0 && state.missionTime <= MISSIONS[timed].time!);
  const start = state.missionTime;
  const bot = makeBot();
  for (let i = 0; i < 120; i++) {
    state.saveLeft = 99;
    step(state, bot(state));
    if (state.balls[0]?.mode === "plunger") state.balls = [ballAt(118, 250)];
  }
  assert.ok(state.missionTime < start - 1.5, "el reloj corre");
  state.missionTime = 0.1;
  state.balls = [ballAt(118, 250)];
  run(state, 0.3, noInput(), log);
  assert.equal(state.active, -1);
  assert.ok(says(log, "Se acabó el tiempo"));
  assert.equal(state.missionsDone, 0);
});

test("pinball: cumpliendo misiones se sube hasta el rango más alto, que sale en el resultado", () => {
  const log: string[] = [];
  const state = fresh();
  plunge(state);
  const act = actions();
  let rank = 0;
  for (let done = 1; done <= RANK_AT[RANK_AT.length - 1]; done++) {
    state.active = state.selected;
    state.stepIndex = MISSIONS[state.active].steps.length - 1;
    state.saveLeft = 99;
    const ev = MISSIONS[state.active].steps[state.stepIndex].ev;
    state.stepCount = stepGoal(state) - 1;
    if (["moon", "ramp", "loop", "bumper", "orbit"].includes(ev)) act[ev as "moon"](state);
    else {
      // Sin un tiro fácil para ese paso: se usa otra misión que termine en la luna.
      state.active = -1;
      state.stepIndex = 0;
      state.selected = MISSIONS.findIndex((m, i) => !state.done[i] && m.steps[m.steps.length - 1].ev === "moon");
      if (state.selected < 0) state.selected = 2;
      done -= 1;
      continue;
    }
    run(state, 2, noInput(), log);
    assert.equal(state.missionsDone, done, `misión ${done}`);
    assert.ok(state.rank >= rank);
    rank = state.rank;
    state.balls = [ballAt(118, 250)];
    state.multiball = false;
    state.spitQueue = state.autoPlunge = 0;
  }
  assert.equal(state.rank, RANKS.length - 1);
  assert.ok(state.level > RANK_AT[RANK_AT.length - 1]);
  state.saveLeft = 0;
  state.lives = 1;
  state.balls = [ballAt(118, 430, 0, 240)];
  run(state, 4);
  assert.ok(state.over);
  assert.equal(pinball.status(state).result, "RANGO: GUARDIÁN DE LAS LUNAS");
});

test("pinball: la luna se traga la bola y la escupe; con la luz encendida la guarda, y con dos empieza la multibola con jackpots", () => {
  const log: string[] = [];
  const state = fresh();
  plunge(state);
  state.active = 0;
  state.lockLit = true;
  openMoon(state);
  state.balls = [SHOTS.moon()];
  run(state, 0.3, noInput(), log);
  assert.equal(state.locked, 1);
  assert.ok(!state.lockLit, "la luz se apaga hasta volver a encenderla");
  assert.equal(state.balls.length, 1, "llega una bola nueva al resorte");
  assert.equal(state.balls[0].mode, "plunger");
  plunge(state);
  // Sin la luz encendida, la luna sólo mastica y escupe la bola.
  openMoon(state);
  state.balls = [SHOTS.moon()];
  run(state, 0.3, noInput(), log);
  assert.equal(state.balls.length, 0, "la bola está en la panza");
  assert.ok(state.chew > 0, "la luna mastica");
  run(state, 2, noInput(), log);
  assert.equal(state.locked, 1);
  assert.equal(state.balls.length, 1, "la escupe");
  assert.ok(state.balls[0].y > MOUTH.y);
  state.lockLit = true;
  openMoon(state);
  state.balls = [SHOTS.moon()];
  run(state, 0.3, noInput(), log);
  assert.ok(state.multiball);
  assert.ok(state.post > 0, "el poste sube al empezar la multibola");
  run(state, 3, noInput(), log);
  assert.equal(state.locked, 0);
  assert.ok(state.balls.length >= 2, `hay ${state.balls.length} bolas`);
  assert.ok(log.includes("say:Multibola: tres bolas en la mesa. Las rampas dan jackpot."));
  // Las rampas dan jackpot; el rulo o una órbita lo vuelven a encender.
  const jackpot = state.jackpot;
  state.balls[0] = SHOTS.lramp();
  run(state, 0.6, noInput(), log);
  assert.ok(says(log, `Jackpot: ${jackpot}`));
  assert.ok(!state.jackpotLit);
  state.balls[0] = SHOTS.loop();
  run(state, 0.8, noInput(), log);
  assert.ok(state.jackpotLit, "el rulo vuelve a encender el jackpot");
  state.balls[0] = SHOTS.rramp();
  run(state, 0.6, noInput(), log);
  assert.ok(state.superLit, "con dos jackpots se enciende el súper jackpot");
  openMoon(state);
  state.balls.push(SHOTS.moon());
  run(state, 0.3, noInput(), log);
  assert.ok(says(log, "Súper jackpot:"));
  // En la multibola, perder una bola no cuesta una vida.
  state.saveLeft = 0;
  run(state, 30, makeBot()(state));
  assert.ok(state.lives >= 2);
});

test("pinball: encender el nombre da el secreto una sola vez por partida (con cualquier nombre)", () => {
  const original = GAME_NAME;
  try {
    for (const name of ["SOL", "NATHALIA", "MARIANGÉLICA"]) {
      setGameName(name);
      const log: string[] = [];
      const state = fresh();
      plunge(state);
      // Cada vuelta por el rulo enciende una letra.
      let shots = 0;
      while (state.letters < GAME_NAME.length && shots < 40) {
        state.balls = [SHOTS.loop()];
        state.saveLeft = 99;
        run(state, 2, noInput(), log);
        shots += 1;
        assert.ok(pinball.status(state).letters <= GAME_NAME.length);
      }
      assert.equal(state.letters, GAME_NAME.length, `${name}: no se encendió el nombre`);
      assert.equal(log.filter((entry) => entry === "secret").length, 1);
      assert.ok(state.multiball, "el nombre arranca la multibola");
      run(state, 3.1, noInput(), log);
      assert.ok(state.letters < GAME_NAME.length, "las letras se apagan para otra vuelta");
      for (let i = 0; i < 40 && state.letters < GAME_NAME.length; i++) {
        state.multiball = false;
        state.balls = [SHOTS.loop()];
        state.spitQueue = state.autoPlunge = 0;
        state.saveLeft = 99;
        run(state, 2, noInput(), log);
      }
      assert.equal(state.letters, GAME_NAME.length);
      assert.equal(log.filter((entry) => entry === "secret").length, 1, "el secreto sale una sola vez");
    }
  } finally {
    setGameName(original);
  }
});

test("pinball: empujar la mesa ayuda, pero abusar es FALTA y la mesa queda muerta hasta perder la bola", () => {
  const log: string[] = [];
  const state = fresh();
  plunge(state);
  run(state, 1.5);
  state.balls = [ballAt(118, 250)];
  step(state);
  const before = state.balls[0].vy;
  step(state, noInput({ pressed: ["up"] }), log);
  assert.ok(state.balls[0].vy < before, "el empujón mueve la bola");
  step(state, noInput({ swipes: ["up"] }), log);
  assert.ok(says(log, "Cuidado"));
  step(state, noInput({ pressed: ["up"] }), log);
  assert.ok(state.tilted);
  assert.ok(says(log, "Falta"));
  const rest = state.flip[0].angle;
  run(state, 0.2, keys("left"));
  assert.equal(state.flip[0].angle, rest, "con falta las paletas no responden");
  state.balls = [ballAt(118, 430, 0, 240)];
  run(state, 3, noInput(), log);
  assert.equal(state.lives, 2, "con falta no hay salvavidas");
  assert.ok(!state.tilted, "con la bola nueva la mesa vuelve a andar");
});

test("pinball: la rampa del cielo cruza por encima de la mesa y deja la bola en el pasillo derecho", () => {
  const log: string[] = [];
  const state = fresh();
  plunge(state);
  state.balls = [SHOTS.lramp()];
  run(state, 0.1, noInput(), log);
  assert.equal(state.balls[0].mode, "path");
  assert.equal(state.balls[0].path, "lramp");
  const time = until(state, () => state.balls[0].mode !== "path", 4, noInput(), log);
  assert.ok(time > 0.5, "el viaje toma su tiempo");
  assert.ok(log.some((entry) => entry.startsWith("sound:clear2")));
  assert.ok(state.balls[0].x > 188 && state.balls[0].x < 208 && state.balls[0].y > 320, "sale por el pasillo derecho");
  assert.ok(state.score >= 1000);
});

test("pinball: la espiral baja por un alambre al pasillo izquierdo; la rampa de alambre devuelve la bola al carril", () => {
  const state = fresh();
  plunge(state);
  state.balls = [SHOTS.cramp()];
  until(state, () => state.balls[0].mode !== "path" && state.balls[0].s > 0, 5);
  assert.ok(state.balls[0].x > 28 && state.balls[0].x < 48 && state.balls[0].y > 320, `sale por el pasillo izquierdo (${state.balls[0].x}, ${state.balls[0].y})`);
  state.balls = [SHOTS.rramp()];
  until(state, () => state.balls[0].mode === "plunger", 5);
  assert.equal(state.balls[0].mode, "plunger", "vuelve a esperar sobre el resorte");
  // En la multibola sale sola.
  state.multiball = true;
  state.balls = [SHOTS.rramp(), ballAt(118, 250)];
  let launched = false;
  for (let i = 0; i < 300 && !launched; i++) {
    step(state);
    launched = state.balls[0].mode === "free" && state.balls[0].x > 228 && state.balls[0].vy < -200;
  }
  assert.ok(launched, "en la multibola el resorte la lanza solo");
});

test("pinball: el rulo da una vuelta completa, deja la bola en los faroles y enciende una letra", () => {
  const state = fresh();
  plunge(state);
  state.balls = [SHOTS.loop()];
  const letters = state.letters;
  until(state, () => state.balls[0].mode !== "path" && state.balls[0].made, 4);
  assert.equal(state.letters, letters + 1);
  assert.ok(state.balls[0].y < 110, "la bola queda arriba, junto a los faroles");
  // Dos tiros grandes distintos seguidos hacen combo.
  state.balls = [SHOTS.lramp()];
  run(state, 0.6);
  assert.equal(state.combo, 2);
});

test("pinball: con la escalera encendida la espiral sube a la cámara de las estrellas, y la luna escupe la bola al volver", () => {
  const log: string[] = [];
  const state = fresh();
  plunge(state);
  state.lanes = [true, true, false];
  state.balls = [SHOTS.lane(152)];
  run(state, 0.4, noInput(), log);
  assert.ok(state.stairs, "los tres faroles abren la escalera");
  state.balls = [SHOTS.cramp()];
  run(state, 0.1, noInput(), log);
  assert.equal(state.balls[0].path, "stairs");
  until(state, () => state.balls[0].floor === 1 && state.balls[0].mode === "free", 4, noInput(), log);
  assert.equal(viewOf(state), 1, "se ve el piso de arriba");
  assert.ok(says(log, "La cámara de las estrellas"));
  assert.ok(!state.stairs, "la escalera se usa una vez");
  const lives = state.lives;
  state.saveLeft = 0;
  until(state, () => state.balls.length === 0 || state.balls[0].floor === 0, 20, noInput(), log);
  assert.ok(says(log, "La bola baja por el tubo"));
  until(state, () => state.balls.length === 1 && state.balls[0].mode === "free" && state.balls[0].floor === 0, 4);
  assert.ok(Math.hypot(state.balls[0].x - MOUTH.x, state.balls[0].y - MOUTH.y) < 30, "la luna la escupe");
  assert.equal(state.lives, lives, "no se pierde la bola");
  // Durante la multibola la escalera no se abre.
  state.multiball = true;
  state.stairs = true;
  state.balls = [SHOTS.cramp(), ballAt(118, 250)];
  run(state, 0.1, noInput(), log);
  assert.equal(state.balls[0].path, "cramp");
});

test("pinball: los objetivos caen de verdad, con los tres abajo baja la muralla, y después vuelven a subir", () => {
  const log: string[] = [];
  const state = fresh();
  plunge(state);
  state.active = 0;
  run(state, 1);
  assert.ok(state.wall.up, "con misión la muralla está arriba");
  for (let i = 0; i < 3; i++) {
    state.balls = [ballAt(62, (DROPS[i].y0 + DROPS[i].y1) / 2, -420, 0)];
    run(state, 0.25, noInput(), log);
    assert.ok(state.drops[i], `el objetivo ${i} cae`);
    if (i < 2) {
      // Abajo, la bola pasa por donde estaba y choca con la pared de atrás.
      state.balls = [ballAt(62, (DROPS[i].y0 + DROPS[i].y1) / 2, -420, 0)];
      let least = 999;
      for (let k = 0; k < 8; k++) {
        step(state);
        least = Math.min(least, state.balls[0].x);
      }
      assert.ok(least < 42, `el objetivo caído no frena la bola (${least.toFixed(1)})`);
    }
  }
  assert.ok(says(log, "Los tres objetivos abajo"));
  assert.ok(!state.wall.up, "la muralla baja");
  state.balls = [ballAt(118, 250)];
  run(state, 2.5);
  assert.deepEqual(state.drops, [false, false, false], "los objetivos vuelven a subir");
});

test("pinball: la muralla se tumba con dos golpes y la boca de la luna se abre", () => {
  const log: string[] = [];
  const state = fresh();
  plunge(state);
  state.active = 0;
  run(state, 1);
  assert.ok(state.wall.pos > 0.9 && state.mouth < 0.1, "muralla arriba, boca cerrada");
  // Con la muralla arriba la bola no llega a la boca: rebota.
  state.balls = [ballAt(60, WALL.y + 18, 0, -320)];
  run(state, 0.3, noInput(), log);
  assert.equal(state.wall.hits, 1);
  assert.ok(state.balls.length === 1 && state.balls[0].y > WALL.y, "rebota en la muralla");
  state.balls = [ballAt(60, WALL.y + 18, 0, -320)];
  run(state, 0.3, noInput(), log);
  assert.ok(says(log, "La muralla bajó"));
  run(state, 0.6);
  assert.ok(state.wall.pos < 0.1 && state.mouth > 0.9, "muralla abajo, boca abierta");
  state.balls = [SHOTS.moon()];
  run(state, 0.3, noInput(), log);
  assert.equal(state.balls.length, 0, "la luna se la traga");
});

test("pinball: la bola cautiva enciende el imán, y el imán atrapa la bola y la suelta hacia una paleta", () => {
  const log: string[] = [];
  const state = fresh();
  plunge(state);
  run(state, 1);
  assert.ok(!state.magnetLit);
  // Sin encender, el imán no hace nada.
  state.balls = [ballAt(MAGNET.x, MAGNET.y - 14, 0, 30)];
  run(state, 0.3);
  assert.notEqual(state.balls[0].mode, "held");
  state.balls = [SHOTS.captive()];
  run(state, 0.5, noInput(), log);
  assert.ok(state.captive.y < CAPTIVE.rest || state.magnetLit, "la cautiva se movió");
  assert.ok(state.magnetLit, "la cautiva enciende el imán");
  assert.ok(Math.abs(state.balls[0].x - CAPTIVE.x) > 2 || state.balls[0].y > 152, "la bola no entra al canal de la cautiva");
  run(state, 1.5);
  assert.ok(Math.abs(state.captive.y - CAPTIVE.rest) < 1, "la cautiva vuelve a su lugar");
  state.balls = [ballAt(MAGNET.x, MAGNET.y - 14, 0, 30)];
  run(state, 0.3, noInput(), log);
  assert.equal(state.balls[0].mode, "held", "el imán atrapa la bola");
  run(state, 1.3);
  assert.equal(state.balls[0].mode, "free", "y la suelta");
  assert.ok(Math.abs(state.balls[0].vx) > 80);
  assert.ok(!state.magnetLit, "el imán se apaga hasta la próxima");
});

test("pinball: el disco giratorio desvía la bola, cambia de sentido y a veces apaga una luz", () => {
  const state = fresh();
  plunge(state);
  state.balls = [SHOTS.disc()];
  run(state, 0.12);
  assert.ok(Math.abs(state.balls[0].vx) > 40, "el disco empuja la bola de lado");
  const dir = state.disc.dir;
  run(state, 10);
  assert.notEqual(state.disc.dir, dir, "cambia de sentido");
  let stolen = 0;
  for (let seed = 1; seed < 80; seed++) {
    const s = fresh(seed);
    plunge(s);
    s.lanes = [true, true, false];
    s.balls = [SHOTS.disc()];
    run(s, 0.3);
    if (!s.lanes[0] || !s.lanes[1]) stolen += 1;
  }
  assert.ok(stolen > 0 && stolen < 40, `luces robadas: ${stolen}`);
});

test("pinball: las campanas del gato encienden la patada de rescate y cierran los pasillos de salida", () => {
  const log: string[] = [];
  const state = fresh();
  plunge(state);
  run(state, 1);
  state.saveLeft = 0;
  assert.ok(state.kickback, "empieza con la patada lista");
  state.balls = [ballAt(18, 340, 0, 160)];
  run(state, 0.5, noInput(), log);
  assert.ok(says(log, "El gato de la suerte"));
  assert.ok(!state.kickback, "la patada se gasta");
  run(state, 1.5);
  assert.equal(state.balls.length, 1);
  assert.ok(state.balls[0].y < 300, "la bola volvió a la mesa");
  assert.equal(state.lives, 3);
  const act = actions();
  for (let i = 0; i < 3; i++) {
    act.cat(state);
    run(state, 0.4, noInput(), log);
  }
  assert.ok(state.kickback);
  assert.ok(state.doors[0] > 0 && state.doors[1] > 0);
  // Con la compuerta cerrada, la bola que baja hacia el pasillo de salida va al de regreso.
  state.kickback = false;
  state.balls = [ballAt(218, 300, 0, 120)];
  run(state, 1.2);
  assert.ok(state.balls[0].x < 208 || state.balls[0].y < 330, `la compuerta desvía la bola (${state.balls[0].x.toFixed(1)}, ${state.balls[0].y.toFixed(1)})`);
});

test("pinball: el poste de luz tapa el hueco entre las paletas mientras dura", () => {
  const state = fresh();
  plunge(state);
  run(state, 1);
  state.saveLeft = 0;
  state.post = 10;
  state.balls = [ballAt(118, 360, 0, 100)];
  run(state, 1.5);
  assert.equal(state.phase, "play");
  assert.equal(state.lives, 3, "el poste salvó la bola");
  state.post = 0;
  state.balls = [ballAt(118, 360, 0, 100)];
  run(state, 1.5);
  assert.equal(state.phase, "drain", "sin poste la bola se va por el medio");
});

test("pinball: en la cámara, el imán sostiene la bola y las cinco estrellas abren el jardín secreto con tiempo", () => {
  const log: string[] = [];
  const state = fresh();
  plunge(state);
  state.balls = [ballAt(128, 250, 0, 40, 1)];
  run(state, 0.4, noInput(), log);
  assert.equal(state.balls[0].mode, "held", "el imán atrapa la bola");
  run(state, 1.5, noInput(), log);
  assert.equal(state.balls[0].mode, "free", "y la suelta");
  const stars = BUMPERS.filter((b) => b.kind === "star");
  for (const star of stars) {
    state.balls = [ballAt(star.x, star.y + 18, 0, -300, 1)];
    run(state, 0.3, noInput(), log);
  }
  assert.ok(state.stars.every(Boolean));
  assert.ok(state.secretOpen);
  assert.ok(says(log, "Las cinco estrellas"));
  state.balls = [ballAt(128, 118, 0, 80, 1)];
  run(state, 0.3, noInput(), log);
  until(state, () => state.balls[0].floor === 2 && state.balls[0].mode === "free", 2);
  assert.equal(viewOf(state), 2);
  assert.ok(state.garden > 15);
  assert.ok(says(log, "El jardín secreto"));
  // Con paletas, la bola se queda arriba hasta que se acaba el tiempo y baja sola.
  const bot = makeBot();
  for (let i = 0; i < 60 * 30 && (state.balls[0]?.floor ?? 0) !== 0 && state.spitQueue === 0; i++) step(state, bot(state), log);
  assert.equal(state.garden, 0);
  run(state, 3);
  assert.equal(state.balls[0].floor, 0);
  assert.ok(state.lives >= 3, "volver del jardín no cuesta una bola");
});

test("pinball: la multibola espera si la bola está en un piso de arriba", () => {
  const state = fresh();
  plunge(state);
  state.letters = GAME_NAME.length - 1;
  const star = BUMPERS.find((b) => b.kind === "star")!;
  state.balls = [ballAt(star.x, star.y + 18, 0, -300, 1)];
  run(state, 0.3);
  assert.ok(state.pendingMulti);
  assert.ok(!state.multiball);
  assert.equal(state.balls.length, 1, "arriba sigue una sola bola");
  state.balls = [ballAt(128, 420, 0, 160, 1)];
  until(state, () => state.balls.length > 0 && state.balls[0].floor === 0 && state.balls[0].mode === "free", 4);
  run(state, 0.2);
  assert.ok(state.multiball, "al volver a la mesa empieza la multibola");
  assert.ok(!state.pendingMulti);
});

test("pinball: puntaje extra y la luz de la luna dan una bola más", () => {
  const log: string[] = [];
  const state = fresh();
  plunge(state);
  state.score = 39950;
  state.balls = [SHOTS.bumper()];
  run(state, 0.15, noInput(), log);
  assert.equal(state.lives, 4);
  assert.ok(says(log, "Bola extra"));
  state.extraLit = true;
  state.active = 0;
  openMoon(state);
  state.balls = [SHOTS.moon()];
  run(state, 0.3, noInput(), log);
  assert.equal(state.lives, 5);
  assert.ok(!state.extraLit);
});

test("pinball: con la misma semilla, la misma partida", () => {
  const play = () => {
    const state = fresh(99);
    const bot = makeBot();
    for (let i = 0; i < 60 * 120; i++) step(state, i % 400 === 0 ? noInput({ pressed: ["up"] }) : bot(state));
    return JSON.stringify(state);
  };
  assert.equal(play(), play());
});

test("pinball: no se rompe con pasos de tiempo variables durante varios minutos, en todos los pisos", () => {
  for (const seed of [11, 12, 13]) {
    const state = fresh(seed);
    const bot = makeBot();
    let rand = seed;
    const floors = new Set<number>();
    for (let i = 0; i < 60 * 300; i++) {
      rand = (rand * 1103515245 + 12345) >>> 0;
      const dt = ((rand >>> 8) % 1000) / 20000;
      // De vez en cuando, ayudas para pasar por todos los pisos y juguetes.
      if (i % 3000 === 1500 && state.balls.length === 1 && !state.multiball) state.stairs = true;
      if (i % 5000 === 2500) state.secretOpen = true;
      if (i % 2000 === 1000) state.magnetLit = true;
      pinball.step(state, dt, bot(state), quietOut());
      const status = pinball.status(state);
      assert.ok(Number.isInteger(status.score) && status.score >= 0 && status.score <= 999999);
      assert.ok(status.world >= 0 && status.world < WORLDS);
      assert.ok(status.letters >= 0 && status.letters <= GAME_NAME.length);
      assert.ok(status.lives >= 0);
      for (const ball of state.balls) {
        assertInside(state, ball, `semilla ${seed}`);
        floors.add(ball.floor);
      }
      if (state.over) break;
    }
  }
});

test("pinball: se dibuja sin navegador sin romperse y en pocos rectángulos", () => {
  let rects = 0;
  const c = new Proxy({ fillRect: () => (rects += 1) } as Record<string, unknown>, {
    get: (target, key) => (key in target ? target[key as string] : typeof key === "string" && /^[a-z]/.test(key) ? () => ({ addColorStop() {} }) : undefined),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  const state = fresh();
  plunge(state);
  for (const floor of [0, 1, 2] as const) {
    state.balls = [ballAt(128, 250, 0, 0, floor)];
    state.banner = { ...state.banner, text: "JACKPOT", time: 2 };
    for (const still of [false, true]) {
      rects = 0;
      pinball.draw(c, state, 3.3, still);
      assert.ok(rects > 10 && rects < 9000, `piso ${floor}: ${rects} rectángulos`);
    }
  }
});
