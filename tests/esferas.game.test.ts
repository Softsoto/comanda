import assert from "node:assert/strict";
import { test } from "node:test";
import esferas, {
  AREA,
  BALL,
  IDOL_R,
  LEVEL_COUNT,
  colorsOf,
  layoutOf,
  pointAt,
  stageOf,
  touching,
  type Ball,
  type Chain,
  type State,
} from "../src/components/secret/games/esferas";
import { HEIGHT, WIDTH } from "../src/components/secret/games/kit";
import { noInput, quietOut, type Input, type Key } from "../src/components/secret/games/types";

const DT = 1 / 60;
const fresh = (seed = 7, mode = "1") => esferas.create(seed, mode) as State;
const step = (state: State, input: Input = noInput(), log?: string[], dt = DT) => esferas.step(state, dt, input, quietOut(log));
const run = (state: State, seconds: number, input: () => Input = () => noInput(), log?: string[]) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) step(state, input(), log);
};
const press = (...keys: Key[]) => noInput({ pressed: keys, held: new Set(keys) });

/** Una cadena puesta a mano: colores desde la cola hasta la cabeza, todas tocándose, empezando en `from`. */
function setChain(state: State, colors: number[], from = 120, index = 0): Ball[] {
  const balls: Ball[] = colors.map((color, i) => ({
    id: 1000 + i,
    color,
    s: from + i * BALL,
    w: 1,
    linked: i > 0,
    combo: 0,
    pull: 0,
    kind: "",
    kindLife: 0,
    fx: 0,
    fy: 0,
  }));
  const chain = state.chains[index];
  chain.balls = balls;
  chain.rush = false;
  // Para estas pruebas no salen esferas nuevas por el comienzo.
  state.full = true;
  state.levelScore = 0;
  for (const other of state.chains) if (other !== chain) other.balls = [];
  return balls;
}

/** Lanza la esfera `color` derecho hacia `target` y espera a que entre en la cadena. */
function shootAt(state: State, target: Ball, color: number, log?: string[], chainIndex = 0) {
  const track = layoutOf(state.level).tracks[state.chains[chainIndex].track];
  const [x, y] = pointAt(track, target.s);
  state.current = color;
  state.reload = 0;
  step(state, noInput({ taps: [{ x, y }] }), log);
  for (let i = 0; i < 120 && state.shots.length > 0; i++) step(state, noInput(), log);
}

/* Un jugador automático: prueba apuntar a cada esfera visible y elige el tiro que más junta. */
function firstHit(state: State, tx: number, ty: number) {
  const layout = layoutOf(state.level);
  const [ix, iy] = layout.idol;
  const a = Math.atan2(ty - iy, tx - ix);
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  let x = ix + dx * 5;
  let y = iy + dy * 5;
  for (let k = 0; k < 160; k++) {
    x += dx * 2;
    y += dy * 2;
    if (x < -6 || x > 134 || y < 16 || y > 230) return null;
    for (const chain of state.chains) {
      const track = layout.tracks[chain.track];
      for (const ball of chain.balls) {
        if (ball.s < 3 || ball.s > track.length || track.hidden[Math.round(ball.s)]) continue;
        const [bx, by] = pointAt(track, ball.s);
        if ((bx - x) ** 2 + (by - y) ** 2 < (BALL - 1) ** 2) return { chain, ball, hx: x, hy: y };
      }
    }
  }
  return null;
}

function runLength(chain: Chain, index: number, color: number, ahead: boolean) {
  const balls = chain.balls;
  let count = 1;
  let k = ahead ? index : index - 1;
  if (k >= 0 && balls[k].color === color) {
    count++;
    while (k > 0 && touching(balls, k - 1) && balls[k - 1].color === color) (count++, k--);
  }
  let j = ahead ? index + 1 : index;
  if (j < balls.length && balls[j].color === color) {
    count++;
    while (j < balls.length - 1 && touching(balls, j) && balls[j + 1].color === color) (count++, j++);
  }
  return count;
}

