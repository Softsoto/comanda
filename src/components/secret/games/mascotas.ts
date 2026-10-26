/**
 * "Casa de Patitas": una casita donde viven gatitos y perritos que hay que
 * cuidar, como una mascota virtual.
 *
 * Cada mascota tiene cuatro barras (comida, alegría, limpieza y energía) que
 * bajan solas con el tiempo. Con los botones de abajo se le da de comer, se
 * juega con ella (pelota para los perritos, puntero de luz para los gatitos),
 * se baña, se acuesta a dormir, se acaricia o se le da medicina si se enfermó
 * por descuido. Cada cuidado da puntos de cariño: con ellos la mascota crece
 * (cachorro, joven, adulto) y gana accesorios, y la casa sube de nivel.
 *
 * La partida no termina sola: se sale con la pausa. Las mascotas nunca mueren;
 * si se descuidan se ponen tristes y un mensaje amable invita a cuidarlas.
 *
 * El estado se guarda en el navegador y, al volver, se cuenta el tiempo que
 * pasó (con un tope suave, para no encontrarlas muy mal).
 *
 * Al empezar, cada tres minutos y al subir de nivel aparece una tarjeta con
 * una fundación real que rescata animalitos.
 */

import { rect, type Colors, type Ctx, type Sprite } from "../art";
import { FOUNDATIONS, type Foundation } from "../../../lib/foundations";
import { glyphFor, normalizeText } from "../pixel-font";
import { worldName } from "../worlds";
import { DIM, GOLD, HEART, INK, LANTERN, LANTERN_COLORS, MOON, MOON_COLORS, NIGHT, STAR, STAR_COLORS, WIDTH, WORLDS, center, drawFrame, drawTop, lookOf, outlined, widthOf, write, type Look } from "./kit";
import { defineGame, roll, type Input, type Out, type Point } from "./types";

/* ---------- Medidas y reglas ---------- */

/** Dónde se guarda la casa en el navegador. */
export const SAVE_KEY = "dos-lunas:mascotas";
export const MAX_PETS = 4;
/** Cada cuánto (segundos de juego) vuelve la tarjeta de las fundaciones. */
export const CARD_EVERY = 180;
/** Con todas las barras desde aquí, la mascota está "feliz de verdad" (para el secreto). */
export const HAPPY_AT = 90;
/** Barra muy baja: si la comida o la limpieza se quedan aquí, la mascota se puede enfermar. */
export const LOW = 15;
/** Segundos seguidos de descuido que hacen falta para enfermarse. */
export const SICK_AFTER = 15;
/** Cuánto baja cada barra por segundo de juego. */
export const DECAY = { food: 0.2, fun: 0.16, clean: 0.11, energy: 0.13 } as const;
/** Lo que sube la energía por segundo mientras duerme. */
export const SLEEP_GAIN = 14;
/** Fuera del juego, las barras bajan mucho más despacio, como mucho por 8 horas y nunca por debajo de 30 por la ausencia. */
export const AWAY = { cap: 8 * 3600, rate: 0.1, floor: 30, rest: 0.02 } as const;

export const ROOM_TOP = 25;
export const FLOOR_Y = 96;
export const ROOM_BOTTOM = 144;
const PANEL_TOP = 146;

/** Los cuidados, en el orden de los botones (dos filas de cuatro). */
export const ACTIONS = ["comer", "jugar", "banar", "dormir", "mimar", "medicina", "adoptar", "ayuda"] as const;
export type Action = (typeof ACTIONS)[number];
export const ACTION_LABELS: Record<Action, string> = {
  comer: "ALIMENTAR",
  jugar: "JUGAR",
  banar: "BAÑAR",
  dormir: "DORMIR",
  mimar: "ACARICIAR",
  medicina: "MEDICINA",
  adoptar: "ADOPTAR",
  ayuda: "AYUDA A UN ANIMALITO",
};

/** Un botón del lienzo (28 × 20, bien grande para el dedo). */
export const buttonBox = (index: number) => ({ x: 4 + (index % 4) * 31, y: 180 + Math.floor(index / 4) * 22, w: 28, h: 20 });
/** La crucecita para salir de un juego antes de tiempo. */
export const EXIT_BOX = { x: 110, y: 28, w: 15, h: 15 } as const;

/** Lugar de cada mascota en el cuarto: dos adelante y dos más atrás, intercaladas. */
export const SLOTS = [
  { x: 12, feet: 140 },
  { x: 72, feet: 140 },
  { x: 40, feet: 117 },
  { x: 94, feet: 117 },
] as const;
const PET_SCALE = 2;

/** Puntos de experiencia para cada nivel de una mascota (después del último, uno cada 400). */
export const PET_XP = [0, 60, 150, 300, 500, 800] as const;
export const STAGES = ["CACHORRO", "JOVEN", "ADULTO"] as const;
export const ACCESSORIES = ["MOÑO", "COLLAR", "BUFANDA"] as const;

/** Nivel de una mascota según su experiencia. */
export function petLevelOf(xp: number): number {
  let level = 1;
  for (let i = 1; i < PET_XP.length; i++) if (xp >= PET_XP[i]) level = i + 1;
  const last = PET_XP[PET_XP.length - 1];
  if (xp >= last) level = PET_XP.length + Math.floor((xp - last) / 400);
  return level;
}
/** 0 cachorro (niveles 1–2), 1 joven (3–4), 2 adulto (5 en adelante). */
export const stageOf = (level: number) => (level >= 5 ? 2 : level >= 3 ? 1 : 0);
/** Cuántos accesorios tiene: moño en el nivel 2, collar en el 4, bufanda en el 6. */
export const accessoriesOf = (level: number) => (level >= 6 ? 3 : level >= 4 ? 2 : level >= 2 ? 1 : 0);
/** Nivel de la casa según los puntos de cariño: 300, 900, 1800, 3000… */
export function houseLevelOf(score: number): number {
  let level = 1;
  while (150 * (level + 1) * level <= score && level < 999) level++;
  return level;
}

/* ---------- Mascotas ---------- */

export type Kind = "gato" | "perro";
export type Bars = { food: number; fun: number; clean: number; energy: number };
export const BAR_KEYS = ["food", "fun", "clean", "energy"] as const;
type Doing = "" | "eat" | "sleep" | "pet" | "vet" | "joy" | "arrive";

export type Pet = Bars & {
  kind: Kind;
  name: string;
  coat: number;
  xp: number;
  level: number;
  sick: boolean;
  /** Segundos seguidos con mucha hambre o suciedad. */
  neglect: number;
  doing: Doing;
  /** Lo que le queda a la animación de ahora. */
  busy: number;
  /** Reloj para las migas, los corazones y las Z. */
  tick: number;
  /** Cuenta atrás hasta el próximo parpadeo (negativa mientras parpadea). */
  blink: number;
  /** Dónde le salen las manchas de barro. */
  seed: number;
};

export const NAMES = [
  "Michi", "Luna", "Canela", "Nube", "Copito", "Bigotes", "Pelusa", "Galleta", "Chispa", "Mota",
  "Maní", "Coco", "Bombón", "Arepa", "Panela", "Bolita", "Churro", "Lucero", "Osito", "Trufa",
] as const;

type Coat = { name: string; f: string; F: string; w: string; s: string; e?: string };
/** Pelajes de los gatitos. */
export const CAT_COATS: readonly Coat[] = [
  { name: "naranja", f: "#f2a65a", F: "#c8743a", w: "#fff1dc", s: "#d4803e" },
  { name: "gris", f: "#aab2cc", F: "#737b98", w: "#f1f3fb", s: "#8a92b0" },
  { name: "carbón", f: "#4f4a6a", F: "#34304a", w: "#e9e6f5", s: "#3e3a56", e: "#ffd95e" },
  { name: "crema", f: "#fbecd6", F: "#e0c29e", w: "#ffffff", s: "#f0d8b6" },
  { name: "siamés", f: "#f3e3c6", F: "#6e4b3a", w: "#fff8ec", s: "#d9bf98", e: "#4f8fe0" },
];
/** Pelajes de los perritos. */
export const DOG_COATS: readonly Coat[] = [
  { name: "café", f: "#b97a46", F: "#7d4a28", w: "#f7e2c4", s: "#8c5630" },
  { name: "dorado", f: "#ecbc62", F: "#b8822f", w: "#fff2d4", s: "#d49c44" },
  { name: "gris", f: "#a4aec6", F: "#4f5872", w: "#ffffff", s: "#4f5872", e: "#5fb0f0" },
  { name: "negro", f: "#5a5474", F: "#38334e", w: "#f2f0fb", s: "#f2f0fb", e: "#ffd95e" },
  { name: "crema", f: "#f4dfbc", F: "#c9a47a", w: "#fffaf0", s: "#e2c494" },
];
const coatsOf = (kind: Kind) => (kind === "gato" ? CAT_COATS : DOG_COATS);

/*
 * Los dibujos miran de frente, sentados: 12 × 14 más la cola (4 de ancho) a la derecha.
 * k contorno · f pelaje · F sombra y orejas · w pecho y hocico · s manchas o rayas
 * e ojo · h brillo del ojo · p rosado · c cachetes · n nariz · t lengua.
 * Las filas 0–7 son la cabeza (se mueve aparte al respirar y al comer) y la 8 es el cuello.
 */
