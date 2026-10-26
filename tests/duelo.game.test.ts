import assert from "node:assert/strict";
import { test } from "node:test";
import duelo, { BALL_MAX, BALL_MIN, BOTTOM_Y, MIDDLE, PADDLE_MAX, PADDLE_MIN, TOP_Y } from "../src/components/secret/games/duelo";
import { noInput, quietOut, type Input } from "../src/components/secret/games/types";

type Duel = {
  mode: string;
  level: number;
  score: number;
  bottom: number;
  top: number;
  points: [number, number];
  ball: { x: number; y: number; vx: number; vy: number; speed: number };
  wait: number;
  over: boolean;
  result?: string;
};

const DT = 1 / 60;
const game = (seed = 7, mode = "1") => duelo.create(seed, mode) as Duel;
/** Alguien que juega perfecto: pone el dedo justo donde está la luna. */
const follow = (state: Duel): Input => noInput({ touches: [{ x: state.ball.x, y: 200 }] });

function inside(state: Duel) {
  assert.ok(state.bottom >= PADDLE_MIN && state.bottom <= PADDLE_MAX, "el farol de abajo se salió");
  assert.ok(state.top >= PADDLE_MIN && state.top <= PADDLE_MAX, "el farol de arriba se salió");
  assert.ok(state.ball.x >= BALL_MIN - 1e-6 && state.ball.x <= BALL_MAX + 1e-6, "la luna atravesó una pared");
  assert.ok(Number.isFinite(state.ball.y));
}

test("duelo: empieza con la luna quieta en el centro y 7 corazones", () => {
  const state = game();
  const status = duelo.status(state);
  assert.deepEqual([status.score, status.lives, status.level, status.world, status.over], [0, 7, 1, 0, false]);
  assert.equal(state.ball.y, MIDDLE);
  assert.ok(state.wait > 0);
  assert.equal(duelo.twoPlayers?.("1"), false);
  assert.equal(duelo.twoPlayers?.("2"), true);
  assert.equal(duelo.pad("1")[0].length, 2);
  assert.deepEqual(duelo.pad("2"), [[], []]);
  // La primera luna sale hacia ti.
  for (let i = 0; i < 120 && state.wait > 0; i++) duelo.step(state, DT, noInput(), quietOut());
  assert.ok(state.ball.vy > 0);
});

test("duelo: las flechas y el dedo mueven el farol de abajo; A y D el de arriba entre dos", () => {
  const state = game();
  const start = state.bottom;
  for (let i = 0; i < 20; i++) duelo.step(state, DT, noInput({ held: new Set(["left"]) }), quietOut());
  assert.ok(state.bottom < start - 20);
  for (let i = 0; i < 300; i++) duelo.step(state, DT, noInput({ held: new Set(["left"]) }), quietOut());
  assert.equal(state.bottom, PADDLE_MIN);
  for (let i = 0; i < 60; i++) duelo.step(state, DT, noInput({ touches: [{ x: 90, y: 40 }] }), quietOut());
  assert.ok(Math.abs(state.bottom - 90) < 0.01, "en un jugador, cualquier toque mueve tu farol");

  const two = game(3, "2");
  for (let i = 0; i < 30; i++) duelo.step(two, DT, noInput({ held: new Set(["right2"]) }), quietOut());
  assert.ok(two.top > 64 + 20 && two.bottom === 64);
  for (let i = 0; i < 60; i++) duelo.step(two, DT, noInput({ touches: [{ x: 20, y: 60 }, { x: 110, y: 190 }] }), quietOut());
  assert.ok(Math.abs(two.top - 20) < 0.01 && Math.abs(two.bottom - 110) < 0.01, "cada dedo mueve el farol de su mitad");
});

test("duelo: el golpe en la orilla del farol tuerce la luna y la acelera", () => {
  const state = game();
  for (let i = 0; i < 200 && state.wait > 0; i++) duelo.step(state, DT, noInput(), quietOut());
  state.ball = { x: 70, y: BOTTOM_Y - 10, vx: 0, vy: 80, speed: 80 };
  state.bottom = 62;
  for (let i = 0; i < 30 && state.ball.vy > 0; i++) duelo.step(state, DT, noInput({ touches: [{ x: 62, y: 200 }] }), quietOut());
  assert.ok(state.ball.vy < 0, "la luna rebota");
  assert.ok(state.ball.vx > 30, "sale hacia el lado donde tocó");
  assert.ok(state.ball.speed > 80);
  assert.equal(state.score, 10);
});

test("duelo: si no la devuelves, punto de la máquina y la luna sale hacia ti", () => {
  const state = game();
  const log: string[] = [];
  for (let i = 0; i < 60 * 10 && state.points[1] === 0; i++) duelo.step(state, DT, noInput({ touches: [{ x: state.ball.x < 64 ? 120 : 8, y: 200 }] }), quietOut(log));
  assert.equal(state.points[1], 1);
  assert.equal(duelo.status(state).lives, 6);
  assert.ok(log.includes("sound:lock"));
  assert.equal(state.ball.y, MIDDLE);
  for (let i = 0; i < 80 && state.wait > 0; i++) duelo.step(state, DT, noInput(), quietOut());
  assert.ok(state.ball.vy > 0, "sale hacia quien perdió el punto");
});