function makeBot(gap = 0.5) {
  let wait = 0;
  return (state: State): Input => {
    wait -= DT;
    if (state.phase === "card") return press("fire");
    if (state.phase !== "play" || state.reload > 0 || wait > 0) return noInput();
    const layout = layoutOf(state.level);
    let best: { x: number; y: number; value: number; swap: boolean } | null = null;
    for (const chain of state.chains) {
      const track = layout.tracks[chain.track];
      for (const target of chain.balls) {
        if (target.s < 3 || target.s > track.length || track.hidden[Math.round(target.s)]) continue;
        const [px, py] = pointAt(track, target.s);
        const hit = firstHit(state, px, py);
        if (!hit) continue;
        const htrack = layout.tracks[hit.chain.track];
        const [bx, by] = pointAt(htrack, hit.ball.s);
        const i = Math.max(2, Math.min(htrack.length - 2, Math.round(hit.ball.s)));
        const ahead = (hit.hx - bx) * (htrack.xs[i + 2] - htrack.xs[i - 2]) + (hit.hy - by) * (htrack.ys[i + 2] - htrack.ys[i - 2]) >= 0;
        for (const swap of [false, true]) {
          const run = runLength(hit.chain, hit.chain.balls.indexOf(hit.ball), swap ? state.next : state.current, ahead);
          const danger = hit.ball.s / htrack.length;
          const value = (run >= 3 ? 100 + run * 10 + danger * 60 : run === 2 ? 20 + danger * 10 : -danger * 20) - (swap ? 1 : 0);
          if (!best || value > best.value) best = { x: px, y: py, value, swap };
        }
      }
    }
    if (!best) return noInput();
    if (best.swap) return press("down");
    wait = gap;
    return noInput({ taps: [{ x: best.x, y: best.y }] });
  };
}

/* ---------- Pruebas ---------- */

test("esferas: hay al menos 20 niveles en etapas, con caminos dentro del tablero y el ídolo fuera del camino", () => {
  assert.ok(LEVEL_COUNT >= 20);
  let twoPaths = 0;
  let tunnels = 0;
  const names = new Set<string>();
  for (let level = 1; level <= LEVEL_COUNT; level++) {
    const layout = layoutOf(level);
    names.add(layout.name);
    if (layout.tracks.length === 2) twoPaths++;
    const [ix, iy] = layout.idol;
    assert.ok(ix - IDOL_R - 3 >= 1 && ix + IDOL_R + 4 <= WIDTH - 1 && iy - IDOL_R >= 26 && iy + IDOL_R + 4 <= HEIGHT - 1, `${layout.name}: el ídolo se sale`);
    for (const track of layout.tracks) {
      assert.ok(track.length > 150, `${layout.name}: camino muy corto`);
      if (track.hidden.some((flag) => flag === 1)) tunnels++;
      for (let i = 0; i <= track.length; i++) {
        const x = track.xs[i];
        const y = track.ys[i];
        assert.ok(x >= AREA.left && x <= AREA.right && y >= AREA.top && y <= AREA.bottom, `${layout.name}: el camino se sale en ${x.toFixed(0)},${y.toFixed(0)}`);
        // Las esferas (radio 4) quedan dentro del marco y debajo del marcador.
        assert.ok(x - BALL / 2 >= 1 && x + BALL / 2 <= WIDTH - 1 && y - BALL / 2 >= 23 && y + BALL / 2 <= HEIGHT - 1);
        // El ídolo nunca queda encima del camino.
        assert.ok(Math.hypot(x - ix, y - iy) >= IDOL_R + BALL / 2 + 6, `${layout.name}: el ídolo pisa el camino`);
        if (i > 0) assert.ok(Math.abs(Math.hypot(x - track.xs[i - 1], y - track.ys[i - 1]) - 1) < 0.15, "los puntos van cada píxel");
      }
      // Dos pasadas del mismo camino nunca corren pegadas: solo se cruzan (por un puente).
      for (let j = 0; j <= track.length; j += 2) {
        for (let i = 0; i < j - 30; i += 2) {
          if (Math.hypot(track.xs[i] - track.xs[j], track.ys[i] - track.ys[j]) >= 10) continue;
          const a = Math.atan2(track.ys[i + 1] - track.ys[Math.max(0, i - 1)], track.xs[i + 1] - track.xs[Math.max(0, i - 1)]);
          const b = Math.atan2(track.ys[Math.min(track.length, j + 1)] - track.ys[j - 1], track.xs[Math.min(track.length, j + 1)] - track.xs[j - 1]);
          assert.ok(Math.abs(Math.cos(a - b)) < 0.6, `${layout.name}: dos pasadas del camino van pegadas`);
        }
      }
    }
    if (layout.tracks.length === 2) {
      const [a, b] = layout.tracks;
      for (let i = 0; i <= a.length; i += 3) for (let j = 0; j <= b.length; j += 3) assert.ok(Math.hypot(a.xs[i] - b.xs[j], a.ys[i] - b.ys[j]) >= 12, `${layout.name}: los dos caminos se tocan`);
    }
  }
  assert.equal(names.size, LEVEL_COUNT, "cada nivel tiene su nombre");
  assert.ok(twoPaths >= 3, "faltan niveles con dos caminos");
  assert.ok(tunnels >= 4, "faltan túneles");
  assert.equal(stageOf(1), 1);
  assert.equal(stageOf(5), 2);
  assert.equal(colorsOf(1), 4);
  assert.equal(colorsOf(LEVEL_COUNT), 6);
});

