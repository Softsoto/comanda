import assert from "node:assert/strict";
import { test } from "node:test";
import mascotas, {
  ACTIONS,
  ACTION_LABELS,
  AWAY,
  CARD_EVERY,
  CATCH_WINDOW,
  EXIT_BOX,
  FLY,
  MAX_PETS,
  ROOM_BOTTOM,
  ROOM_TOP,
  SAVE_KEY,
  SICK_AFTER,
  SLOTS,
  accessoriesOf,
  buttonBox,
  foundationOf,
  houseLevelOf,
  petBox,
  petLevelOf,
  petRows,
  printable,
  stageOf,
  wrapText,
  type State,
} from "../src/components/secret/games/mascotas";
import { HEIGHT, WIDTH, WORLDS, widthOf } from "../src/components/secret/games/kit";
import { noInput, quietOut, type Key, type MiniGameDef, type Point } from "../src/components/secret/games/types";
import { DEFAULT_FOUNDATIONS, FOUNDATIONS, setFoundations } from "../src/lib/foundations";
import { missingGlyphs } from "../src/components/secret/pixel-font";

const DT = 1 / 60;
const game = mascotas as unknown as MiniGameDef<State>;
const action = (name: (typeof ACTIONS)[number]) => ACTIONS.indexOf(name);
const centerOf = (box: { x: number; y: number; w: number; h: number }): Point => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

const step = (state: State, change: Parameters<typeof noInput>[0] = {}, log?: string[], dt = DT) => game.step(state, dt, noInput(change), quietOut(log));
const press = (state: State, key: Key, log?: string[]) => step(state, { pressed: [key], held: new Set([key]) }, log);
const tap = (state: State, point: Point, log?: string[]) => step(state, { taps: [point] }, log);
const tapButton = (state: State, name: (typeof ACTIONS)[number], log?: string[]) => tap(state, centerOf(buttonBox(action(name))), log);
const wait = (state: State, seconds: number, log?: string[]) => {
  for (let t = 0; t < seconds; t += DT) step(state, {}, log);
};
/** Una partida nueva con la tarjeta de las fundaciones ya cerrada. */
function fresh(seed = 3): State {
  const state = game.create(seed, "1");
  tap(state, { x: 64, y: 100 });
  assert.equal(state.card.open, false);
  return state;
}
const cat = (state: State) => state.pets.findIndex((pet) => pet.kind === "gato");
const dog = (state: State) => state.pets.findIndex((pet) => pet.kind === "perro");
const calm = (state: State) => state.pets.forEach((pet) => ((pet.doing = ""), (pet.busy = 0)));

/** Lienzo de mentira: cuenta rectángulos y anota los que tienen medidas rotas. */
function fakeCanvas() {
  const counter = { rects: 0 };
  const broken: string[] = [];
  const c = new Proxy(
    { globalAlpha: 1, fillStyle: "" } as Record<string, unknown>,
    {
      get(target, key) {
        if (key === "fillRect")
          return (x: number, y: number, w: number, h: number) => {
            counter.rects++;
            if (![x, y, w, h].every(Number.isFinite) || w < 0 || h < 0) broken.push(`${x},${y},${w},${h}`);
          };
        if (key in target) return target[key as string];
        return () => undefined;
      },
      set(target, key, value) {
        target[key as string] = value;
        return true;
      },
    },
  );
  return { c: c as unknown as CanvasRenderingContext2D, counter, broken };
}

test("mascotas: empieza con un gatito y un perrito, y la tarjeta de las fundaciones", () => {
  const state = game.create(11, "1");
  assert.deepEqual(game.status(state), { score: 0, lives: 0, level: 1, letters: 0, world: 0, over: false });
  assert.equal(state.pets.length, 2);
  assert.deepEqual(state.pets.map((pet) => pet.kind).sort(), ["gato", "perro"]);
  assert.notEqual(state.pets[0].name, state.pets[1].name);
  assert.ok(state.card.open, "la tarjeta sale al empezar");
  const log: string[] = [];
  step(state, {}, log);
  const said = log.find((line) => line.startsWith("say:Ayuda a un animalito"));
  assert.ok(said, "se anuncia la tarjeta");
  assert.ok(FOUNDATIONS.some((item) => said!.includes(item.name)));
  assert.deepEqual(game.pad("1"), [[], []]);
  // Mientras la tarjeta está abierta las mascotas esperan; se cierra con fuego.
  const food = state.pets[0].food;
  wait(state, 2);
  assert.equal(state.pets[0].food, food);
  press(state, "fire");
  assert.equal(state.card.open, false);
});

