import assert from "node:assert/strict";
import { test } from "node:test";
import game, {
  CAR_HALF,
  DECOS,
  EDGE,
  LANES,
  MAX_SPEED,
  OFF_LIMIT,
  PLAYER_Z,
  RIVAL,
  SEG,
  START_TIME,
  bonusOf,
  controlsOf,
  createRace,
  gateOf,
  segAt,
  stepRace,
  type State,
} from "../src/components/secret/games/carreras";
import { CAR, NAME } from "../src/components/secret/games/kit";
import { noInput, quietOut, type Input, type Key } from "../src/components/secret/games/types";

const DT = 1 / 60;
const holding = (...keys: Key[]): Input => noInput({ held: new Set<Key>(keys) });

/** Una conductora sencilla: acelera siempre, esquiva los autos de su carril y va a buscar las letras. */
function botInput(state: State): Input {
  const pAbs = state.position + PLAYER_Z;
  const pSeg = Math.floor(pAbs / SEG);
  const blocked = (lane: number) =>
    state.rivals.some((r) => r.z > pAbs - SEG * 0.5 && r.z - pAbs < SEG * 22 && Math.abs(r.x - lane) < 0.55 && r.speed < state.speed + 1);
  let target: number = LANES.reduce((a, b) => (Math.abs(b - state.x) < Math.abs(a - state.x) ? b : a));
  if (state.letter && state.letter.seg - pSeg < 70 && !blocked(state.letter.x)) target = state.letter.x;
  if (blocked(target)) {
    const free = [...LANES].filter((l) => !blocked(l)).sort((a, b) => Math.abs(a - state.x) - Math.abs(b - state.x));
    if (free.length) target = free[0];
  }
  const keys: Key[] = ["fire"];
  if (state.x < target - 0.04) keys.push("right");
  else if (state.x > target + 0.04) keys.push("left");
  return holding(...keys);
}

function playBot(seed: number, seconds: number, log?: string[], dt = () => DT) {
  const state = createRace(seed);
  const out = quietOut(log);
  let time = 0;
  while (time < seconds && !state.over) {
    const step = dt();
    stepRace(state, step, botInput(state), out);
    time += step;
  }
  return state;
}

test("carreras: los dibujos tienen filas parejas", () => {
  for (const sprite of [...DECOS.map((deco) => deco.rows), RIVAL]) {
    assert.equal(new Set(sprite.map((row) => row.length)).size, 1);
  }
  assert.equal(RIVAL.length, 12);
  assert.equal(RIVAL[0].length, 16);
  assert.equal(CAR.length, 12);
  assert.equal(CAR[0].length, 16);
});

test("carreras: empieza bien", () => {
  const state = createRace(7);
  assert.deepEqual(game.status(state), { score: 0, lives: 0, level: 1, letters: 0, world: 0, over: false });
  assert.equal(state.left, START_TIME);
  assert.equal(state.speed, 0);
  assert.equal(state.x, 0);
  assert.ok(state.rivals.length >= 3, "hay autos para adelantar desde el principio");
  assert.ok(state.made > 120, "la ruta ya está hecha más allá de lo que se ve");
  const log: string[] = [];
  game.step(state, DT, noInput(), quietOut(log));
  assert.ok(log.includes("sound:start"));
  const pad = game.pad("1");
  assert.equal(pad.length, 2);
  assert.deepEqual(pad[1].map((b) => b.key), ["down", "fire"]);
  assert.ok(pad[1][1].main);
});