test("esferas: empieza bien, la cadena entra rodando y avanza sola", () => {
  const state = fresh();
  const status = esferas.status(state);
  assert.deepEqual(status, { score: 0, lives: 3, level: 1, letters: 0, world: 0, over: false });
  assert.equal(esferas.pad("1").length, 2);
  assert.deepEqual(esferas.pad("1")[1].map((button) => button.key), ["down", "fire"]);
  run(state, 3);
  const balls = state.chains[0].balls;
  assert.ok(balls.length > 20, "la cadena entró");
  const head = balls[balls.length - 1].s;
  run(state, 3);
  assert.ok(state.chains[0].balls[state.chains[0].balls.length - 1].s > head, "la cadena avanza");
  // Todas tocándose, en orden, sin encimarse.
  const now = state.chains[0].balls;
  for (let i = 0; i < now.length - 1; i++) assert.ok(now[i + 1].s - now[i].s >= BALL - 1e-6);
  assert.ok(now.every((ball) => ball.color < colorsOf(1)));
});

test("esferas: girar, lanzar, cambiar de esfera y apuntar con el dedo", () => {
  const state = fresh();
  run(state, 2.5);
  const angle = state.angle;
  run(state, 0.3, () => noInput({ held: new Set<Key>(["right"]) }));
  assert.ok(state.angle > angle + 0.5, "la derecha gira el ídolo");
  run(state, 0.3, () => noInput({ held: new Set<Key>(["left"]) }));
  assert.ok(Math.abs(state.angle - angle) < 0.05);

  const [current, next] = [state.current, state.next];
  const log: string[] = [];
  step(state, press("down"), log);
  assert.deepEqual([state.current, state.next], [next, current]);
  assert.ok(log.includes("sound:move"));
  // Tocar el ídolo también cambia.
  const [ix, iy] = layoutOf(1).idol;
  step(state, noInput({ taps: [{ x: ix, y: iy }], touches: [{ x: ix, y: iy }] }));
  assert.deepEqual([state.current, state.next], [current, next]);
  step(state);

  step(state, press("fire"), log);
  assert.equal(state.shots.length, 1, "fuego lanza");
  assert.ok(log.includes("sound:rotate"));
  run(state, 0.4);
  step(state, press("up"));
  assert.ok(state.shots.length >= 1, "arriba también lanza");
  run(state, 1);

  // Con el dedo: mientras está apoyado gira hacia el toque; al soltar, lanza.
  state.shots = [];
  const point = { x: ix + 30, y: iy };
  step(state, noInput({ taps: [point], touches: [point] }));
  assert.ok(Math.abs(state.angle) < 0.01, "mira hacia el dedo");
  assert.equal(state.shots.length, 0);
  step(state, noInput({ touches: [{ x: ix, y: iy - 30 }] }));
  assert.ok(Math.abs(state.angle + Math.PI / 2) < 0.01, "sigue al dedo");
  step(state, noInput());
  assert.equal(state.shots.length, 1, "al soltar, lanza");
  // Las esferas del ídolo son de colores que quedan en la cadena.
  const present = new Set(state.chains.flatMap((chain) => chain.balls.map((ball) => ball.color)));
  assert.ok(present.has(state.current) && present.has(state.next));
});

