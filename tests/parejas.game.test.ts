import assert from "node:assert/strict";
import { test } from "node:test";
import parejas, { CARD_H, CARD_W, COLS, faces, ROUNDS, cardAt, createParejas, pairsOf, rowsOf, type State } from "../src/components/secret/games/parejas";
import { HEIGHT, WIDTH } from "../src/components/secret/games/kit";
import { noInput, quietOut, type Key, type MiniGameDef } from "../src/components/secret/games/types";

const DT = 1 / 60;
const game = parejas as unknown as MiniGameDef<State>;

const centerOf = (state: State, index: number) => {
  const { x, y } = cardAt(state.round, index);
  return { x: x + CARD_W / 2, y: y + CARD_H / 2 };
};
const tap = (state: State, index: number, log?: string[]) => game.step(state, DT, noInput({ taps: [centerOf(state, index)] }), quietOut(log));
const press = (state: State, key: Key, log?: string[]) => game.step(state, DT, noInput({ pressed: [key] }), quietOut(log));
const wait = (state: State, seconds: number, log?: string[]) => {
  for (let t = 0; t < seconds; t += DT) game.step(state, DT, noInput(), quietOut(log));
};
/** Espera hasta que se pueda volver a tocar (sin pausa, aviso ni pareja mostrándose). */
const settle = (state: State, log?: string[]) => {
  for (let n = 0; n < 1000 && (state.pause > 0 || state.banner > 0 || state.wait > 0); n++) game.step(state, DT, noInput(), quietOut(log));
};
const partnerOf = (state: State, index: number) => state.cards.findIndex((card, i) => i !== index && card.face === state.cards[index].face);

/** Resuelve la ronda actual tocando cada pareja; con `mistakes`, primero falla esas veces. */
function solveRound(state: State, log?: string[], mistakes = 0) {
  for (let m = 0; m < mistakes; m++) {
    const a = state.cards.findIndex((card) => !card.matched);
    const b = state.cards.findIndex((card) => !card.matched && card.face !== state.cards[a].face);
    tap(state, a, log);
    tap(state, b, log);
    settle(state, log);
  }
  while (state.cards.some((card) => !card.matched)) {
    const a = state.cards.findIndex((card) => !card.matched);
    tap(state, a, log);
    tap(state, partnerOf(state, a), log);
  }
}

test("parejas: las caras tienen buen tamaño y son todas distintas", () => {
  assert.ok(faces().length >= pairsOf(ROUNDS));
  const seen = new Set<string>();
  for (const face of faces()) {
    const width = face.rows[0].length;
    for (const row of face.rows) assert.equal(row.length, width, face.name);
    assert.ok(width >= 10 && width <= CARD_W - 4, `${face.name}: ancho ${width}`);
    assert.ok(face.rows.length >= 10 && face.rows.length <= CARD_H - 4, `${face.name}: alto ${face.rows.length}`);
    for (const row of face.rows) for (const char of row) assert.ok(char === "." || face.colors[char], `${face.name}: falta el color "${char}"`);
    const key = face.rows.join("/") + JSON.stringify(face.colors);
    assert.ok(!seen.has(key), `${face.name} se repite`);
    seen.add(key);
  }
});

test("parejas: empieza bien y las cartas caben bajo el marcador en las tres rondas", () => {
  const state = game.create(5, "1");
  const status = game.status(state);
  assert.deepEqual(
    { score: status.score, lives: status.lives, level: status.level, letters: status.letters, world: status.world, over: status.over },
    { score: 0, lives: 0, level: 1, letters: 0, world: 0, over: false },
  );
  assert.equal(state.cards.length, 16);
  assert.ok(state.cards.every((card) => !card.up && !card.matched));
  assert.deepEqual(game.pad("1"), [[], []]);
  for (let round = 1; round <= ROUNDS; round++) {
    assert.equal(rowsOf(round) * COLS, [16, 20, 24][round - 1]);
    for (let index = 0; index < rowsOf(round) * COLS; index++) {
      const { x, y } = cardAt(round, index);
      assert.ok(x >= 2 && x + CARD_W <= WIDTH - 2 && y >= 25 && y + CARD_H <= HEIGHT - 2, `ronda ${round}, carta ${index}`);
      if (index % COLS > 0) assert.ok(x - (cardAt(round, index - 1).x + CARD_W) >= 2, "cartas pegadas");
    }
  }
  // Cada cara sale exactamente dos veces.
  const counts = new Map<number, number>();
  for (const card of state.cards) counts.set(card.face, (counts.get(card.face) ?? 0) + 1);
  assert.equal(counts.size, 8);
  for (const count of counts.values()) assert.equal(count, 2);
});