test("duelo: jugando perfecto se gana el partido, el secreto sale una vez y sube el nivel", () => {
  const state = game(11);
  const log: string[] = [];
  let frames = 0;
  while (state.level < 3 && !state.over && frames < 60 * 60 * 20) {
    duelo.step(state, DT, follow(state), quietOut(log));
    inside(state);
    frames++;
  }
  assert.equal(state.over, false);
  assert.ok(state.level >= 3, "deberían ganarse dos partidos");
  assert.equal(log.filter((entry) => entry === "secret").length, 1);
  assert.ok(log.includes("sound:level"));
  const status = duelo.status(state);
  assert.equal(status.world, 2);
  // 2 partidos × (700 de puntos + 500) y por lo menos algunos golpes.
  assert.ok(status.score >= 2 * 1200 + 50);
  assert.ok(status.score <= 999999);
});

test("duelo: si la máquina llega a 7, se acaba la partida", () => {
  const state = game(5);
  const log: string[] = [];
  let frames = 0;
  // Quedarse en una esquina: la máquina gana.
  while (!state.over && frames < 60 * 60 * 10) {
    duelo.step(state, DT, noInput({ touches: [{ x: state.ball.x < 64 ? 120 : 8, y: 200 }] }), quietOut(log));
    frames++;
  }
  assert.ok(state.over);
  assert.equal(state.points[1], 7);
  assert.equal(duelo.status(state).lives, 0);
  assert.ok(log.includes("sound:over"));
  assert.ok(!log.includes("secret"));
  const frozen = JSON.stringify(state);
  duelo.step(state, DT, follow(state), quietOut());
  assert.equal(JSON.stringify(state), frozen, "terminada, ya no cambia");
});

test("duelo: entre dos, gana quien llega a 7 y no hay puntaje ni secreto", () => {
  const state = game(9, "2");
  const log: string[] = [];
  let frames = 0;
  // Abajo juega perfecto; arriba se queda quieto en una esquina.
  while (!state.over && frames < 60 * 60 * 10) {
    duelo.step(state, DT, noInput({ touches: [{ x: state.ball.x, y: 200 }, { x: state.ball.x < 64 ? 120 : 8, y: 30 }] }), quietOut(log));
    inside(state);
    frames++;
  }
  assert.ok(state.over);
  const status = duelo.status(state);
  assert.equal(status.result, "¡Gana el farol de abajo!");
  assert.equal(status.score, 0);
  assert.ok(!log.includes("secret"));

  const other = game(9, "2");
  for (let i = 0; i < 60 * 60 * 10 && !other.over; i++) {
    duelo.step(other, DT, noInput({ touches: [{ x: other.ball.x < 64 ? 120 : 8, y: 200 }, { x: other.ball.x, y: 30 }] }), quietOut());
  }
  assert.equal(duelo.status(other).result, "¡Gana el farol de arriba!");
});

test("duelo: con la misma semilla, la misma partida", () => {
  const play = (seed: number) => {
    const state = game(seed);
    for (let i = 0; i < 60 * 90 && !state.over; i++) {
      const wobble = Math.sin(i / 37) * 12;
      duelo.step(state, DT, noInput({ touches: [{ x: state.ball.x + wobble, y: 200 }] }), quietOut());
    }
    return JSON.stringify(state);
  };
  assert.equal(play(21), play(21));
  assert.notEqual(play(21), play(22));
});

test("duelo: aguanta pasos de tiempo variables durante varios minutos", () => {
  for (const mode of ["1", "2"]) {
    const state = game(33, mode);
    let random = 12345;
    let elapsed = 0;
    let score = 0;
    while (elapsed < 60 * 6) {
      random = (random * 1103515245 + 12345) >>> 0;
      const dt = ((random >>> 8) % 1000) / 1000 * 0.05;
      const keys = ["left", "right", "left2", "right2"].filter((_, index) => (random >>> (index + 3)) & 1) as Input["pressed"][number][];
      const touches = (random >>> 20) % 3 === 0 ? [{ x: state.ball.x, y: 200 }] : [];
      duelo.step(state, dt, noInput({ held: new Set(keys), touches }), quietOut());
      elapsed += dt;
      inside(state);
      assert.ok(state.ball.y > TOP_Y - 30 && state.ball.y < 240);
      const status = duelo.status(state);
      assert.ok(Number.isInteger(status.score) && status.score >= score);
      score = status.score;
      assert.ok(status.lives >= 0 && status.lives <= 7 && status.world >= 0 && status.world <= 5);
      if (state.over) break;
    }
  }
});