test("esferas: la esfera lanzada se mete en la cadena y abre espacio; tres iguales explotan", () => {
  const state = fresh();
  const balls = setChain(state, [0, 2, 3, 1, 1, 2, 0, 3]);
  const log: string[] = [];
  // Una sola: entra en la cadena, que se corre para hacerle lugar.
  shootAt(state, balls[2], 0, log);
  assert.ok(log.includes("sound:drop"));
  assert.equal(state.chains[0].balls.length, 9, "entró una esfera");
  run(state, 0.3, undefined, log);
  const after = state.chains[0].balls;
  for (let i = 0; i < after.length - 1; i++) assert.ok(touching(after, i), "siguen todas juntas");
  assert.equal(state.score, 0);
  // Dos azules + una lanzada: explotan.
  const ones = after.filter((ball) => ball.color === 1);
  shootAt(state, ones[0], 1, log);
  run(state, 0.3, undefined, log);
  const left = state.chains[0].balls;
  assert.ok(!left.some((ball) => ball.color === 1), "las tres desaparecieron");
  assert.equal(left.length, 9 - 2);
  assert.equal(state.score, 30);
  assert.ok(log.includes("sound:clear"));
});

test("esferas: el imán devuelve el tramo de adelante y arma combos", () => {
  const state = fresh();
  // 0 0 | 1 1 | 0 ... : al romper los 1, los 0 de los dos lados se atraen y explotan también.
  const balls = setChain(state, [2, 3, 0, 0, 1, 1, 0, 2, 3]);
  const front = balls[6];
  const log: string[] = [];
  shootAt(state, balls[4], 1, log);
  for (let i = 0; i < 60 && state.chains[0].balls.some((ball) => ball.color === 1); i++) step(state, noInput(), log);
  // Se rompieron los 1: el tramo de adelante retrocede, atraído.
  const before = front.s;
  run(state, 0.1, undefined, log);
  assert.ok(front.s < before - 1, "el tramo de adelante vuelve");
  run(state, 1.5, undefined, log);
  const left = state.chains[0].balls;
  assert.ok(!left.some((ball) => ball.color === 0 || ball.color === 1), "la reacción en cadena se llevó los 0");
  assert.equal(state.bestCombo, 2);
  assert.ok(log.includes("sound:clear2"));
  // Combo x2: 3 esferas × 10 × 2 + 80 de premio, además de las primeras 30.
  assert.equal(state.score, 30 + 3 * 10 * 2 + 80);
  // Lo que queda, junto otra vez cuando la de atrás alcanza a la de adelante.
  run(state, 5, undefined, log);
  for (let i = 0; i < left.length - 1; i++) assert.ok(touching(left, i));
});

