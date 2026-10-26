import assert from "node:assert/strict";
import { test } from "node:test";
import { MAZE, MAZE_COLS, MAZE_ROWS, NAME, createMaze, isWall, positionOf, stepMaze, type Dir } from "../src/lib/maze";
import { GAMES, cleanName, cleanScore, isGame, withScore } from "../src/lib/scores";
import { GROUND, WIDTH, createStars, foeAt, letterOf, roundOf, stepStars } from "../src/lib/stars";

const DIRS: Dir[] = ["left", "right", "up", "down"];
const STEP: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

/* ---------- Laberinto Lunar ---------- */

test("laberinto: el plano es un rectángulo cerrado y todo se puede alcanzar", () => {
  assert.equal(MAZE_ROWS, 17);
  for (const row of MAZE) assert.equal(row.length, MAZE_COLS);
  for (let x = 0; x < MAZE_COLS; x++) assert.ok(isWall(x, 0) && isWall(x, MAZE_ROWS - 1));
  for (let y = 0; y < MAZE_ROWS; y++) assert.ok(isWall(0, y) && isWall(MAZE_COLS - 1, y));

  const state = createMaze(1);
  const seen = new Set<string>();
  const queue = [[state.player.x, state.player.y]];
  while (queue.length > 0) {
    const [x, y] = queue.pop() as number[];
    if (isWall(x, y) || seen.has(`${x},${y}`)) continue;
    seen.add(`${x},${y}`);
    for (const [dx, dy] of Object.values(STEP)) queue.push([x + dx, y + dy]);
  }
  let open = 0;
  for (let y = 0; y < MAZE_ROWS; y++) for (let x = 0; x < MAZE_COLS; x++) if (!isWall(x, y)) open += 1;
  assert.equal(seen.size, open, "hay pasillos sin entrada");
  for (const spirit of state.spirits) assert.ok(seen.has(`${spirit.x},${spirit.y}`));
  assert.ok(state.left > 100);
  assert.equal(state.items.flat().filter((cell) => cell === "o").length, 4);
});

test("laberinto: con la misma semilla, la misma partida", () => {
  const play = () => {
    const state = createMaze(77);
    for (let frame = 0; frame < 3000 && !state.over; frame++) stepMaze(state, 1 / 60, DIRS[Math.floor(frame / 40) % 4]);
    return JSON.stringify(state);
  };
  assert.equal(play(), play());
});

test("laberinto: nadie atraviesa muros, y quedarse quieto termina la partida", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const state = createMaze(seed);
    let random = seed * 7919;
    let wanted: Dir | null = null;
    let score = 0;
    const seenEvents = new Set<string>();
    for (let frame = 0; frame < 60 * 600 && !state.over; frame++) {
      random = (random * 1103515245 + 12345) >>> 0;
      if (frame % 20 === 0) wanted = DIRS[(random >>> 16) % 4];
      for (const event of stepMaze(state, 1 / 60, wanted)) seenEvents.add(event);
      for (const walker of [state.player, ...state.spirits]) {
        assert.ok(!isWall(walker.x, walker.y), "alguien quedó dentro de un muro");
        const [x, y] = positionOf(walker);
        assert.ok(x >= 1 && x <= MAZE_COLS - 2 && y >= 1 && y <= MAZE_ROWS - 2);
        assert.ok(walker.t >= 0 && walker.t < 1);
      }
      assert.ok(state.score >= score, "el puntaje nunca baja");
      score = state.score;
      assert.ok(state.lives <= 5 && state.left >= 0);
    }
    assert.ok(seenEvents.has("dot"));
    assert.ok(state.score > 0);
  }
  const idle = createMaze(9);
  let frames = 0;
  while (!idle.over && frames < 60 * 300) {
    stepMaze(idle, 1 / 60, null);
    frames += 1;
  }
  assert.ok(idle.over, "los espíritus deberían alcanzar a quien no se mueve");
  assert.equal(idle.lives, 0);
  assert.deepEqual(stepMaze(idle, 1 / 60, "left"), []);
});

test("laberinto: la flor asusta a los espíritus y las letras forman el nombre", () => {
  const state = createMaze(3);
  state.wait = 0;
  state.spirits.forEach((spirit) => (spirit.away = 999));
  // De la salida a la flor de abajo a la izquierda: todo recto.
  let events: string[] = [];
  for (let frame = 0; frame < 600 && !events.includes("flower"); frame++) events = stepMaze(state, 1 / 60, "left");
  assert.ok(events.includes("flower"));
  assert.ok(state.scared > 0);

  // Una letra puesta delante se recoge al pasar; con las ocho, premio y vida.
  state.letters = NAME.length - 1;
  state.letter = { x: state.player.x + 1, y: state.player.y, time: 9 };
  const lives = state.lives;
  const before = state.score;
  events = [];
  for (let frame = 0; frame < 120 && !events.includes("name"); frame++) events = stepMaze(state, 1 / 60, "right");
  assert.ok(events.includes("letter") && events.includes("name"));
  assert.equal(state.lives, lives + 1);
  assert.ok(state.score >= before + 1100);
});

