"use client";

/**
 * El secreto final: una cinemática en pixel art, a pantalla completa.
 *
 * Se abre con el botón "Secreto final" de la portada. Tiene cinco partes:
 * 1. Apertura: negro, aparece un cielo de estrellas y dos lunas se acercan.
 * 2. Una escena por cada texto de `finale.scenes`, cada una en un paisaje
 *    encendido y con su propia animación (faroles, carrera, el nombre letra por
 *    letra, pétalos y corazones, fuegos artificiales), con el texto escrito
 *    letra por letra en una caja de diálogo.
 * 3. Clímax: el nombre en grande, con las franjas doradas del logo, rodeado de
 *    los trofeos de los logros, y el título.
 * 4. Cierre: los párrafos de `finale.closing`, la firma y unos créditos que suben.
 * 5. Al final, "Ver otra vez" y "Volver".
 *
 * Todo se pinta en un lienzo pequeño (unos 150 a 320 píxeles de ancho) que el
 * navegador agranda sin suavizar, a unas 30 veces por segundo como mucho.
 * Con `still` (menos movimiento) las escenas quedan quietas, cambian con
 * fundidos suaves y el texto sale completo de una vez.
 */

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  FLOWER,
  FLOWER_COLORS,
  GHOST,
  GHOST_COLORS,
  NINJA,
  NINJA_COLORS,
  TROPHY,
  TROPHY_COLORS,
  dither,
  drawTile,
  makeCanvas,
  rect,
  seeded,
  type Colors,
  type Ctx,
  type Sprite,
} from "./art";
import { createBleeps } from "./bleeps";
import * as kit from "./games/kit";
import { glyphFor, normalizeText, type Glyph } from "./pixel-font";
import { PixelText } from "./PixelText";
import { disc, glow, scatterStars, sky, twinkle, type Scene, type Star } from "./scenery";
import { GAME_NAMES, SECRETS, UI } from "./texts";
import { currentTheme } from "./theme";
import { createScene } from "./worlds";
import { SHOWN_WORLDS } from "../../lib/world-list";
import { GAMES, type GameId } from "../../lib/scores";

export type FinaleProps = { onClose: () => void; still: boolean; unit: number };

/* ---------- Medidas y tiempos ---------- */

/** Cada cuánto se repinta el lienzo, como mínimo (unas 30 veces por segundo). */
const FRAME_MS = 33;
/** Cuánto tarda en escribirse cada letra de los textos. */
const TYPE_MS = 34;
/** Cuánto duran los cambios de escena (más largos y solo con fundido, con menos movimiento). */
const TRANSITION_MS = 700;
const STILL_TRANSITION_MS = 1100;
/** Alto de un renglón de texto (7 de la letra, 2 de las tildes y 2 de aire). */
const LINE = 11;

const NIGHT = "#06040e";
const INK = "#f7f2ff";
const GOLD = "#ffd684";
const SOFT = "#c9c1f2";
const HEART = "#ff7a8a";
/** Las mismas franjas que el nombre de la portada. */
const LOGO_BANDS = ["#fffbe6", "#fff1b8", "#ffdc7c", "#ffbd4f", "#ff9547", "#f4683f", "#d9463c"];
const LOGO_SHADOW = "#3b1a5e";
const SKY = ["#030209", "#07051a", "#0d0a2c", "#16103f", "#22164f", "#33195a"];
const SKY_STOPS = [0, 0.22, 0.45, 0.65, 0.82, 0.93];
const FIREWORK_COLORS = [
  ["#fff6c4", "#ffd684", "#ff9547", "#7c2b4d"],
  ["#e8fbff", "#8ff3ff", "#3c9cc8", "#1f3d6e"],
  ["#ffe7f2", "#ffb3d9", "#ff6fb5", "#6e1f52"],
  ["#f4ffd8", "#c4f080", "#6fae45", "#1f3d1a"],
  ["#fff1e0", "#ff8f70", "#d5422d", "#5a1a14"],
] as const;

const SECRETS_KEY = "dos-lunas:secretos";
const SOUND_KEY = "bloques-natha:sonido";

type Transition = "none" | "blinds" | "dither" | "iris";
type SceneKind = "lanterns" | "run" | "letters" | "hearts" | "fireworks";
type Act =
  | { kind: "open"; duration: number; transition: Transition; say: string }
  | { kind: "scene"; duration: number; transition: Transition; say: string; index: number; world: number; type: SceneKind; text: string }
  | { kind: "climax" | "closing" | "credits" | "end"; duration: number; transition: Transition; say: string };

const SCENE_KINDS: readonly SceneKind[] = ["lanterns", "run", "letters", "hearts", "fireworks"];
const SCENE_TRANSITIONS: readonly Transition[] = ["iris", "blinds", "dither", "blinds", "iris"];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const ease = (value: number) => {
  const t = clamp01(value);
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
};
const easeOut = (value: number) => 1 - (1 - clamp01(value)) ** 3;

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Cuántos logros hay descubiertos en este dispositivo. */
function foundCount(): number {
  try {
    const list = JSON.parse(readStored(SECRETS_KEY) ?? "[]") as unknown;
    const known = new Set<string>(SECRETS.map((secret) => secret.id));
    return Array.isArray(list) ? new Set(list.filter((id) => typeof id === "string" && known.has(id))).size : 0;
  } catch {
    return 0;
  }
}

/* ---------- Dibujo ---------- */

/** Un dibujo agrandado `scale` veces (cada píxel, un cuadrado). */
function sprite(c: Ctx, rows: Sprite, colors: Colors, x: number, y: number, scale = 1, flip = false) {
  for (let row = 0; row < rows.length; row++) {
    const line = rows[row];
    for (let column = 0; column < line.length; column++) {
      const color = colors[line[flip ? line.length - 1 - column : column]];
      if (!color) continue;
      c.fillStyle = color;
      c.fillRect(x + column * scale, y + row * scale, scale, scale);
    }
  }
}

const glyphOf = (char: string) => glyphFor(char) ?? (glyphFor("?") as Glyph);

/** Texto con un borde oscuro del grosor de su píxel, para que se lea sobre cualquier fondo. */
const outlineCache = new Map<string, HTMLCanvasElement>();
function outlined(c: Ctx, text: string, x: number, y: number, color: string, scale = 1) {
  const width = kit.widthOf(text, scale);
  if (!text) return x;
  // Cada texto con borde se pinta una sola vez y se guarda (también cada pedazo, mientras se escribe).
  const key = `${scale}:${color}:${text}`;
  let canvas = outlineCache.get(key);
  if (!canvas) {
    canvas = makeCanvas(width + 2 * scale, 11 * scale);
    const oc = canvas.getContext("2d") as Ctx;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) kit.write(oc, text, scale + dx * scale, 3 * scale + dy * scale, NIGHT, scale);
    kit.write(oc, text, scale, 3 * scale, color, scale);
    if (outlineCache.size > 800) outlineCache.clear();
    outlineCache.set(key, canvas);
  }
  c.drawImage(canvas, x - scale, y - 3 * scale);
  return x + width + scale;
}