test("esferas: tras una explosión sin imán, la parte de adelante se queda quieta hasta que la de atrás la alcanza", () => {
  const state = fresh();
  state.full = false;
  const balls = setChain(state, [2, 3, 1, 1, 2, 0], 20);
  state.full = false;
  const head = balls[5];
  shootAt(state, balls[2], 1);
  run(state, 0.2);
  const chain = state.chains[0];
  const where = head.s;
  const tail = chain.balls.find((ball) => ball.id === 1001) as Ball;
  const tailWas = tail.s;
  run(state, 0.8);
  assert.equal(head.s, where, "la parte de adelante se detuvo");
  assert.ok(tail.s > tailWas, "la de atrás sigue empujando");
  run(state, 8);
  const i = chain.balls.indexOf(head);
  assert.ok(touching(chain.balls, i - 1), "al final se alcanzan");
  assert.ok(head.s > where, "y entonces empuja también a la de adelante");
});

test("esferas: la barra llena, la cadena vacía, el bono por el camino que quedaba y el nivel siguiente", () => {
  const state = fresh();
  run(state, 3);
  const log: string[] = [];
  for (const chain of state.chains) chain.balls = [];
  state.full = true;
  step(state, noInput(), log);
  assert.equal(state.phase, "bonus");
  assert.ok(log.includes("sound:level"));
  const score = state.score;
  run(state, 8, undefined, log);
  assert.equal(state.phase, "card");
  assert.ok(state.score > score && state.bonusTotal === state.score - score, "el bono suma puntos");
  run(state, 1);
  step(state, press("fire"), log);
  assert.equal(state.level, 2);
  assert.equal(state.phase, "play");
  assert.equal(esferas.status(state).world, 0, "la etapa 1 sigue en el primer paisaje");
  // Con la barra a medias no se termina aunque la cadena quede vacía un momento: vuelven a salir esferas.
  run(state, 2);
  for (const chain of state.chains) chain.balls = [];
  step(state);
  assert.equal(state.phase, "play");
  run(state, 1);
  assert.ok(state.chains[0].balls.length > 0);
});

test("esferas: la barra se llena con los puntos del nivel y entonces no salen más esferas", () => {
  const state = fresh();
  run(state, 4);
  const log: string[] = [];
  const balls = setChain(state, [0, 0, 1, 2], 100);
  state.full = false;
  state.levelScore = 100_000;
  shootAt(state, balls[0], 0, log);
  run(state, 0.3, undefined, log);
  assert.ok(state.full, "la barra quedó llena");
  assert.ok(log.includes("sound:letter"));
  const count = state.chains[0].balls.length;
  run(state, 5);
  assert.equal(state.chains[0].balls.length, count, "ya no salen más");
});

test("esferas: esferas especiales (retroceso, lentitud, puntería, bomba) y la moneda-luna", () => {
  const state = fresh();
  run(state, 2);
  let balls = setChain(state, [2, 3, 1, 1, 2, 3, 2, 3]);
  balls[3].kind = "back";
  balls[3].kindLife = 10;
  shootAt(state, balls[2], 1);
  run(state, 0.3);
  assert.ok(state.reverse > 0, "retroceso");
  const tail = state.chains[0].balls[0];
  const was = tail.s;
  run(state, 1);
  assert.ok(tail.s < was, "la cadena va hacia atrás");
  run(state, 3);

  balls = setChain(state, [2, 3, 1, 1, 2, 3]);
  balls[2].kind = "slow";
  balls[2].kindLife = 10;
  shootAt(state, balls[3], 1);
  run(state, 0.3);
  assert.ok(state.slow > 0, "lentitud");

  balls = setChain(state, [2, 3, 1, 1, 2, 3]);
  balls[2].kind = "aim";
  balls[2].kindLife = 10;
  shootAt(state, balls[3], 1);
  run(state, 0.3);
  assert.ok(state.aim > 0, "puntería");
  step(state, press("fire"));
  assert.ok(Math.hypot(state.shots[0].vx, state.shots[0].vy) > 300, "con puntería los tiros van más rápido");
  run(state, 1);

  balls = setChain(state, [2, 3, 2, 3, 1, 1, 2, 3, 2, 3, 2, 3, 2, 3]);
  balls[4].kind = "bomb";
  balls[4].kindLife = 10;
  shootAt(state, balls[5], 1);
  run(state, 0.3);
  assert.ok(state.chains[0].balls.length <= 15 - 3 - 4, "la bomba se llevó a las vecinas");

  // La moneda-luna: un tiro que pasa por encima da un bono.
  const coinState = fresh();
  run(coinState, 3);
  const [ix, iy] = layoutOf(1).idol;
  coinState.coin = { x: ix + 20, y: iy, life: 5 };
  const score = coinState.score;
  coinState.angle = 0;
  const log: string[] = [];
  step(coinState, press("fire"), log);
  run(coinState, 0.3, undefined, log);
  assert.equal(coinState.coin, null);
  assert.ok(coinState.score >= score + 300);
  assert.ok(log.includes("sound:clear2"));

  // Los poderes aparecen solos en la cadena de vez en cuando.
  const idle = fresh(3);
  let seen = false;
  for (let i = 0; i < 60 * 25 && !seen; i++) {
    step(idle);
    seen = idle.chains.some((chain) => chain.balls.some((ball) => ball.kind !== ""));
  }
  assert.ok(seen, "nunca apareció un poder");
});