test("laberinto: al recoger todo se pasa de nivel", () => {
  const state = createMaze(5);
  state.wait = 0;
  state.spirits.forEach((spirit) => (spirit.away = 999));
  state.items = state.items.map((row) => row.map(() => " "));
  state.items[15][6] = ".";
  state.left = 1;
  let events: string[] = [];
  for (let frame = 0; frame < 120 && !events.includes("level"); frame++) events = stepMaze(state, 1 / 60, "left");
  assert.ok(events.includes("level"));
  assert.equal(state.level, 2);
  assert.ok(state.left > 100);
});

/* ---------- Lluvia de Espíritus ---------- */

test("espíritus: cada oleada dibuja una letra del nombre", () => {
  assert.equal([0, 1, 2, 3, 4, 5, 6, 7, 8].map(letterOf).join(""), "NATHALIAN");
  assert.equal(roundOf(7), 0);
  assert.equal(roundOf(8), 1);
  for (let wave = 0; wave < 8; wave++) {
    const state = createStars(1);
    state.wave = wave;
    state.foes.forEach((foe) => (foe.alive = false));
    state.alive = 0;
    state.wait = 0;
    stepStars(state, 1 / 60, 0, false);
    assert.equal(state.wave, wave + 1);
    assert.ok(state.foes.length >= 9, "una letra tiene varios espíritus");
    assert.equal(state.alive, state.foes.length);
    for (const foe of state.foes) {
      const [x, y] = foeAt(state, foe);
      assert.ok(x > 4 && x < WIDTH - 4 && y > 20 && y < GROUND - 60);
    }
  }
});

test("espíritus: quien apunta gana oleadas; quien no hace nada pierde", () => {
  const state = createStars(11);
  const events = new Set<string>();
  let score = 0;
  for (let frame = 0; frame < 60 * 240 && !state.over && state.wave < 2; frame++) {
    // Un jugador sencillo: se pone debajo del espíritu más bajo, esquiva lo que cae cerca y lanza siempre.
    const living = state.foes.filter((foe) => foe.alive);
    const target = living.length > 0 ? foeAt(state, living[living.length - 1])[0] : state.player;
    const danger = state.drops.find((drop) => drop.y > GROUND - 50 && Math.abs(drop.x - state.player) < 9);
    const move = danger ? (danger.x >= state.player ? -1 : 1) : Math.abs(target - state.player) < 2 ? 0 : Math.sign(target - state.player);
    for (const event of stepStars(state, 1 / 60, move, true)) events.add(event);
    assert.ok(state.player >= 10 && state.player <= WIDTH - 10);
    assert.ok(state.shots.length <= 3);
    assert.ok(state.score >= score);
    score = state.score;
  }
  assert.ok(events.has("throw") && events.has("pop"));
  assert.ok(events.has("letter"), "debería completar al menos una letra");

  const idle = createStars(4);
  let frames = 0;
  while (!idle.over && frames < 60 * 900) {
    stepStars(idle, 1 / 60, 0, false);
    frames += 1;
  }
  assert.ok(idle.over);
  assert.deepEqual(stepStars(idle, 1 / 60, 1, true), []);
});

test("espíritus: completar el nombre da premio y una vida", () => {
  const state = createStars(2);
  state.wave = 7;
  state.foes.forEach((foe) => (foe.alive = false));
  state.alive = 0;
  state.wait = 0;
  const events = stepStars(state, 1 / 60, 0, false);
  assert.deepEqual(events, ["letter", "name"]);
  assert.equal(state.lives, 4);
  assert.equal(state.score, 1100);
});

/* ---------- Puntajes ---------- */

test("puntajes: nombres y puntajes se limpian antes de guardar", () => {
  assert.deepEqual([...GAMES], ["bloques", "laberinto", "espiritus", "duelo", "tejados", "muro", "dragon", "parejas", "fichas", "carreras", "pinball", "esferas", "mascotas"]);
  assert.ok(isGame("laberinto") && !isGame("otro") && !isGame(3));
  assert.equal(cleanName("  natha  "), "NATHA");
  assert.equal(cleanName("Nathalia Bermúdez"), "NATHALIA");
  assert.equal(cleanName("<b>ñu</b> 1"), "BÑUB 1");
  assert.equal(cleanName("a       b"), "A B");
  assert.equal(cleanName("@@@"), "");
  assert.equal(cleanName(12), "");
  assert.equal(cleanScore("bloques", 1200), 1200);
  assert.equal(cleanScore("bloques", "1200"), 1200);
  for (const bad of [0, -5, 1.5, 1e9, "x", null, undefined]) assert.equal(cleanScore("laberinto", bad), null);
});

test("puntajes: la tabla guarda los diez mejores, en orden", () => {
  let rows: { name: string; score: number }[] = [];
  for (let score = 1; score <= 14; score++) rows = withScore(rows, { name: `J${score}`, score: score * 10 });
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map((row) => row.score), [140, 130, 120, 110, 100, 90, 80, 70, 60, 50]);
  assert.equal(withScore(rows, { name: "BAJO", score: 5 }).some((row) => row.name === "BAJO"), false);
});