test("carreras: acelerar, frenar y girar hacen lo que deben", () => {
  const state = createRace(1);
  state.rivals = [];
  const out = quietOut();
  for (let n = 0; n < 60; n++) stepRace(state, DT, holding("up"), out);
  const fast = state.speed;
  assert.ok(fast > MAX_SPEED * 0.2, "acelera con la flecha de arriba");
  for (let n = 0; n < 600; n++) {
    // Sola y en el centro: aquí solo se mira la velocidad (las curvas y los rivales la frenarían).
    state.x = 0;
    state.rivals = [];
    stepRace(state, DT, holding("fire"), out);
  }
  assert.ok(state.speed <= MAX_SPEED && state.speed > MAX_SPEED * 0.9, "llega casi al tope y no lo pasa");
  // La aceleración es más fuerte desde parado que cerca del tope.
  const slow = createRace(1);
  stepRace(slow, DT, holding("fire"), out);
  const early = slow.speed;
  const late = state.speed;
  stepRace(state, DT, holding("fire"), out);
  assert.ok(state.speed - late < early);

  const x = state.x;
  for (let n = 0; n < 10; n++) stepRace(state, DT, holding("fire", "left"), out);
  assert.ok(state.x < x - 0.1, "gira a la izquierda");
  const y = state.x;
  for (let n = 0; n < 20; n++) stepRace(state, DT, holding("fire", "right"), out);
  assert.ok(state.x > y + 0.1, "gira a la derecha");

  const speed = state.speed;
  for (let n = 0; n < 30; n++) stepRace(state, DT, holding("down"), out);
  assert.ok(state.speed < speed * 0.5, "frena");
  for (let n = 0; n < 300; n++) stepRace(state, DT, noInput(), out);
  assert.equal(state.speed, 0, "sin acelerar se detiene solo");
});

test("carreras: el dedo acelera y gira hacia su mitad del tablero", () => {
  assert.deepEqual(controlsOf(noInput({ touches: [{ x: 20, y: 150 }] })), { turn: -1, gas: true, brake: false });
  assert.deepEqual(controlsOf(noInput({ touches: [{ x: 110, y: 150 }] })), { turn: 1, gas: true, brake: false });
  assert.deepEqual(controlsOf(noInput({ touches: [{ x: 64, y: 150 }] })), { turn: 0, gas: true, brake: false });
  assert.deepEqual(controlsOf(noInput()), { turn: 0, gas: false, brake: false });
  const state = createRace(2);
  for (let n = 0; n < 60; n++) stepRace(state, DT, noInput({ touches: [{ x: 10, y: 120 }] }), quietOut());
  assert.ok(state.speed > 0 && state.x < 0);
});

test("carreras: el pasto frena y no se puede salir del tablero", () => {
  const state = createRace(3);
  state.rivals = [];
  const out = quietOut();
  for (let n = 0; n < 400; n++) stepRace(state, DT, holding("fire"), out);
  for (let n = 0; n < 600; n++) {
    stepRace(state, DT, holding("fire", "right"), out);
    assert.ok(state.x <= EDGE);
  }
  assert.equal(state.x, EDGE);
  assert.ok(state.offroad);
  assert.ok(state.speed <= OFF_LIMIT + 1, "en el pasto no pasa de un cuarto de la velocidad");
});

test("carreras: chocar con un rival frena mucho y sacude", () => {
  const state = createRace(4);
  const out = quietOut();
  const log: string[] = [];
  state.speed = MAX_SPEED;
  state.rivals = [{ z: state.position + PLAYER_Z + SEG * 2, x: 0, to: 0, speed: MAX_SPEED * 0.3, paint: 0, passed: false }];
  for (let n = 0; n < 10; n++) stepRace(state, DT, holding("fire"), quietOut(log));
  assert.ok(log.includes("sound:lock"));
  assert.ok(state.speed < MAX_SPEED * 0.4);
  assert.ok(state.shake > 0);
  assert.equal(state.passes, 0);
  // Por el lado se adelanta sin chocar y da puntos.
  const other = createRace(4);
  other.speed = MAX_SPEED;
  other.x = LANES[2];
  other.rivals = [{ z: other.position + PLAYER_Z + SEG * 3, x: LANES[0], to: LANES[0], speed: MAX_SPEED * 0.3, paint: 1, passed: false }];
  for (let n = 0; n < 30; n++) stepRace(other, DT, holding("fire"), quietOut());
  assert.equal(other.passes, 1);
  assert.equal(other.bonus, 50);
});

test("carreras: chocar con una cosa del borde casi detiene el auto", () => {
  const state = createRace(5);
  state.rivals = [];
  const out = quietOut();
  for (let n = 0; n < 300; n++) stepRace(state, DT, holding("fire"), out);
  const seg = Math.floor((state.position + PLAYER_Z) / SEG) + 6;
  const tramo = segAt(state, seg);
  assert.ok(tramo);
  tramo.d = [0, 1.6];
  state.x = 1.6;
  state.speed = OFF_LIMIT;
  const log: string[] = [];
  for (let n = 0; n < 60; n++) stepRace(state, DT, holding("fire"), quietOut(log));
  assert.ok(log.includes("sound:lock"));
  assert.ok(state.speed <= MAX_SPEED * 0.06);
  assert.ok(Math.floor((state.position + PLAYER_Z) / SEG) < seg, "queda antes del farol");
  assert.ok(CAR_HALF > 0);
});