test("mascotas: botones, mascotas y salida caben en el lienzo y se pueden tocar", () => {
  for (let i = 0; i < ACTIONS.length; i++) {
    const box = buttonBox(i);
    assert.ok(box.w >= 20 && box.h >= 20, "botón grande");
    assert.ok(box.x >= 2 && box.y >= ROOM_BOTTOM && box.x + box.w <= WIDTH - 2 && box.y + box.h <= HEIGHT - 1, `botón ${i}`);
    for (let j = 0; j < i; j++) {
      const other = buttonBox(j);
      const apart = box.x >= other.x + other.w || other.x >= box.x + box.w || box.y >= other.y + other.h || other.y >= box.y + box.h;
      assert.ok(apart, `botones ${i} y ${j} encimados`);
    }
  }
  assert.ok(EXIT_BOX.w >= 12 && EXIT_BOX.h >= 12);
  for (const slot of SLOTS) {
    for (const level of [1, 3, 6]) {
      const height = petRows({ kind: "gato", level }).length * 2;
      assert.ok(slot.x >= 2 && slot.x + 32 <= WIDTH - 1 && slot.feet - height >= ROOM_TOP + 30 && slot.feet <= ROOM_BOTTOM, "mascota dentro del cuarto");
    }
  }
  // Todos los textos fijos caben a lo ancho y se pueden dibujar.
  const texts = [...Object.values(ACTION_LABELS), "LA CASA ESTÁ LLENA", "ESPERA UN POQUITO", "NECESITA MEDICINA", "NO TIENE HAMBRE", "TOCA LA ESPUMA: 7", "PUNTERO DE LUZ  14", "PELOTA 5 DE 5  ♥5", "TE EXTRAÑAN MUCHO", "¡BRILLA DE LIMPIO!"];
  for (const text of texts) assert.ok(widthOf(text) <= WIDTH - 6, text);
  assert.deepEqual(missingGlyphs(texts.join(" ")), []);
});

test("mascotas: las barras bajan con el tiempo y cada cuidado sube la suya", () => {
  const state = fresh();
  const before = { ...state.pets[0] };
  wait(state, 30);
  for (const key of ["food", "fun", "clean", "energy"] as const) assert.ok(state.pets[0][key] < before[key], `${key} baja`);

  calm(state);
  state.selected = 0;
  state.pets[0].food = 40;
  tapButton(state, "comer");
  assert.ok(state.pets[0].food >= 79, "comer");
  assert.ok(state.score > 0);
  assert.equal(state.pets[0].doing, "eat");

  const fun = (state.pets[0].fun = 50);
  tapButton(state, "mimar");
  assert.ok(state.pets[0].fun > fun, "acariciar");
  // Tocar a la mascota elegida también la acaricia; tocar otra la elige.
  const other = petBox(state, 1);
  tap(state, centerOf(other));
  assert.equal(state.selected, 1);
  const funOther = (state.pets[1].fun = 50);
  tap(state, centerOf(petBox(state, 1)));
  assert.ok(state.pets[1].fun > funOther);

  calm(state);
  state.selected = 0;
  state.pets[0].energy = 30;
  tapButton(state, "dormir");
  assert.equal(state.pets[0].doing, "sleep");
  wait(state, 8);
  assert.ok(state.pets[0].energy >= 99, "dormir");
  assert.notEqual(state.pets[0].doing, "sleep");

  // El baño: se revientan las burbujas y queda limpio.
  calm(state);
  state.pets[0].clean = 20;
  tapButton(state, "banar");
  assert.equal(state.activity?.type, "bath");
  const bath = state.activity!.type === "bath" ? state.activity! : null;
  assert.ok(bath && bath.bubbles.length === 7);
  for (const bubble of bath!.bubbles) {
    assert.ok(bubble.x - bubble.r >= 2 && bubble.x + bubble.r <= WIDTH - 2 && bubble.y - bubble.r >= ROOM_TOP && bubble.y + bubble.r <= ROOM_BOTTOM);
    assert.ok(bubble.r * 2 >= 12, "burbuja tocable");
  }
  tap(state, bath!.bubbles[3]);
  assert.ok(bath!.bubbles[3].popped, "tocar una burbuja la revienta");
  tap(state, { x: 2, y: 30 });
  assert.equal(bath!.bubbles.filter((b) => b.popped).length, 1, "tocar fuera no revienta nada");
  for (let i = 0; i < 6; i++) press(state, "fire");
  wait(state, 2.5);
  assert.equal(state.activity, null);
  assert.ok(state.pets[0].clean >= 99);
});

