import assert from "node:assert/strict";
import { test } from "node:test";
import muro from "../src/components/secret/games/muro";
import { noInput, quietOut, type Input } from "../src/components/secret/games/types";

type Lantern = { x: number; y: number; hp: number };
type State = {
  paddle: number;
  wide: number;
  level: number;
  letters: number;
  lives: number;
  score: number;
  wait: number;
  over: boolean;
  ball: { x: number; y: number; vx: number; vy: number; stuck: boolean };
  lanterns: Lantern[];
  flower: { x: number; y: number } | null;
};

const DT = 1 / 60;
const fresh = (seed = 7) => muro.create(seed, "1") as State;
const step = (state: State, input: Input = noInput(), log?: string[], dt = DT) => muro.step(state, dt, input, quietOut(log));

/** Un jugador automático: el dedo sigue a la luz, ladeándose un poco para variar el ángulo. */
function autopilot(state: State, frame: number): Input {
  if (state.ball.stuck) return noInput({ taps: frame % 20 === 0 ? [{ x: 64, y: 100 }] : [] });
  const lean = ((Math.floor(frame / 100) % 5) - 2) * 4;
  return noInput({ touches: [{ x: state.ball.x + lean, y: 200 }] });
}

test("muro: empieza con la N, la luz pegada al abanico y 3 vidas", () => {
  const state = fresh();
  const status = muro.status(state);
  assert.deepEqual(status, { score: 0, lives: 3, level: 1, letters: 0, world: 0, over: false });
  assert.equal(state.lanterns.length, 17, "la N tiene 17 faroles");
  assert.ok(state.ball.stuck);
  for (let i = 0; i < 60; i++) step(state);
  assert.ok(state.ball.stuck, "sin lanzar, la luz espera");
  assert.deepEqual(muro.pad("1"), [
    [
      { key: "left", glyph: "←", label: "Izquierda" },
      { key: "right", glyph: "→", label: "Derecha" },
    ],
    [{ key: "fire", glyph: "★", label: "Lanzar", main: true }],
  ]);
});

test("muro: las flechas y el dedo mueven el abanico; fire y un toque lanzan", () => {
  const state = fresh();
  const start = state.paddle;
  for (let i = 0; i < 20; i++) step(state, noInput({ held: new Set(["left"]) }));
  assert.ok(state.paddle < start);
  assert.equal(state.ball.x, state.paddle, "la luz va pegada al abanico");
  for (let i = 0; i < 200; i++) step(state, noInput({ held: new Set(["left"]) }));
  assert.ok(state.paddle - 12 >= 1, "el abanico no sale del tablero");
  for (let i = 0; i < 120; i++) step(state, noInput({ touches: [{ x: 100, y: 200 }] }));
  assert.ok(Math.abs(state.paddle - 100) < 0.01, "sigue la x del dedo");

  const log: string[] = [];
  step(state, noInput({ pressed: ["fire"], held: new Set(["fire"]) }), log);
  assert.ok(!state.ball.stuck && state.ball.vy < 0);
  assert.ok(log.includes("sound:rotate"));

  const other = fresh();
  step(other, noInput({ taps: [{ x: 30, y: 120 }] }));
  assert.ok(!other.ball.stuck, "un toque también lanza");
});

test("muro: el ángulo depende de dónde toca el abanico", () => {
  const bounce = (offset: number) => {
    const state = fresh();
    state.lanterns = [{ x: 0, y: 30, hp: 99 }]; // un farol fuera del camino, para que no termine el nivel
    state.ball = { x: state.paddle + offset, y: 190, vx: 0, vy: 100, stuck: false };
    for (let i = 0; i < 20 && state.ball.vy > 0; i++) step(state);
    return state.ball;
  };
  const left = bounce(-10);
  const middle = bounce(0);
  const right = bounce(10);
  assert.ok(left.vx < 0 && right.vx > 0);
  assert.ok(Math.abs(middle.vx) < Math.abs(right.vx));
  assert.ok(Math.abs(middle.vx) > 0, "nunca sale perfectamente derecha");
  for (const ball of [left, middle, right]) assert.ok(-ball.vy >= Math.hypot(ball.vx, ball.vy) * 0.45, "nunca casi de lado");
});

test("muro: la luz no atraviesa faroles aunque vaya muy rápido", () => {
  const state = fresh();
  const target = state.lanterns.find((l) => l.y === 40 + 6 * 9) as Lantern; // la fila de abajo de la N
  state.ball = { x: target.x + 8, y: target.y + 24, vx: 0.5, vy: -190, stuck: false };
  const before = state.lanterns.length;
  for (let i = 0; i < 3; i++) step(state, noInput(), undefined, 0.05);
  assert.equal(state.lanterns.length, before - 1, "el primer farol del camino se apagó");
  assert.ok(state.ball.vy > 0, "y la luz rebotó hacia abajo");
});

