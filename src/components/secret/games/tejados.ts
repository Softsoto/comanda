/**
 * "Carrera por los Tejados": Natha corre sola hacia la derecha por los tejados
 * de la aldea. Hay que saltar los huecos entre casas y las cosas bajas que hay
 * encima (macetas, cajas, faroles), y NO saltar cuando pasa un espíritu a media
 * altura (o pasarle por encima con un salto alto). Mantener el botón apretado
 * hace el salto más alto; al soltarlo, el salto se corta.
 *
 * Las letras de NATHALIA flotan en orden: cada una da 100 puntos y, al juntar
 * las ocho, se gana el mensaje secreto y una vida.
 */

import { paintSprite, rect, type Colors, type Ctx, type Sprite } from "../art";
import {
  GOLD,
  HEIGHT,
  INK,
  LANTERN,
  LANTERN_COLORS,
  MOON,
  MOON_COLORS,
  NAME,
  NIGHT,
  NINJA,
  NINJA_COLORS,
  CUSTOM,
  SPIRIT,
  SPIRIT_COLORS,
  WIDTH,
  center,
  drawFrame,
  drawName,
  drawTop,
  lookOf,
  outlined,
  widthOf,
  write,
} from "./kit";
import { WORLDS } from "./kit";
import { defineGame, roll, type Input, type Out } from "./types";

/* ---------- Medidas y números del juego ---------- */

/** Dónde corre Natha en la pantalla (el mundo se mueve, ella no). */
export const PLAYER_X = 30;
/** Medio ancho y alto de la caja con que Natha choca. */
const HALF = 3;
const TALL = 9;
/** Velocidad del salto y gravedades: más suave mientras se sube con el botón apretado. */
export const JUMP = 170;
const RISE_HELD = 380;
const FALL = 700;
/** Velocidad del mundo: empieza tranquila y sube poco a poco hasta un tope. */
export const START_SPEED = 55;
export const TOP_SPEED = 125;
const SPEED_GAIN = 0.35;
/** Segundos por nivel. */
export const LEVEL_TIME = 25;
/** Segundos sin poder perder vidas después de un golpe. */
export const SAFE_TIME = 1.5;
export const MAX_LIVES = 5;
/** Alturas posibles de los tejados (la parte de arriba, donde se pisa). */
export const TOP_MIN = 146;
export const TOP_MAX = 184;

export type Roof = { x: number; w: number; top: number; seed: number };
export type ThingKind = "pot" | "crate" | "crates" | "stack" | "lamp" | "spirit" | "letter";
export type Thing = { kind: ThingKind; x: number; y: number; w: number; h: number; got: boolean; tint: number };

export type State = {
  random: number;
  /** Segundos de carrera. */
  time: number;
  speed: number;
  /** Cuánto se ha movido el mundo (en píxeles): el borde izquierdo de la pantalla. */
  scroll: number;
  /** Distancia recorrida corriendo (la que da puntos). */
  dist: number;
  bonus: number;
  lives: number;
  level: number;
  letters: number;
  secret: boolean;
  over: boolean;
  /** Altura de los pies de Natha y su velocidad hacia abajo. */
  y: number;
  vy: number;
  grounded: boolean;
  /** Si el salto sigue subiendo con el botón apretado. */
  rising: boolean;
  /** Un instante para saltar aunque ya se haya salido del borde, y para recordar un salto pedido justo antes de tocar el tejado. */
  coyote: number;
  buffer: number;
  /** Se cayó por debajo del borde de un tejado: ya no puede subir, solo caer. */
  sunk: boolean;
  safe: number;
  roofs: Roof[];
  things: Thing[];
  /** Hasta dónde está hecho el mundo y la altura del último tejado. */
  madeTo: number;
  lastTop: number;
  /** A partir de dónde puede aparecer la siguiente letra. */
  nextLetter: number;
  /** Un aviso grande por un momento (nivel, nombre completo). */
  banner: string;
  bannerTime: number;
  run: number;
};

const HAZARDS: ReadonlySet<ThingKind> = new Set(["pot", "crate", "crates", "stack", "lamp", "spirit"]);
export const isHazard = (thing: Thing) => HAZARDS.has(thing.kind);

/* ---------- Cómo se arma el mundo ---------- */

const randomInt = (state: State, min: number, max: number) => min + Math.floor(roll(state) * (max - min + 1));

/** Cuánto avanza un salto completo en el aire: sirve para separar los peligros según la velocidad. */
export const jumpReach = (speed: number) => speed * 0.8;