test("mascotas: flechas cambian de mascota y de cuidado, y fuego lo hace", () => {
  const state = fresh();
  calm(state);
  assert.equal(state.selected, 0);
  press(state, "right");
  assert.equal(state.selected, 1);
  press(state, "right");
  assert.equal(state.selected, 0);
  press(state, "left");
  assert.equal(state.selected, 1);
  assert.equal(state.action, 0);
  press(state, "up");
  assert.equal(ACTIONS[state.action], "ayuda");
  press(state, "down");
  press(state, "down");
  assert.equal(ACTIONS[state.action], "jugar");
  press(state, "up");
  state.pets[1].food = 30;
  press(state, "fire");
  assert.ok(state.pets[1].food > 60);
});

test("mascotas: con el perrito se lanza la pelota y se atrapa tocando en el momento justo", () => {
  const state = fresh();
  calm(state);
  state.selected = dog(state);
  state.pets[state.selected].fun = 40;
  tapButton(state, "jugar");
  const fetch = state.activity;
  assert.equal(fetch?.type, "fetch");
  if (fetch?.type !== "fetch") return;
  // Tocar demasiado pronto falla; el perrito trae la pelota igual.
  press(state, "fire");
  assert.equal(fetch.phase, "fly");
  wait(state, FLY * 0.3);
  press(state, "fire");
  for (let n = 0; n < 600 && (fetch.phase as string) !== "ready"; n++) step(state);
  assert.equal(fetch.caught, 0);
  assert.equal(fetch.throwsLeft, 4);
  // Ahora sí, cuando la pelota baja.
  const score = state.score;
  const fun = state.pets[state.selected].fun;
  press(state, "fire");
  while (fetch.t / FLY < (CATCH_WINDOW[0] + CATCH_WINDOW[1]) / 2) {
    step(state);
    assert.ok(fetch.ball.x >= 2 && fetch.ball.x <= WIDTH - 2 && fetch.ball.y >= ROOM_TOP && fetch.ball.y <= ROOM_BOTTOM, "la pelota no se sale");
  }
  press(state, "fire");
  assert.equal(fetch.caught, 1);
  assert.ok(state.score > score && state.pets[state.selected].fun > fun);
  // Las demás se lanzan solas si nadie toca, y el juego termina.
  wait(state, 30);
  assert.equal(state.activity, null);
});

test("mascotas: con el gatito el puntero de luz se mueve con flechas o el dedo y el gatito lo persigue", () => {
  const state = fresh();
  calm(state);
  state.selected = cat(state);
  tapButton(state, "jugar");
  const laser = state.activity;
  assert.equal(laser?.type, "laser");
  if (laser?.type !== "laser") return;
  const start = { ...laser.dot };
  for (let i = 0; i < 30; i++) step(state, { held: new Set<Key>(["left"]) });
  assert.ok(laser.dot.x < start.x, "flechas");
  for (let i = 0; i < 200; i++) step(state, { held: new Set<Key>(["left", "up"]) });
  assert.ok(laser.dot.x >= 0 && laser.dot.y >= ROOM_TOP, "no se sale");
  step(state, { touches: [{ x: 90, y: 128 }] });
  assert.deepEqual(laser.dot, { x: 90, y: 128 });
  const score = state.score;
  for (let i = 0; i < 240; i++) step(state, { touches: [{ x: 90, y: 128 }] });
  assert.ok(laser.pounces > 0, "el gatito salta sobre la luz");
  // Llevar la luz a una estrella la junta.
  const star = { ...laser.sparkles[0] };
  step(state, { touches: [star] });
  assert.ok(laser.got >= 1);
  assert.ok(state.score > score);
  for (let i = 0; i < 60 * 15; i++) {
    step(state, { touches: [{ x: (i * 7) % WIDTH, y: 40 + ((i * 3) % 100) }] });
    if (state.activity) {
      assert.ok(laser.cat.x >= 0 && laser.cat.x <= WIDTH && laser.cat.y <= ROOM_BOTTOM && laser.cat.y >= ROOM_TOP);
    }
  }
  assert.equal(state.activity, null, "se acaba a los 14 segundos");
  // Con la crucecita se sale antes de tiempo.
  calm(state);
  tapButton(state, "jugar");
  assert.ok(state.activity);
  tap(state, centerOf(EXIT_BOX));
  assert.equal(state.activity, null);
});