/** Parte un texto en renglones que quepan en `width` píxeles. */
function wrapText(text: string, width: number, scale = 1): string[] {
  const words = normalizeText(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const tried = current ? `${current} ${word}` : word;
    if (!current || kit.widthOf(tried, scale) <= width) current = tried;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

/** Cuántas letras tiene un texto ya partido (contando un espacio entre renglón y renglón). */
const lettersIn = (lines: readonly string[]) => lines.reduce((sum, line) => sum + line.length, 0) + Math.max(0, lines.length - 1);

/** Escribe renglones centrados en `cx`, mostrando solo las primeras `shown` letras. */
function typeLines(c: Ctx, lines: readonly string[], cx: number, top: number, shown: number, color: string, scale = 1, outline = false) {
  let left = shown;
  lines.forEach((line, index) => {
    if (left <= 0) return;
    const part = line.slice(0, Math.max(0, left));
    left -= line.length + 1;
    const x = Math.round(cx - kit.widthOf(line, scale) / 2);
    const y = top + index * LINE * scale + 2 * scale;
    if (outline) outlined(c, part, x, y, color, scale);
    else kit.write(c, part, x, y, color, scale);
  });
}

type LogoLetter = { canvas: HTMLCanvasElement; x: number; width: number };
const logoCache = new Map<string, { letters: LogoLetter[]; width: number; scale: number }>();

/**
 * Un texto con las franjas doradas del logo de la portada, su borde oscuro y su
 * sombra. Cada letra queda en su propio lienzo (para poder hacerlas aparecer
 * una a una); se pintan una sola vez y se guardan.
 * Cada lienzo tiene el origen de la letra en (scale, 3 × scale).
 */
function logoOf(text: string, scale: number) {
  const key = `${scale}:${text}`;
  const cached = logoCache.get(key);
  if (cached) return cached;
  const letters: LogoLetter[] = [];
  let x = 0;
  for (const char of normalizeText(text)) {
    const glyph = glyphOf(char);
    const canvas = makeCanvas((glyph.width + 3) * scale, 12 * scale);
    const c = canvas.getContext("2d") as Ctx;
    const paint = (dx: number, dy: number, color: ((row: number) => string) | string) => {
      glyph.rows.forEach((row, line) => {
        c.fillStyle = typeof color === "string" ? color : color(line);
        for (let column = 0; column < row.length; column++) {
          if (row[column] === "#") c.fillRect(scale + dx + column * scale, 3 * scale + dy + line * scale, scale, scale);
        }
      });
      glyph.accent?.forEach((row, line) => {
        c.fillStyle = typeof color === "string" ? color : color(0);
        for (let column = 0; column < row.length; column++) {
          if (row[column] === "#") c.fillRect(scale + dx + column * scale, 3 * scale + dy + (line - 2) * scale, scale, scale);
        }
      });
    };
    for (const dx of [0, scale]) paint(dx, 2 * scale, LOGO_SHADOW);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) paint(dx * scale, dy * scale, NIGHT);
    paint(0, 0, (line) => LOGO_BANDS[line]);
    if (char !== " ") letters.push({ canvas, x, width: glyph.width * scale });
    x += (glyph.width + 1) * scale;
  }
  const logo = { letters, width: Math.max(0, x - scale), scale };
  logoCache.set(key, logo);
  return logo;
}

/** Pinta un logo con la esquina de arriba de sus letras en (x, y). `each` puede mover o esconder cada letra. */
function paintLogo(
  c: Ctx,
  logo: ReturnType<typeof logoOf>,
  x: number,
  y: number,
  each?: (index: number) => { dx?: number; dy?: number; hide?: boolean },
) {
  logo.letters.forEach((letter, index) => {
    const move = each?.(index) ?? {};
    if (move.hide) return;
    c.drawImage(letter.canvas, Math.round(x + letter.x - logo.scale + (move.dx ?? 0)), Math.round(y - 3 * logo.scale + (move.dy ?? 0)));
  });
}

/* ---------- Minidibujos de los juegos (16 × 12) ---------- */

type Icon = { rows: Sprite; colors: Colors; scale?: number };
const ICONS: Partial<Record<GameId, Icon>> = {
  muro: {
    rows: [
      "......ww........",
      "......ww........",
      "................",
      "rrrrr.rrrrr.rrrr",
      "RRRRR.RRRRR.RRRR",
      "................",
      "rr.rrrrr.rrrrr.r",
      "RR.RRRRR.RRRRR.R",
      "................",
      "rrrrr.rrrrr.rrrr",
      "RRRRR.RRRRR.RRRR",
    ],
    colors: { r: "#ff8f70", R: "#d5422d", w: "#fff1b8" },
  },
  dragon: {
    rows: [
      "...........RRR..",
      "..........RRRRR.",
      "..........RwRwR.",
      "..........RRRRR.",
      "......GG...RRR..",
      ".....GGGG..GG...",
      "..GG.GGGG.GGGG..",
      ".GGGG.GG..GGGG..",
      ".GGGG......GG...",
      "..GG............",
    ],
    colors: { R: "#ee4f2c", w: "#fff1b8", G: "#ffd95e" },
  },
  parejas: {
    rows: [
      ".wwwww....wwwww.",
      "wPPPPPw..wPPPPPw",
      "wPpppPw..wPpppPw",
      "wPpkpPw..wPpkpPw",
      "wPpppPw..wPpppPw",
      "wPPPPPw..wPPPPPw",
      "wPPPPPw..wPPPPPw",
      ".wwwww....wwwww.",
    ],
    colors: { w: "#f7f2ff", P: "#5964c8", p: "#ffd0e0", k: "#4a1830" },
  },
  fichas: {
    rows: [
      ".kkkkk..kkkkk..",
      "kwwwwwk.kwwwwwk",
      "kwrwrwk.kwgggwk",
      "kwwwwwk.kwwgwwk",
      "kwrwrwk.kwgggwk",
      "kwwwwwk.kwwwwwk",
      "kdddddk.kdddddk",
      ".kkkkk..kkkkk..",
    ],
    colors: { k: "#1a1430", w: "#ecdcaa", r: "#d5422d", g: "#3c9c88", d: "#b2955b" },
  },
  pinball: {
    rows: [
      "......ww......",
      ".....wwww.....",
      ".....wwww.....",
      "......ww......",
      "..............",
      "..............",
      "o............o",
      "oo..........oo",
      ".ooo......ooo.",
      "..ooo....ooo..",
    ],
    colors: { w: "#e8ecff", o: "#ffc46b" },
  },
  esferas: {
    rows: [".bb..rr..gg..yy.", "bWbbrWrrgWggyWyy", "bbbbrrrrggggyyyy", ".bb..rr..gg..yy."],
    colors: { b: "#4a97ee", r: "#f0603b", g: "#5fd9b0", y: "#f3ba36", W: "#ffffff" },
  },
  mascotas: {
    rows: [
      "k.........k",
      "kk.......kk",
      "kOk.....kOk",
      "kOOkkkkkOOk",
      "kOOOOOOOOOk",
      "kOeOOOOOeOk",
      "kOOOOpOOOOk",
      "kOOOkkkOOOk",
      ".kOOOOOOOk.",
      "..kkkkkkk..",
    ],
    colors: { k: "#2a1a10", O: "#f0a040", e: "#1b1030", p: "#ff7a8a" },
  },
};

/** El minidibujo de un juego, centrado en un recuadro de 16 × 12 con su esquina en (x, y). */
function paintIcon(c: Ctx, id: GameId, x: number, y: number) {
  const centered = (rows: Sprite, colors: Colors, scale = 1) => {
    const width = rows[0].length * scale;
    sprite(c, rows, colors, x + Math.floor((16 - width) / 2), y + Math.floor((12 - rows.length * scale) / 2), scale);
  };
  if (id === "bloques") drawTile(c, 4, x + 2, y);
  else if (id === "laberinto") centered(kit.SPIRIT[0], kit.SPIRIT_COLORS[0]);
  else if (id === "espiritus") centered(kit.STAR[0], kit.STAR_COLORS, 2);
  else if (id === "duelo") {
    centered(kit.MOON, kit.MOON_COLORS, 2);
  } else if (id === "tejados") centered(NINJA.run[0], NINJA_COLORS);
  else if (id === "carreras") centered(kit.CAR, kit.CAR_COLORS);
  else {
    const icon = ICONS[id];
    if (icon) centered(icon.rows, icon.colors, icon.scale);
  }
}

/* ---------- Piezas de las escenas ---------- */

type Moon = { canvas: HTMLCanvasElement; radius: number; pad: number };

/** Una luna ya pintada (con su resplandor), cálida o fría. */
function makeMoon(radius: number, warm: boolean): Moon {
  const pad = radius + 9;
  const canvas = makeCanvas(pad * 2 + 1, pad * 2 + 1);
  const c = canvas.getContext("2d") as Ctx;
  const look = warm
    ? { glow: "#6a4a8e", base: "#fff1b8", light: "#fffdf0", shade: "#e2c87a", crater: "#ecd592" }
    : { glow: "#3d5a9a", base: "#e6efff", light: "#ffffff", shade: "#9fb3e0", crater: "#c5d3f2" };
  glow(c, pad, pad, radius + 1, radius + 8, look.glow, 0.55);
  disc(c, pad, pad, radius, look.base);
  // Sombra del lado de afuera: la cálida la tiene a la izquierda y la fría a la derecha, como mirándose.
  const side = warm ? -1 : 1;
  disc(c, pad, pad, radius, look.shade, (dx, dy) => dx * side > radius * 0.35 && dx * dx + dy * dy > radius * radius * 0.45);
  disc(c, pad - side * Math.round(radius * 0.35), pad - Math.round(radius * 0.35), Math.max(1, Math.round(radius * 0.2)), look.light);
  disc(c, pad + side * Math.round(radius * 0.3), pad + Math.round(radius * 0.25), Math.max(1, Math.round(radius * 0.18)), look.crater);
  disc(c, pad - side * Math.round(radius * 0.1), pad + Math.round(radius * 0.5), Math.max(1, Math.round(radius * 0.12)), look.crater);
  return { canvas, radius, pad };
}

const paintMoon = (c: Ctx, moon: Moon, cx: number, cy: number) => c.drawImage(moon.canvas, Math.round(cx - moon.pad), Math.round(cy - moon.pad));

/** Fuegos artificiales: cada uno sube, revienta en chispas que caen y se apagan. Todo se calcula con el tiempo. */
function fireworks(c: Ctx, time: number, width: number, top: number, bottom: number, every: number, seed: number, size: number) {
  const first = Math.max(0, Math.floor((time - 2600) / every));
  for (let index = first; index * every <= time; index++) {
    const random = seeded(seed * 977 + index * 131);
    const x = Math.round(width * (0.12 + random() * 0.76));
    const y = Math.round(top + random() * (bottom - top) * 0.6);
    const palette = FIREWORK_COLORS[Math.floor(random() * FIREWORK_COLORS.length)];
    const local = (time - index * every) / 1000;
    const rise = 0.55;
    if (local < rise) {
      // El cohete sube dejando una estela.
      const progress = easeOut(local / rise);
      const ry = Math.round(bottom + (y - bottom) * progress);
      rect(c, x, ry, 1, 2, palette[0]);
      rect(c, x, ry + 2, 1, 2, palette[2]);
      continue;
    }
    const age = local - rise;
    if (age > 1.7) continue;
    const sparks = 22 + Math.floor(random() * 8);
    const speed = (18 + random() * 10) * size;
    for (let spark = 0; spark < sparks; spark++) {
      const angle = (spark / sparks) * Math.PI * 2 + random() * 0.2;
      const pace = speed * (0.75 + random() * 0.35);
      const drift = 1 - Math.exp(-age * 2.2);
      const sx = Math.round(x + (Math.cos(angle) * pace * drift) / 2.2);
      const sy = Math.round(y + (Math.sin(angle) * pace * drift) / 2.2 + 9 * size * age * age);
      const color = age < 0.12 ? palette[0] : age < 0.7 ? palette[1] : age < 1.2 ? palette[2] : palette[3];
      if (age > 1.2 && dither(sx, sy, 1.7 - age)) continue;
      rect(c, sx, sy, 1, 1, color);
      if (age < 0.5) rect(c, sx, sy, age < 0.25 ? 2 : 1, 1, color);
    }
    if (age < 0.14) {
      rect(c, x - 1, y - 1, 3, 3, "#ffffff");
    }
  }
}

/** Un fuego artificial quieto, ya abierto (para la versión con menos movimiento). */
function bloom(c: Ctx, x: number, y: number, radius: number, palette: readonly string[]) {
  const sparks = 20;
  for (let spark = 0; spark < sparks; spark++) {
    const angle = (spark / sparks) * Math.PI * 2;
    for (const [step, color] of [[0.45, palette[0]], [0.75, palette[1]], [1, palette[2]]] as const) {
      rect(c, Math.round(x + Math.cos(angle) * radius * step), Math.round(y + Math.sin(angle) * radius * step), 1, 1, color);
    }
  }
  rect(c, x, y, 1, 1, palette[0]);
}

/** Un corazón de 5 × 4 píxeles. */
const SMALL_HEART: Sprite = [".h.h.", "hhhhh", ".hhh.", "..h.."];

/** Resplandor ya pintado y guardado (el de scenery recorre cada píxel: hacerlo en cada cuadro sale caro). */
const glowCache = new Map<string, HTMLCanvasElement>();
function softGlow(c: Ctx, cx: number, cy: number, inner: number, outer: number, color: string, strength = 0.6) {
  const level = Math.round(strength * 10) / 10;
  if (level <= 0 || outer <= inner) return;
  const radius = Math.round(outer);
  const key = `${Math.round(inner)}:${radius}:${color}:${level}`;
  let canvas = glowCache.get(key);
  if (!canvas) {
    canvas = makeCanvas(radius * 2 + 1, radius * 2 + 1);
    glow(canvas.getContext("2d") as Ctx, radius, radius, Math.round(inner), radius, color, level);
    if (glowCache.size > 200) glowCache.clear();
    glowCache.set(key, canvas);
  }
  c.drawImage(canvas, Math.round(cx) - radius, Math.round(cy) - radius);
}

/* ---------- Componente ---------- */

type Size = { width: number; height: number; pixel: number };

export default function Finale({ onClose, still, unit }: FinaleProps) {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const [done, setDone] = useState(false);
  const [said, setSaid] = useState("");
  const settings = useRef({ still, unit });
  settings.current = { still, unit };
  const control = useRef<{ next: () => void; skip: () => void; restart: () => void } | null>(null);

  // La música: empieza al abrir (el botón que la abre cuenta como permiso para sonar) y se calla al salir.
  useEffect(() => {
    const bleeps = createBleeps();
    bleeps.setEnabled(readStored(SOUND_KEY) !== "no");
    const stop = bleeps.melody();
    // El botón de sonido de arriba sigue sirviendo: se escucha cuándo cambia.
    const button = section.current?.closest("dialog")?.querySelector<HTMLButtonElement>('button[aria-label="Sonido"]');
    const watch = button
      ? new MutationObserver(() => bleeps.setEnabled(button.getAttribute("aria-pressed") === "true"))
      : null;
    if (button && watch) {
      bleeps.setEnabled(button.getAttribute("aria-pressed") !== "false");
      watch.observe(button, { attributes: true, attributeFilter: ["aria-pressed"] });
    }
    return () => {
      watch?.disconnect();
      stop();
      window.setTimeout(() => bleeps.close(), 500);
    };
  }, []);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const c = element.getContext("2d") as Ctx | null;
    if (!c) return;
    const theme = currentTheme();
    const isStill = () => settings.current.still;
    const name = normalizeText(theme.name);
    const worlds = SHOWN_WORLDS.length > 0 ? SHOWN_WORLDS : [0];
    const found = foundCount();

    /* ----- Las partes de la cinemática ----- */

    const sceneTexts = theme.finale.scenes.length > 0 ? theme.finale.scenes : [""];
    // Las escenas se acortan si hay muchas, para que todo dure entre uno y dos minutos.
    const sceneBudget = Math.min(8400, 44000 / sceneTexts.length);
    const acts: Act[] = [
      { kind: "open", duration: 7600, transition: "none", say: theme.title.join(" ") },
      ...sceneTexts.map(
        (text, index): Act => ({
          kind: "scene",
          index,
          text,
          world: worlds[index % worlds.length],
          type: SCENE_KINDS[index % SCENE_KINDS.length],
          duration: Math.max(5600, Math.min(11000, Math.max(sceneBudget, 900 + text.length * TYPE_MS + 3600))),
          transition: SCENE_TRANSITIONS[index % SCENE_TRANSITIONS.length],
          say: text,
        }),
      ),
      { kind: "climax", duration: 11500, transition: "iris", say: `${theme.name}. ${theme.finale.title}` },
      {
        kind: "closing",
        duration: 0,
        transition: "dither",
        say: [...theme.finale.closing, theme.signature].join(" "),
      },
      {
        kind: "credits",
        duration: 19000,
        transition: "blinds",
        say: `${theme.title.join(" ")}. Para ${theme.handle}. ${UI.games}: ${GAMES.map((id) => GAME_NAMES[id]).join(", ")}. ${UI.achievements}: ${found} de ${SECRETS.length}. Hecho con cariño.`,
      },
      { kind: "end", duration: Number.POSITIVE_INFINITY, transition: "dither", say: "Fin" },
    ];
    // El cierre dura lo que tarda en escribirse cada párrafo, más una pausa para leerlo.
    const closingStarts: number[] = [];
    let closingAt = 900;
    for (const paragraph of theme.finale.closing) {
      closingStarts.push(closingAt);
      closingAt += paragraph.length * TYPE_MS + 1500;
    }
    const signatureAt = closingAt;
    acts.find((act) => act.kind === "closing")!.duration = signatureAt + 3400;

    /* ----- Tamaño del lienzo ----- */

    let size: Size = { width: 1, height: 1, pixel: 2 };
    let scenes = new Map<number, Scene>();
    let backdrop: { canvas: HTMLCanvasElement; stars: Star[]; appear: number[] } | null = null;
    let moons: { warm: Moon; cool: Moon } | null = null;
    let previous = makeCanvas(1, 1);
    let scratch = makeCanvas(1, 1);
    const patterns = new Map<number, CanvasPattern | null>();

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const snap = (value: number) => Math.max(1, Math.floor(value * ratio) / ratio);
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      // Píxeles gorditos: el lado corto de la pantalla mide unos 180 píxeles del lienzo (o menos, si el paisaje ya los usa más grandes).
      const pixel = Math.max(settings.current.unit, 2, snap(Math.min(screenWidth, screenHeight) / 180));
      const width = Math.ceil(screenWidth / pixel);
      const height = Math.ceil(screenHeight / pixel);
      if (width === size.width && height === size.height && pixel === size.pixel) return;
      size = { width, height, pixel };
      element.width = width;
      element.height = height;
      element.style.width = `${width * pixel}px`;
      element.style.height = `${height * pixel}px`;
      scenes = new Map();
      backdrop = null;
      moons = null;
      previous = makeCanvas(width, height);
      scratch = makeCanvas(width, height);
      patterns.clear();
      hasPrevious = false;
    };

    const sceneOf = (world: number) => {
      let scene = scenes.get(world);
      if (!scene) {
        scene = createScene(world, size.width, size.height);
        scenes.set(world, scene);
      }
      return scene;
    };

    /** El cielo de noche de la apertura y el final, con sus estrellas (y cuándo aparece cada una). */
    const backdropOf = () => {
      if (backdrop) return backdrop;
      const { width, height } = size;
      const sky0 = makeCanvas(width, height);
      const bc = sky0.getContext("2d") as Ctx;
      sky(bc, width, height, SKY, SKY_STOPS);
      const random = seeded(2026);
      const stars = scatterStars(bc, random, width, height, 70, ["#5d5790", "#8a84c8", "#b9b4ee", "#ffffff"], { x: -99, y: -99, r: 0 });
      const appear = stars.map(() => 300 + random() * 3200);
      backdrop = { canvas: sky0, stars, appear };
      return backdrop;
    };

    const moonsOf = () => {
      if (moons) return moons;
      const radius = Math.max(8, Math.min(22, Math.round(Math.min(size.width, size.height) * 0.085)));
      moons = { warm: makeMoon(radius, true), cool: makeMoon(radius, false) };
      return moons;
    };

    /** Medidas que comparten las escenas: la caja del texto, el camino y el tamaño de los personajes. */
    const stage = () => {
      const { width, height } = size;
      const boxWidth = Math.min(width - 8, 280);
      const textWidth = boxWidth - 12;
      const lines = Math.max(2, ...sceneTexts.map((text) => wrapText(text, textWidth).length));
      const boxHeight = lines * LINE + 9;
      const boxX = Math.round((width - boxWidth) / 2);
      const boxY = height - boxHeight - Math.max(6, Math.round(height * 0.03));
      const scale = height >= 150 && width >= 120 ? 2 : 1;
      return { width, height, boxWidth, textWidth, boxHeight, boxX, boxY, ground: boxY - 4, scale };
    };

    /* ----- Personajes ----- */

    const hero = (x: number, feet: number, scale: number, pose: Sprite = NINJA.stand, flip = false) =>
      sprite(c, pose, NINJA_COLORS, Math.round(x), Math.round(feet - 12 * scale), scale, flip);

    const friend = (x: number, feet: number, scale: number, time: number, flip = false) => {
      const calm = isStill();
      const float = calm ? 0 : Math.round(Math.sin(time / 420) * scale * 1.5);
      const closed = !calm && Math.floor(time / 180) % 23 === 0;
      sprite(c, closed ? GHOST.blink : GHOST.open, GHOST_COLORS, Math.round(x), Math.round(feet - 12 * scale - 5 * scale + float), scale, flip);
    };

    /** La sombra bajo los pies, para que se vean parados sobre el camino. */
    const shadow = (x: number, feet: number, width: number) => {
      c.fillStyle = "rgba(6, 4, 14, 0.45)";
      c.fillRect(Math.round(x + 1), Math.round(feet), Math.max(1, Math.round(width - 2)), 1);
    };

    /* ----- Caja de diálogo ----- */

    const dialogBox = (text: string, local: number) => {
      const s = stage();
      const { boxX: x, boxY: y, boxWidth: w, boxHeight: h } = s;
      rect(c, x - 1, y, w + 2, h, NIGHT);
      rect(c, x, y - 1, w, h + 2, NIGHT);
      rect(c, x + 1, y + 1, w - 2, h - 2, "#1a1442");
      rect(c, x + 2, y + 2, w - 4, h - 4, "#0d0a24");
      // Borde dorado con las esquinas recortadas.
      rect(c, x + 2, y + 1, w - 4, 1, GOLD);
      rect(c, x + 2, y + h - 2, w - 4, 1, "#c57f37");
      rect(c, x + 1, y + 2, 1, h - 4, GOLD);
      rect(c, x + w - 2, y + 2, 1, h - 4, "#c57f37");
      const lines = wrapText(text, s.textWidth);
      const total = lettersIn(lines);
      const shown = isStill() ? total : Math.floor((local - 500) / TYPE_MS);
      const top = y + 4 + Math.floor((h - 8 - lines.length * LINE) / 2);
      lines.forEach((line, index) => {
        const before = lines.slice(0, index).reduce((sum, item) => sum + item.length + 1, 0);
        const part = line.slice(0, Math.max(0, shown - before));
        if (part) kit.write(c, part, x + 6, top + index * LINE + 2, INK);
      });
      // Una flechita avisa que el texto terminó y se puede seguir.
      if (shown >= total && (isStill() || Math.floor(local / 400) % 2 === 0)) kit.write(c, "▶", x + w - 9, y + h - 10, GOLD);
    };

    /** El camino donde caminan los personajes: el suelo del paisaje, con su borde de pasto. */
    const path = (world: number, ground: number) => {
      const look = kit.LOOKS[world] ?? kit.LOOKS[0];
      const { width, height } = size;
      c.fillStyle = look.ground;
      for (let y = ground - 3; y < ground; y++) for (let x = 0; x < width; x++) if (dither(x, y, (y - ground + 4) / 4)) c.fillRect(x, y, 1, 1);
      rect(c, 0, ground, width, height - ground, look.ground);
      rect(c, 0, ground, width, 1, look.grass);
      c.fillStyle = "rgba(6, 4, 14, 0.35)";
      c.fillRect(0, ground + 1, width, 1);
    };

    /* ----- Cada parte ----- */

    const paintOpen = (local: number, clock: number) => {
      const { width, height } = size;
      const calm = isStill();
      const sky0 = backdropOf();
      rect(c, 0, 0, width, height, "#000000");
      // El cielo se enciende poco a poco.
      const light = calm ? 1 : clamp01((local - 1800) / 3000);
      if (light > 0) {
        c.globalAlpha = light;
        c.drawImage(sky0.canvas, 0, 0);
        c.globalAlpha = 1;
      }
      // Las estrellas van apareciendo una por una.
      if (light < 1) {
        sky0.stars.forEach((star, index) => {
          if (local > sky0.appear[index]) rect(c, star.x, star.y, 1, 1, local - sky0.appear[index] < 260 ? "#ffffff" : "#8a84c8");
        });
      }
      if (!calm) twinkle(c, sky0.stars, clock, "#ffffff", "#aaa4ee");
      // Las dos lunas se acercan hasta casi tocarse.
      const { warm, cool } = moonsOf();
      const cx = width / 2;
      const cy = Math.round(height * (height > width ? 0.34 : 0.38));
      const near = calm ? 1 : ease((local - 900) / 5200);
      const gap = warm.radius * 1.12;
      const far = width / 2 + warm.pad;
      if (near > 0.82) softGlow(c, Math.round(cx), cy, warm.radius * 2, warm.radius * 2 + 10 + Math.round((near - 0.82) * 20), "#4a3a8a", 0.35 * ((near - 0.82) / 0.18));
      paintMoon(c, warm, cx - gap - (far - gap) * (1 - near), cy);
      paintMoon(c, cool, cx + gap + (far - gap) * (1 - near), cy);
      // El nombre del juego, letra por letra, debajo de las lunas.
      const title = theme.title.join(" ");
      const scale = Math.max(1, Math.min(4, Math.floor((width - 16) / Math.max(1, kit.widthOf(title)))));
      const logo = logoOf(title, scale);
      const shown = calm ? logo.letters.length : Math.floor((local - 5000) / 110);
      paintLogo(c, logo, Math.round((width - logo.width) / 2), cy + warm.radius + 16, (index) => {
        const age = local - 5000 - index * 110;
        return { hide: index >= shown, dy: calm ? 0 : -Math.round((1 - easeOut(age / 300)) * 4) };
      });
    };

    const paintScene = (act: Extract<Act, { kind: "scene" }>, local: number, clock: number) => {
      const s = stage();
      const { width, height, ground, scale } = s;
      const calm = isStill();
      const scene = sceneOf(act.world);
      scene.paint(c, clock, calm);
      path(act.world, ground);
      const heroWidth = 12 * scale;
      const t = calm ? 0 : local;

      if (act.type === "lanterns") {
        // Faroles que suben al cielo, uno tras otro; los primeros salen de las manos de los dos.
        const heroX = Math.round(width * 0.5 - heroWidth - 2);
        const friendX = Math.round(width * 0.5 + 2);
        const random = seeded(act.index * 31 + 7);
        const count = 16;
        for (let index = 0; index < count; index++) {
          const fromMiddle = index < 3;
          const startX = fromMiddle ? width * 0.5 - 2 + (index - 1) * 8 : width * (0.06 + random() * 0.88);
          const speed = (9 + random() * 6) * (height / 180);
          const big = random() < 0.3 && !fromMiddle ? 2 : 1;
          const born = fromMiddle ? 500 + index * 700 : 1600 + index * 380 + random() * 300;
          const age = calm ? 3000 + random() * 9000 : t - born;
          if (age < 0) continue;
          const y = Math.round(ground - 6 * scale - 8 - (age / 1000) * speed);
          if (y < -16) continue;
          const x = Math.round(startX + (calm ? 0 : Math.sin(age / 900 + index) * 3));
          softGlow(c, x + 2 * big, y + 3 * big, 3 * big, 7 * big, "#7c2b4d", 0.45);
          sprite(c, kit.LANTERN, kit.LANTERN_COLORS, x, y, big);
        }
        shadow(heroX, ground, heroWidth);
        shadow(friendX, ground, 11 * scale);
        hero(heroX, ground, scale);
        friend(friendX, ground, scale, local, true);
      } else if (act.type === "run") {
        // Corre y salta por el paisaje; el compañero la sigue flotando.
        if (calm) {
          const x = Math.round(width * 0.42 - heroWidth / 2);
          shadow(x, ground, heroWidth);
          hero(x, ground, scale);
          friend(x - 13 * scale, ground, scale, local);
        } else {
          const lap = (width + 40 * scale) / 4.2;
          const run = (Math.max(0, t - 300) / 1000) * lap;
          const travel = width + 30 * scale;
          const x = (run % travel) - 14 * scale;
          const hop = ((run % travel) % (46 * scale)) / (18 * scale);
          const air = hop < 1 ? Math.round(Math.sin(hop * Math.PI) * 9 * scale) : 0;
          const pose = air > 1 ? NINJA.jump : NINJA.run[Math.floor(t / 110) % 2];
          shadow(x + (air > 3 ? 2 : 0), ground, heroWidth - (air > 3 ? 4 : 0));
          hero(x, ground - air, scale, pose);
          // Polvito al caer.
          if (hop >= 1 && hop < 1.3) {
            c.fillStyle = "#d8d3ff";
            c.fillRect(Math.round(x - 1), ground - 1, 1, 1);
            c.fillRect(Math.round(x + heroWidth), ground - 2, 1, 1);
          }
          friend(x - 14 * scale, ground, scale, local);
          // Estrellitas que quedan detrás.
          for (let index = 1; index <= 4; index++) {
            const tx = Math.round(x - 14 * scale - index * 5 * scale);
            const ty = Math.round(ground - 13 * scale + Math.sin((t - index * 140) / 420) * scale * 1.5);
            if ((Math.floor(t / 90) + index) % 3 !== 0) rect(c, tx, ty, 1, 1, index < 3 ? "#fff6c4" : "#8a84c8");
          }
        }
      } else if (act.type === "letters") {
        // Corre por el camino y, a su paso, aparecen las letras del nombre; luego suben y se juntan.
        const letters = [...name];
        const letterScale = scale;
        const stopX = width - heroWidth - 6;
        const left = 8;
        const right = stopX - 6;
        const runFor = 4600;
        const heroX = calm ? stopX : -heroWidth + (stopX + heroWidth) * clamp01((t - 300) / runFor);
        const join = calm ? 1 : ease((t - 5400) / 1400);
        const word = logoOf(name, Math.max(1, Math.min(4, Math.floor((width - 16) / Math.max(1, kit.widthOf(name))), scale + 1)));
        const wordX = Math.round((width - word.width) / 2);
        const wordY = Math.round(Math.min(height * 0.3, ground - 12 * scale - 40));
        letters.forEach((char, index) => {
          if (char === " ") return;
          const at = letters.length > 1 ? left + ((right - left) * index) / (letters.length - 1) : (left + right) / 2;
          if (!calm && heroX + heroWidth / 2 < at) return;
          const pop = calm ? 1 : easeOut((t - 300 - (runFor * (at + heroWidth)) / (stopX + heroWidth)) / 260);
          const fromX = at - kit.widthOf(char, letterScale) / 2;
          const fromY = ground - 7 * letterScale - 12 * scale - 6 - Math.round(pop * 2);
          const target = word.letters[index - letters.slice(0, index).filter((item) => item === " ").length];
          if (join >= 1 && target) {
            paintLogo(c, { ...word, letters: [target] }, wordX, wordY);
            return;
          }
          const tx = target ? wordX + target.x : fromX;
          const x = Math.round(fromX + (tx - fromX) * join);
          const y = Math.round(fromY + (wordY - fromY) * join);
          if (join > 0 && target) {
            outlined(c, char, x, y, GOLD, join > 0.5 ? word.scale : letterScale);
          } else {
            softGlow(c, Math.round(fromX + kit.widthOf(char, letterScale) / 2), Math.round(fromY + 3 * letterScale), 2, 6 + letterScale * 2, "#ffd684", 0.25 * pop);
            outlined(c, char, Math.round(fromX), Math.round(fromY), GOLD, letterScale);
          }
        });
        // Chispas cuando el nombre queda junto.
        if (!calm && join >= 1) {
          const random = seeded(Math.floor(t / 140));
          for (let index = 0; index < 6; index++) {
            const sx = Math.round(wordX - 6 + random() * (word.width + 12));
            const sy = Math.round(wordY - 8 + random() * (word.scale * 7 + 16));
            rect(c, sx, sy, 1, 1, "#ffffff");
            if (random() < 0.4) {
              rect(c, sx - 1, sy, 3, 1, "#fff1b8");
              rect(c, sx, sy - 1, 1, 3, "#fff1b8");
            }
          }
        }
        const running = !calm && t < runFor + 300;
        const pose = running ? NINJA.run[Math.floor(t / 110) % 2] : NINJA.stand;
        shadow(heroX, ground, heroWidth);
        hero(heroX, ground, scale, pose);
        friend(heroX - 14 * scale, ground, scale, local);
      } else if (act.type === "hearts") {
        // Pétalos que caen; los dos se encuentran y entre ellos nace una flor y suben corazones.
        const random = seeded(act.index * 17 + 3);
        const petals = Math.round((width * height) / 500);
        for (let index = 0; index < petals; index++) {
          const x0 = random() * (width + 20);
          const y0 = random() * (height + 20);
          const fall = 6 + random() * 9;
          const drift = 3 + random() * 6;
          const x = Math.round(((((x0 - (t / 1000) * drift + Math.sin(t / 700 + index) * 4) % (width + 20)) + width + 20) % (width + 20)) - 10);
          const y = Math.round((((y0 + (t / 1000) * fall) % (height + 20)) + height + 20) % (height + 20)) - 10;
          const color = index % 3 === 0 ? "#ffc9df" : index % 3 === 1 ? "#f58fbd" : "#c9578f";
          rect(c, x, y, index % 4 === 0 ? 2 : 1, 1, color);
          if (index % 5 === 0) rect(c, x, y + 1, 1, 1, color);
        }
        const middle = Math.round(width / 2);
        const meet = calm ? 1 : easeOut((t - 300) / 2200);
        const heroX = Math.round(middle - 8 - heroWidth - (1 - meet) * (width * 0.35));
        const friendX = Math.round(middle + 8 + (1 - meet) * (width * 0.35));
        const walking = !calm && meet < 1;
        shadow(heroX, ground, heroWidth);
        hero(heroX, ground, scale, walking ? NINJA.run[Math.floor(t / 130) % 2] : NINJA.stand);
        friend(friendX, ground, scale, local, true);
        // La flor crece en medio.
        const grow = calm ? 1 : clamp01((t - 2600) / 600);
        if (grow > 0) {
          const flowerScale = scale;
          const rows = FLOWER.slice(FLOWER.length - Math.max(1, Math.ceil(FLOWER.length * grow)));
          sprite(c, rows, FLOWER_COLORS, middle - Math.floor((11 * flowerScale) / 2), ground - rows.length * flowerScale, flowerScale);
        }
        // Corazones que suben.
        const beats = calm ? [0] : Array.from({ length: 10 }, (_, index) => index);
        for (const index of beats) {
          const born = 3000 + index * 520;
          const age = calm ? 1400 : t - born;
          if (age < 0 || age > 3200) continue;
          const hx = Math.round(middle - 2 + Math.sin(age / 380 + index * 2) * (4 + index % 3) * scale * 0.7);
          const hy = Math.round(ground - 11 * scale - 6 - (age / 1000) * 14 * scale * 0.7);
          if (age > 2600 && dither(hx, hy, (3200 - age) / 600)) continue;
          sprite(c, SMALL_HEART, { h: index % 2 ? "#ff9fb2" : HEART }, hx, hy, index % 3 === 0 ? scale : 1);
        }
      } else {
        // Fuegos artificiales, y una guirnalda de luces que se enciende de lado a lado.
        if (calm) {
          bloom(c, Math.round(width * 0.25), Math.round(height * 0.18), Math.round(14 * scale), FIREWORK_COLORS[0]);
          bloom(c, Math.round(width * 0.7), Math.round(height * 0.12), Math.round(11 * scale), FIREWORK_COLORS[2]);
          bloom(c, Math.round(width * 0.5), Math.round(height * 0.3), Math.round(9 * scale), FIREWORK_COLORS[1]);
        } else fireworks(c, t, width, Math.round(height * 0.06), Math.round(ground - 40 * scale), 620, act.index + 1, scale * 0.8);
        const sag = Math.round(6 * scale);
        const lineY = Math.round(ground - 24 * scale);
        const bulbs = Math.max(6, Math.floor(width / (9 * scale)));
        for (let index = 0; index <= bulbs; index++) {
          const p = index / bulbs;
          const x = Math.round(p * (width - 1));
          const y = Math.round(lineY + Math.sin(p * Math.PI * 3) * sag * 0.3 + sag * Math.sin(p * Math.PI));
          rect(c, x, y - 1, 1, 1, "#2a1a3a");
          const lit = calm || t > 800 + p * 2400;
          const color = ["#ffd684", "#ff8f70", "#8ff3ff", "#ffb3d9", "#c4f080"][index % 5];
          if (lit) {
            softGlow(c, x, y + 1, 1, 4, color, 0.3);
            rect(c, x - (scale > 1 ? 1 : 0), y, scale > 1 ? 2 : 1, scale > 1 ? 2 : 1, color);
          } else rect(c, x, y, 1, 1, "#3a3554");
        }
        const heroX = Math.round(width * 0.5 - heroWidth - 2);
        shadow(heroX, ground, heroWidth);
        hero(heroX, ground, scale, !calm && Math.floor(t / 900) % 4 === 1 ? NINJA.jump : NINJA.stand);
        friend(Math.round(width * 0.5 + 2), ground, scale, local, true);
      }
      dialogBox(act.text, local);
    };

    const nightSky = (clock: number, withMoons: boolean) => {
      const sky0 = backdropOf();
      c.drawImage(sky0.canvas, 0, 0);
      if (!isStill()) twinkle(c, sky0.stars, clock, "#ffffff", "#aaa4ee");
      if (!withMoons) return;
      const { warm, cool } = moonsOf();
      const cy = Math.round(warm.pad + 4);
      const gap = warm.radius * 1.12;
      paintMoon(c, warm, size.width / 2 - gap, cy);
      paintMoon(c, cool, size.width / 2 + gap, cy);
    };

    const paintClimax = (local: number, clock: number) => {
      const { width, height } = size;
      const calm = isStill();
      const t = calm ? 99999 : local;
      nightSky(clock, false);
      if (calm) {
        bloom(c, Math.round(width * 0.18), Math.round(height * 0.15), 12, FIREWORK_COLORS[0]);
        bloom(c, Math.round(width * 0.82), Math.round(height * 0.2), 10, FIREWORK_COLORS[2]);
      } else fireworks(c, Math.max(0, local - 1800), width, Math.round(height * 0.05), Math.round(height * 0.7), 520, 99, Math.max(1, height / 160));

      // Medidas: fila de trofeos, nombre, fila de trofeos y título.
      const trophies = SECRETS.map((secret) => theme.secrets[secret.id]?.trophy ?? "bronce");
      // Los trofeos van en filas, la mitad encima del nombre y la otra mitad debajo; en vertical caben más filas y más grandes.
      const maxRows = height > width * 1.2 ? 4 : 2;
      let trophyScale = Math.max(1, Math.min(3, Math.floor(height / 70)));
      let rows = 1;
      for (; trophyScale >= 1; trophyScale--) {
        rows = Math.ceil(trophies.length / Math.max(1, Math.floor((width - 8) / (11 * trophyScale))));
        if (rows <= maxRows || trophyScale === 1) break;
      }
      trophyScale = Math.max(1, trophyScale);
      const perRow = Math.ceil(trophies.length / rows);
      const rowsAbove = Math.ceil(rows / 2);
      const trophySize = 9 * trophyScale;
      const rowStep = trophySize + 3 * trophyScale;
      const nameScale = Math.max(1, Math.min(6, Math.floor((width - 16) / Math.max(1, kit.widthOf(name))), Math.floor((height - rows * rowStep - 60) / 14)));
      const logo = logoOf(name, nameScale);
      const titleScale = Math.max(1, Math.min(3, Math.floor((width - 16) / Math.max(1, kit.widthOf(theme.finale.title))), nameScale));
      const nameHeight = 9 * nameScale + 3 * nameScale;
      const gap = Math.max(5, Math.round(height * 0.04));
      const total = rows * rowStep + gap + nameHeight + gap + gap + 9 * titleScale;
      const top = Math.round((height - total) / 2);
      const nameY = top + rowsAbove * rowStep + gap + 2 * nameScale + nameScale;
      const lowY = nameY + 7 * nameScale + 2 * nameScale + gap;
      const titleY = lowY + (rows - rowsAbove) * rowStep + gap + 2 * titleScale;

      // Un halo dorado detrás del nombre.
      const halo = calm ? 1 : easeOut((t - 300) / 1200);
      if (halo > 0) softGlow(c, Math.round(width / 2), Math.round(nameY + 3.5 * nameScale), 4, Math.round(Math.min(width * 0.5, logo.width * 0.65 + 12)), "#5a3a2a", 0.5 * halo);

      // El nombre aparece letra por letra, saltando un poquito.
      const nameX = Math.round((width - logo.width) / 2);
      paintLogo(c, logo, nameX, nameY, (index) => {
        const age = t - 600 - index * 180;
        if (age < 0) return { hide: true };
        return { dy: -Math.round(Math.sin(clamp01(age / 360) * Math.PI) * nameScale * 2) };
      });

      // Los trofeos caen a su lugar y brillan.
      trophies.forEach((trophy, index) => {
        const row = Math.floor(index / perRow);
        const column = index - row * perRow;
        const inRow = Math.min(perRow, trophies.length - row * perRow);
        const step = Math.min(trophySize + 2 * trophyScale, (width - 8) / inRow);
        const x = Math.round((width - step * (inRow - 1) - trophySize) / 2 + column * step);
        const y = row < rowsAbove ? top + row * rowStep : lowY + (row - rowsAbove) * rowStep;
        const born = 2400 + index * 140;
        const age = t - born;
        if (age < 0) return;
        const fall = easeOut(age / 650);
        const bounce = age > 650 && age < 900 ? Math.round(Math.sin(((age - 650) / 250) * Math.PI) * trophyScale * 2) : 0;
        // Los de arriba caen desde el cielo; los de abajo suben desde el borde de la pantalla.
        const from = row < rowsAbove ? -trophySize - 4 : height + 4;
        const ty = Math.round(from + (y - from) * fall) - bounce;
        sprite(c, TROPHY, TROPHY_COLORS[trophy], x, ty, trophyScale);
        // Destello: una crucecita blanca que pasa de un trofeo a otro.
        if (!calm && age > 900 && Math.floor(t / 150 + index * 3.7) % 17 === 0) {
          const sx = x + 2 * trophyScale;
          const sy = ty + trophyScale;
          rect(c, sx - trophyScale, sy, trophyScale * 3, Math.max(1, trophyScale - 1) || 1, "#ffffff");
          rect(c, sx, sy - trophyScale, Math.max(1, trophyScale - 1) || 1, trophyScale * 3, "#ffffff");
        }
      });

      // El título, escrito letra por letra.
      const titleLines = [normalizeText(theme.finale.title)];
      const shown = calm ? 99 : Math.floor((t - 5200) / 80);
      if (shown > 0) typeLines(c, titleLines, width / 2, titleY - 2 * titleScale, shown, GOLD, titleScale, true);
    };

    const paintClosing = (local: number, clock: number) => {
      const { width, height } = size;
      const calm = isStill();
      nightSky(clock, true);
      const textWidth = Math.min(width - 16, 260);
      const blocks = theme.finale.closing.map((paragraph) => wrapText(paragraph, textWidth));
      const signature = normalizeText(theme.signature);
      const { warm } = moonsOf();
      const moonBottom = warm.pad * 2 + 4;
      const scale = stage().scale;
      const charsTop = height - 6;
      const space = blocks.reduce((sum, lines) => sum + lines.length * LINE + 6, 0) + LINE + 4;
      let top = Math.max(moonBottom + 4, Math.round(moonBottom + (charsTop - 12 * scale - 8 - moonBottom - space) / 2));
      blocks.forEach((lines, index) => {
        const shown = calm ? 999 : Math.floor((local - closingStarts[index]) / TYPE_MS);
        if (shown > 0) typeLines(c, lines, width / 2, top, shown, index === blocks.length - 1 ? GOLD : INK, 1, true);
        top += lines.length * LINE + 6;
      });
      const sigShown = calm || local > signatureAt;
      if (sigShown) {
        const sx = Math.round(width / 2 + textWidth / 2 - kit.widthOf(signature) - 4);
        outlined(c, signature, Math.min(sx, width - kit.widthOf(signature) - 6), top + 6, "#ffb3c9");
      }
      // Los dos, sentaditos abajo mirando las lunas.
      const heroWidth = 12 * scale;
      const x = Math.round(width / 2 - heroWidth - 2);
      shadow(x, charsTop, heroWidth);
      hero(x, charsTop, scale);
      friend(Math.round(width / 2 + 2), charsTop, scale, local, true);
    };

    /* Créditos: una lista de renglones que sube. */
    type Credit = { height: number; draw: (y: number) => void };
    const credits = (): Credit[] => {
      const { width } = size;
      const center = (text: string, color: string, scale = 1): Credit => {
        const lines = wrapText(text, width - 12, scale);
        return { height: lines.length * LINE * scale, draw: (y) => typeLines(c, lines, width / 2, y, 999, color, scale, true) };
      };
      const gap = (height: number): Credit => ({ height, draw: () => {} });
      const title = theme.title.join(" ");
      const titleScale = Math.max(1, Math.min(3, Math.floor((width - 16) / Math.max(1, kit.widthOf(title)))));
      const logo = logoOf(title, titleScale);
      const list: Credit[] = [
        { height: 11 * titleScale, draw: (y) => paintLogo(c, logo, Math.round((width - logo.width) / 2), y + 2 * titleScale) },
        gap(10),
        center("Para", SOFT),
        center(theme.handle, GOLD),
        gap(16),
        center(UI.games, SOFT),
        gap(4),
      ];
      for (const id of GAMES) {
        const lines = wrapText(GAME_NAMES[id], width - 32);
        const rowWidth = 20 + Math.max(...lines.map((line) => kit.widthOf(line)));
        list.push({
          height: Math.max(14, lines.length * LINE + 3),
          draw: (y) => {
            const x = Math.round((width - rowWidth) / 2);
            paintIcon(c, id, x, y + 1);
            lines.forEach((line, index) => outlined(c, line, x + 20, y + 4 + index * LINE, INK));
          },
        });
      }
      list.push(gap(16), center(`${UI.achievements}: ${found} de ${SECRETS.length}`, GOLD), gap(16));
      const made = "Hecho con cariño";
      list.push({
        height: LINE,
        draw: (y) => {
          const x = Math.round((width - kit.widthOf(made) - 10) / 2);
          outlined(c, made, x, y + 2, INK);
          sprite(c, SMALL_HEART, { h: HEART }, x + kit.widthOf(made) + 5, y + 4);
        },
      });
      list.push(gap(8), center(theme.signature, "#ffb3c9"));
      return list;
    };

    const paintCredits = (local: number, clock: number) => {
      const { width, height } = size;
      nightSky(clock, false);
      const list = credits();
      const total = list.reduce((sum, item) => sum + item.height, 0);
      if (isStill()) {
        // Sin movimiento: páginas quietas que cambian con un fundido.
        const pages: Credit[][] = [[]];
        let used = 0;
        for (const item of list) {
          if (used + item.height > height - 24 && pages[pages.length - 1].length > 0) {
            pages.push([]);
            used = 0;
          }
          pages[pages.length - 1].push(item);
          used += item.height;
        }
        const pageMs = acts[creditsIndex].duration / pages.length;
        const page = Math.min(pages.length - 1, Math.floor(local / pageMs));
        const pageHeight = pages[page].reduce((sum, item) => sum + item.height, 0);
        let y = Math.round((height - pageHeight) / 2);
        for (const item of pages[page]) {
          item.draw(y);
          y += item.height;
        }
        // Fundido tramado al pasar de una página a otra.
        const into = local - page * pageMs;
        if (page > 0 && into < 700) fadeOver(1 - into / 700, "#07051a");
        return;
      }
      // Sube desde abajo hasta que el último renglón queda a media pantalla.
      const travel = height + total - height * 0.55;
      const progress = clamp01(local / (acts[creditsIndex].duration - 1500));
      let y = Math.round(height - travel * progress);
      for (const item of list) {
        if (y + item.height > -12 && y < height + 12) item.draw(y);
        y += item.height;
      }
    };

    const paintEnd = (local: number, clock: number) => {
      const { width, height } = size;
      nightSky(clock, false);
      const { warm, cool } = moonsOf();
      const cy = Math.round(height * (height > width ? 0.24 : 0.26));
      const gap = warm.radius * 1.05;
      softGlow(c, Math.round(width / 2), cy, warm.radius * 2, warm.radius * 2 + 12, "#4a3a8a", 0.35);
      paintMoon(c, warm, width / 2 - gap, cy);
      paintMoon(c, cool, width / 2 + gap, cy);
      const scale = stage().scale;
      // Una colinita donde están los dos.
      const hill = Math.round(height * (height > width ? 0.56 : 0.72));
      c.fillStyle = "#120d2e";
      for (let x = 0; x < width; x++) {
        const rise = Math.round(Math.max(0, 1 - ((x - width / 2) / (width * 0.45)) ** 2) * 10 * scale);
        c.fillRect(x, hill - rise, 1, height - hill + rise);
      }
      const heroWidth = 12 * scale;
      const top = hill - 10 * scale;
      const x = Math.round(width / 2 - heroWidth - 2);
      hero(x, top, scale);
      friend(Math.round(width / 2 + 2), top, scale, local, true);
      if (!isStill() && Math.floor(local / 1300) % 2 === 0) sprite(c, SMALL_HEART, { h: HEART }, Math.round(width / 2 - 2), top - 15 * scale);
      else if (isStill()) sprite(c, SMALL_HEART, { h: HEART }, Math.round(width / 2 - 2), top - 15 * scale);
    };

    /* ----- Transiciones ----- */

    /** Pinta encima un color tramado (para fundidos sin tonos intermedios). `amount` de 0 a 1. */
    const fadeOver = (amount: number, color: string) => {
      const level = Math.round(clamp01(amount) * 16);
      if (level <= 0) return;
      c.fillStyle = color;
      if (level >= 16) {
        c.fillRect(0, 0, size.width, size.height);
        return;
      }
      // El patrón tiene encendidos `level` de cada 16 píxeles: se pinta del color pedido.
      const tile = makeTile(level, color);
      const fill = c.createPattern(tile, "repeat");
      if (fill) {
        c.fillStyle = fill;
        c.fillRect(0, 0, size.width, size.height);
      }
    };

    const tiles = new Map<string, HTMLCanvasElement>();
    const makeTile = (level: number, color: string) => {
      const key = `${level}:${color}`;
      let tile = tiles.get(key);
      if (!tile) {
        tile = makeCanvas(4, 4);
        const tc = tile.getContext("2d") as Ctx;
        tc.fillStyle = color;
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (dither(x, y, level / 16)) tc.fillRect(x, y, 1, 1);
        tiles.set(key, tile);
      }
      return tile;
    };

    /** Patrón para borrar: `level` de cada 16 píxeles. */
    function patternFor(target: Ctx, level: number) {
      if (!patterns.has(level)) patterns.set(level, target.createPattern(makeTile(level, "#000000"), "repeat"));
      return patterns.get(level) ?? null;
    }

    /** La escena anterior, encima, se va abriendo para dejar ver la nueva. */
    const overlayPrevious = (kind: Transition, progress: number) => {
      const sc = scratch.getContext("2d") as Ctx;
      const { width, height } = size;
      sc.globalCompositeOperation = "copy";
      sc.drawImage(previous, 0, 0);
      sc.globalCompositeOperation = "destination-out";
      sc.fillStyle = "#000000";
      if (kind === "blinds") {
        const open = Math.ceil(progress * 8);
        for (let y = 0; y < height; y += 8) sc.fillRect(0, y, width, open);
      } else if (kind === "iris") {
        const cx = width / 2;
        const cy = height * 0.42;
        const radius = easeOut(progress) * Math.hypot(width, height) * 0.62;
        for (let y = 0; y < height; y++) {
          const dy = y - cy;
          if (Math.abs(dy) >= radius) continue;
          const half = Math.floor(Math.sqrt(radius * radius - dy * dy));
          sc.fillRect(Math.round(cx - half), y, half * 2, 1);
        }
      } else {
        const level = Math.round(clamp01(progress) * 16);
        const pattern = patternFor(sc, level);
        if (level >= 16) sc.fillRect(0, 0, width, height);
        else if (pattern && level > 0) {
          sc.fillStyle = pattern;
          sc.fillRect(0, 0, width, height);
        }
      }
      sc.globalCompositeOperation = "source-over";
      c.drawImage(scratch, 0, 0);
    };

    /* ----- Reloj ----- */

    const creditsIndex = acts.findIndex((act) => act.kind === "credits");
    const endIndex = acts.length - 1;
    let index = 0;
    let local = 0;
    let clock = 0;
    let hasPrevious = false;
    let transition: Transition = "none";

    const enter = (next: number) => {
      // Lo último que se vio queda guardado para la transición.
      const pc = previous.getContext("2d") as Ctx;
      pc.globalCompositeOperation = "copy";
      pc.drawImage(element, 0, 0);
      pc.globalCompositeOperation = "source-over";
      hasPrevious = true;
      index = Math.min(next, endIndex);
      local = 0;
      const act = acts[index];
      transition = isStill() && act.transition !== "none" ? "dither" : act.transition;
      setSaid(act.say);
      setDone(act.kind === "end");
      const after = acts[index + 1];
      // El paisaje que sigue se arma con tiempo, para que el cambio no se trabe.
      if (after?.kind === "scene") window.setTimeout(() => sceneOf(after.world), 60);
    };

    const paint = () => {
      const act = acts[index];
      if (act.kind === "open") paintOpen(local, clock);
      else if (act.kind === "scene") paintScene(act, local, clock);
      else if (act.kind === "climax") paintClimax(local, clock);
      else if (act.kind === "closing") paintClosing(local, clock);
      else if (act.kind === "credits") paintCredits(local, clock);
      else paintEnd(local, clock);
      const span = isStill() ? STILL_TRANSITION_MS : TRANSITION_MS;
      if (hasPrevious && transition !== "none" && local < span) overlayPrevious(transition, local / span);
    };

    resize();
    setSaid(acts[0].say);
    window.setTimeout(() => {
      const first = acts[1];
      if (first?.kind === "scene") sceneOf(first.world);
    }, 200);

    let frame = 0;
    let last = performance.now();
    let painted = -Infinity;
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const elapsed = Math.min(100, Math.max(0, now - last));
      last = now;
      local += elapsed;
      clock += elapsed;
      if (local >= acts[index].duration) enter(index + 1);
      if (now - painted >= FRAME_MS - 2) {
        painted = now;
        paint();
      }
    };
    frame = requestAnimationFrame(step);

    control.current = {
      next: () => {
        if (index < endIndex) enter(index + 1);
      },
      skip: () => {
        if (index < endIndex) enter(endIndex);
      },
      restart: () => {
        enter(0);
      },
    };

    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        resize();
        paint();
      }, 120);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      control.current = null;
    };
  }, []);

  // Al terminar, el foco va a "Volver".
  useEffect(() => {
    if (done) back.current?.focus({ preventScroll: true });
  }, [done]);

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== " " && event.key !== "Enter") return;
    if (event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    control.current?.next();
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    control.current?.next();
  };

  const restart = () => {
    setDone(false);
    control.current?.restart();
    section.current?.focus({ preventScroll: true });
  };

  return (
    <section
      ref={section}
      className="bn-fin"
      aria-label={currentTheme().finale.button}
      tabIndex={-1}
      data-first
      data-done={done || undefined}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    >
      <style>{FINALE_STYLES}</style>
      <canvas ref={canvas} className="bn-fin-canvas" aria-hidden="true" />
      <p className="bn-sr" role="status" aria-live="polite">
        {said}
      </p>
      {done ? (
        <div className="bn-fin-end">
          <button type="button" className="bn-btn bn-btn-quiet" onClick={restart}>
            <PixelText>Ver otra vez</PixelText>
          </button>
          <button ref={back} type="button" className="bn-btn" onClick={onClose}>
            <PixelText>{UI.back}</PixelText>
          </button>
        </div>
      ) : (
        <button type="button" className="bn-btn bn-btn-quiet bn-fin-skip" onClick={() => control.current?.skip()}>
          <PixelText>{UI.skip}</PixelText>
        </button>
      )}
    </section>
  );
}

const FINALE_STYLES = `
.bn-fin {
  position: absolute;
  z-index: 6;
  inset: 0;
  overflow: hidden;
  background: #000000;
  cursor: pointer;
  touch-action: manipulation;
}
.bn-fin:focus, .bn-fin:focus-visible { outline: none; }
.bn-fin[data-done] { cursor: default; }
.bn-fin-canvas { position: absolute; left: 0; top: 0; }
.bn-fin-skip {
  position: absolute;
  z-index: 2;
  top: 4px;
  left: max(8px, env(safe-area-inset-left));
  min-width: 0;
  opacity: 0.85;
}
.bn-fin-skip:hover, .bn-fin-skip:focus-visible { opacity: 1; }
.bn-fin-end {
  position: absolute;
  z-index: 2;
  left: 0;
  right: 0;
  bottom: max(18px, env(safe-area-inset-bottom));
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: calc(var(--bn-t) * 2);
  padding: 0 16px;
}
`;