/** Un obstáculo bajo puesto sobre un tejado, con su caja de choque. */
function lowThing(state: State, x: number, top: number): Thing {
  const pick = roll(state);
  const level = state.level;
  // Las pilas altas aparecen desde el segundo nivel.
  const kind: ThingKind = pick < 0.3 ? "pot" : pick < 0.55 ? "crate" : pick < 0.75 ? "lamp" : level > 1 && pick < 0.88 ? "stack" : "crates";
  const size: Record<string, [number, number]> = { pot: [8, 9], crate: [8, 7], crates: [15, 7], stack: [8, 13], lamp: [6, 12] };
  const [w, h] = size[kind];
  return { kind, x, y: top - h, w, h, got: false, tint: 0 };
}

/**
 * Añade un tejado más a la derecha. Los huecos se hacen más cortos que lo que
 * alcanza un salto a esa velocidad, y los peligros quedan separados lo
 * suficiente para caer, mirar y volver a saltar. Así siempre se puede pasar.
 */
function addRoof(state: State) {
  const first = state.roofs.length === 0;
  const speed = Math.min(TOP_SPEED, state.speed + 8);
  const reach = jumpReach(speed);
  const top = first ? 170 : Math.max(TOP_MIN, Math.min(TOP_MAX, state.lastTop + Math.round((roll(state) - 0.5) * 30)));
  const rise = Math.max(0, state.lastTop - top);
  const maxGap = Math.max(16, Math.min(56, state.speed * 0.55 - rise * 0.8));
  const gap = first ? 0 : Math.round(14 + roll(state) * (maxGap - 14));
  const w = first ? 240 : Math.round(110 + roll(state) * 90 + state.speed * 0.6);
  const roof: Roof = { x: state.madeTo + gap, w, top, seed: Math.floor(roll(state) * 1e6) };
  state.roofs.push(roof);

  // Peligros: lejos de donde se cae al llegar y de donde hay que saltar para irse.
  const placed: Thing[] = [];
  const spacing = speed * 0.95 + 24;
  let x = roof.x + (first ? 120 : reach + 12);
  const end = roof.x + w - reach - 10;
  const spiritChance = Math.min(0.45, 0.2 + state.level * 0.05);
  while (x + 16 <= end) {
    if (roll(state) < 0.8) {
      const at = Math.round(x + roll(state) * 10);
      const thing: Thing =
        roll(state) < spiritChance
          ? { kind: "spirit", x: at, y: top - 27, w: 8, h: 8, got: false, tint: randomInt(state, 0, 2) }
          : lowThing(state, at, top);
      placed.push(thing);
    }
    x += spacing + roll(state) * 30;
  }
  state.things.push(...placed);

  // La letra que toca: sobre el hueco recién hecho, sobre un obstáculo o en un tramo libre.
  const waiting = state.things.some((thing) => thing.kind === "letter" && !thing.got);
  if (!first && !waiting && roof.x >= state.nextLetter) {
    const low = placed.find((thing) => thing.kind !== "spirit");
    const choice = roll(state);
    let cx: number;
    let cy: number;
    if (gap >= 18 && (choice < 0.5 || !low)) {
      cx = roof.x - gap / 2;
      cy = Math.min(top, state.lastTop) - 24;
    } else if (low) {
      cx = low.x + low.w / 2;
      cy = top - low.h - 16;
    } else {
      cx = roof.x + w / 2;
      cy = top - 22;
    }
    state.things.push({ kind: "letter", x: Math.round(cx - 5), y: Math.round(cy - 5), w: 11, h: 11, got: false, tint: 0 });
    state.nextLetter = cx + 240 + roll(state) * 200;
  }

  state.madeTo = roof.x + w;
  state.lastTop = top;
}

/** Hace mundo hasta un poco más allá del borde derecho y olvida lo que ya quedó atrás. */
function buildAhead(state: State) {
  while (state.madeTo < state.scroll + WIDTH + 80) addRoof(state);
  state.roofs = state.roofs.filter((roof) => roof.x + roof.w > state.scroll - 20);
  state.things = state.things.filter((thing) => thing.x + thing.w > state.scroll - 10);
}

