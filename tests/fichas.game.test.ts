import assert from "node:assert/strict";
import { test } from "node:test";
import game, { AREA, faces, FIGURES, TILE_H, TILE_W, createFichas, figureOf, freeTiles, hasMove, isFree, reshuffle, tileAt, type State, type Tile } from "../src/components/secret/games/fichas";
import { noInput, quietOut, type Input, type Key } from "../src/components/secret/games/types";

const DT = 1 / 60;
const run = (state: State, input: Input = noInput(), log?: string[]) => game.step(state, DT, input, quietOut(log));
const centerOf = (tile: Tile) => ({ x: tile.x + 6, y: tile.y + 7 });
const tap = (state: State, i: number, log?: string[]) => run(state, noInput({ taps: [centerOf(state.tiles[i])] }), log);
const press = (state: State, key: Key, log?: string[]) => run(state, noInput({ pressed: [key] }), log);
const alive = (state: State) => state.tiles.filter((tile) => tile.alive);
/** Deja pasar el tiempo hasta que termine un aviso (barajada, tablero nuevo). */
const settle = (state: State, log?: string[]) => {
  for (let frame = 0; frame < 600 && state.phase !== "play" && !state.over; frame++) run(state, noInput(), log);
};

/** Juega siguiendo el turno guardado de cada ficha: siempre debería despejar el tablero. */
function playPlan(state: State, log?: string[]) {
  const turns = new Map<number, number[]>();
  state.tiles.forEach((tile, i) => tile.alive && turns.set(tile.turn, [...(turns.get(tile.turn) ?? []), i]));
  for (const turn of [...turns.keys()].sort((a, b) => a - b)) {
    const [a, b] = turns.get(turn) as number[];
    assert.ok(isFree(state.tiles, a) && isFree(state.tiles, b), `turno ${turn}: la pareja no está libre`);
    assert.equal(state.tiles[a].face, state.tiles[b].face);
    tap(state, a, log);
    tap(state, b, log);
    assert.ok(!state.tiles[a].alive && !state.tiles[b].alive, `turno ${turn}: la pareja no se fue`);
  }
}

function insideArea(state: State) {
  for (const tile of alive(state)) {
    assert.ok(tile.x >= AREA.left && tile.x + TILE_W <= AREA.right + 1, `ficha fuera en x: ${tile.x}`);
    assert.ok(tile.y >= AREA.top && tile.y + TILE_H <= AREA.bottom + 1, `ficha fuera en y: ${tile.y}`);
  }
}

test("fichas: la partida empieza bien, con caras en pares y todo dentro del tablero", () => {
  const state = game.create(7, "1") as State;
  assert.deepEqual(game.status(state), { score: 0, lives: 3, level: 1, letters: 0, world: 0, over: false });
  assert.deepEqual(game.pad("1"), [[], []]);
  assert.equal(state.tiles.length, FIGURES[0].slots.length);
  for (const figure of FIGURES) {
    assert.ok(figure.slots.length >= 70 && figure.slots.length <= 90 && figure.slots.length % 2 === 0, figure.name);
    assert.ok(new Set(figure.slots.map((s) => s.z)).size >= 3, `${figure.name}: pocas capas`);
  }
  assert.ok(new Set(FIGURES.map((f) => f.name)).size >= 2);
  const counts = new Map<number, number>();
  for (const tile of state.tiles) counts.set(tile.face, (counts.get(tile.face) ?? 0) + 1);
  for (const [, count] of counts) assert.equal(count % 2, 0);
  assert.ok([...counts.values()].some((count) => count >= 4), "hay caras repetidas varias veces");
  assert.ok(counts.size >= 15, "se usan muchas caras distintas");
  for (const face of faces()) {
    assert.equal(face.rows.length, 9, face.name);
    for (const row of face.rows) assert.equal(row.length, 8, face.name);
  }
  insideArea(state);
  assert.ok(hasMove(state.tiles));
});

test("fichas: todos los repartos tienen salida, en las tres figuras y con varias semillas", () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    for (let level = 1; level <= FIGURES.length; level++) {
      const state = createFichas(seed);
      if (level > 1) {
        // Como si se acabara de despejar el nivel anterior.
        state.level = level - 1;
        state.phase = "clear";
        state.wait = 0;
        run(state);
      }
      assert.equal(state.level, level);
      assert.equal(state.tiles.length, figureOf(level).slots.length);
      insideArea(state);
      playPlan(state);
      assert.equal(state.phase, "clear");
    }
  }
});

