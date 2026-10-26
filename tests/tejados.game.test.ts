import assert from "node:assert/strict";
import { test } from "node:test";
import game, {
  JUMP,
  MAX_LIVES,
  PLAYER_X,
  SAFE_TIME,
  TOP_MAX,
  TOP_MIN,
  createRoofs,
  isHazard,
  jumpReach,
  roofUnder,
  stepRoofs,
  type State,
} from "../src/components/secret/games/tejados";
import { HEIGHT, NAME, WIDTH } from "../src/components/secret/games/kit";
import { noInput, quietOut, type Input, type Key } from "../src/components/secret/games/types";

const DT = 1 / 60;
const jumpPress = (): Input => noInput({ pressed: ["fire"], held: new Set<Key>(["fire"]) });
const holding = (): Input => noInput({ held: new Set<Key>(["fire"]) });

/** Una jugadora sencilla: salta al borde y ante los obstáculos, nunca bajo un espíritu, y busca las letras. */
function botInput(state: State, wasHolding: boolean): Input {
  const x = state.scroll + PLAYER_X;
  if (!state.grounded) return state.vy < 0 && wasHolding ? holding() : noInput();
  const roof = roofUnder(state);
  const reach = jumpReach(state.speed);
  const spiritNear = state.things.some((t) => t.kind === "spirit" && !t.got && t.x + t.w > x - 5 && t.x < x + reach + 6);
  if (spiritNear) return noInput();
  const edge = roof ? roof.x + roof.w - (x + 3) : 0;
  const lead = state.speed * 0.12 + 3;
  const obstacle = state.things.some((t) => isHazard(t) && t.kind !== "spirit" && t.x - (x + 3) >= 0 && t.x - (x + 3) < lead);
  const letter = state.things.some((t) => t.kind === "letter" && !t.got && Math.abs(t.x + 5 - (x + state.speed * 0.3)) < 2);
  return edge < 5 || obstacle || letter ? jumpPress() : noInput();
}

function playBot(seed: number, seconds: number, log?: string[], dt = () => DT) {
  const state = game.create(seed, "1") as State;
  const out = quietOut(log);
  let hold = false;
  let time = 0;
  while (time < seconds && !state.over) {
    const input = botInput(state, hold);
    hold = input.held.size > 0;
    const step = dt();
    game.step(state, step, input, out);
    time += step;
  }
  return state;
}

test("tejados: empieza bien", () => {
  const state = createRoofs(7);
  const status = game.status(state);
  assert.deepEqual(status, { score: 0, lives: 3, level: 1, letters: 0, world: 0, over: false });
  assert.ok(state.grounded);
  assert.equal(roofUnder(state)?.top, state.y);
  assert.ok(state.madeTo > WIDTH);
  assert.equal(game.help.length > 20, true);
  assert.deepEqual(game.pad("1"), [[], [{ key: "fire", glyph: "↑", label: "Saltar", main: true }]]);
  // El primer tramo no tiene peligros a la vista enseguida.
  assert.ok(state.things.filter(isHazard).every((t) => t.x > PLAYER_X + 80));
});

test("tejados: saltar sube, mantener apretado sube más y soltar corta el salto", () => {
  const peak = (frames: number) => {
    const state = createRoofs(3);
    const ground = state.y;
    let top = ground;
    for (let f = 0; f < 120; f++) {
      const input = f === 0 ? jumpPress() : f < frames ? holding() : noInput();
      stepRoofs(state, DT, input, quietOut());
      top = Math.min(top, state.y);
    }
    return ground - top;
  };
  const short = peak(1);
  const long = peak(60);
  assert.ok(short > 10 && short < 24, `salto corto ${short}`);
  assert.ok(long > 34 && long < 42, `salto largo ${long}`);
  // Un toque en el tablero también salta, y la flecha arriba igual.
  for (const input of [noInput({ taps: [{ x: 60, y: 100 }] }), noInput({ pressed: ["up"] })]) {
    const state = createRoofs(3);
    const log: string[] = [];
    stepRoofs(state, DT, input, quietOut(log));
    assert.ok(!state.grounded && state.vy < 0);
    assert.deepEqual(log, ["sound:move"]);
  }
  // En el aire no se salta otra vez.
  const state = createRoofs(3);
  stepRoofs(state, DT, jumpPress(), quietOut());
  stepRoofs(state, DT, noInput(), quietOut());
  const vy = state.vy;
  stepRoofs(state, DT, jumpPress(), quietOut());
  assert.ok(state.vy > vy - 1, "no hay doble salto");
  assert.ok(JUMP > 0);
});