export function createRoofs(seed: number): State {
  const state: State = {
    random: seed >>> 0,
    time: 0,
    speed: START_SPEED,
    scroll: 0,
    dist: 0,
    bonus: 0,
    lives: 3,
    level: 1,
    letters: 0,
    secret: false,
    over: false,
    y: 170,
    vy: 0,
    grounded: true,
    rising: false,
    coyote: 0,
    buffer: 0,
    sunk: false,
    safe: 0,
    roofs: [],
    things: [],
    madeTo: 0,
    lastTop: 170,
    nextLetter: 150,
    banner: "",
    bannerTime: 0,
    run: 0,
  };
  buildAhead(state);
  return state;
}

/* ---------- Cómo avanza ---------- */

export const scoreOf = (state: State) => Math.min(999999, Math.floor(state.dist / 4) + state.bonus);

/** El tejado que está bajo los pies de Natha (o que ella toca de lado), si hay uno. */
export function roofUnder(state: State): Roof | undefined {
  const x = state.scroll + PLAYER_X;
  return state.roofs.find((roof) => x + HALF > roof.x && x - HALF < roof.x + roof.w);
}

/** Si dos cajas se tocan (con un píxel de perdón en cada borde). */
const touching = (state: State, thing: Thing, mercy: number) => {
  const x = state.scroll + PLAYER_X;
  return (
    x + HALF > thing.x + mercy &&
    x - HALF < thing.x + thing.w - mercy &&
    state.y > thing.y + mercy &&
    state.y - TALL < thing.y + thing.h - mercy
  );
};


function loseLife(state: State, out: Out) {
  state.lives -= 1;
  state.safe = SAFE_TIME;
  out.sound("lock");
  if (state.lives <= 0) {
    state.lives = 0;
    state.over = true;
    out.sound("over");
    out.say(`Fin de la carrera. ${scoreOf(state)} puntos.`);
    return;
  }
  out.say(`Vidas: ${state.lives}`);
}

/** Tras caer por un hueco, Natha vuelve a empezar sobre el siguiente tejado. */
function respawn(state: State) {
  buildAhead(state);
  const x = state.scroll + PLAYER_X;
  const roof = state.roofs.find((one) => one.x + one.w - 40 > x) ?? state.roofs[state.roofs.length - 1];
  state.scroll = Math.max(state.scroll, roof.x + 14 - PLAYER_X);
  state.y = roof.top;
  state.vy = 0;
  state.grounded = true;
  state.rising = false;
  state.sunk = false;
  state.buffer = 0;
  buildAhead(state);
}

function wantsJump(input: Input) {
  return input.pressed.includes("fire") || input.pressed.includes("up") || input.taps.length > 0;
}
function holdsJump(input: Input) {
  return input.held.has("fire") || input.held.has("up") || input.touches.length > 0;
}

export function stepRoofs(state: State, rawDt: number, input: Input, out: Out) {
  if (state.over) return;
  const dt = Math.max(0, Math.min(0.05, rawDt || 0));
  state.time += dt;
  state.bannerTime = Math.max(0, state.bannerTime - dt);
  state.safe = Math.max(0, state.safe - dt);
  state.speed = Math.min(TOP_SPEED, START_SPEED + state.time * SPEED_GAIN);

  const level = 1 + Math.floor(state.time / LEVEL_TIME);
  if (level !== state.level) {
    state.level = level;
    state.banner = `NIVEL ${level}`;
    state.bannerTime = 1.6;
    out.sound("level");
    out.say(`Nivel ${level}`);
  }

  // Salto: se pide al apretar; si llega justo antes de tocar el tejado, se guarda un momento.
  if (wantsJump(input)) state.buffer = 0.12;
  const hold = holdsJump(input);
  if (state.buffer > 0 && (state.grounded || state.coyote > 0) && !state.sunk) {
    state.vy = -JUMP;
    state.grounded = false;
    state.rising = true;
    state.coyote = 0;
    state.buffer = 0;
    out.sound("move");
  }
  state.buffer = Math.max(0, state.buffer - dt);
  state.coyote = Math.max(0, state.coyote - dt);

  // Al soltar el botón el salto se corta: cae más rápido.
  if (!hold || state.vy >= 0) state.rising = false;
  if (!state.grounded) {
    state.vy = Math.min(400, state.vy + (state.rising ? RISE_HELD : FALL) * dt);
  }
  const before = state.y;
  state.y += state.vy * dt;
  state.scroll += state.speed * dt;
  state.dist += state.speed * dt;
  state.run += state.speed * dt;

  const roof = roofUnder(state);
  if (state.grounded) {
    if (!roof || roof.top !== state.y) {
      state.grounded = false;
      state.coyote = 0.08;
    }
  } else if (roof && !state.sunk && state.vy >= 0 && before <= roof.top + 1 && state.y >= roof.top) {
    state.y = roof.top;
    state.vy = 0;
    state.grounded = true;
  }
  if (!state.grounded && roof && state.y > roof.top + 2) state.sunk = true;

  if (state.y > HEIGHT + 12) {
    loseLife(state, out);
    if (state.over) return;
    respawn(state);
  }

  for (const thing of state.things) {
    if (thing.got) continue;
    if (thing.kind === "letter") {
      if (!touching(state, thing, -1)) continue;
      thing.got = true;
      state.bonus += 100;
      state.letters += 1;
      if (state.letters >= NAME.length) {
        state.letters = 0;
        state.lives = Math.min(MAX_LIVES, state.lives + 1);
        state.banner = NAME;
        state.bannerTime = 2;
        out.sound("letter");
        out.say(`${NAME} completo. Una vida más: ${state.lives}`);
        if (!state.secret) {
          state.secret = true;
          out.secret();
        }
      } else out.sound("clear");
    } else if (state.safe <= 0 && touching(state, thing, 1)) {
      loseLife(state, out);
      if (state.over) return;
    }
  }

  buildAhead(state);
}