test("esferas: si la primera llega al pozo se pierde una vida, la cadena se va por el pozo y el nivel se repite", () => {
  const state = fresh(5, "n3");
  const log: string[] = [];
  let frames = 0;
  while (state.phase === "play" && frames < 60 * 200) {
    step(state, noInput(), log);
    frames++;
  }
  assert.equal(state.phase, "dying");
  assert.ok(log.includes("sound:lock"));
  assert.equal(state.lives, 3);
  run(state, 0.5, undefined, log);
  const left = state.chains[0].balls.length;
  run(state, 0.5, undefined, log);
  assert.ok(state.chains[0].balls.length < left || (state.phase as string) === "play", "las esferas se van por el pozo");
  run(state, 4, undefined, log);
  assert.equal(state.phase, "play");
  assert.equal(state.lives, 2);
  assert.equal(state.level, 3, "el mismo nivel otra vez");
  assert.ok(log.some((line) => line.startsWith("say:Vidas")));
  // Sin hacer nada, la partida termina.
  run(state, 400, undefined, log);
  assert.ok(state.over && esferas.status(state).over);
  assert.equal(state.lives, 0);
  assert.ok(log.includes("sound:over"));
  const frozen = JSON.stringify(state);
  run(state, 2, () => press("fire"));
  assert.equal(JSON.stringify(state), frozen, "terminada, ya no cambia");
});

test("esferas: el secreto sale una sola vez, al completar el nivel 10", () => {
  const before = fresh(1, "n9");
  const log: string[] = [];
  for (const chain of before.chains) chain.balls = [];
  before.full = true;
  run(before, 9, undefined, log);
  assert.ok(!log.includes("secret"), "el nivel 9 no da el secreto");
  const state = fresh(1, "n10");
  for (let level = 0; level < 2; level++) {
    for (const chain of state.chains) chain.balls = [];
    state.full = true;
    run(state, 9, undefined, log);
    step(state, press("fire"), log);
  }
  assert.equal(state.level, 12);
  assert.equal(log.filter((line) => line === "secret").length, 1);
});

test("esferas: un jugador automático pasa al menos 3 niveles y gana puntos", () => {
  const state = fresh(11);
  const bot = makeBot(0.5);
  const log: string[] = [];
  for (let i = 0; i < 60 * 600 && state.level < 4 && !state.over; i++) step(state, bot(state), log);
  assert.ok(state.level >= 4, `llegó solo al nivel ${state.level}`);
  assert.ok(state.score > 3000);
  assert.ok(log.filter((line) => line === "sound:level").length >= 3);
  assert.equal(esferas.status(state).world, 0);
  // Y otro, a partir del nivel 5, llega a la etapa siguiente con su paisaje y dos caminos.
  const later = fresh(12, "n5");
  assert.equal(later.chains.length, 2);
  assert.equal(esferas.status(later).world, 1);
});