test("fichas: una ficha tapada no se puede tomar; una libre se resalta; la pareja se va", () => {
  const state = createFichas(3);
  const locked = state.tiles.findIndex((_, i) => !isFree(state.tiles, i));
  // Un punto de la ficha que se vea (la esquina de abajo a la derecha suele quedar a la vista).
  const visible = (i: number) => {
    const t = state.tiles[i];
    for (let y = t.y; y < t.y + TILE_H; y++) for (let x = t.x; x < t.x + TILE_W; x++) if (tileAt(state, { x, y }) === i) return { x, y };
    return null;
  };
  const lockedSpot = state.tiles.map((_, i) => i).filter((i) => !isFree(state.tiles, i)).map(visible).find(Boolean);
  assert.ok(locked >= 0 && lockedSpot);
  let log: string[] = [];
  run(state, noInput({ taps: [lockedSpot] }), log);
  assert.deepEqual(log, ["sound:lock"]);
  assert.equal(state.selected, -1);
  assert.ok(state.shake > 0);

  // Una pareja libre: la primera se resalta, la segunda la quita.
  const free = freeTiles(state.tiles);
  const a = free.find((i) => free.some((j) => j !== i && state.tiles[j].face === state.tiles[i].face)) as number;
  const b = free.find((j) => j !== a && state.tiles[j].face === state.tiles[a].face) as number;
  log = [];
  tap(state, a, log);
  assert.equal(state.selected, a);
  assert.deepEqual(log, ["sound:move"]);
  tap(state, a);
  assert.equal(state.selected, -1, "tocarla otra vez la suelta");
  tap(state, a);
  log = [];
  tap(state, b, log);
  assert.ok(!state.tiles[a].alive && !state.tiles[b].alive);
  assert.equal(state.score, 20);
  assert.ok(log.includes("sound:clear"));
  assert.equal(alive(state).length, state.tiles.length - 2);

  // Otra pareja enseguida: cadena con bono.
  const free2 = freeTiles(state.tiles);
  const c = free2.find((i) => free2.some((j) => j !== i && state.tiles[j].face === state.tiles[i].face));
  if (c !== undefined) {
    const d = free2.find((j) => j !== c && state.tiles[j].face === state.tiles[c].face) as number;
    tap(state, c);
    tap(state, d);
    assert.equal(state.score, 20 + 30);
  }
});

test("fichas: con el teclado el cursor solo pisa fichas libres y fuego elige", () => {
  const state = createFichas(5);
  press(state, "right");
  assert.ok(state.cursor >= 0 && isFree(state.tiles, state.cursor));
  for (const key of ["left", "left", "up", "right", "down", "down", "right", "up"] as Key[]) {
    const before = state.cursor;
    const from = centerOf(state.tiles[before]);
    press(state, key);
    assert.ok(isFree(state.tiles, state.cursor), "el cursor quedó en una ficha tapada");
    if (state.cursor !== before) {
      const to = centerOf(state.tiles[state.cursor]);
      if (key === "left") assert.ok(to.x < from.x);
      if (key === "right") assert.ok(to.x > from.x);
      if (key === "up") assert.ok(to.y < from.y);
      if (key === "down") assert.ok(to.y > from.y);
    }
  }
  press(state, "fire");
  assert.equal(state.selected, state.cursor);
  // Buscar con flechas la pareja de la elegida y tomarla.
  const face = state.tiles[state.selected].face;
  const target = freeTiles(state.tiles).find((i) => i !== state.selected && state.tiles[i].face === face);
  if (target !== undefined) {
    state.cursor = target;
    press(state, "fire");
    assert.equal(state.score, 20);
  }
});

test("fichas: sin jugadas se baraja (con salida) y sin barajadas termina", () => {
  const state = createFichas(11);
  /** Deja vivas solo seis fichas del piso, puestas a mano: una torre trabada y una pareja suelta. */
  const rig = (target: State) => {
    const six = target.tiles.map((_, i) => i).filter((i) => target.tiles[i].z === 0).slice(0, 6);
    const spots = [
      { gx: 0, gy: 0, z: 0, face: 0 },
      { gx: 0, gy: 4, z: 0, face: 1 },
      { gx: 0, gy: 0, z: 1, face: 1 },
      { gx: 0, gy: 4, z: 1, face: 0 },
      { gx: 20, gy: 0, z: 0, face: 2 },
      { gx: 20, gy: 4, z: 0, face: 2 },
    ];
    target.tiles.forEach((t) => (t.alive = false));
    six.forEach((i, k) => Object.assign(target.tiles[i], spots[k], { alive: true }));
    return six;
  };
  const six = rig(state);
  const log: string[] = [];
  tap(state, six[4], log);
  tap(state, six[5], log);
  assert.equal(state.phase, "stuck");
  settle(state, log);
  assert.equal(state.phase, "play");
  assert.equal(game.status(state).lives, 2);
  assert.ok(log.includes("sound:rotate"));
  assert.ok(log.some((line) => line.startsWith("say:Sin jugadas")));
  assert.equal(alive(state).length, 4);
  assert.ok(hasMove(state.tiles), "después de barajar hay jugada");
  insideArea(state);
  playPlan(state);

  // Barajar a mano un tablero a medio jugar también deja salida.
  const big = createFichas(12);
  for (let k = 0; k < 10; k++) {
    const f = freeTiles(big.tiles);
    const i = f.find((x) => f.some((y) => y !== x && big.tiles[y].face === big.tiles[x].face));
    if (i === undefined) break;
    const j = f.find((y) => y !== i && big.tiles[y].face === big.tiles[i].face) as number;
    big.tiles[i].alive = big.tiles[j].alive = false;
  }
  reshuffle(big);
  assert.equal(big.tiles.length, FIGURES[0].slots.length - 20);
  insideArea(big);
  playPlan(big);
  assert.equal(big.phase, "clear");

  // Sin barajadas: fin.
  const end = createFichas(11);
  end.shuffles = 0;
  const endSix = rig(end);
  const endLog: string[] = [];
  tap(end, endSix[4], endLog);
  tap(end, endSix[5], endLog);
  settle(end, endLog);
  assert.equal(end.over, true);
  assert.equal(game.status(end).over, true);
  assert.ok(endLog.includes("sound:over"));
  const frozen = JSON.stringify(end.tiles);
  run(end, noInput({ taps: [{ x: 64, y: 100 }], pressed: ["fire", "left"] }));
  assert.equal(JSON.stringify(end.tiles), frozen, "terminada, ya no se mueve nada");
});