/* ---------- Dibujos ---------- */

/** Natha corriendo de lado (10 × 10), con su bufanda turquesa al viento. */
const BODY = ["...kkkkk..", "..kbbbbbk.", "..kbbsesek", "ttkbbbbbk.", ".tkbbbbbk."];
export const RUNNER: readonly Sprite[] = [
  [...BODY, "..kbbbbkkk", "..kbbbbbk.", "..kbkkkbk.", ".kbk...kbk", ".kk.....kk"],
  [...BODY.slice(0, 3), "t.kbbbbbk.", "ttkbbbbbk.", "..kbbbbbkk", "..kbbbbbk.", "...kbbbk..", "...kbkbk..", "...kk.kk.."],
];
export const RUNNER_JUMP: Sprite = [...BODY.slice(0, 3), "t.kbbbbbkk", "ttkbbbbbk.", ".kkbbbbbk.", "kbbbbbbk..", "kkbbkkbk..", "..kk.kbk..", "......kk.."];

const POT: Sprite = ["..kkkk..", ".kggggk.", "kgglgggk", "kggpgglk", ".kkggkk.", "kkkkkkkk", "krrrrrrk", ".krrrrk.", ".kkkkkk."];
const POT_COLORS: Colors = { k: NIGHT, g: "#3f8f45", l: "#8fd16a", p: "#f58fbd", r: "#c4623a" };
const CRATE: Sprite = ["kkkkkkkk", "kwwwwwwk", "kwdwwdwk", "kwwddwwk", "kwdwwdwk", "kwwwwwwk", "kkkkkkkk"];
const CRATE_COLORS: Colors = { k: NIGHT, w: "#b9824a", d: "#6e4424" };

function drawThing(c: Ctx, thing: Thing, x: number, frame: number, bob: number) {
  const y = Math.round(thing.y);
  if (thing.kind === "pot") paintSprite(c, POT, POT_COLORS, x, y);
  else if (thing.kind === "crate") paintSprite(c, CRATE, CRATE_COLORS, x, y);
  else if (thing.kind === "crates") {
    paintSprite(c, CRATE, CRATE_COLORS, x, y);
    paintSprite(c, CRATE, CRATE_COLORS, x + 7, y);
  } else if (thing.kind === "stack") {
    paintSprite(c, CRATE, CRATE_COLORS, x, y);
    paintSprite(c, CRATE, CRATE_COLORS, x, y + 6);
  } else if (thing.kind === "lamp") {
    // Farol de papel sobre un poste de madera.
    rect(c, x + 2, y + 6, 2, 5, NIGHT);
    rect(c, x, y + 11, 6, 1, NIGHT);
    paintSprite(c, LANTERN, LANTERN_COLORS, x, y);
  } else if (thing.kind === "spirit") {
    paintSprite(c, SPIRIT[frame], SPIRIT_COLORS[thing.tint % 3], x, y + bob);
  }
}