test("mascotas: el descuido enferma, la medicina cura y nunca se muere nadie", () => {
  const state = fresh();
  calm(state);
  const log: string[] = [];
  state.pets[0].food = 5;
  wait(state, SICK_AFTER + 1, log);
  assert.equal(state.pets[0].sick, true);
  assert.ok(log.some((line) => line.includes("se enfermó")));
  state.selected = 0;
  tapButton(state, "jugar");
  assert.equal(state.activity, null, "enferma no juega");
  tapButton(state, "medicina");
  assert.equal(state.pets[0].sick, false);
  // Medicina sin enfermedad no hace nada.
  const score = state.score;
  calm(state);
  tapButton(state, "medicina");
  assert.equal(state.score, score);
  // Mucho rato sin cuidar: tristes, con aviso amable, pero siguen ahí.
  const sad: string[] = [];
  // (la tarjeta de las fundaciones vuelve cada tres minutos y se cierra tocando)
  for (let t = 0; t < 900; t += DT) step(state, state.card.open ? { taps: [{ x: 64, y: 100 }] } : {}, sad);
  assert.equal(state.pets.length, 2);
  assert.ok(state.sadAll);
  assert.ok(sad.some((line) => line.includes("te extrañan")));
  assert.equal(sad.filter((line) => line.includes("te extrañan")).length, 1);
  for (const pet of state.pets) for (const key of ["food", "fun", "clean", "energy"] as const) assert.ok(pet[key] >= 0);
  assert.equal(game.status(state).over, false);
});

test("mascotas: se adoptan hasta cuatro, con nombres distintos", () => {
  const state = fresh();
  const log: string[] = [];
  tapButton(state, "adoptar", log);
  tapButton(state, "adoptar", log);
  assert.equal(state.pets.length, MAX_PETS);
  assert.equal(state.pets.filter((pet) => pet.kind === "gato").length, 2);
  tapButton(state, "adoptar", log);
  assert.equal(state.pets.length, MAX_PETS);
  assert.equal(state.message?.text, "LA CASA ESTÁ LLENA");
  assert.equal(new Set(state.pets.map((pet) => pet.name)).size, MAX_PETS);
  assert.equal(log.filter((line) => line.startsWith("say:Llegó")).length, 2);
  // Cada una se puede elegir con las flechas.
  for (let i = 0; i < 4; i++) press(state, "right");
  assert.equal(state.selected, 3);
});

test("mascotas: las mascotas crecen y ganan accesorios, y la casa sube de nivel y de paisaje", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((level) => [stageOf(level), accessoriesOf(level)]), [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [2, 3]]);
  assert.equal(petLevelOf(0), 1);
  assert.equal(petLevelOf(60), 2);
  assert.equal(petLevelOf(800), 6);
  assert.equal(petLevelOf(1200), 7);
  assert.ok(petRows({ kind: "perro", level: 1 }).length < petRows({ kind: "perro", level: 5 }).length, "los cachorros son más pequeños");
  assert.deepEqual([0, 299, 300, 900, 1800].map(houseLevelOf), [1, 1, 2, 3, 4]);

  const state = fresh();
  const log: string[] = [];
  state.selected = 0;
  // Muchos cuidados seguidos.
  for (let i = 0; i < 400 && state.pets[0].level < 6; i++) {
    calm(state);
    state.card.open = false;
    state.pets[0].food = 10;
    state.pets[0].fun = 10;
    tapButton(state, "comer", log);
  }
  assert.ok(state.pets[0].level >= 6);
  assert.equal(accessoriesOf(state.pets[0].level), 3);
  assert.ok(log.some((line) => line.includes("Ganó un moño")));
  assert.ok(log.some((line) => line.includes("¡Ya es adulto!")));
  assert.ok(state.level >= 2);
  assert.equal(game.status(state).level, state.level);
  assert.equal(game.status(state).world, (state.level - 1) % WORLDS);
  assert.ok(log.some((line) => line.startsWith("say:¡La casa subió al nivel 2!")));
  assert.ok(log.includes("sound:level"));
});