export const CAT: Sprite = [
  ".k........k.",
  "kpk......kpk",
  "kppkkkkkkppk",
  "kfffsffsfffk",
  "kfheffffhefk",
  "kfeeffffeefk",
  "kcffwppwffck",
  ".kffkwwkffk.",
  "..kkffffkk..",
  ".kfffwwfffk.",
  ".kffwwwwffk.",
  "kfffwwwwfffk",
  "kffwwffwwffk",
  ".kkkkkkkkkk.",
];
export const DOG: Sprite = [
  "..kkkkkkkk..",
  ".kffffffffk.",
  "kFkffssffkFk",
  "kFfheffhefFk",
  "kFfeeffeefFk",
  "kFfcwwwwcfFk",
  "kFkwwnnwwkFk",
  ".kkfwwwwfkk.",
  "..kffffffk..",
  ".kfffwwfffk.",
  ".kffwwwwffk.",
  "kfffwwwwfffk",
  "kffwwffwwffk",
  ".kkkkkkkkkk.",
];
const HEAD_ROWS = 8;
const EYE_ROW: Record<Kind, number> = { gato: 4, perro: 3 };
const MOUTH_ROW = 7;
/** Colas: arriba, meneándose y caída (cuando está triste). Se pintan detrás, desde la columna 10. */
const TAILS: Record<Kind, readonly Sprite[]> = {
  gato: [
    ["...kk", "..kfk", "..ksk", ".kfk.", ".kfk.", ".ksk.", ".kfk.", "kfk..", "kk..."],
    ["kk...", "kfk..", "ksk..", ".kfk.", ".kfk.", ".ksk.", ".kfk.", "kfk..", "kk..."],
    [".....", ".....", ".....", ".....", ".....", ".....", "..kkk", "kfffk", "kkkk."],
  ],
  perro: [
    ["...kk", "..kfk", ".kfk.", "kfk..", "kk..."],
    [".....", "..kkk", "kffwk", "kkkk.", "....."],
    [".....", ".....", "kkk..", "kffk.", "kkkk."],
  ],
};
const PET_COLORS = { k: "#160d1e", p: "#f7a1bd", c: "#ff9db5", n: "#160d1e", t: "#ff6f8f", h: "#ffffff", d: "#6fd6ff", g: "#9ad66a", e: "#1b1030" } as const;

/** El dibujo de una mascota según su edad: los cachorros tienen el cuerpo más corto. */
export function petRows(pet: Pick<Pet, "kind" | "level">): string[] {
  const base = pet.kind === "gato" ? CAT : DOG;
  const stage = stageOf(pet.level);
  const drop = stage === 0 ? [9, 10, 11] : stage === 1 ? [10] : [];
  return base.filter((_, index) => !drop.includes(index));
}

/* ---------- Estado ---------- */

type Particle = { kind: "heart" | "crumb" | "bubble" | "drop" | "z" | "star"; x: number; y: number; vx: number; vy: number; life: number; color: string };
type Float = { text: string; x: number; y: number; life: number; color: string };

export const FETCH_THROWS = 5;
/** Lo que dura el vuelo de la pelota y la parte del vuelo en que se puede atrapar. */
export const FLY = 2;
export const CATCH_WINDOW = [0.86, 1] as const;
const FETCH_FEET = 140;
export type Fetch = {
  type: "fetch";
  phase: "ready" | "fly" | "miss" | "back";
  t: number;
  throwsLeft: number;
  caught: number;
  dogX: number;
  from: number;
  to: number;
  tried: boolean;
  jump: number;
  ball: Point;
};
export const LASER_TIME = 14;
export type Laser = { type: "laser"; t: number; dot: Point; cat: Point; hop: number; cool: number; pounces: number; got: number; sparkles: Point[] };
export const BATH_BUBBLES = 7;
export type Bath = { type: "bath"; phase: "scrub" | "rinse" | "shake"; t: number; start: number; bubbles: { x: number; y: number; r: number; popped: boolean }[] };
export type Activity = Fetch | Laser | Bath;

export type Card = { open: boolean; index: number; timer: number; announce: boolean; pending: boolean };

export type State = {
  random: number;
  time: number;
  score: number;
  level: number;
  pets: Pet[];
  selected: number;
  action: number;
  activity: Activity | null;
  particles: Particle[];
  floats: Float[];
  message: { text: string; life: number } | null;
  card: Card;
  secretDone: boolean;
  sadAll: boolean;
  saveTimer: number;
  dirty: boolean;
  /** Segundos que pasaron desde la última vez (si se recuperó una casa guardada). */
  away: number;
  over: false;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const pick = <T>(state: State, list: readonly T[]) => list[Math.floor(roll(state) * list.length) % list.length];

function newPet(state: State, kind: Kind): Pet {
  const used = new Set(state.pets.map((pet) => pet.name));
  const free = NAMES.filter((name) => !used.has(name));
  return {
    kind,
    name: pick(state, free.length ? free : NAMES),
    coat: Math.floor(roll(state) * coatsOf(kind).length),
    food: 70 + Math.floor(roll(state) * 15),
    fun: 70 + Math.floor(roll(state) * 15),
    clean: 75 + Math.floor(roll(state) * 15),
    energy: 75 + Math.floor(roll(state) * 15),
    xp: 0,
    level: 1,
    sick: false,
    neglect: 0,
    doing: "",
    busy: 0,
    tick: 0,
    blink: 1 + roll(state) * 3,
    seed: Math.floor(roll(state) * 1000),
  };
}

/** Una mascota está triste si está enferma o muy descuidada (nunca le pasa nada peor). */
export const isSad = (pet: Pet) => pet.sick || Math.min(pet.food, pet.fun, pet.clean, pet.energy) < 20 || (pet.food + pet.fun + pet.clean + pet.energy) / 4 < 35;
/** Todas sus barras muy altas. */
export const isHappy = (pet: Pet) => !pet.sick && BAR_KEYS.every((key) => pet[key] >= HAPPY_AT);

/* ---------- Guardado en el navegador ---------- */

type Saved = { v: 1; at: number; score: number; pets: Partial<Pet>[] };

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Guarda la casa (las mascotas y los puntos). Si el navegador no deja, no pasa nada. */
export function saveHouse(state: State) {
  try {
    const store = storage();
    if (!store) return;
    const pets = state.pets.map(({ kind, name, coat, food, fun, clean, energy, xp, sick, neglect, seed }) => ({ kind, name, coat, food, fun, clean, energy, xp, sick, neglect, seed }));
    const data: Saved = { v: 1, at: Date.now(), score: state.score, pets };
    store.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Sin espacio o sin permiso: se sigue jugando sin guardar.
  }
}

/** Lee la casa guardada, revisando cada dato (pudo quedar a medias o venir de otra versión). */
export function loadHouse(): Saved | null {
  try {
    const store = storage();
    const text = store?.getItem(SAVE_KEY);
    if (!text) return null;
    const data = JSON.parse(text) as Partial<Saved>;
    if (!data || !Array.isArray(data.pets) || data.pets.length === 0) return null;
    return { v: 1, at: Number(data.at) || 0, score: Number(data.score) || 0, pets: data.pets.slice(0, MAX_PETS) };
  } catch {
    return null;
  }
}

const bar = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? clamp(value, 0, 100) : fallback);

function restorePet(state: State, raw: Partial<Pet>): Pet {
  const kind: Kind = raw.kind === "perro" ? "perro" : "gato";
  const pet = newPet(state, kind);
  if (typeof raw.name === "string" && raw.name.trim()) pet.name = raw.name.trim().slice(0, 10);
  if (Number.isInteger(raw.coat)) pet.coat = clamp(raw.coat as number, 0, coatsOf(kind).length - 1);
  for (const key of BAR_KEYS) pet[key] = bar(raw[key], pet[key]);
  pet.xp = clamp(Math.floor(Number(raw.xp) || 0), 0, 999_999);
  pet.level = petLevelOf(pet.xp);
  pet.sick = raw.sick === true;
  pet.neglect = clamp(Number(raw.neglect) || 0, 0, SICK_AFTER);
  if (Number.isInteger(raw.seed)) pet.seed = raw.seed as number;
  return pet;
}

/**
 * Lo que pasó mientras no se jugaba: las barras bajan despacio, pero la ausencia
 * sola no las deja por debajo de `AWAY.floor` (y la energía sube: durmieron).
 */
export function applyAway(pet: Pet, seconds: number) {
  const time = clamp(seconds, 0, AWAY.cap);
  for (const key of ["food", "fun", "clean"] as const) {
    const before = pet[key];
    pet[key] = Math.max(before - DECAY[key] * AWAY.rate * time, Math.min(before, AWAY.floor));
  }
  pet.energy = Math.min(100, pet.energy + time * AWAY.rest);
}

/* ---------- Fundaciones ---------- */

