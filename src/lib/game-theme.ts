/**
 * La personalización de los juegos escondidos: los textos de la portada y del
 * mensaje, el nombre que se junta letra por letra, los mensajes secretos y los
 * dibujos propios de los personajes.
 *
 * El administrador la cambia en /admin/juegos; se guarda en la tabla
 * "settings" (clave "game_theme") como texto JSON. Lo que no se haya cambiado
 * toma el valor de siempre (los de src/components/secret/texts.ts y los
 * dibujos originales).
 *
 * Este archivo no toca la base de datos: lo usan tanto el servidor (para
 * revisar lo que llega) como el navegador (el panel y los juegos).
 */

import {
  DEDICATION,
  DEFAULT_TROPHIES,
  FINALE,
  GAME_TITLE,
  HANDLE,
  LETTER,
  LETTER_TITLE,
  SECRETS,
  SIGNATURE,
  TRIBUTE,
  UNLOCKED,
  type SecretId,
  type Trophy,
} from "../components/secret/texts";
import { missingGlyphs } from "../components/secret/pixel-font";
import { DEFAULT_FOUNDATIONS, cleanFoundations, type Foundation } from "./foundations";
import { DEFAULT_GAME_NAME, NAME_MAX, NAME_MIN, cleanGameName } from "./game-name";
import { WORLD_COUNT, cleanWorldList } from "./world-list";

/** Un dibujo: cada texto es una fila y cada carácter un píxel ("." transparente); `colors` dice el color de cada carácter. */
export type SpriteArt = { rows: string[]; colors: Record<string, string> };

/** Los personajes que se pueden cambiar, con la medida exacta que debe tener su dibujo. */
export const SPRITE_SLOTS = [
  { id: "hero", label: "Protagonista", size: "grande", width: 12, height: 12, uses: "Portada, mensaje y paisajes (en lugar de la ninja)." },
  { id: "heroSmall", label: "Protagonista", size: "pequeño", width: 8, height: 8, uses: "Dentro de los juegos: quien recorre el laberinto, lanza estrellas, corre, etc." },
  { id: "friend", label: "Compañero", size: "grande", width: 11, height: 12, uses: "Portada, mensaje y paisajes (en lugar del espíritu)." },
  { id: "friendSmall", label: "Compañero", size: "pequeño", width: 8, height: 8, uses: "Dentro de los juegos: los que persiguen en el laberinto y bajan en la lluvia." },
  { id: "prize", label: "Premio", size: "grande", width: 11, height: 11, uses: "El adorno del mensaje (en lugar de la flor de cerezo)." },
  { id: "prizeSmall", label: "Premio", size: "pequeño", width: 5, height: 5, uses: "Dentro de los juegos: lo que se recoge (en lugar de la flor)." },
  { id: "car", label: "Auto", size: "de carreras", width: 16, height: 12, uses: "El auto que manejas en Ruta de los Faroles, visto desde atrás." },
] as const;
export type SpriteSlot = (typeof SPRITE_SLOTS)[number]["id"];
export const MAX_COLORS = 16;
/** Caracteres que puede usar un dibujo para sus colores ("." es transparente). */
export const PIXEL_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export type SecretText = { title: string; text: string[]; trophy: Trophy };
export const TROPHIES: readonly Trophy[] = ["bronce", "plata", "oro"];

/** El secreto final: el texto del botón, el título de la cinemática, una frase por escena y el mensaje de cierre. */
export type Finale = { button: string; title: string; scenes: string[]; closing: string[] };

export type GameTheme = {
  /** El nombre del juego en la portada, en dos renglones. */
  title: [string, string];
  /** A quién está dedicado (tal cual, sin enlace). */
  handle: string;
  tribute: string;
  dedication: string;
  /** El nombre que se junta letra por letra en los juegos (3 a 10 letras). */
  name: string;
  /** El nombre corto: escribirlo en la portada o firmar con él abre mensajes secretos. */
  shortName: string;
  letterTitle: string;
  letter: string[];
  signature: string;
  unlocked: string;
  secrets: Record<SecretId, SecretText>;
  sprites: Partial<Record<SpriteSlot, SpriteArt>>;
  /** Los paisajes que salen, en orden (números de WORLD_NAMES). */
  worlds: number[];
  /** Las fundaciones del mensaje "Ayuda a un animalito". */
  foundations: Foundation[];
  finale: Finale;
};