test("tejados: sin saltar se cae por el hueco, pierde una vida y vuelve sobre el siguiente tejado", () => {
  const state = createRoofs(11);
  state.things = state.things.filter((t) => !isHazard(t));
  const log: string[] = [];
  for (let f = 0; f < 60 * 20 && state.lives === 3; f++) {
    stepRoofs(state, DT, noInput(), quietOut(log));
    state.things = state.things.filter((t) => !isHazard(t));
  }
  assert.equal(state.lives, 2);
  assert.ok(log.includes("sound:lock") && log.includes("say:Vidas: 2"));
  assert.ok(state.grounded && !state.sunk);
  assert.equal(roofUnder(state)?.top, state.y);
  assert.ok(Math.abs(state.safe - SAFE_TIME) < 0.05);
});

test("tejados: chocar quita una vida y da un rato de calma; tres golpes terminan la partida", () => {
  const state = createRoofs(5);
  const log: string[] = [];
  const x = state.scroll + PLAYER_X;
  state.things.push({ kind: "crate", x: x + 4, y: state.y - 7, w: 8, h: 7, got: false, tint: 0 });
  state.things.push({ kind: "crate", x: x + 12, y: state.y - 7, w: 8, h: 7, got: false, tint: 0 });
  for (let f = 0; f < 30; f++) stepRoofs(state, DT, noInput(), quietOut(log));
  assert.equal(state.lives, 2, "la segunda caja no quita vida durante la calma");
  // Espíritu a media altura: saltando bajo él, golpe; de pie, pasa por debajo.
  const calm = createRoofs(5);
  const cx = calm.scroll + PLAYER_X;
  calm.things.push({ kind: "spirit", x: cx + 2, y: calm.y - 27, w: 8, h: 8, got: false, tint: 0 });
  for (let f = 0; f < 20; f++) stepRoofs(calm, DT, noInput(), quietOut());
  assert.equal(calm.lives, 3);
  const jumper = createRoofs(5);
  const jx = jumper.scroll + PLAYER_X;
  jumper.things.push({ kind: "spirit", x: jx + 8, y: jumper.y - 27, w: 8, h: 8, got: false, tint: 0 });
  stepRoofs(jumper, DT, jumpPress(), quietOut());
  for (let f = 0; f < 20; f++) stepRoofs(jumper, DT, noInput(), quietOut());
  assert.equal(jumper.lives, 2);

  state.lives = 1;
  state.safe = 0;
  const y = state.y;
  state.things.push({ kind: "pot", x: state.scroll + PLAYER_X + 2, y: y - 9, w: 8, h: 9, got: false, tint: 0 });
  stepRoofs(state, DT, noInput(), quietOut(log));
  assert.ok(state.over);
  assert.ok(game.status(state).over);
  assert.ok(log.includes("sound:over"));
  const frozen = JSON.stringify(state);
  stepRoofs(state, DT, jumpPress(), quietOut());
  assert.equal(JSON.stringify(state), frozen, "terminada, ya no cambia");
});

test("tejados: las letras dan puntos y las ocho dan el secreto una sola vez y una vida", () => {
  const state = createRoofs(9);
  state.things = [];
  // Un tejado larguísimo, para probar solo las letras.
  state.roofs = [{ x: -100, w: 1e6, top: state.y, seed: 1 }];
  state.madeTo = 1e6;
  const log: string[] = [];
  let secrets = 0;
  const out = { ...quietOut(log), secret: () => (secrets += 1) };
  state.lives = 3;
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < NAME.length; i++) {
      const bonus = state.bonus;
      state.things = state.things.filter((t) => t.kind !== "letter" && !isHazard(t));
      state.things.push({ kind: "letter", x: state.scroll + PLAYER_X - 2, y: state.y - 30, w: 11, h: 11, got: false, tint: 0 });
      stepRoofs(state, DT, jumpPress(), out);
      for (let f = 0; f < 90 && !state.grounded; f++) stepRoofs(state, DT, holding(), out);
      assert.equal(state.bonus, bonus + 100, `letra ${i + 1} de la vuelta ${round + 1}`);
    }
    assert.equal(state.letters, 0, "el nombre vuelve a empezar");
    assert.equal(state.lives, 4 + round);
  }
  assert.equal(secrets, 1);
  assert.equal(state.lives, 5);
  assert.ok(log.includes("sound:letter") && log.includes("sound:clear"));
  // Con cinco vidas no se pasa del tope.
  assert.ok(state.lives <= MAX_LIVES);
  // De pie, una letra alta no se toma.
  const still = createRoofs(9);
  still.things = [{ kind: "letter", x: still.scroll + PLAYER_X - 2, y: still.y - 30, w: 11, h: 11, got: false, tint: 0 }];
  for (let f = 0; f < 20; f++) stepRoofs(still, DT, noInput(), quietOut());
  assert.equal(still.bonus, 0);
});