test("esferas: misma semilla, misma partida", () => {
  const play = (seed: number) => {
    const state = fresh(seed);
    const bot = makeBot(0.7);
    for (let i = 0; i < 60 * 90; i++) step(state, bot(state));
    return JSON.stringify(state);
  };
  assert.equal(play(21), play(21));
  assert.notEqual(play(21), play(22));
});

test("esferas: varios minutos con dt variables y controles al azar, sin romperse ni salirse", () => {
  for (const seed of [1, 2, 3]) {
    const state = fresh(seed, seed === 3 ? "n13" : "1");
    let random = seed * 31;
    const next = () => (random = (random * 1103515245 + 12345) >>> 0) / 4294967296;
    const keys: Key[] = ["left", "right", "up", "down", "fire"];
    const held = new Set<Key>();
    const bot = makeBot(0.4);
    let lastScore = 0;
    for (let frame = 0; frame < 60 * 240 && !state.over; frame++) {
      let input: Input;
      if (frame % 600 < 300) input = bot(state);
      else {
        const pressed: Key[] = [];
        if (frame % 9 === 0) {
          const key = keys[Math.floor(next() * keys.length)];
          if (held.has(key)) held.delete(key);
          else (held.add(key), pressed.push(key));
        }
        const tap = frame % 37 === 0 ? [{ x: next() * WIDTH, y: next() * HEIGHT }] : [];
        input = noInput({ held, pressed, taps: tap, touches: frame % 100 < 20 ? tap : [] });
      }
      esferas.step(state, next() * 0.05, input, quietOut());
      const status = esferas.status(state);
      assert.ok(Number.isInteger(status.score) && status.score >= lastScore && status.score <= 999_999);
      lastScore = status.score;
      assert.ok(status.lives >= 0 && status.lives <= 6);
      assert.ok(Number.isFinite(state.angle));
      const layout = layoutOf(state.level);
      for (const chain of state.chains) {
        const track = layout.tracks[chain.track];
        chain.balls.forEach((ball, i) => {
          assert.ok(Number.isFinite(ball.s) && ball.w >= 0 && ball.w <= 1);
          assert.ok(ball.s <= track.length + 400, "una esfera se escapó");
          if (i > 0) assert.ok(ball.s - chain.balls[i - 1].s >= ((ball.w + chain.balls[i - 1].w) / 2) * BALL - 1e-6, "esferas encimadas");
        });
      }
      for (const shot of state.shots) assert.ok(shot.x > -10 && shot.x < WIDTH + 10 && shot.y > 10 && shot.y < HEIGHT + 10);
    }
    assert.ok(state.score > 0);
  }
});

test("esferas: se dibuja sin medidas rotas y con pocos rectángulos", () => {
  const broken: string[] = [];
  const counter = { rects: 0 };
  const c = new Proxy(
    {
      fillRect(x: number, y: number, w: number, h: number) {
        counter.rects++;
        if (![x, y, w, h].every(Number.isFinite)) broken.push(`${x},${y},${w},${h}`);
      },
    } as Record<string, unknown>,
    {
      get: (target, key) => (key in target ? target[key as string] : typeof key === "string" && /^[a-z]/.test(key) ? () => ({ addColorStop() {} }) : undefined),
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  for (const mode of ["1", "n9", "n13", "n14"]) {
    const state = fresh(4, mode);
    const bot = makeBot(0.5);
    let most = 0;
    for (let frame = 0; frame < 60 * 40; frame++) {
      step(state, bot(state));
      if (frame % 20 === 0) {
        counter.rects = 0;
        esferas.draw(c, state, frame / 60, frame % 40 === 0);
        most = Math.max(most, counter.rects);
      }
    }
    assert.deepEqual(broken, []);
    assert.ok(most < 9000, `${mode}: ${most} rectángulos`);
  }
});