/** Límites de largo de cada texto. */
export const THEME_LIMITS = { line: 60, paragraph: 400, paragraphs: 8, secretParagraphs: 5, shortName: 12, scenes: 8, scene: 140, closing: 6 } as const;

export function defaultTheme(): GameTheme {
  return {
    title: [GAME_TITLE[0], GAME_TITLE[1]],
    handle: HANDLE,
    tribute: TRIBUTE,
    dedication: DEDICATION,
    name: DEFAULT_GAME_NAME,
    shortName: "NATHA",
    letterTitle: LETTER_TITLE,
    letter: [...LETTER],
    signature: SIGNATURE,
    unlocked: UNLOCKED,
    secrets: Object.fromEntries(
      SECRETS.map((secret) => [secret.id, { title: secret.title, text: [...secret.text], trophy: DEFAULT_TROPHIES[secret.id] }]),
    ) as Record<SecretId, SecretText>,
    sprites: {},
    worlds: Array.from({ length: WORLD_COUNT }, (_, index) => index),
    foundations: [...DEFAULT_FOUNDATIONS],
    finale: { button: FINALE.button, title: FINALE.title, scenes: [...FINALE.scenes], closing: [...FINALE.closing] },
  };
}

const text = (value: unknown, max: number, fallback: string) => {
  if (typeof value !== "string") return fallback;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return clean || fallback;
};

const paragraphs = (value: unknown, max: number, fallback: readonly string[]) => {
  if (!Array.isArray(value)) return [...fallback];
  const list = value.map((item) => text(item, THEME_LIMITS.paragraph, "")).filter(Boolean).slice(0, max);
  return list.length > 0 ? list : [...fallback];
};

/** Revisa un dibujo: medidas exactas del espacio, caracteres conocidos y colores en formato #rrggbb. */
export function cleanSprite(value: unknown, width: number, height: number): SpriteArt | null {
  if (!value || typeof value !== "object") return null;
  const { rows, colors } = value as { rows?: unknown; colors?: unknown };
  if (!Array.isArray(rows) || rows.length !== height || !colors || typeof colors !== "object") return null;
  const palette: Record<string, string> = {};
  for (const [key, color] of Object.entries(colors as Record<string, unknown>)) {
    if (key.length !== 1 || !PIXEL_CHARS.includes(key) || typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) return null;
    palette[key] = color.toLowerCase();
  }
  if (Object.keys(palette).length === 0 || Object.keys(palette).length > MAX_COLORS) return null;
  for (const row of rows) {
    if (typeof row !== "string" || row.length !== width) return null;
    for (const char of row) if (char !== "." && !palette[char]) return null;
  }
  if (rows.every((row) => /^\.+$/.test(row as string))) return null;
  return { rows: [...(rows as string[])], colors: palette };
}

/**
 * Convierte lo que llega (del panel o de la base de datos) en una personalización válida.
 * Lo que falte o no sirva toma el valor de siempre; `problems` explica qué se descartó.
 */