test("tejados: el mundo siempre se puede pasar (huecos, obstáculos y espíritus separados)", () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const state = createRoofs(seed);
    let previous = state.roofs[0];
    const seen = new Set<string>();
    for (let f = 0; f < 60 * 240; f++) {
      stepRoofs(state, DT, noInput(), quietOut());
      state.lives = 3;
      state.safe = 1;
      for (const roof of state.roofs) {
        if (seen.has(`${roof.x}`)) continue;
        seen.add(`${roof.x}`);
        if (roof === previous) continue;
        const gap = roof.x - (previous.x + previous.w);
        if (gap > 0) {
          assert.ok(gap >= 14 && gap <= jumpReach(state.speed) * 0.75, `hueco de ${gap} a velocidad ${state.speed}`);
          assert.ok(roof.top >= TOP_MIN && roof.top <= TOP_MAX);
        }
        previous = roof;
      }
    }
    assert.ok(seen.size > 20);
  }
});

test("tejados: una jugadora sencilla avanza lejos, gana puntos y sube de nivel", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const log: string[] = [];
    const state = playBot(seed, 150, log);
    assert.ok(!state.over, `semilla ${seed}: perdió todas las vidas`);
    const status = game.status(state);
    assert.ok(status.score > 1500, `puntos ${status.score}`);
    assert.ok(status.level >= 6 && status.world === (status.level - 1) % 6);
    assert.ok(log.filter((l) => l === "sound:level").length === status.level - 1);
    assert.ok(log.includes("say:Nivel 2"));
    assert.ok(state.speed > 100);
  }
});

test("tejados: con la misma semilla, la misma partida", () => {
  const a = JSON.stringify(playBot(42, 60));
  const b = JSON.stringify(playBot(42, 60));
  assert.equal(a, b);
  assert.notEqual(JSON.stringify(playBot(43, 60)), a);
});

test("tejados: no se rompe con pasos variables durante minutos, y nada se sale del tablero", () => {
  let random = 12345;
  const next = () => ((random = (random * 1103515245 + 12345) >>> 0) / 4294967296);
  for (const seed of [1, 2, 3]) {
    let state = game.create(seed, "1") as State;
    let score = 0;
    let secrets = 0;
    const out = { ...quietOut(), secret: () => (secrets += 1) };
    for (let time = 0; time < 300; ) {
      const dt = next() * 0.05;
      const r = next();
      const input = r < 0.03 ? jumpPress() : r < 0.3 ? holding() : r < 0.32 ? noInput({ taps: [{ x: 50, y: 120 }] }) : noInput();
      if (state.over) {
        // Terminada: otra partida, para seguir probando mucho rato.
        state = game.create(seed + time, "1") as State;
        score = 0;
      }
      game.step(state, dt, input, out);
      if (r < 0.001) game.step(state, 0, noInput(), out);
      time += dt;
      const status = game.status(state);
      assert.ok(Number.isFinite(state.y) && Number.isFinite(state.scroll));
      if (!state.over) assert.ok(state.y <= HEIGHT + 20 && state.y > 26, `y=${state.y}`);
      assert.ok(Number.isInteger(status.score) && status.score >= score && status.score <= 999999);
      score = status.score;
      assert.ok(status.lives >= 0 && status.lives <= MAX_LIVES);
      assert.ok(status.letters >= 0 && status.letters < 8);
      assert.ok(status.world >= 0 && status.world <= 4);
      assert.ok(state.roofs.length < 12 && state.things.length < 40, "lo de atrás se olvida");
    }
    assert.ok(secrets <= 1);
  }
});
