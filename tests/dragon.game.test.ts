import assert from "node:assert/strict";
import { test } from "node:test";
import game, { COLS, ROWS, createDragon, type State } from "../src/components/secret/games/dragon";
import { noInput, quietOut, type Dir, type Input, type Point } from "../src/components/secret/games/types";

const DT = 1 / 60;
const STEP: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const DIRS: Dir[] = ["left", "right", "up", "down"];

const run = (state: State, seconds: number, log?: string[], input: Input = noInput()) => {
  for (let t = 0; t < seconds; t += DT) game.step(state, DT, input, quietOut(log));
};
const press = (state: State, key: Dir, log?: string[]) => game.step(state, DT, noInput({ pressed: [key] }), quietOut(log));
const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < COLS && p.y < ROWS;

/** Piloto automático: busca el camino más corto a la letra (o a la flor) sin pisarse. */
function pilot(state: State): Dir | null {
  const head = state.body[0];
  const target = state.letter ?? state.flower;
  const blocked = new Set(state.body.slice(0, -1).map((p) => `${p.x},${p.y}`));
  const first = new Map<string, Dir>();
  const queue: Point[] = [];
  for (const dir of DIRS) {
    const [dx, dy] = STEP[dir];
    const next = { x: head.x + dx, y: head.y + dy };
    const key = `${next.x},${next.y}`;
    if (!inside(next) || blocked.has(key) || first.has(key)) continue;
    first.set(key, dir);
    queue.push(next);
  }
  const safe = queue.length > 0 ? (first.get(`${queue[0].x},${queue[0].y}`) as Dir) : null;
  if (!target) return safe;
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    const dir = first.get(`${at.x},${at.y}`) as Dir;
    if (at.x === target.x && at.y === target.y) return dir;
    for (const [dx, dy] of Object.values(STEP)) {
      const next = { x: at.x + dx, y: at.y + dy };
      const key = `${next.x},${next.y}`;
      if (!inside(next) || blocked.has(key) || first.has(key)) continue;
      first.set(key, dir);
      queue.push(next);
    }
  }
  return safe;
}

/** Juega con el piloto: decide un giro cada vez que la cabeza cambia de casilla. */
function autoplay(state: State, seconds: number, log: string[], dt = () => DT) {
  let seen = "";
  for (let t = 0; t < seconds && !game.status(state).over; ) {
    const step = dt();
    const head = `${state.body[0].x},${state.body[0].y}`;
    let pressed: Dir[] = [];
    if (head !== seen && state.turns.length === 0) {
      seen = head;
      const dir = pilot(state);
      if (dir) pressed = [dir];
    }
    game.step(state, step, noInput({ pressed }), quietOut(log));
    t += step;
  }
}

test("dragón: empieza corto, en el centro, quieto y con 3 vidas", () => {
  const state = game.create(1, "1") as State;
  const status = game.status(state);
  assert.deepEqual({ ...status }, { score: 0, lives: 3, level: 1, letters: 0, world: 0, over: false });
  assert.equal(state.body.length, 3);
  assert.deepEqual(state.body[0], { x: 7, y: 11 });
  assert.ok(state.flower && inside(state.flower));
  run(state, 1.4);
  assert.deepEqual(state.body[0], { x: 7, y: 11 }, "se movió antes de tiempo");
  run(state, 0.5);
  assert.ok(state.body[0].y < 11, "no arrancó solo a los 1,5 s");
  assert.equal(state.body[0].x, 7);
});

test("dragón: un control lo pone en marcha y gira; no da media vuelta", () => {
  const state = createDragon(2);
  press(state, "left");
  assert.equal(state.ready, 0);
  run(state, 0.21);
  assert.deepEqual(state.body[0], { x: 6, y: 11 });
  assert.equal(state.dir, "left");
  press(state, "right"); // media vuelta: no se hace caso
  run(state, 0.21);
  assert.equal(state.dir, "left");
  assert.deepEqual(state.body[0], { x: 5, y: 11 });

  // Dos giros seguidos dentro del mismo paso: se hacen los dos, uno en cada casilla.
  const quick = createDragon(3);
  press(quick, "left");
  press(quick, "down");
  assert.deepEqual(quick.turns, ["left", "down"]);
  run(quick, 0.41);
  assert.deepEqual(quick.body[0], { x: 6, y: 12 });
  assert.equal(quick.dir, "down");

  // Los deslizamientos también sirven.
  const swiped = createDragon(4);
  game.step(swiped, DT, noInput({ swipes: ["right"] }), quietOut());
  run(swiped, 0.21);
  assert.equal(swiped.dir, "right");
});

test("dragón: al chocar con la cerca pierde una vida y reaparece corto en el centro", () => {
  const state = createDragon(5);
  state.flower = { x: 0, y: 0 };
  state.score = 30;
  const log: string[] = [];
  press(state, "up", log);
  run(state, 3, log);
  assert.equal(state.lives, 2);
  assert.ok(log.includes("sound:lock"));
  assert.ok(log.includes("say:Vidas: 2"));
  assert.equal(state.score, 30, "el puntaje se conserva");
  assert.equal(state.body.length, 3);
  for (const part of state.body) assert.ok(inside(part));
});