test("fichas: despejar el tablero da 1000, el secreto una sola vez y otra figura", () => {
  const state = createFichas(21);
  const log: string[] = [];
  playPlan(state, log);
  assert.equal(log.filter((line) => line === "secret").length, 1);
  assert.ok(state.score >= 1000 + 44 * 20);
  assert.equal(state.phase, "clear");
  settle(state, log);
  assert.equal(game.status(state).level, 2);
  assert.equal(game.status(state).world, 1);
  assert.notEqual(figureOf(2).name, figureOf(1).name);
  assert.equal(state.tiles.length, figureOf(2).slots.length);
  assert.ok(log.some((line) => line.startsWith("say:Nivel 2")));
  playPlan(state, log);
  settle(state, log);
  assert.equal(game.status(state).level, 3);
  assert.equal(log.filter((line) => line === "secret").length, 1, "el secreto sale una vez por partida");
  // Sin despejar no hay secreto.
  const other = createFichas(22);
  const otherLog: string[] = [];
  for (let frame = 0; frame < 600; frame++) run(other, noInput(), otherLog);
  assert.ok(!otherLog.includes("secret"));
});

test("fichas: con la misma semilla, la misma partida", () => {
  const play = (seed: number) => {
    const state = createFichas(seed);
    let random = 99;
    for (let frame = 0; frame < 4000 && !state.over; frame++) {
      random = (random * 1103515245 + 12345) >>> 0;
      const taps = frame % 7 === 0 ? [{ x: 3 + ((random >>> 8) % 122), y: 26 + ((random >>> 16) % 194) }] : [];
      run(state, noInput({ taps }));
    }
    return JSON.stringify(state);
  };
  assert.equal(play(4), play(4));
  assert.notEqual(JSON.stringify(createFichas(4).tiles), JSON.stringify(createFichas(5).tiles));
});

test("fichas: aguanta varios minutos con dt variables y toques al azar", () => {
  for (const seed of [1, 2, 3]) {
    const state = createFichas(seed);
    const out = quietOut();
    let random = seed * 7919;
    const next = () => (random = (random * 1103515245 + 12345) >>> 0) >>> 8;
    let score = 0;
    let time = 0;
    const keys: Key[] = ["left", "right", "up", "down", "fire"];
    while (time < 60 * 5) {
      const dt = (next() % 51) / 1000;
      time += dt;
      // Un jugador que a veces elige bien (una pareja libre) y a veces toca cualquier cosa.
      const taps = [];
      const roll = next() % 10;
      if (roll === 0) taps.push({ x: next() % 128, y: next() % 224 });
      else if (roll < 3 && state.phase === "play") {
        const free = freeTiles(state.tiles);
        const i = free.find((x) => free.some((y) => y !== x && state.tiles[y].face === state.tiles[x].face));
        if (i !== undefined) {
          const j = free.find((y) => y !== i && state.tiles[y].face === state.tiles[i].face) as number;
          state.selected = -1;
          taps.push(centerOf(state.tiles[i]), centerOf(state.tiles[j]));
        }
      }
      const pressed = next() % 6 === 0 ? [keys[next() % keys.length]] : [];
      game.step(state, dt, noInput({ taps, pressed }), out);
      const status = game.status(state);
      assert.ok(Number.isInteger(status.score) && status.score >= score && status.score <= 999999);
      score = status.score;
      assert.ok(status.lives >= 0 && status.lives <= 3);
      assert.equal(status.world, (status.level - 1) % 6);
      assert.ok(Number.isFinite(state.time));
      if (state.cursor >= 0) assert.ok(state.cursor < state.tiles.length);
      insideArea(state);
      if (state.over) break;
    }
    assert.ok(score > 0, "se ganan puntos");
  }
});