/** Un tejado de tejas con su casa debajo: ventanas encendidas y vigas de madera. */
function drawHouse(c: Ctx, roof: Roof, x: number, world: number) {
  const look = lookOf(world);
  const { top, w } = roof;
  const body = top + 7;
  rect(c, x, body, w, HEIGHT - body, NIGHT);
  rect(c, x + 1, body, w - 2, HEIGHT - body, look.ground);
  // Vigas: postes en los bordes y una franja a media altura.
  c.globalAlpha = 0.55;
  rect(c, x + 2, body, 2, HEIGHT - body, look.grass);
  rect(c, x + w - 4, body, 2, HEIGHT - body, look.grass);
  rect(c, x + 2, body + 24, w - 4, 2, look.grass);
  c.globalAlpha = 1;
  // Ventanas: unas encendidas y otras no, siempre igual para la misma casa.
  let hash = roof.seed;
  for (let row = body + 8; row + 12 < HEIGHT; row += 30) {
    for (let col = x + 9; col + 8 < x + w - 6; col += 18) {
      hash = (hash * 1103515245 + 12345) >>> 0;
      const lit = (hash >>> 16) % 3 !== 0;
      rect(c, col - 1, row - 1, 9, 10, NIGHT);
      rect(c, col, row, 7, 8, lit ? look.light : look.wall);
      rect(c, col + 3, row, 1, 8, NIGHT);
      rect(c, col, row + 4, 7, 1, NIGHT);
    }
  }
  // Sombra bajo el alero.
  c.globalAlpha = 0.5;
  rect(c, x + 1, body, w - 2, 2, NIGHT);
  c.globalAlpha = 1;
  // Tejado: contorno oscuro, tejas del color del paisaje, brillo arriba y puntas levantadas.
  rect(c, x - 4, top, w + 8, 7, NIGHT);
  rect(c, x - 3, top + 1, w + 6, 5, look.wall);
  rect(c, x - 3, top + 1, w + 6, 1, look.edge);
  for (let seam = x - 1; seam < x + w + 2; seam += 5) rect(c, seam, top + 2, 1, 3, NIGHT);
  rect(c, x - 3, top + 5, w + 6, 1, NIGHT);
  rect(c, x - 6, top - 2, 3, 3, NIGHT);
  rect(c, x - 5, top - 1, 2, 2, look.edge);
  rect(c, x + w + 3, top - 2, 3, 3, NIGHT);
  rect(c, x + w + 3, top - 1, 2, 2, look.edge);
}

/** Una pagoda lejana, hecha de pisos que se van achicando. */
function drawPagoda(c: Ctx, x: number, base: number, color: string) {
  rect(c, x + 9, base - 46, 2, 8, color);
  for (let floor = 0; floor < 4; floor++) {
    const half = 12 - floor * 2;
    const y = base - 10 - floor * 9;
    rect(c, x + 10 - half - 2, y, half * 2 + 4, 2, color);
    rect(c, x + 10 - half + 2, y + 2, half * 2 - 4, 7 + (floor === 0 ? 1 : 0), color);
  }
}

/** Fondo lejano: estrellas, la luna y siluetas que se mueven más despacio que los tejados. */
function drawBackdrop(c: Ctx, state: State, world: number) {
  const look = lookOf(world);
  c.globalAlpha = 0.7;
  for (let i = 0; i < 18; i++) {
    const sx = Math.round((i * 37 + 11 - state.scroll * 0.02) % WIDTH + WIDTH) % WIDTH;
    rect(c, sx, 30 + ((i * 53) % 70), 1, 1, i % 4 === 0 ? look.light : INK);
  }
  c.globalAlpha = 1;
  // La luna, grande y quieta.
  const moonX = 92;
  const moonY = 34;
  for (const [dy, half] of [[0, 4], [1, 6], [2, 7], [3, 8], [5, 8], [7, 8], [9, 7], [10, 6], [11, 4]]) {
    rect(c, moonX - half, moonY + dy, half * 2, dy === 3 ? 2 : dy >= 3 && dy < 9 ? 2 : 1, MOON_COLORS.y);
  }
  rect(c, moonX - 3, moonY + 4, 2, 2, MOON_COLORS.d);
  rect(c, moonX + 2, moonY + 7, 3, 2, MOON_COLORS.d);
  paintSprite(c, MOON, MOON_COLORS, 12, 40);

  // Capa lejana: colinas y pagodas.
  c.globalAlpha = 0.35;
  const far = state.scroll * 0.12;
  for (let i = -1; i < 3; i++) {
    const x = Math.round(i * 90 - (far % 90));
    rect(c, x, 142, 90, HEIGHT - 142, look.wall);
    rect(c, x + 20, 136, 50, 6, look.wall);
    drawPagoda(c, x + 40, 136, look.wall);
  }
  // Capa del medio: casas apagadas más cerca.
  c.globalAlpha = 0.6;
  const mid = state.scroll * 0.35;
  for (let i = -1; i < 4; i++) {
    const x = Math.round(i * 46 - (mid % 46));
    const h = 22 + ((i + Math.floor(mid / 46)) * 7 & 15);
    rect(c, x + 2, 182 - h, 36, HEIGHT, look.wall);
    rect(c, x - 1, 182 - h - 3, 42, 3, look.wall);
  }
  c.globalAlpha = 1;
}