test("dragón: chocar consigo mismo también cuesta una vida, y sin vidas termina", () => {
  const state = createDragon(6);
  // Un dragón largo que va a morderse: cabeza en (5,5) mirando a la izquierda, con el cuerpo dando la vuelta.
  state.body = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }, { x: 4, y: 4 }];
  state.last = state.body.map((p) => ({ ...p }));
  state.dir = "left";
  state.ready = 0;
  state.flower = { x: 14, y: 21 };
  state.lives = 1;
  const log: string[] = [];
  run(state, 0.5, log);
  assert.equal(state.lives, 0);
  assert.equal(game.status(state).over, true);
  assert.ok(log.includes("sound:over"));
  const before = JSON.stringify(state);
  run(state, 2, log, noInput({ pressed: ["up"] }));
  assert.equal(JSON.stringify(state), before, "después del final no pasa nada");
});

test("dragón: la flor hace crecer y suma 10; cada 10 flores sube de nivel y de paisaje", () => {
  const state = createDragon(7);
  const log: string[] = [];
  state.ready = 0;
  for (let i = 1; i <= 10; i++) {
    // Cada vez, un dragón corto mirando hacia arriba con la flor justo delante.
    state.body = [{ x: 7, y: 15 }, { x: 7, y: 16 }, { x: 7, y: 17 }];
    state.last = state.body.map((p) => ({ ...p }));
    state.dir = "up";
    state.grow = 0;
    state.clock = 0;
    state.flower = { x: 7, y: 14 };
    state.letter = null;
    state.letterWait = 99;
    run(state, 0.25, log);
    assert.equal(state.score, i * 10);
    assert.equal(state.grow, 1, "no va a crecer");
    assert.ok(state.flower && !(state.flower.x === 7 && state.flower.y === 14), "la flor no se movió");
  }
  run(state, 0.21, log);
  assert.equal(state.body.length, 4);
  assert.equal(state.level, 2);
  assert.equal(game.status(state).world, 1);
  assert.ok(log.includes("sound:level"));
  assert.ok(log.some((line) => line.startsWith("say:Nivel 2")));
});

test("dragón: con el piloto gana puntos, junta NATHALIA y el secreto sale una sola vez", () => {
  const state = createDragon(11);
  const log: string[] = [];
  let maxLength = 0;
  let names = 0;
  let seconds = 0;
  while (seconds < 900 && names < 2 && !state.over) {
    const before = state.letters;
    autoplay(state, 1, log);
    seconds += 1;
    if (state.letters < before) names += 1;
    maxLength = Math.max(maxLength, state.body.length);
    // Para que dure: si se queda sin vidas no es lo que se prueba aquí.
    if (state.lives === 1) state.lives = 2;
  }
  assert.ok(names >= 2, `solo juntó ${names} nombres en ${seconds} s`);
  assert.ok(state.score >= 1600);
  assert.ok(maxLength > 10, "no creció");
  assert.equal(log.filter((line) => line === "secret").length, 1);
  assert.ok(log.includes("sound:letter"));
  assert.ok(state.lives <= 5);
});

test("dragón: con la misma semilla, la misma partida", () => {
  const play = (seed: number) => {
    const state = createDragon(seed);
    autoplay(state, 120, []);
    return JSON.stringify(state);
  };
  assert.equal(play(21), play(21));
  assert.notEqual(play(21), play(22));
});

test("dragón: aguanta dt variables durante minutos sin salirse del tablero", () => {
  for (const seed of [1, 2, 3]) {
    const state = createDragon(seed);
    let random = seed * 7919;
    const next = () => {
      random = (random * 1103515245 + 12345) >>> 0;
      return (random >>> 8) / 16777216;
    };
    const log: string[] = [];
    let over = false;
    for (let t = 0; t < 600 && !over; ) {
      const dt = next() * 0.05;
      const pressed: Dir[] = next() < 0.05 ? [DIRS[Math.floor(next() * 4)]] : [];
      const swipes: Dir[] = next() < 0.01 ? [DIRS[Math.floor(next() * 4)]] : [];
      game.step(state, dt, noInput({ pressed, swipes }), quietOut(log));
      t += dt;
      const status = game.status(state);
      over = status.over;
      for (const part of state.body) assert.ok(inside(part), "una parte del dragón quedó fuera");
      assert.equal(new Set(state.body.map((p) => `${p.x},${p.y}`)).size, state.body.length, "el dragón se pisa");
      if (state.flower) assert.ok(inside(state.flower));
      if (state.letter) assert.ok(inside(state.letter));
      assert.ok(Number.isInteger(status.score) && status.score >= 0 && status.score <= 999999);
      assert.ok(status.lives >= 0 && status.lives <= 5);
      assert.ok(status.letters >= 0 && status.letters < 8);
      assert.ok(status.world >= 0 && status.world <= 4);
      assert.ok(state.turns.length <= 2);
    }
    assert.ok(over, "al azar debería chocar hasta perder");
    assert.ok(log.filter((line) => line === "secret").length <= 1);
  }
  // Con el piloto y dt variables también va bien.
  const state = createDragon(9);
  let k = 0;
  autoplay(state, 300, [], () => ((k = (k * 7 + 3) % 11) / 10) * 0.05);
  for (const part of state.body) assert.ok(inside(part));
  assert.ok(state.score > 0);
});

test("dragón: los botones y la ayuda", () => {
  const pad = game.pad("1");
  assert.deepEqual(pad.map((group) => group.map((b) => b.key)), [["left", "right"], ["down", "up"]]);
  assert.ok(game.help.length > 20);
});