test("mascotas: la tarjeta de las fundaciones rota, vuelve cada tres minutos y usa la lista viva", () => {
  try {
    setFoundations([
      { name: "Patitas del Sol", place: "Pereira", contact: "@patitas_sol" },
      { name: "Hogar Michi", place: "Tunja", contact: "300 000 0000" },
      { name: "Refugio Arcoíris & Amigos con un nombre larguísimo de verdad", place: "Ibagué", contact: "www.refugio-arcoiris-amigos-de-verdad.org" },
    ]);
    const state = game.create(4, "1");
    const log: string[] = [];
    step(state, {}, log);
    const first = foundationOf(state).name;
    assert.ok(["Patitas del Sol", "Hogar Michi", "Refugio Arcoíris & Amigos con un nombre larguísimo de verdad"].includes(first));
    assert.ok(log.some((line) => line.includes(first)));
    press(state, "fire");
    // El botón de corazón la vuelve a mostrar, con la siguiente.
    tapButton(state, "ayuda", log);
    assert.ok(state.card.open);
    assert.notEqual(foundationOf(state).name, first);
    const seen = new Set([first, foundationOf(state).name]);
    tap(state, { x: 10, y: 10 });
    assert.equal(state.card.open, false);
    wait(state, CARD_EVERY - 1);
    assert.equal(state.card.open, false);
    wait(state, 2);
    assert.ok(state.card.open, "vuelve a los tres minutos");
    seen.add(foundationOf(state).name);
    assert.equal(seen.size, 3, "pasa por todas");
    // Los textos se parten en renglones que caben y se pueden dibujar.
    for (const item of FOUNDATIONS) {
      for (const text of [item.name, item.place, item.contact]) {
        for (const line of wrapText(text, 108)) assert.ok(widthOf(line) <= 108, line);
        assert.deepEqual(missingGlyphs(printable(text)), []);
      }
    }
    // Si el administrador cambia la lista con la partida empezada, se usa la nueva.
    setFoundations([{ name: "Gaticos de Chía", place: "Chía", contact: "@gaticos" }]);
    assert.equal(foundationOf(state).name, "Gaticos de Chía");
    const { c, broken } = fakeCanvas();
    game.draw(c, state, 1, false);
    assert.deepEqual(broken, []);
  } finally {
    setFoundations(DEFAULT_FOUNDATIONS);
  }
});

test("mascotas: el secreto sale una sola vez, con un gatito y un perrito muy felices a la vez", () => {
  const state = fresh();
  const log: string[] = [];
  const fill = (index: number) => Object.assign(state.pets[index], { food: 100, fun: 100, clean: 100, energy: 100, sick: false });
  fill(cat(state));
  wait(state, 1, log);
  assert.equal(log.filter((line) => line === "secret").length, 0, "solo el gatito no basta");
  fill(dog(state));
  step(state, {}, log);
  assert.equal(log.filter((line) => line === "secret").length, 1);
  for (let i = 0; i < 5; i++) {
    fill(0);
    fill(1);
    wait(state, 2, log);
  }
  assert.equal(log.filter((line) => line === "secret").length, 1);
});