/** La letra que toca, en una placa dorada que flota. */
function drawLetter(c: Ctx, letter: string, x: number, y: number) {
  rect(c, x, y + 1, 11, 9, NIGHT);
  rect(c, x + 1, y, 9, 11, NIGHT);
  rect(c, x + 1, y + 1, 9, 9, GOLD);
  rect(c, x + 1, y + 9, 9, 1, "#d39a3c");
  write(c, letter, x + 6 - Math.ceil(widthOf(letter) / 2), y + 2, NIGHT);
}

export function drawRoofs(c: Ctx, state: State, time: number, still: boolean) {
  const world = (state.level - 1) % WORLDS;
  drawFrame(c, world);
  drawBackdrop(c, state, world);

  const frame = still ? 0 : Math.floor(time * 3) % 2;
  const bob = still ? 0 : Math.round(Math.sin(time * 4));
  const px = PLAYER_X - 5;
  const py = Math.round(state.y) - 10;
  const blink = state.safe > 0 && !still && Math.floor(time * 10) % 2 === 1;
  const sprite = !state.grounded ? RUNNER_JUMP : still ? RUNNER[0] : RUNNER[Math.floor(state.run / 7) % 2];
  // Con un dibujo propio de la protagonista (8 × 8) se usa ese, con un saltito al correr.
  const hero = (x: number, y: number) =>
    CUSTOM.heroSmall
      ? paintSprite(c, NINJA[0], NINJA_COLORS, x + 1, y + 2 - (state.grounded && !still && Math.floor(state.run / 7) % 2 ? 1 : 0))
      : paintSprite(c, sprite, NINJA_COLORS, x, y);
  // Si cae por un hueco, pasa por detrás de las casas.
  if (state.sunk && !blink) hero(px, py);

  for (const roof of state.roofs) {
    const x = Math.round(roof.x - state.scroll);
    if (x > WIDTH + 6 || x + roof.w < -6) continue;
    drawHouse(c, roof, x, world);
  }
  for (const thing of state.things) {
    if (thing.got) continue;
    const x = Math.round(thing.x - state.scroll);
    if (x > WIDTH || x + thing.w < 0) continue;
    if (thing.kind === "letter") drawLetter(c, NAME[state.letters], x, Math.round(thing.y) + bob);
    else drawThing(c, thing, x, frame, bob);
  }
  if (!state.sunk && !blink) hero(px, py);

  // Marcador: puntos, nivel, vidas y el nombre.
  rect(c, 1, 1, WIDTH - 2, 25, "rgba(6, 4, 14, 0.75)");
  drawTop(c, scoreOf(state), state.lives);
  drawName(c, 16, state.letters, 1, true, still ? 0 : time);
  write(c, `N${state.level}`, 5, 16, lookOf(world).light);

  if (state.bannerTime > 0 && !state.over) {
    const gold = state.banner === NAME;
    outlined(c, state.banner, Math.round((WIDTH - widthOf(state.banner, 2)) / 2), 62, gold ? GOLD : INK, 2);
  }
  if (state.over) {
    outlined(c, "FIN", Math.round((WIDTH - widthOf("FIN", 3)) / 2), 56, INK, 3);
    const text = `${scoreOf(state)} PUNTOS`;
    outlined(c, text, Math.round((WIDTH - widthOf(text)) / 2), 86, GOLD);
  }
}

export default defineGame<State>({
  help: "Natha corre sola por los tejados. Barra espaciadora, flecha arriba o un toque para saltar; mantener apretado salta más alto. Salta los huecos y las cajas, no saltes bajo los espíritus y junta las letras de su nombre.",
  create: (seed) => createRoofs(seed),
  pad: () => [[], [{ key: "fire", glyph: "↑", label: "Saltar", main: true }]],
  step: stepRoofs,
  draw: drawRoofs,
  status: (state) => ({
    score: scoreOf(state),
    lives: state.lives,
    level: state.level,
    letters: state.letters,
    world: (state.level - 1) % WORLDS,
    over: state.over,
  }),
});