export function cleanTheme(input: unknown): { theme: GameTheme; problems: string[] } {
  const base = defaultTheme();
  const problems: string[] = [];
  if (!input || typeof input !== "object") return { theme: base, problems };
  const raw = input as Record<string, unknown>;
  const { line } = THEME_LIMITS;

  const title = Array.isArray(raw.title) ? raw.title : [];
  const name = cleanGameName(raw.name);
  if (raw.name !== undefined && name.length < NAME_MIN) problems.push(`El nombre debe tener entre ${NAME_MIN} y ${NAME_MAX} letras; se usa ${base.name}.`);

  const theme: GameTheme = {
    title: [text(title[0], 12, base.title[0]), text(title[1], 12, base.title[1])],
    handle: text(raw.handle, line, base.handle),
    tribute: text(raw.tribute, line, base.tribute),
    dedication: text(raw.dedication, 120, base.dedication),
    name: name.length >= NAME_MIN ? name : base.name,
    shortName: cleanGameName(raw.shortName).slice(0, THEME_LIMITS.shortName) || base.shortName,
    letterTitle: text(raw.letterTitle, line, base.letterTitle),
    letter: paragraphs(raw.letter, THEME_LIMITS.paragraphs, base.letter),
    signature: text(raw.signature, line, base.signature),
    unlocked: text(raw.unlocked, line, base.unlocked),
    secrets: base.secrets,
    sprites: {},
    worlds: raw.worlds === undefined ? base.worlds : cleanWorldList(raw.worlds),
    foundations: raw.foundations === undefined ? base.foundations : cleanFoundations(raw.foundations),
    finale: base.finale,
  };
  const finale = raw.finale && typeof raw.finale === "object" ? (raw.finale as Partial<Finale>) : {};
  const sceneList = Array.isArray(finale.scenes) ? finale.scenes.map((item) => text(item, THEME_LIMITS.scene, "")).filter(Boolean).slice(0, THEME_LIMITS.scenes) : [];
  theme.finale = {
    button: text(finale.button, 24, base.finale.button),
    title: text(finale.title, 40, base.finale.title),
    scenes: sceneList.length > 0 ? sceneList : base.finale.scenes,
    closing: paragraphs(finale.closing, THEME_LIMITS.closing, base.finale.closing),
  };
  if (theme.shortName.length < 2) theme.shortName = base.shortName;

  const secrets = raw.secrets && typeof raw.secrets === "object" ? (raw.secrets as Record<string, Partial<SecretText>>) : {};
  for (const secret of SECRETS) {
    const given = secrets[secret.id];
    if (!given) continue;
    theme.secrets[secret.id] = {
      title: text(given.title, line, base.secrets[secret.id].title),
      text: paragraphs(given.text, THEME_LIMITS.secretParagraphs, base.secrets[secret.id].text),
      trophy: TROPHIES.includes(given.trophy as Trophy) ? (given.trophy as Trophy) : base.secrets[secret.id].trophy,
    };
  }

  const sprites = raw.sprites && typeof raw.sprites === "object" ? (raw.sprites as Record<string, unknown>) : {};
  for (const slot of SPRITE_SLOTS) {
    if (sprites[slot.id] === undefined || sprites[slot.id] === null) continue;
    const art = cleanSprite(sprites[slot.id], slot.width, slot.height);
    if (art) theme.sprites[slot.id] = art;
    else problems.push(`El dibujo de ${slot.label.toLowerCase()} (${slot.size}) no tiene la medida de ${slot.width} × ${slot.height} o tiene colores raros; se usa el original.`);
  }
  return { theme, problems };
}

/** Todos los textos de una personalización, para revisar que las letras de píxeles los puedan dibujar. */
export const themeTexts = (theme: GameTheme) => [
  ...theme.title,
  theme.handle,
  theme.tribute,
  theme.dedication,
  theme.name,
  theme.letterTitle,
  ...theme.letter,
  theme.signature,
  theme.unlocked,
  ...Object.values(theme.secrets).flatMap((secret) => [secret.title, ...secret.text]),
  ...theme.foundations.flatMap((item) => [item.name, item.place, item.contact]),
  theme.finale.button,
  theme.finale.title,
  ...theme.finale.scenes,
  ...theme.finale.closing,
];

/** Signos que no existen en las letras de píxeles (en pantalla saldrían como "?"). */
export const unknownSigns = (theme: GameTheme) => missingGlyphs(themeTexts(theme).join(" "));

/** La pista de un mensaje secreto, con el nombre que toca. */
export const hintFor = (hint: string, theme: Pick<GameTheme, "name">) => hint.replaceAll("{nombre}", theme.name);