test("mascotas: guarda en el navegador y, al volver, cuenta el tiempo que pasó con un tope suave", () => {
  const store = new Map<string, string>();
  const fake = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
  const g = globalThis as { window?: unknown };
  g.window = { localStorage: fake };
  try {
    const state = fresh(8);
    calm(state);
    state.pets[0].food = 50;
    tapButton(state, "comer");
    wait(state, 1.2);
    assert.ok(store.has(SAVE_KEY), "guardó al cambiar");
    const saved = JSON.parse(store.get(SAVE_KEY)!);
    assert.equal(saved.pets.length, 2);
    assert.equal(saved.score, state.score);

    // Vuelve al rato (casi nada): todo igual.
    const back = game.create(99, "1");
    assert.deepEqual(back.pets.map((pet) => pet.name), state.pets.map((pet) => pet.name));
    assert.equal(back.score, state.score);
    assert.ok(Math.abs(back.pets[0].food - state.pets[0].food) < 1);

    // Dos horas después: bajaron, pero no por debajo del tope suave.
    const hours = (h: number) => {
      const data = JSON.parse(store.get(SAVE_KEY)!);
      data.at = Date.now() - h * 3600 * 1000;
      data.pets[0].food = 90;
      data.pets[0].fun = 25;
      data.pets[0].energy = 40;
      store.set(SAVE_KEY, JSON.stringify(data));
      return game.create(1, "1");
    };
    const later = hours(2);
    assert.ok(later.away >= 7000);
    assert.ok(later.pets[0].food < 90 && later.pets[0].food >= AWAY.floor);
    assert.equal(later.pets[0].fun, 25, "lo que ya estaba bajo no baja más por la ausencia");
    assert.ok(later.pets[0].energy > 40, "durmieron mientras tanto");
    // Un año fuera cuenta como el tope (8 horas).
    const year = hours(24 * 365);
    const cap = hours(8);
    assert.ok(Math.abs(year.pets[0].food - cap.pets[0].food) < 0.01);
    assert.ok(year.pets[0].food >= AWAY.floor);
    // Datos rotos: empieza de cero sin romperse.
    store.set(SAVE_KEY, "{roto");
    assert.equal(game.create(1, "1").pets.length, 2);
    g.window = {
      get localStorage(): never {
        throw new Error("bloqueado");
      },
    };
    const blocked = game.create(1, "1");
    wait(blocked, 12);
    assert.equal(blocked.pets.length, 2);
  } finally {
    delete g.window;
  }
});

test("mascotas: con la misma semilla sale la misma partida", () => {
  const run = (seed: number) => {
    const state = game.create(seed, "1");
    let random = 5;
    const next = () => (random = (random * 1103515245 + 12345) >>> 0) / 4294967296;
    for (let frame = 0; frame < 60 * 40; frame++) {
      const taps = frame % 20 === 0 ? [{ x: Math.floor(next() * WIDTH), y: Math.floor(next() * HEIGHT) }] : [];
      const keys: Key[] = ["left", "right", "up", "down", "fire"];
      step(state, { taps, pressed: frame % 45 === 0 ? [keys[Math.floor(next() * keys.length)]] : [] });
    }
    return JSON.stringify(state);
  };
  assert.equal(run(21), run(21));
  assert.notEqual(run(21), run(22));
});

test("mascotas: varios minutos con dt variable y toques al azar sin romperse", () => {
  const state = game.create(42, "1");
  const keys: Key[] = ["left", "right", "up", "down", "fire"];
  let random = 77;
  const next = () => (random = (random * 1103515245 + 12345) >>> 0) / 4294967296;
  const log: string[] = [];
  const { c, counter, broken } = fakeCanvas();
  let most = 0;
  const held = new Set<Key>();
  for (let frame = 0; frame < 60 * 600; frame++) {
    const pressed: Key[] = [];
    if (frame % 13 === 0) {
      const key = keys[Math.floor(next() * keys.length)];
      if (held.has(key)) held.delete(key);
      else {
        held.add(key);
        pressed.push(key);
      }
    }
    const taps = frame % 17 === 0 ? [{ x: next() * WIDTH, y: next() * HEIGHT }] : [];
    game.step(state, next() * 0.05, noInput({ held, pressed, taps, touches: frame % 100 < 30 ? taps : [] }), quietOut(log));
    const status = game.status(state);
    assert.ok(Number.isInteger(status.score) && status.score >= 0 && status.score <= 999_999);
    assert.ok(status.world >= 0 && status.world < WORLDS);
    assert.equal(status.over, false);
    assert.equal(status.lives, 0);
    assert.ok(state.pets.length >= 2 && state.pets.length <= MAX_PETS);
    for (const pet of state.pets) for (const key of ["food", "fun", "clean", "energy"] as const) assert.ok(pet[key] >= 0 && pet[key] <= 100 && Number.isFinite(pet[key]));
    for (const p of state.particles) assert.ok(p.x > -40 && p.x < WIDTH + 40 && p.y >= ROOM_TOP - 4 && p.y < HEIGHT);
    if (frame % 20 === 0) {
      counter.rects = 0;
      game.draw(c, state, frame / 60, frame % 40 === 0);
      most = Math.max(most, counter.rects);
    }
  }
  assert.deepEqual(broken.slice(0, 3), []);
  assert.ok(most < 9000, `${most} rectángulos`);
  assert.ok(state.score > 0, "jugando al azar también se gana cariño");
  assert.ok(log.filter((line) => line === "secret").length <= 1);
  assert.ok(log.some((line) => line.startsWith("say:Ayuda a un animalito")));
});