test("parejas: una pareja suma 100 más la racha, y dos distintas se tapan después de mostrarse", () => {
  const state = createParejas(9);
  const log: string[] = [];
  const a = 0;
  const wrong = state.cards.findIndex((card) => card.face !== state.cards[a].face);
  tap(state, a, log);
  tap(state, wrong, log);
  assert.ok(state.cards[a].up && state.cards[wrong].up);
  assert.ok(log.includes("sound:rotate"));
  // Mientras se muestran, otra carta no se puede voltear.
  const third = state.cards.findIndex((_, i) => i !== a && i !== wrong);
  tap(state, third);
  assert.equal(state.cards[third].up, false);
  wait(state, 0.5);
  assert.ok(state.cards[a].up, "se taparon demasiado pronto");
  wait(state, 0.6, log);
  assert.ok(!state.cards[a].up && !state.cards[wrong].up);
  assert.ok(log.includes("sound:drop"));
  assert.equal(state.score, 0);

  // Primera pareja: 100. Segunda seguida: 150. Tercera: 200.
  const scores: number[] = [];
  for (let n = 0; n < 3; n++) {
    const first = state.cards.findIndex((card) => !card.matched);
    tap(state, first, log);
    tap(state, partnerOf(state, first), log);
    scores.push(state.score);
  }
  assert.deepEqual(scores, [100, 250, 450]);
  assert.ok(log.includes("sound:clear"));
  // Un error corta la racha.
  const free = state.cards.map((_, i) => i).filter((i) => !state.cards[i].matched);
  const x = free[0];
  const y = free.find((i) => state.cards[i].face !== state.cards[x].face) as number;
  tap(state, x);
  tap(state, y);
  settle(state);
  assert.equal(state.streak, 0);
  // Tocar una carta ya descubierta no hace nada.
  const done = state.cards.findIndex((card) => card.matched);
  tap(state, done);
  assert.deepEqual(state.open, []);
});

test("parejas: con teclado, las flechas mueven el cursor sin salirse y fire voltea", () => {
  const state = createParejas(3);
  press(state, "left");
  press(state, "up");
  assert.equal(state.cursor, 0);
  assert.ok(state.keys);
  press(state, "right");
  press(state, "down");
  assert.equal(state.cursor, COLS + 1);
  for (let n = 0; n < 10; n++) {
    press(state, "right");
    press(state, "down");
  }
  assert.equal(state.cursor, state.cards.length - 1);
  press(state, "fire");
  assert.ok(state.cards[state.cursor].up);
  // Un toque también mueve el cursor a esa carta.
  tap(state, 2);
  assert.equal(state.cursor, 2);
});

test("parejas: tres rondas, bono por tiempo, secreto una sola vez y fin de la partida", () => {
  const state = createParejas(21);
  const log: string[] = [];
  wait(state, 4); // 4 segundos pensando: bono 600 − 20.
  solveRound(state, log);
  assert.equal(state.bonus, 600 - 5 * 4);
  assert.ok(log.includes("sound:clear2"));
  settle(state, log);
  assert.equal(game.status(state).level, 2);
  assert.equal(game.status(state).world, 1);
  assert.equal(state.cards.length, 20);
  assert.ok(log.includes("sound:level"));
  assert.ok(log.some((line) => line.startsWith("say:Ronda 2")));
  solveRound(state, log);
  settle(state, log);
  assert.equal(game.status(state).level, 3);
  assert.equal(state.cards.length, 24);
  assert.ok(!log.includes("secret"));
  wait(state, 200, log); // Muy lento: el bono no baja de 0.
  solveRound(state, log);
  assert.equal(state.bonus, 0);
  assert.equal(log.filter((line) => line === "secret").length, 1);
  settle(state, log);
  const status = game.status(state);
  assert.ok(status.over);
  assert.equal(status.result, "¡Completaste las tres rondas!");
  assert.equal(status.level, 3);
  assert.equal(status.world, 2);
  assert.equal(status.lives, 0);
  assert.equal(status.letters, 0);
  assert.ok(status.score > 0 && Number.isInteger(status.score));
  // Después del final ya no pasa nada más.
  wait(state, 5, log);
  tap(state, 0, log);
  assert.equal(log.filter((line) => line === "secret").length, 1);
});

test("parejas: con la misma semilla, la misma partida", () => {
  const play = (seed: number) => {
    const state = createParejas(seed);
    for (let round = 0; round < ROUNDS; round++) {
      solveRound(state, undefined, 2);
      settle(state);
    }
    return JSON.stringify(state);
  };
  assert.equal(play(42), play(42));
  assert.notEqual(JSON.stringify(createParejas(1).cards), JSON.stringify(createParejas(2).cards));
});

test("parejas: aguanta varios minutos con dt variable y toques al azar", () => {
  const state = createParejas(77);
  let seed = 1;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const log: string[] = [];
  const keys: Key[] = ["left", "right", "up", "down", "fire"];
  for (let n = 0; n < 60 * 60 * 4; n++) {
    const dt = rand() * 0.05;
    const r = rand();
    const input =
      r < 0.05
        ? noInput({ taps: [{ x: Math.floor(rand() * WIDTH), y: Math.floor(rand() * HEIGHT) }] })
        : r < 0.08
          ? noInput({ pressed: [keys[Math.floor(rand() * keys.length)]] })
          : noInput();
    game.step(state, dt, input, quietOut(log));
    assert.ok(state.open.length <= 2);
    assert.ok(state.cursor >= 0 && state.cursor < state.cards.length);
    assert.ok(Number.isFinite(state.score) && state.score >= 0 && state.score <= 999999);
    for (const card of state.cards) assert.ok(card.turn >= 0 && card.glow >= 0);
    if (state.over) break;
  }
  assert.ok(log.filter((line) => line === "secret").length <= 1);
  const status = game.status(state);
  assert.ok(status.world >= 0 && status.world <= 4 && status.level >= 1 && status.level <= 3);
});