/** El texto, con solo los signos que las letras de píxeles saben dibujar. */
export function printable(text: string): string {
  return [...normalizeText(text)]
    .map((char) => {
      if (glyphFor(char)) return char;
      const plain = char.normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (plain && [...plain].every((part) => glyphFor(part))) return plain;
      return char === "&" ? "Y" : " ";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parte un texto en renglones de hasta `max` píxeles (las palabras muy largas, letra por letra). */
export function wrapText(text: string, max: number): string[] {
  const pieces: string[] = [];
  for (const word of printable(text).split(" ").filter(Boolean)) {
    if (widthOf(word) <= max) {
      pieces.push(word);
      continue;
    }
    let part = "";
    for (const char of word) {
      if (part && widthOf(part + char) > max) {
        pieces.push(part);
        part = char;
      } else part += char;
    }
    if (part) pieces.push(part);
  }
  const lines: string[] = [];
  let line = "";
  for (const piece of pieces) {
    const next = line ? `${line} ${piece}` : piece;
    if (line && widthOf(next) > max) {
      lines.push(line);
      line = piece;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** La fundación que toca mostrar (la lista se lee cada vez: el administrador la puede cambiar). */
export function foundationOf(state: State): Foundation {
  const list = FOUNDATIONS.length ? FOUNDATIONS : [{ name: "Adopta, no compres", place: "", contact: "" }];
  return list[((state.card.index % list.length) + list.length) % list.length];
}

export const CARD_TITLE = "AYUDA A UN ANIMALITO";
export const CARD_TEXT = "Ellos sí existen y necesitan un hogar";

function openCard(state: State, next: boolean) {
  if (next) state.card.index++;
  state.card.open = true;
  state.card.timer = 0;
  state.card.announce = true;
  state.card.pending = false;
}

function announceCard(state: State, out: Out) {
  const place = foundationOf(state);
  const parts = [place.name, place.place, place.contact].filter(Boolean).join(", ");
  out.say(`Ayuda a un animalito. ${CARD_TEXT}. ${parts}.`);
  out.sound("clear");
  state.card.announce = false;
}

/* ---------- Avisos ---------- */

function tell(state: State, text: string) {
  state.message = { text, life: 1.8 };
}

function float(state: State, text: string, x: number, y: number, color = GOLD) {
  state.floats.push({ text: printable(text), x, y, life: 1.2, color });
  if (state.floats.length > 8) state.floats.shift();
}

function burst(state: State, kind: Particle["kind"], x: number, y: number, count: number, color = "") {
  for (let i = 0; i < count; i++) {
    const angle = roll(state) * Math.PI * 2;
    const speed = 10 + roll(state) * 25;
    state.particles.push({ kind, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (kind === "crumb" ? 20 : 15), life: 0.6 + roll(state) * 0.6, color });
  }
  if (state.particles.length > 90) state.particles.splice(0, state.particles.length - 90);
}

/** Dónde está dibujada una mascota en el cuarto (esquina de arriba a la izquierda, pies y medidas). */
export function petBox(state: State, index: number) {
  const pet = state.pets[index];
  const slot = SLOTS[index];
  const height = petRows(pet).length * PET_SCALE;
  let x: number = slot.x;
  if (pet.doing === "arrive") x = Math.round(4 + (slot.x - 4) * (1 - pet.busy / 1.4));
  return { x, y: slot.feet - height, w: 12 * PET_SCALE, h: height, feet: slot.feet };
}

/** Puntos de cariño: para la casa y para la mascota que los ganó. */
function reward(state: State, pet: Pet, amount: number, out: Out) {
  if (amount <= 0) return;
  state.score = Math.min(999_999, state.score + Math.round(amount));
  pet.xp = Math.min(999_999, pet.xp + Math.round(amount));
  state.dirty = true;
  const level = petLevelOf(pet.xp);
  if (level > pet.level) {
    const stageBefore = stageOf(pet.level);
    const gearBefore = accessoriesOf(pet.level);
    pet.level = level;
    const index = state.pets.indexOf(pet);
    const box = index >= 0 ? petBox(state, index) : { x: 52, y: 100 };
    out.sound("clear2");
    let news = `${pet.name} subió al nivel ${level}.`;
    if (stageOf(level) > stageBefore) {
      news += ` ¡Ya es ${STAGES[stageOf(level)].toLowerCase()}!`;
      float(state, `¡YA ES ${STAGES[stageOf(level)]}!`, box.x + 12, box.y - 8);
    } else if (accessoriesOf(level) > gearBefore) {
      const gear = ACCESSORIES[accessoriesOf(level) - 1];
      news += ` Ganó ${gear === "BUFANDA" ? "una" : "un"} ${gear.toLowerCase()}.`;
      float(state, `¡${gear} NUEVO!`.replace("BUFANDA NUEVO", "BUFANDA NUEVA"), box.x + 12, box.y - 8);
    } else float(state, `¡NIVEL ${level}!`, box.x + 12, box.y - 8);
    burst(state, "star", box.x + 12, box.y + 6, 8);
    out.say(news);
  }
  const house = houseLevelOf(state.score);
  if (house > state.level) {
    state.level = house;
    out.sound("level");
    out.say(`¡La casa subió al nivel ${house}! Ahora se ve ${worldName((house - 1) % WORLDS).toLowerCase()}.`);
    tell(state, `¡CASA NIVEL ${house}!`);
    state.card.pending = true;
  }
}

/* ---------- Crear ---------- */

/** Con `keep` en false no se lee ni se guarda nada en el navegador (para las miniaturas del menú). */
export function createHouse(seed: number, keep = true): State {
  const state: State = {
    random: seed >>> 0,
    time: 0,
    score: 0,
    level: 1,
    pets: [],
    selected: 0,
    action: 0,
    activity: null,
    particles: [],
    floats: [],
    message: null,
    card: { open: false, index: 0, timer: 0, announce: false, pending: false },
    secretDone: false,
    sadAll: false,
    saveTimer: 0,
    dirty: false,
    away: 0,
    over: false,
  };
  const saved = keep ? loadHouse() : null;
  if (saved) {
    for (const raw of saved.pets) state.pets.push(restorePet(state, raw));
    state.score = clamp(Math.floor(saved.score), 0, 999_999);
    state.level = houseLevelOf(state.score);
    let now = 0;
    try {
      now = Date.now();
    } catch {
      now = saved.at;
    }
    state.away = Math.max(0, (now - saved.at) / 1000);
    for (const pet of state.pets) applyAway(pet, state.away);
  } else {
    // Llegan un gatito y un perrito.
    state.pets.push(newPet(state, "gato"));
    state.pets.push(newPet(state, "perro"));
  }
  state.card.index = Math.floor(roll(state) * Math.max(1, FOUNDATIONS.length));
  openCard(state, false);
  return state;
}

/* ---------- Cuidados ---------- */

function startActivity(state: State, pet: Pet, out: Out) {
  if (pet.kind === "perro") {
    state.activity = { type: "fetch", phase: "ready", t: 0, throwsLeft: FETCH_THROWS, caught: 0, dogX: 64, from: 64, to: 64, tried: false, jump: 0, ball: { x: 64, y: 126 } };
  } else {
    state.activity = {
      type: "laser",
      t: 0,
      dot: { x: 64, y: 70 },
      cat: { x: 64, y: 140 },
      hop: 0,
      cool: 0,
      pounces: 0,
      got: 0,
      sparkles: [0, 1, 2].map(() => sparkleSpot(state, { x: 64, y: 70 })),
    };
  }
  out.sound("rotate");
  out.say(pet.kind === "perro" ? `A jugar a la pelota con ${pet.name}: toca para lanzarla y toca otra vez cuando baje para atraparla.` : `A jugar con el puntero de luz: muévelo con el dedo o las flechas y ${pet.name} lo perseguirá. Pasa por las estrellas.`);
}

function sparkleSpot(state: State, avoid: Point): Point {
  let spot = { x: 64, y: 60 };
  for (let tries = 0; tries < 8; tries++) {
    spot = { x: 14 + Math.floor(roll(state) * 100), y: 40 + Math.floor(roll(state) * 92) };
    if (Math.hypot(spot.x - avoid.x, spot.y - avoid.y) > 30) break;
  }
  return spot;
}

function startBath(state: State, pet: Pet, out: Out) {
  const bubbles: Bath["bubbles"] = [];
  for (let tries = 0; bubbles.length < BATH_BUBBLES && tries < 200; tries++) {
    const spot = { x: 30 + Math.floor(roll(state) * 68), y: 62 + Math.floor(roll(state) * 56), r: 6 + Math.floor(roll(state) * 2), popped: false };
    // Que no tapen la carita: la espuma va alrededor y en el cuerpo.
    if (Math.abs(spot.x - 64) < 18 && spot.y > 88 && spot.y < 118) continue;
    if (bubbles.every((b) => Math.hypot(b.x - spot.x, b.y - spot.y) >= 14)) bubbles.push(spot);
  }
  while (bubbles.length < BATH_BUBBLES) bubbles.push({ x: 24 + bubbles.length * 13, y: 68, r: 6, popped: false });
  state.activity = { type: "bath", phase: "scrub", t: 0, start: pet.clean, bubbles };
  out.sound("drop");
  out.say(`Hora del baño de ${pet.name}: toca o frota la espuma.`);
}

/** Hace el cuidado número `index` con la mascota elegida. */
export function doAction(state: State, index: number, out: Out) {
  const action = ACTIONS[index];
  const pet = state.pets[state.selected];
  if (!pet) return;
  const box = petBox(state, state.selected);
  const head = { x: box.x + 12, y: box.y + 4 };
  if (action === "ayuda") {
    openCard(state, true);
    return;
  }
  if (action === "adoptar") {
    if (state.pets.length >= MAX_PETS) {
      tell(state, "LA CASA ESTÁ LLENA");
      out.sound("move");
      return;
    }
    const cats = state.pets.filter((p) => p.kind === "gato").length;
    const dogs = state.pets.length - cats;
    const kind: Kind = cats < dogs ? "gato" : dogs < cats ? "perro" : roll(state) < 0.5 ? "gato" : "perro";
    const friend = newPet(state, kind);
    friend.doing = "arrive";
    friend.busy = 1.4;
    state.pets.push(friend);
    state.selected = state.pets.length - 1;
    state.dirty = true;
    out.sound("level");
    out.say(`Llegó ${friend.name}, ${kind === "gato" ? "un gatito" : "un perrito"}. ¡Bienvenido a casa!`);
    tell(state, `¡LLEGÓ ${printable(friend.name)}!`);
    return;
  }
  if (pet.doing === "sleep") {
    if (action === "dormir" || action === "medicina") {
      pet.doing = "";
      out.sound("move");
      if (action === "dormir") {
        tell(state, "¡BUENOS DÍAS!");
        return;
      }
    } else {
      tell(state, "ESTÁ DURMIENDO");
      return;
    }
  }
  if (pet.busy > 0 && pet.doing !== "joy" && pet.doing !== "pet" && action !== "mimar") {
    tell(state, "ESPERA UN POQUITO");
    return;
  }
  switch (action) {
    case "comer": {
      if (pet.food >= 95) {
        tell(state, "NO TIENE HAMBRE");
        return;
      }
      const gain = Math.min(40, 100 - pet.food);
      pet.food += gain;
      pet.doing = "eat";
      pet.busy = 1.6;
      pet.tick = 0;
      out.sound("drop");
      float(state, "¡QUÉ RICO!", head.x, box.y - 16);
      reward(state, pet, 5 + Math.round(gain / 4), out);
      return;
    }
    case "jugar": {
      if (pet.sick) {
        tell(state, "NECESITA MEDICINA");
        return;
      }
      if (pet.energy < 15) {
        tell(state, "ESTÁ CANSADITO");
        return;
      }
      startActivity(state, pet, out);
      return;
    }
    case "banar": {
      if (pet.clean >= 95) {
        tell(state, "YA ESTÁ LIMPIO");
        return;
      }
      startBath(state, pet, out);
      return;
    }
    case "dormir": {
      if (pet.energy >= 90) {
        tell(state, "NO TIENE SUEÑO");
        return;
      }
      pet.doing = "sleep";
      pet.busy = 0;
      pet.tick = 0;
      out.sound("move");
      out.say(`${pet.name} se acurrucó a dormir.`);
      return;
    }
    case "mimar": {
      const gain = Math.min(8, 100 - pet.fun);
      pet.fun += gain;
      pet.doing = "pet";
      pet.busy = 0.7;
      burst(state, "heart", head.x, head.y, 3);
      out.sound("move");
      if (gain > 0) reward(state, pet, 2 + Math.round(gain / 4), out);
      return;
    }
    case "medicina": {
      if (!pet.sick) {
        tell(state, "ESTÁ SANO");
        return;
      }
      pet.sick = false;
      pet.neglect = 0;
      pet.fun = Math.min(100, pet.fun + 5);
      pet.doing = "vet";
      pet.busy = 1.6;
      out.sound("clear2");
      out.say(`${pet.name} tomó su medicina y ya está sano.`);
      float(state, "¡SANO!", head.x, box.y - 6, "#9ef0a8");
      burst(state, "star", head.x, head.y, 6);
      reward(state, pet, 20, out);
      return;
    }
  }
}

function finishActivity(state: State, out: Out, text: string) {
  const pet = state.pets[state.selected];
  state.activity = null;
  if (pet) {
    pet.doing = "joy";
    pet.busy = 1;
  }
  tell(state, text);
  out.sound("clear2");
  state.dirty = true;
}

/* ---------- Juegos cortos ---------- */

export function ballOf(fetch: Fetch): Point {
  const p = clamp(fetch.t / FLY, 0, 1);
  const startY = FETCH_FEET - 16;
  const endY = FETCH_FEET - 3;
  return { x: fetch.from + (fetch.to - fetch.from) * p, y: startY + (endY - startY) * p - 84 * 4 * p * (1 - p) };
}

function stepFetch(state: State, fetch: Fetch, pet: Pet, dt: number, act: boolean, out: Out) {
  fetch.t += dt;
  fetch.jump = Math.max(0, fetch.jump - dt);
  if (fetch.phase === "ready") {
    fetch.ball = { x: fetch.dogX, y: FETCH_FEET - 16 };
    if (act || fetch.t > 3) {
      fetch.phase = "fly";
      fetch.t = 0;
      fetch.from = fetch.dogX;
      let to = fetch.dogX;
      for (let tries = 0; tries < 10 && Math.abs(to - fetch.dogX) < 26; tries++) to = 18 + Math.floor(roll(state) * 92);
      fetch.to = to;
      fetch.tried = false;
      out.sound("rotate");
    }
    return;
  }
  if (fetch.phase === "fly") {
    const p = fetch.t / FLY;
    // El perrito corre hacia donde va a caer la pelota.
    const speed = Math.max(40, Math.abs(fetch.to - fetch.from) / (0.7 * FLY));
    fetch.dogX += clamp(fetch.to - fetch.dogX, -speed * dt, speed * dt);
    fetch.ball = ballOf(fetch);
    if (act && !fetch.tried) {
      fetch.tried = true;
      fetch.jump = 0.4;
      out.sound("move");
      if (p >= CATCH_WINDOW[0] && p <= CATCH_WINDOW[1]) {
        fetch.caught++;
        fetch.phase = "back";
        fetch.t = 0;
        pet.fun = Math.min(100, pet.fun + 7);
        pet.energy = Math.max(0, pet.energy - 3);
        pet.food = Math.max(0, pet.food - 1);
        float(state, "¡ATRAPADA!", fetch.dogX, 70);
        out.sound("clear");
        burst(state, "star", fetch.dogX, FETCH_FEET - 24, 5);
        reward(state, pet, 12, out);
        return;
      }
    }
    if (p > 1) {
      fetch.phase = "miss";
      fetch.t = 0;
      float(state, "¡UY! CASI", fetch.to, 80, INK);
      out.sound("drop");
    }
    return;
  }
  if (fetch.phase === "miss") {
    const roll2 = Math.min(fetch.t, 0.7) / 0.7;
    const dir = fetch.to >= 64 ? -1 : 1;
    fetch.ball = { x: fetch.to + dir * 16 * roll2, y: FETCH_FEET - 3 - Math.abs(Math.sin(fetch.t * 9)) * 9 * (1 - roll2) };
    fetch.dogX += clamp(fetch.ball.x - fetch.dogX, -60 * dt, 60 * dt);
    if (fetch.t >= 0.8) {
      fetch.phase = "back";
      fetch.t = 0;
      pet.fun = Math.min(100, pet.fun + 3);
      pet.energy = Math.max(0, pet.energy - 2);
      reward(state, pet, 3, out);
    }
    return;
  }
  // De vuelta con la pelota en la boca.
  fetch.dogX += clamp(64 - fetch.dogX, -55 * dt, 55 * dt);
  if (Math.abs(64 - fetch.dogX) < 1 && fetch.t > 0.5) {
    fetch.throwsLeft--;
    if (fetch.throwsLeft <= 0) {
      reward(state, pet, fetch.caught * 5, out);
      out.say(`${pet.name} atrapó ${fetch.caught} de ${FETCH_THROWS} pelotas.`);
      finishActivity(state, out, `¡${fetch.caught} DE ${FETCH_THROWS}!`);
      return;
    }
    fetch.phase = "ready";
    fetch.t = 0;
  }
}

function stepLaser(state: State, laser: Laser, pet: Pet, dt: number, input: Input, out: Out) {
  laser.t += dt;
  laser.cool = Math.max(0, laser.cool - dt);
  laser.hop = Math.max(0, laser.hop - dt);
  const { held } = input;
  const speed = 80;
  laser.dot.x += ((held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0)) * speed * dt;
  laser.dot.y += ((held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0)) * speed * dt;
  const finger = input.touches[0] ?? input.taps[input.taps.length - 1];
  if (finger) laser.dot = { x: finger.x, y: finger.y };
  laser.dot.x = clamp(laser.dot.x, 6, 121);
  laser.dot.y = clamp(laser.dot.y, ROOM_TOP + 6, ROOM_BOTTOM - 2);
  // El gatito va más lento que la luz: así se puede llevarlo de paseo.
  const target = { x: clamp(laser.dot.x, 14, 114), y: clamp(laser.dot.y + 12, 108, 140) };
  const step = (laser.hop > 0 ? 70 : 46) * dt;
  const dx = target.x - laser.cat.x;
  const dy = target.y - laser.cat.y;
  const far = Math.hypot(dx, dy);
  if (far > 0.5) {
    laser.cat.x += (dx / far) * Math.min(step, far);
    laser.cat.y += (dy / far) * Math.min(step, far);
  }
  if (laser.cool <= 0 && Math.hypot(laser.cat.x - laser.dot.x, laser.cat.y - 12 - laser.dot.y) < 12) {
    laser.cool = 1;
    laser.hop = 0.45;
    laser.pounces++;
    pet.fun = Math.min(100, pet.fun + 4);
    pet.energy = Math.max(0, pet.energy - 1);
    float(state, "¡ZAS!", laser.cat.x, laser.cat.y - 34);
    out.sound("move");
    reward(state, pet, 4, out);
  }
  laser.sparkles.forEach((spark, index) => {
    if (Math.hypot(spark.x - laser.dot.x, spark.y - laser.dot.y) < 10) {
      laser.got++;
      pet.fun = Math.min(100, pet.fun + 2);
      burst(state, "star", spark.x, spark.y, 5);
      out.sound("clear");
      reward(state, pet, 6, out);
      laser.sparkles[index] = sparkleSpot(state, laser.dot);
    }
  });
  if (laser.t >= LASER_TIME) {
    out.say(`${pet.name} saltó ${laser.pounces} veces y juntaste ${laser.got} ${laser.got === 1 ? "estrella" : "estrellas"}.`);
    finishActivity(state, out, `¡${laser.pounces} SALTOS!`);
  }
}

function stepBath(state: State, bath: Bath, pet: Pet, dt: number, input: Input, act: boolean, out: Out) {
  bath.t += dt;
  if (bath.phase === "scrub") {
    const fingers = [...input.taps, ...input.touches];
    const pop = (bubble: Bath["bubbles"][number]) => {
      bubble.popped = true;
      pet.clean = Math.min(100, pet.clean + (100 - bath.start) / BATH_BUBBLES);
      burst(state, "bubble", bubble.x, bubble.y, 4);
      out.sound("move");
      reward(state, pet, 2, out);
    };
    for (const bubble of bath.bubbles) {
      if (!bubble.popped && fingers.some((f) => Math.hypot(f.x - bubble.x, f.y - bubble.y) <= bubble.r + 4)) pop(bubble);
    }
    if (act) {
      const next = bath.bubbles.find((bubble) => !bubble.popped);
      if (next) pop(next);
    }
    if (bath.bubbles.every((bubble) => bubble.popped)) {
      bath.phase = "rinse";
      bath.t = 0;
      out.sound("drop");
    }
    return;
  }
  if (bath.phase === "rinse") {
    if (bath.t >= 1.2) {
      bath.phase = "shake";
      bath.t = 0;
      out.sound("rotate");
      burst(state, "drop", 64, 112, 10);
    }
    return;
  }
  if (bath.t >= 0.9) {
    pet.clean = 100;
    reward(state, pet, 8, out);
    out.say(`${pet.name} quedó limpio y brillante.`);
    finishActivity(state, out, "¡BRILLA DE LIMPIO!");
  }
}

/* ---------- Paso del juego ---------- */

const inBox = (point: Point, box: { x: number; y: number; w: number; h: number }) => point.x >= box.x && point.x < box.x + box.w && point.y >= box.y && point.y < box.y + box.h;

function stepPets(state: State, dt: number, out: Out) {
  state.pets.forEach((pet, index) => {
    const sleeping = pet.doing === "sleep";
    pet.food = Math.max(0, pet.food - DECAY.food * dt * (sleeping ? 0.5 : 1));
    pet.fun = Math.max(0, pet.fun - DECAY.fun * dt * (pet.sick ? 1.8 : 1) * (sleeping ? 0.3 : 1));
    pet.clean = Math.max(0, pet.clean - DECAY.clean * dt);
    if (sleeping) pet.energy = Math.min(100, pet.energy + SLEEP_GAIN * dt);
    else pet.energy = Math.max(0, pet.energy - DECAY.energy * dt * (pet.sick ? 1.5 : 1));

    // Mucha hambre o mucha suciedad por un rato: se enferma (se cura con medicina).
    if (!pet.sick && (pet.food < LOW || pet.clean < LOW)) {
      pet.neglect += dt;
      if (pet.neglect >= SICK_AFTER) {
        pet.sick = true;
        pet.neglect = 0;
        state.dirty = true;
        out.sound("lock");
        out.say(`${pet.name} se enfermó. Dale medicina y cuídalo un poquito más.`);
        tell(state, `${printable(pet.name)} ESTÁ ENFERMO`);
      }
    } else pet.neglect = Math.max(0, pet.neglect - dt);

    const box = petBox(state, index);
    pet.tick += dt;
    if (sleeping) {
      if (pet.tick >= 0.9) {
        pet.tick = 0;
        state.particles.push({ kind: "z", x: box.x + 20, y: box.y + 6, vx: 6, vy: -9, life: 1.6, color: INK });
      }
      if (pet.energy >= 100) {
        pet.doing = "joy";
        pet.busy = 0.8;
        float(state, "¡DESCANSÓ!", box.x + 12, box.y - 6);
        out.sound("clear");
        reward(state, pet, 5, out);
      }
    } else if (pet.busy > 0) {
      pet.busy -= dt;
      if (pet.doing === "eat" && pet.tick >= 0.22) {
        pet.tick = 0;
        burst(state, "crumb", box.x + 24, box.feet - 6, 2, pet.kind === "gato" ? "#9fd0e8" : "#a8692e");
      }
      if (pet.doing === "pet" && pet.tick >= 0.3) {
        pet.tick = 0;
        burst(state, "heart", box.x + 12, box.y + 2, 1);
      }
      if (pet.busy <= 0) {
        pet.busy = 0;
        pet.doing = "";
      }
    } else if (pet.fun >= 85 && !pet.sick && roll(state) < dt * 0.1) {
      pet.doing = "joy";
      pet.busy = 0.6;
    }
    pet.blink -= dt;
    if (pet.blink < -0.15) pet.blink = 2 + roll(state) * 3;
  });
}

function stepHouse(state: State, dt: number, input: Input, out: Out) {
  const n = state.pets.length;
  const fire = input.pressed.includes("fire");
  for (const key of input.pressed) {
    if (key === "left" || key === "right") {
      state.selected = (state.selected + (key === "left" ? n - 1 : 1)) % n;
      out.sound("move");
      out.say(`${state.pets[state.selected].name}.`);
    } else if (key === "up" || key === "down") {
      state.action = (state.action + (key === "up" ? ACTIONS.length - 1 : 1)) % ACTIONS.length;
      out.sound("move");
      out.say(`${ACTION_LABELS[ACTIONS[state.action]].toLowerCase()}.`);
    }
  }
  for (const swipe of input.swipes) {
    if (swipe === "left" || swipe === "right") state.selected = (state.selected + (swipe === "left" ? n - 1 : 1)) % n;
  }
  if (fire) doAction(state, state.action, out);
  for (const tap of input.taps) {
    if (state.card.open || state.activity) break;
    const button = ACTIONS.findIndex((_, index) => inBox(tap, buttonBox(index)));
    if (button >= 0) {
      state.action = button;
      doAction(state, button, out);
      continue;
    }
    // Primero las de adelante (se pintan encima).
    const order = [0, 1, 2, 3].filter((index) => index < n).sort((a, b) => SLOTS[b].feet - SLOTS[a].feet);
    for (const index of order) {
      const box = petBox(state, index);
      if (inBox(tap, { x: box.x - 2, y: box.y - 2, w: box.w + 4, h: box.h + 4 })) {
        if (index === state.selected) doAction(state, ACTIONS.indexOf("mimar"), out);
        else {
          state.selected = index;
          out.sound("move");
          out.say(`${state.pets[index].name}.`);
        }
        break;
      }
    }
  }
  void dt;
}

function stepActivity(state: State, activity: Activity, dt: number, input: Input, out: Out) {
  const pet = state.pets[state.selected];
  if (input.taps.some((tap) => inBox(tap, EXIT_BOX))) {
    finishActivity(state, out, "¡GRACIAS!");
    return;
  }
  const act = input.pressed.includes("fire") || input.taps.some((tap) => tap.y >= ROOM_TOP && tap.y < PANEL_TOP);
  if (activity.type === "fetch") stepFetch(state, activity, pet, dt, act, out);
  else if (activity.type === "laser") stepLaser(state, activity, pet, dt, input, out);
  else stepBath(state, activity, pet, dt, input, input.pressed.includes("fire"), out);
}

export function stepGame(state: State, dt: number, input: Input, out: Out) {
  dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);
  state.time += dt;
  if (state.card.announce) announceCard(state, out);
  if (state.message) {
    state.message.life -= dt;
    if (state.message.life <= 0) state.message = null;
  }
  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.kind === "crumb" || p.kind === "drop" ? 90 : p.kind === "heart" || p.kind === "z" || p.kind === "bubble" ? -8 : 20) * dt;
    p.life -= dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0 && p.y > ROOM_TOP - 4 && p.y < PANEL_TOP);
  for (const f of state.floats) {
    f.y -= 10 * dt;
    f.life -= dt;
  }
  state.floats = state.floats.filter((f) => f.life > 0);

  if (state.card.open) {
    // La tarjeta se cierra tocando en cualquier parte o con fuego; mientras, las mascotas esperan.
    if (input.taps.length > 0 || input.pressed.includes("fire")) {
      state.card.open = false;
      state.card.timer = 0;
      out.sound("move");
    }
    return;
  }

  stepPets(state, dt, out);
  if (state.activity) stepActivity(state, state.activity, dt, input, out);
  else stepHouse(state, dt, input, out);

  // Todas tristes: un aviso amable (una sola vez cada vez que pasa).
  const sadAll = state.pets.every(isSad);
  if (sadAll && !state.sadAll) {
    out.say("Tus patitas te extrañan mucho. ¡Dales cariño!");
    out.sound("drop");
  }
  state.sadAll = sadAll;

  if (!state.secretDone && state.pets.some((pet) => pet.kind === "gato" && isHappy(pet)) && state.pets.some((pet) => pet.kind === "perro" && isHappy(pet))) {
    state.secretDone = true;
    out.sound("letter");
    out.say("¡Un gatito y un perrito están felices de verdad!");
    out.secret();
  }

  if (!state.activity) {
    state.card.timer += dt;
    if (state.card.pending || state.card.timer >= CARD_EVERY) openCard(state, true);
  }

  state.saveTimer += dt;
  if ((state.dirty && state.saveTimer >= 1) || state.saveTimer >= 10) {
    saveHouse(state);
    state.saveTimer = 0;
    state.dirty = false;
  }
}

/* ---------- Dibujo ---------- */

/** Pinta un dibujo agrandado, juntando los píxeles seguidos del mismo color en un solo rectángulo. */
function paint(c: Ctx, rows: readonly string[], colors: Colors, x: number, y: number, s: number, from = 0, to = rows.length, dy = 0) {
  for (let row = from; row < to; row++) {
    const line = rows[row];
    let column = 0;
    while (column < line.length) {
      const char = line[column];
      const color = colors[char];
      if (!color) {
        column++;
        continue;
      }
      let end = column + 1;
      while (end < line.length && line[end] === char) end++;
      c.fillStyle = color;
      c.fillRect(x + column * s, y + row * s + dy, (end - column) * s, s);
      column = end;
    }
  }
}

const replaceAt = (line: string, index: number, char: string) => (index >= 0 && index < line.length ? line.slice(0, index) + char + line.slice(index + 1) : line);

type Face = "open" | "closed" | "happy";
type Pose = { face: Face; tongue: boolean; tear: boolean; headDy: number; tail: number; dy: number; dx: number; sleep: boolean };

/** Cómo se ve la mascota en este momento (ojos, cola, saltos…). */
function poseOf(pet: Pet, time: number, still: boolean, phase: number): Pose {
  const sad = isSad(pet);
  const pose: Pose = { face: "open", tongue: false, tear: false, headDy: 0, tail: sad ? 2 : 0, dy: 0, dx: 0, sleep: false };
  if (!still) {
    // Respira: la cabeza baja un píxel por un momento cada dos segundos.
    if ((time + phase) % 2 < 0.9) pose.headDy = 1;
    if (pet.blink < 0) pose.face = "closed";
    if (!sad) pose.tail = Math.floor((time + phase) * (pet.fun > 70 ? 5 : 2)) % 2;
    if (sad && !pet.doing) pose.dx = Math.floor(time * 14) % 2 === 0 ? -1 : 1;
  }
  if (sad) pose.tear = true;
  if (pet.doing === "eat") {
    pose.headDy = still ? 4 : 3 + (Math.floor(time * 8) % 2) * 2;
    pose.face = "happy";
    pose.tongue = true;
    pose.tail = still ? 0 : Math.floor(time * 6) % 2;
    pose.dx = 0;
  } else if (pet.doing === "sleep") {
    pose.sleep = true;
    pose.face = "closed";
    pose.headDy = 5 + (!still && time % 2.4 < 1.2 ? 1 : 0);
    pose.tail = 2;
    pose.tear = false;
    pose.dx = 0;
  } else if (pet.doing === "joy" || pet.doing === "pet" || pet.doing === "vet") {
    pose.face = "happy";
    pose.tongue = true;
    pose.tear = false;
    pose.dx = 0;
    if (!still && pet.doing === "joy") pose.dy = -Math.round(Math.abs(Math.sin(time * 9)) * 6);
    if (!still) pose.tail = Math.floor(time * 8) % 2;
  } else if (pet.doing === "arrive" && !still) {
    pose.dy = -Math.round(Math.abs(Math.sin(time * 10)) * 3);
  }
  return pose;
}

function petColors(pet: Pet): Colors {
  const coat = coatsOf(pet.kind)[pet.coat] ?? coatsOf(pet.kind)[0];
  return { ...PET_COLORS, f: coat.f, F: coat.F, w: coat.w, s: coat.s, e: coat.e ?? PET_COLORS.e, c: pet.sick ? PET_COLORS.g : PET_COLORS.c };
}

/** Dibuja una mascota con su esquina de arriba a la izquierda en (x, y), agrandada `s` veces. */
function drawPet(c: Ctx, pet: Pet, x: number, y: number, s: number, pose: Pose, extra?: { ball?: boolean; dirt?: number }) {
  const rows = petRows(pet);
  const eye = EYE_ROW[pet.kind];
  const eyeCols = pet.kind === "gato" ? [2, 3, 8, 9] : [3, 4, 7, 8];
  if (pose.face !== "open") {
    rows[eye] = [...rows[eye]].map((ch) => (ch === "h" || ch === "e" ? (pose.face === "happy" ? "k" : "f") : ch)).join("");
    rows[eye + 1] = [...rows[eye + 1]].map((ch) => (ch === "e" ? (pose.face === "happy" ? "f" : "k") : ch)).join("");
  }
  if (pose.tongue) rows[MOUTH_ROW] = pet.kind === "gato" ? replaceAt(rows[MOUTH_ROW], 5, "t") : replaceAt(replaceAt(rows[MOUTH_ROW], 5, "t"), 6, "t");
  if (pose.tear) rows[eye + 2] = replaceAt(rows[eye + 2], eyeCols[0], "d");
  const colors = petColors(pet);
  const left = x + pose.dx;
  const top = y + pose.dy;
  // La cola va detrás, abajo a la derecha.
  const tail = TAILS[pet.kind][pose.tail];
  paint(c, tail, colors, left + 10 * s, top + (rows.length - tail.length) * s, s);
  if (pose.sleep) {
    // Acurrucado: el cuerpo se hunde y la cabeza descansa encima.
    paint(c, rows, colors, left, top, s, rows.length - 4, rows.length);
  } else paint(c, rows, colors, left, top, s, HEAD_ROWS, rows.length);
  paint(c, rows, colors, left, top, s, 0, HEAD_ROWS, pose.headDy);
  const headTop = top + pose.headDy;

  // Barro: más manchas cuanto más sucia.
  const spots = extra?.dirt ?? pet.clean;
  const count = spots < 15 ? 6 : spots < 30 ? 4 : spots < 45 ? 2 : spots < 60 ? 1 : 0;
  const SPOTS = [[2, -4], [8, -3], [5, 3], [3, -2], [9, 5], [6, -5], [1, 6], [7, -2]];
  for (let i = 0; i < count; i++) {
    const [col, row] = SPOTS[(pet.seed + i * 3) % SPOTS.length];
    const r = row < 0 ? rows.length + row : row;
    if (pose.sleep && row < 0) continue;
    const yy = row < 0 ? top + r * s : headTop + r * s;
    rect(c, left + col * s, yy, s * 2, s, "#7a5230");
    rect(c, left + col * s + s, yy + s, s, Math.max(1, s / 2), "#5a3a20");
  }

  // Accesorios: moño, collar y bufanda.
  const gear = accessoriesOf(pet.level);
  if (!pose.sleep) {
    const neckY = top + 8 * s;
    if (gear >= 3) {
      rect(c, left + 2 * s, neckY, 8 * s, s, "#6fd0e0");
      rect(c, left + 3 * s, neckY, s, s, "#ffffff");
      rect(c, left + 6 * s, neckY, s, s, "#ffffff");
      rect(c, left + 7 * s, neckY + s, 2 * s, 2 * s, "#6fd0e0");
      rect(c, left + 7 * s, neckY + 3 * s, s, s, "#ffffff");
    } else if (gear >= 2) {
      rect(c, left + 3 * s, neckY, 6 * s, s, "#e8483a");
      rect(c, left + 5 * s, neckY + s, 2 * s, s, GOLD);
    }
    if (gear >= 1) {
      const bx = left + (pet.kind === "gato" ? 7 : 7) * s;
      const by = headTop + (pet.kind === "gato" ? 1 : 0) * s - s;
      paint(c, ["bb.bb", "bbkbb", "b...b"], { b: "#ff7ab0", k: "#c23a74" }, bx, by, Math.max(1, s - 1));
    }
  }
  if (extra?.ball) {
    const mouthX = left + 6 * s;
    const mouthY = headTop + 7 * s;
    drawBall(c, mouthX, mouthY);
  }
}

const BALL: Sprite = [".kkkk.", "kRRwRk", "kwwwwk", "kRRRwk", "kRRRRk", ".kkkk."];
const BALL_COLORS: Colors = { k: "#160d1e", R: "#ff6f6f", w: "#fff1dc" };
function drawBall(c: Ctx, cx: number, cy: number) {
  paint(c, BALL, BALL_COLORS, Math.round(cx) - 3, Math.round(cy) - 3, 1);
}

/* Íconos de 7 × 7: los de los botones (agrandados) y los de las barras. */
const ICONS: Record<Action, { rows: Sprite; colors: Colors }> = {
  comer: { rows: [".o.o.o.", "ooooooo", "kkkkkkk", "kRRRRRk", "kRrRrRk", ".kRRRk.", "..kkk.."], colors: { o: "#d79a52", k: "#160d1e", R: "#e8483a", r: "#ff8a6b" } },
  jugar: { rows: ["..kkk..", ".kRRwk.", "kRRwRRk", "kwwwwwk", "kRwRRRk", ".kRRRk.", "..kkk.."], colors: { k: "#160d1e", R: "#ff6f6f", w: "#fff1dc" } },
  banar: { rows: ["...k...", "..kbk..", ".kbbbk.", "kbwbbbk", "kbwbbbk", ".kbbbk.", "..kkk.."], colors: { k: "#160d1e", b: "#4fc3f7", w: "#e6fbff" } },
  dormir: { rows: ["..kkk..", ".kyyk..", "kyyk...", "kyyk...", "kyyyk.k", ".kyyyyk", "..kkkk."], colors: { k: "#160d1e", y: "#ffe58c" } },
  mimar: { rows: ["..p.p..", "p.p.p.p", "p.....p", "..ppp..", ".ppppp.", ".ppppp.", "..p.p.."], colors: { p: "#ffb3cf" } },
  medicina: { rows: [".wwwww.", "wwwGwww", "wwwGwww", "wGGGGGw", "wwwGwww", "wwwGwww", ".wwwww."], colors: { w: "#f4f6ff", G: "#3cc46a" } },
  adoptar: { rows: ["...r...", "..rrr..", ".rrrrr.", "rrrrrrr", ".wwwww.", ".wwdww.", ".wwdww."], colors: { r: "#ff8a5c", w: "#fff1dc", d: "#8a5a3a" } },
  ayuda: { rows: [".hh.hh.", "hHhhhhh", "hhhhhhh", "hhhhhhh", ".hhhhh.", "..hhh..", "...h..."], colors: { h: HEART, H: "#ffd0d8" } },
};
const BAR_ICONS: Record<keyof Bars, Action> = { food: "comer", fun: "jugar", clean: "banar", energy: "dormir" };

const WOOD = "#8a5a36";
const WOOD_DARK = "#5c3a22";
const PAPER = "#fff3e2";
const PAPER_INK = "#3a2048";

function alpha(c: Ctx, value: number, draw: () => void) {
  const before = c.globalAlpha;
  c.globalAlpha = value;
  draw();
  c.globalAlpha = before;
}

/** Óvalo hecho con franjas (para alfombras, cojines y sombras). */
function oval(c: Ctx, cx: number, cy: number, rx: number, ry: number, color: string) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
    rect(c, cx - half, cy + dy, half * 2, 1, color);
  }
}

function drawRoom(c: Ctx, look: Look, dim: boolean, time: number, still: boolean) {
  // Pared con papel de rayas suaves.
  rect(c, 1, ROOM_TOP, WIDTH - 2, FLOOR_Y - ROOM_TOP, look.wall);
  alpha(c, 0.18, () => {
    for (let x = 4; x < WIDTH - 1; x += 10) rect(c, x, ROOM_TOP, 3, FLOOR_Y - ROOM_TOP, look.edge);
  });
  // Guirnalda de faroles de papel colgada del techo.
  rect(c, 1, ROOM_TOP, WIDTH - 2, 2, WOOD_DARK);
  for (let x = 4; x < WIDTH - 4; x += 4) rect(c, x, ROOM_TOP + 2 + (Math.abs(((x / 4) % 6) - 3) > 1 ? 1 : 2), 4, 1, "#2a1a20");
  for (const lx of [10, 58, 106]) {
    rect(c, lx + 2, ROOM_TOP + 2, 1, 3, "#2a1a20");
    c.save();
    c.translate(lx, ROOM_TOP + 4);
    paint(c, LANTERN, LANTERN_COLORS, 0, 0, 1);
    c.restore();
    if (!dim) alpha(c, 0.25, () => oval(c, lx + 2, ROOM_TOP + 8, 6, 4, look.light));
  }

  // Puerta (por aquí llegan las mascotas nuevas).
  rect(c, 4, 52, 20, FLOOR_Y - 52, WOOD_DARK);
  rect(c, 6, 54, 16, FLOOR_Y - 54, WOOD);
  rect(c, 8, 57, 12, 14, "#9c6a42");
  rect(c, 8, 75, 12, 16, "#9c6a42");
  rect(c, 18, 74, 2, 2, GOLD);

  // Cuadro con una patita.
  rect(c, 32, 38, 18, 16, WOOD_DARK);
  rect(c, 34, 40, 14, 12, PAPER);
  paint(c, ICONS.mimar.rows, { p: "#d9839f" }, 37, 42, 1);

  // Ventana con la noche, la luna y estrellas.
  const wx = 78;
  const wy = 34;
  rect(c, wx - 3, wy - 3, 38, 36, WOOD_DARK);
  rect(c, wx - 2, wy - 2, 36, 34, WOOD);
  rect(c, wx, wy, 32, 30, "#0e0b2c");
  rect(c, wx, wy + 18, 32, 12, "#1a1748");
  paint(c, MOON, MOON_COLORS, wx + 21, wy + 4, 1);
  for (const [sx, sy] of [[4, 5], [12, 11], [7, 20], [27, 22], [17, 3]]) {
    const on = still || Math.floor(time * 1.5 + sx) % 3 !== 0;
    rect(c, wx + sx, wy + sy, 1, 1, on ? "#ffffff" : "#8088c8");
  }
  rect(c, wx + 15, wy, 2, 30, WOOD);
  rect(c, wx, wy + 14, 32, 2, WOOD);
  // Cortinas.
  rect(c, wx - 6, wy - 4, 6, 40, look.edge);
  rect(c, wx + 32, wy - 4, 6, 40, look.edge);
  alpha(c, 0.35, () => {
    rect(c, wx - 3, wy - 4, 1, 40, NIGHT);
    rect(c, wx + 35, wy - 4, 1, 40, NIGHT);
  });
  rect(c, wx - 4, wy + 31, 40, 3, WOOD_DARK);

  // Zócalo y piso de tablas.
  rect(c, 1, FLOOR_Y - 3, WIDTH - 2, 3, look.edge);
  rect(c, 1, FLOOR_Y, WIDTH - 2, ROOM_BOTTOM - FLOOR_Y, look.ground);
  alpha(c, 0.35, () => {
    for (let y = FLOOR_Y + 8, row = 0; y < ROOM_BOTTOM; y += 10, row++) {
      rect(c, 1, y, WIDTH - 2, 1, NIGHT);
      for (let x = (row % 2) * 20 + 12; x < WIDTH - 1; x += 40) rect(c, x, y - 9, 1, 9, NIGHT);
    }
  });
  // Alfombra redonda.
  oval(c, 64, 128, 58, 13, look.grass);
  alpha(c, 0.45, () => oval(c, 64, 128, 50, 10, look.light));
  oval(c, 64, 128, 42, 8, look.grass);
  rect(c, 1, ROOM_BOTTOM, WIDTH - 2, 1, look.edge);
}

function drawIcon(c: Ctx, action: Action, x: number, y: number, s: number, faded = false) {
  const icon = ICONS[action];
  if (faded) alpha(c, 0.35, () => paint(c, icon.rows, icon.colors, x, y, s));
  else paint(c, icon.rows, icon.colors, x, y, s);
}

/** Globito de pensamiento con lo que la mascota necesita. */
function needOf(pet: Pet): Action | null {
  if (pet.sick) return "medicina";
  if (pet.doing) return null;
  if (pet.food < 30) return "comer";
  if (pet.clean < 30) return "banar";
  if (pet.energy < 25) return "dormir";
  if (pet.fun < 30) return "jugar";
  return null;
}

function drawThought(c: Ctx, action: Action, x: number, y: number) {
  rect(c, x - 1, y, 11, 9, NIGHT);
  rect(c, x, y - 1, 9, 11, NIGHT);
  rect(c, x, y, 9, 9, "#fdf6ff");
  rect(c, x - 3, y + 10, 2, 2, "#fdf6ff");
  drawIcon(c, action, x + 1, y + 1, 1);
}

function drawPets(c: Ctx, state: State, time: number, still: boolean) {
  const order = state.pets.map((_, index) => index).sort((a, b) => SLOTS[a].feet - SLOTS[b].feet);
  for (const index of order) {
    const pet = state.pets[index];
    const box = petBox(state, index);
    alpha(c, 0.35, () => oval(c, box.x + 12, box.feet, 13, 2, NIGHT));
    if (pet.doing === "sleep") {
      oval(c, box.x + 13, box.feet - 1, 16, 3, "#c78bd8");
      oval(c, box.x + 13, box.feet - 2, 13, 2, "#e8b8f0");
    }
    const pose = poseOf(pet, time, still, index * 0.7);
    drawPet(c, pet, box.x, box.y, PET_SCALE, pose);
    if (pet.doing === "eat") drawBowl(c, pet, box.x + 18, box.feet - 4);
    if (pet.doing === "vet") drawIcon(c, "medicina", box.x + 22, box.y - 4, 1);
    const need = needOf(pet);
    if (need && (still || Math.floor(time * 2 + index) % 4 !== 0)) drawThought(c, need, box.x + 22, box.y - 12);
    if (index === state.selected && !state.activity) {
      const bob = still ? 0 : Math.round(Math.sin(time * 5) * 1.5);
      const ay = box.y + pose.dy - 9 + bob;
      paint(c, ["kkkkkkk", "kyyyyyk", ".kyyyk.", "..kyk..", "...k..."], { k: NIGHT, y: GOLD }, box.x + 9, ay, 1);
    }
  }
}

function drawBowl(c: Ctx, pet: Pet, x: number, y: number) {
  const left = pet.busy / 1.6;
  if (pet.kind === "gato") {
    if (left > 0.3) paint(c, [".bbb..b", "bkbbbbb", ".bbb..b"], { b: "#9fd0e8", k: "#160d1e" }, x + 3, y - 2, 1);
  } else {
    const count = Math.ceil(left * 5);
    for (let i = 0; i < count; i++) rect(c, x + 2 + i * 2, y - 1 - (i % 2), 2, 2, "#a8692e");
  }
  paint(c, ["kkkkkkkkkkkkkk", "kRRRRRRRRRRRRk", ".kRRrRRrRRrRk.", "..kkkkkkkkkk.."], { k: "#160d1e", R: "#e8483a", r: "#ff8a6b" }, x - 1, y + 1, 1);
}

function drawParticles(c: Ctx, state: State) {
  for (const p of state.particles) {
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (p.kind === "heart") paint(c, [".h.h.", "hhhhh", ".hhh.", "..h.."], { h: HEART }, x - 2, y - 2, 1);
    else if (p.kind === "crumb") rect(c, x, y, 2, 2, p.color || "#a8692e");
    else if (p.kind === "bubble") paint(c, [".w.", "w.w", ".w."], { w: "#e6fbff" }, x - 1, y - 1, 1);
    else if (p.kind === "drop") paint(c, [".i.", "ioi", ".o."], { o: "#2fb8ee", i: "#8ff3ff" }, x - 1, y - 1, 1);
    else if (p.kind === "star") paint(c, STAR[0], STAR_COLORS, x - 2, y - 2, 1);
    else if (p.kind === "z") outlined(c, "Z", x, y, INK);
  }
  for (const f of state.floats) {
    const width = widthOf(f.text);
    const x = clamp(Math.round(f.x - width / 2), 3, WIDTH - 3 - width);
    outlined(c, f.text, x, Math.round(clamp(f.y, ROOM_TOP + 2, ROOM_BOTTOM - 8)), f.color);
  }
}

function drawPanel(c: Ctx, state: State, look: Look) {
  const pet = state.pets[state.selected];
  rect(c, 2, PANEL_TOP, WIDTH - 4, 31, look.wall);
  rect(c, 2, PANEL_TOP, WIDTH - 4, 1, look.edge);
  rect(c, 2, PANEL_TOP + 30, WIDTH - 4, 1, look.edge);
  if (!pet) return;
  write(c, printable(pet.name), 5, PANEL_TOP + 3, GOLD);
  const stage = STAGES[stageOf(pet.level)];
  write(c, stage, WIDTH - 5 - widthOf(stage), PANEL_TOP + 3, pet.sick ? "#9ef0a8" : INK);
  BAR_KEYS.forEach((key, index) => {
    const x = index % 2 === 0 ? 4 : 66;
    const y = PANEL_TOP + 12 + Math.floor(index / 2) * 9;
    drawIcon(c, BAR_ICONS[key], x, y, 1);
    const value = pet[key];
    const width = 48;
    rect(c, x + 9, y + 1, width + 2, 6, NIGHT);
    const color = value >= 60 ? "#7ee08a" : value >= 30 ? GOLD : "#ff7a7a";
    rect(c, x + 10, y + 2, Math.round((width * value) / 100), 4, color);
    rect(c, x + 10, y + 2, Math.round((width * value) / 100), 1, "rgba(255,255,255,0.35)");
  });
}

function disabled(state: State, action: Action): boolean {
  const pet = state.pets[state.selected];
  if (action === "adoptar") return state.pets.length >= MAX_PETS;
  if (action === "medicina") return !pet?.sick;
  if (action === "ayuda") return false;
  return !!state.activity;
}

function drawButtons(c: Ctx, state: State, look: Look, time: number, still: boolean) {
  ACTIONS.forEach((action, index) => {
    const box = buttonBox(index);
    const chosen = index === state.action;
    rect(c, box.x, box.y, box.w, box.h, chosen ? GOLD : look.edge);
    rect(c, box.x + 1, box.y + 1, box.w - 2, box.h - 2, chosen ? "#3a2a1a" : look.wall);
    if (chosen) rect(c, box.x + 2, box.y + 2, box.w - 4, box.h - 4, "#2a1d2e");
    alpha(c, 0.25, () => rect(c, box.x + 1, box.y + box.h - 3, box.w - 2, 2, NIGHT));
    let dy = 0;
    if (action === "ayuda" && !still && !state.card.open) dy = Math.floor(time * 2) % 2 === 0 ? 0 : -1;
    if (action === "medicina" && state.pets.some((pet) => pet.sick) && !still) dy = Math.floor(time * 3) % 2 === 0 ? 0 : -1;
    drawIcon(c, action, box.x + 7, box.y + 3 + dy, 2, disabled(state, action));
  });
}

function drawFetch(c: Ctx, state: State, fetch: Fetch, time: number, still: boolean) {
  const pet = state.pets[state.selected];
  const height = petRows(pet).length * PET_SCALE;
  const jump = fetch.jump > 0 ? Math.round(Math.sin(Math.PI * (1 - fetch.jump / 0.4)) * 20) : 0;
  const x = Math.round(fetch.dogX) - 12;
  // Sombra de la pelota en el piso: ayuda a saber dónde va a caer.
  if (fetch.phase === "fly" || fetch.phase === "miss") alpha(c, 0.4, () => oval(c, Math.round(fetch.ball.x), FETCH_FEET, 4, 1, NIGHT));
  alpha(c, 0.35, () => oval(c, x + 12, FETCH_FEET, 13, 2, NIGHT));
  const pose = poseOf(pet, time, still, 0);
  pose.dy = -jump;
  if (fetch.phase !== "ready") pose.tail = still ? 0 : Math.floor(time * 10) % 2;
  if (jump > 0 || fetch.phase === "back") pose.face = "happy";
  drawPet(c, pet, x, FETCH_FEET - height, PET_SCALE, pose, { ball: fetch.phase === "back" });
  if (fetch.phase === "fly" || fetch.phase === "miss" || fetch.phase === "ready") {
    const p = fetch.t / FLY;
    const ready = fetch.phase === "fly" && p >= CATCH_WINDOW[0] && p <= CATCH_WINDOW[1] && !fetch.tried;
    if (ready) {
      // Aro dorado: ¡ahora!
      const bx = Math.round(fetch.ball.x);
      const by = Math.round(fetch.ball.y);
      rect(c, bx - 6, by - 6, 13, 1, GOLD);
      rect(c, bx - 6, by + 6, 13, 1, GOLD);
      rect(c, bx - 6, by - 6, 1, 13, GOLD);
      rect(c, bx + 6, by - 6, 1, 13, GOLD);
    }
    drawBall(c, fetch.ball.x, fetch.ball.y);
    if (ready) outlined(c, "¡AHORA!", clamp(Math.round(fetch.ball.x) - 20, 3, WIDTH - 45), Math.round(fetch.ball.y) - 16, GOLD);
  }
  if (fetch.phase === "ready") center(c, "TOCA PARA LANZAR", 84, INK);
}

const SPARKLE: readonly Sprite[] = [
  ["...k...", "..kyk..", ".kyyyk.", "kyywyyk", ".kyyyk.", "..kyk..", "...k..."],
  ["...k...", "..kyk..", "..kyk..", "kyywyyk", "..kyk..", "..kyk..", "...k..."],
];

function drawLaser(c: Ctx, state: State, laser: Laser, time: number, still: boolean) {
  const pet = state.pets[state.selected];
  const height = petRows(pet).length * PET_SCALE;
  for (const spark of laser.sparkles) {
    const frame = still ? 0 : Math.floor(time * 4 + spark.x) % 2;
    paint(c, SPARKLE[frame], { y: GOLD, w: "#ffffff", k: NIGHT }, spark.x - 7, spark.y - 7, 2);
  }
  const hop = laser.hop > 0 ? Math.round(Math.sin(Math.PI * (1 - laser.hop / 0.45)) * 12) : 0;
  const x = Math.round(laser.cat.x) - 12;
  const feet = Math.round(laser.cat.y);
  alpha(c, 0.35, () => oval(c, x + 12, feet, 13, 2, NIGHT));
  const pose = poseOf(pet, time, still, 0);
  pose.dy = -hop;
  if (hop > 0) pose.face = "happy";
  drawPet(c, pet, x, feet - height, PET_SCALE, pose);
  // El puntero de luz, con su resplandor.
  const dx = Math.round(laser.dot.x);
  const dy = Math.round(laser.dot.y);
  const pulse = still ? 0 : Math.floor(time * 6) % 2;
  alpha(c, 0.3, () => oval(c, dx, dy, 6 + pulse, 5 + pulse, "#ff4a5a"));
  rect(c, dx - 3, dy - 2, 6, 4, "#ff3a4a");
  rect(c, dx - 2, dy - 3, 4, 6, "#ff3a4a");
  rect(c, dx - 1, dy - 1, 2, 2, "#ffe0e0");
}

function drawBath(c: Ctx, state: State, bath: Bath, time: number, still: boolean) {
  const pet = state.pets[state.selected];
  const s = 3;
  const rows = petRows(pet).length;
  const x = 64 - 18;
  // La cabeza y el cuello asoman sobre el borde de la bañera; el cuerpo queda en el agua.
  const feet = 90 + rows * s;
  // Ducha.
  rect(c, 60, ROOM_TOP + 2, 3, 12, "#b8c4d8");
  rect(c, 54, ROOM_TOP + 14, 15, 4, "#d8e2f2");
  if (bath.phase === "rinse" && !still) {
    for (let i = 0; i < 9; i++) {
      const dx = 54 + (i % 5) * 3 + (i > 4 ? 1 : 0);
      const dy = ROOM_TOP + 20 + ((time * 120 + i * 13) % 70);
      rect(c, dx, Math.round(dy), 1, 3, "#8ff3ff");
    }
  }
  const pose = poseOf(pet, time, still, 0);
  pose.face = bath.phase === "scrub" ? "open" : "happy";
  pose.tear = false;
  pose.dy = 0;
  pose.dx = bath.phase === "shake" && !still ? (Math.floor(time * 24) % 2 === 0 ? -2 : 2) : 0;
  drawPet(c, pet, x, feet - rows * s, s, pose, { dirt: pet.clean });
  // Bañera.
  rect(c, 21, 117, 86, 4, NIGHT);
  rect(c, 22, 118, 84, 2, "#ffffff");
  rect(c, 24, 120, 80, 18, "#e6eef8");
  rect(c, 24, 120, 80, 3, "#8fd8f0");
  rect(c, 24, 135, 80, 3, "#b8c4d8");
  rect(c, 23, 120, 1, 18, NIGHT);
  rect(c, 104, 120, 1, 18, NIGHT);
  rect(c, 30, 138, 5, 4, GOLD);
  rect(c, 93, 138, 5, 4, GOLD);
  for (const bubble of bath.bubbles) {
    if (bubble.popped) continue;
    const wobble = still ? 0 : Math.round(Math.sin(time * 3 + bubble.x) * 1);
    oval(c, bubble.x, bubble.y + wobble, bubble.r, bubble.r, "#c9eefc");
    oval(c, bubble.x, bubble.y + wobble, bubble.r - 1, bubble.r - 1, "#f4fdff");
    rect(c, bubble.x - 3, bubble.y - 3 + wobble, 2, 2, "#ffffff");
    rect(c, bubble.x + 2, bubble.y + 2 + wobble, 2, 1, "#9ad8f0");
  }
    }

function drawExit(c: Ctx) {
  const { x, y, w, h } = EXIT_BOX;
  rect(c, x, y, w, h, NIGHT);
  rect(c, x + 1, y + 1, w - 2, h - 2, "#4a2a4e");
  write(c, "×", x + 5, y + 4, INK);
}

function drawCard(c: Ctx, state: State, look: Look, time: number, still: boolean) {
  const place = foundationOf(state);
  const inner = 108;
  const name = wrapText(place.name, inner).slice(0, 3);
  const where = wrapText(place.place, inner).slice(0, 2);
  const contact = wrapText(place.contact, inner).slice(0, 3);
  const text = wrapText(CARD_TEXT, inner);
  const lines = name.length + where.length + contact.length;
  const pets = lines <= 5;
  const top = 28;
  const bottom = 177;
  const left = 6;
  const right = WIDTH - 6;
  alpha(c, 0.6, () => rect(c, 1, ROOM_TOP, WIDTH - 2, bottom - ROOM_TOP + 2, NIGHT));
  // Tarjeta con esquinas redondeadas y borde del color del paisaje.
  rect(c, left + 1, top - 1, right - left - 2, bottom - top + 2, NIGHT);
  rect(c, left - 1, top + 1, right - left + 2, bottom - top - 2, NIGHT);
  rect(c, left + 1, top, right - left - 2, bottom - top, look.edge);
  rect(c, left, top + 1, right - left, bottom - top - 2, look.edge);
  rect(c, left + 2, top + 2, right - left - 4, bottom - top - 4, PAPER);
  let y = top + 6;
  center(c, "AYUDA A UN", y, "#c2416e");
  y += 10;
  const title = "ANIMALITO";
  write(c, title, Math.round((WIDTH - widthOf(title, 2)) / 2), y, "#c2416e", 2);
  y += 18;
  if (pets) {
    const cat = state.pets.find((pet) => pet.kind === "gato") ?? { ...state.pets[0], kind: "gato" as Kind };
    const dog = state.pets.find((pet) => pet.kind === "perro") ?? { ...state.pets[0], kind: "perro" as Kind };
    for (const [pet, x] of [[cat, 30], [dog, 72]] as const) {
      const shown = { ...pet, doing: "joy" as Doing, sick: false, food: 100, fun: 100, clean: 100, energy: 100, level: 1, blink: 1 };
      const pose = poseOf(shown, time, still, x / 30);
      pose.dy = 0;
      drawPet(c, shown, x, y, PET_SCALE, pose);
    }
    paint(c, ICONS.ayuda.rows, ICONS.ayuda.colors, 60, y + 2 + (still ? 0 : Math.floor(time * 2) % 2), 1);
    y += 26;
  }
  for (const line of text) {
    center(c, line, y, PAPER_INK);
    y += 9;
  }
  y += 1;
  rect(c, left + 14, y, right - left - 28, 1, "#e0c8b0");
  y += 4;
  for (const line of name) {
    center(c, line, y, "#b0305e");
    y += 9;
  }
  for (const line of where) {
    center(c, line, y, PAPER_INK);
    y += 9;
  }
  for (const line of contact) {
    center(c, line, y, "#2a6a9a");
    y += 9;
  }
  center(c, "TOCA PARA CERRAR", bottom - 12, "#a08a9a");
}

function drawSad(c: Ctx) {
  rect(c, 8, 60, WIDTH - 16, 26, NIGHT);
  rect(c, 9, 61, WIDTH - 18, 24, "#3a2048");
  center(c, "TE EXTRAÑAN MUCHO", 65, INK);
  center(c, "¡DALES CARIÑO!", 75, GOLD);
}

export function drawGame(c: Ctx, state: State, time: number, still: boolean) {
  const world = (state.level - 1) % WORLDS;
  const look = lookOf(world);
  drawFrame(c, world);
  drawTop(c, Math.floor(state.score), 0);
  const house = `CASA ${state.level}`;
  write(c, house, WIDTH - 5 - widthOf(house), 5, look.light);
  const activity = state.activity;
  const line = state.message?.text ?? (activity ? (activity.type === "fetch" ? `PELOTA ${Math.min(FETCH_THROWS, FETCH_THROWS - activity.throwsLeft + 1)} DE ${FETCH_THROWS}  ♥${activity.caught}` : activity.type === "laser" ? `PUNTERO DE LUZ  ${Math.ceil(LASER_TIME - activity.t)}` : activity.phase === "scrub" ? `TOCA LA ESPUMA: ${activity.bubbles.filter((b) => !b.popped).length}` : "¡AL AGUA!") : ACTION_LABELS[ACTIONS[state.action]]);
  center(c, line, 15, state.message ? INK : GOLD);

  const sleeping = state.pets.some((pet) => pet.doing === "sleep") && !activity;
  drawRoom(c, look, sleeping, time, still);
  if (sleeping) alpha(c, 0.5, () => rect(c, 1, ROOM_TOP, WIDTH - 2, ROOM_BOTTOM - ROOM_TOP, "#05031a"));
  if (activity?.type === "fetch") drawFetch(c, state, activity, time, still);
  else if (activity?.type === "laser") drawLaser(c, state, activity, time, still);
  else if (activity?.type === "bath") drawBath(c, state, activity, time, still);
  else drawPets(c, state, time, still);
  drawParticles(c, state);
  if (activity) drawExit(c);
  else if (state.sadAll && !state.card.open) drawSad(c);
  drawPanel(c, state, look);
  drawButtons(c, state, look, time, still);
  if (state.card.open) drawCard(c, state, look, time, still);
}

export default defineGame<State>({
  help: "Cuida a tus mascotas. Flechas izquierda y derecha cambian de mascota, arriba y abajo eligen un cuidado y espacio lo hace. También puedes tocar los botones y a las mascotas.",
  create: (seed) => createHouse(seed),
  preview: (seed) => {
    const state = createHouse(seed, false);
    state.card.open = false;
    return state;
  },
  pad: () => [[], []],
  step: stepGame,
  draw: drawGame,
  status: (state) => ({
    score: Math.min(999_999, Math.max(0, Math.floor(state.score))),
    lives: 0,
    level: state.level,
    letters: 0,
    world: (state.level - 1) % WORLDS,
    over: false,
  }),
});