test("muro: perder la luz quita una vida y a la tercera termina", () => {
  const state = fresh();
  const log: string[] = [];
  for (let lost = 0; lost < 3; lost++) {
    step(state, noInput({ pressed: ["fire"] }), log);
    for (let i = 0; i < 60 * 30 && !state.ball.stuck && !state.over; i++) step(state, noInput({ held: new Set(["left"]) }), log);
  }
  // Si con el abanico pegado a la izquierda la luz igual rebotó, seguimos hasta perderla.
  for (let i = 0; i < 60 * 300 && !state.over; i++) step(state, noInput({ pressed: ["fire"], held: new Set(["left"]) }), log);
  assert.ok(state.over);
  assert.equal(muro.status(state).lives, 0);
  assert.ok(log.includes("sound:over"));
  const frozen = JSON.stringify(state);
  step(state, noInput({ pressed: ["fire"] }));
  assert.equal(JSON.stringify(state), frozen, "terminada, no cambia nada");
});

test("muro: la flor de cerezo ensancha el abanico 10 segundos", () => {
  const state = fresh();
  state.flower = { x: state.paddle - 2, y: 190 };
  const log: string[] = [];
  for (let i = 0; i < 60; i++) step(state, noInput(), log);
  assert.equal(state.flower, null);
  assert.ok(state.wide > 8.5 && state.wide <= 10);
  assert.ok(log.includes("sound:level"));
  step(state, noInput({ pressed: ["fire"] }));
  state.lanterns = [{ x: 0, y: 30, hp: 99 }];
  for (let i = 0; i < 60 * 11; i++) {
    step(state);
    if (state.ball.stuck) step(state, noInput({ pressed: ["fire"] }));
  }
  assert.equal(state.wide, 0);
});

test("muro: con un jugador automático se juntan letras, NATHALIA da el secreto una vez y una vida", () => {
  const state = fresh(3);
  const log: string[] = [];
  let score = 0;
  for (let frame = 0; frame < 60 * 60 * 40 && !state.over && state.level < 10; frame++) {
    step(state, autopilot(state, frame), log);
    const s = muro.status(state);
    assert.ok(s.score >= score, "el puntaje nunca baja");
    score = s.score;
    assert.ok(s.letters >= 0 && s.letters <= 8);
    assert.equal(s.world, (s.level - 1) % 6);
    if (!state.ball.stuck) {
      assert.ok(state.ball.x >= 1 && state.ball.x <= 127, "la luz no sale por los lados");
      assert.ok(state.ball.y >= 26, "ni por arriba");
    }
  }
  assert.ok(state.level >= 9, `llegó al nivel ${state.level}`);
  assert.equal(log.filter((e) => e === "secret").length, 1);
  assert.ok(log.includes("sound:letter"));
  assert.ok(state.score >= 8 * 200);
  // En la segunda vuelta hay faroles duros.
  if (state.level === 9 || state.level === 10) assert.ok(state.lanterns.some((l) => l.hp === 2) || state.wait > 0);
});

test("muro: la segunda vez que se junta el nombre no repite el secreto", () => {
  const state = fresh(5);
  const log: string[] = [];
  for (let frame = 0; frame < 60 * 60 * 10 && state.level <= 17; frame++) {
    if (state.wait <= 0 && state.lanterns.length > 0) state.lanterns.splice(0, state.lanterns.length - 1);
    if (!state.ball.stuck && state.wait <= 0 && state.ball.vy > 0) {
      // Llevamos la luz directo al último farol que queda.
      const l = state.lanterns[0];
      state.ball = { x: l.x + 8, y: l.y + 14, vx: 0.3, vy: -120, stuck: false };
    }
    step(state, noInput({ pressed: ["fire"] }), log);
  }
  assert.ok(state.level > 16);
  assert.equal(log.filter((e) => e === "secret").length, 1);
  assert.equal(log.filter((e) => e === "sound:letter").length, 2);
});

test("muro: misma semilla, misma partida", () => {
  const play = (seed: number) => {
    const state = fresh(seed);
    for (let frame = 0; frame < 60 * 120 && !state.over; frame++) step(state, autopilot(state, frame));
    return JSON.stringify(state);
  };
  assert.equal(play(11), play(11));
  assert.notEqual(play(11), play(12));
});

test("muro: aguanta pasos de tiempo variables durante varios minutos", () => {
  let random = 12345;
  const next = () => {
    random = (random * 1103515245 + 12345) >>> 0;
    return random / 4294967296;
  };
  for (const seed of [1, 2, 3]) {
    const state = fresh(seed);
    let time = 0;
    let frame = 0;
    while (time < 60 * 6 && !state.over) {
      const dt = next() * 0.05;
      const input = next() < 0.5 ? autopilot(state, frame) : noInput({ held: new Set([next() < 0.5 ? "left" : "right"]), pressed: ["fire"] });
      muro.step(state, dt, input, quietOut());
      time += dt;
      frame += 1;
      for (const value of [state.ball.x, state.ball.y, state.ball.vx, state.ball.vy, state.paddle, state.score]) assert.ok(Number.isFinite(value));
      if (!state.ball.stuck) {
        assert.ok(state.ball.x >= 1 && state.ball.x <= 127 && state.ball.y >= 26);
        const speed = Math.hypot(state.ball.vx, state.ball.vy);
        assert.ok(Math.abs(state.ball.vy) >= speed * 0.4, "la luz nunca queda casi de lado");
      }
      assert.ok(state.paddle >= 1 && state.paddle <= 127);
    }
    muro.step(state, 0, noInput(), quietOut());
  }
});