test("carreras: el arco suma tiempo y cambia de paisaje", () => {
  const state = createRace(6);
  state.rivals = [];
  const log: string[] = [];
  state.position = gateOf(1) * SEG - PLAYER_Z - SEG * 2;
  state.speed = MAX_SPEED * 0.5;
  const left = state.left;
  for (let n = 0; n < 30; n++) stepRace(state, DT, holding("fire"), quietOut(log));
  assert.equal(state.stage, 2);
  assert.ok(state.left > left + bonusOf(1) - 1);
  assert.equal(game.status(state).world, 1);
  assert.equal(game.status(state).level, 2);
  assert.ok(log.includes("sound:level"));
  assert.equal(segAt(state, gateOf(1))?.g, true);
  assert.equal(segAt(state, gateOf(1))?.w, 1);
  assert.equal(segAt(state, gateOf(1) - 1)?.w, 0);
});

test("carreras: el bot gana puntos, pasa etapas y junta el nombre (secreto una sola vez)", () => {
  for (const seed of [1, 2, 3]) {
    const log: string[] = [];
    let score = 0;
    const state = createRace(seed);
    const out = quietOut(log);
    for (let n = 0; n < 60 * 240 && !state.over; n++) {
      stepRace(state, DT, botInput(state), out);
      const status = game.status(state);
      assert.ok(status.score >= score, "el puntaje nunca baja");
      score = status.score;
      assert.ok(Math.abs(state.x) <= EDGE);
      assert.ok(status.letters >= 0 && status.letters <= NAME.length);
      assert.equal(status.world, (status.level - 1) % 6);
    }
    assert.ok(state.passes > 5, "adelanta autos");
    assert.ok(state.stage >= 4, `pasa varias etapas (llegó a ${state.stage})`);
    assert.equal(log.filter((e) => e === "secret").length, 1, "el secreto sale una vez");
    assert.ok(state.secret);
    assert.ok(game.status(state).score > 2000);
  }
});

test("carreras: sin hacer nada se acaba el tiempo", () => {
  const state = createRace(8);
  const log: string[] = [];
  let frames = 0;
  while (!state.over && frames < 60 * 60) {
    stepRace(state, DT, noInput(), quietOut(log));
    frames += 1;
  }
  assert.ok(state.over);
  assert.ok(Math.abs(frames * DT - START_TIME) < 0.1);
  assert.equal(game.status(state).over, true);
  assert.equal(log.filter((e) => e === "sound:over").length, 1);
  assert.equal(log.includes("secret"), false);
  const frozen = JSON.stringify(state);
  stepRace(state, DT, holding("fire"), quietOut(log));
  assert.equal(JSON.stringify(state), frozen, "después del final no cambia nada");
});

test("carreras: misma semilla, misma partida", () => {
  const play = () => JSON.stringify(playBot(42, 90));
  assert.equal(play(), play());
  assert.notEqual(JSON.stringify(playBot(43, 30)), JSON.stringify(playBot(42, 30)));
});

test("carreras: aguanta dt variables varios minutos", () => {
  let random = 99;
  const dt = () => {
    random = (random * 1103515245 + 12345) >>> 0;
    return ((random >>> 8) % 1000) / 20000;
  };
  const state = playBot(11, 300, undefined, dt);
  for (const value of [state.position, state.speed, state.x, state.left, game.status(state).score]) assert.ok(Number.isFinite(value));
  assert.ok(state.segs.length < 2000, "la ruta vieja se olvida");
  assert.ok(state.rivals.length < 20);
  // Con dt cero y controles locos no se rompe.
  const odd = createRace(12);
  for (let n = 0; n < 2000; n++) {
    stepRace(odd, n % 3 === 0 ? 0 : 0.05, holding(...(["left", "right", "up", "down", "fire"] as Key[]).filter((_, k) => (n >> k) & 1)), quietOut());
    assert.ok(Math.abs(odd.x) <= EDGE && odd.speed >= 0 && odd.speed <= MAX_SPEED);
  }
});
