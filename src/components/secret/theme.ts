/**
 * Aplica la personalización hecha en la administración (textos, nombre y
 * dibujos propios) a los juegos escondidos mientras la página está abierta.
 *
 * Los dibujos de los personajes se usan en muchos lugares (portada, paisajes,
 * cada juego). En vez de cambiar cada lugar, aquí se reemplaza el contenido de
 * los dibujos originales: quien los pinte después ya pinta el nuevo. Antes de
 * aplicar otra personalización se vuelven a poner los originales.
 */

import { cleanTheme, defaultTheme, type GameTheme, type SpriteArt } from "../../lib/game-theme";
import { setFoundations } from "../../lib/foundations";
import { setGameName } from "../../lib/game-name";
import { setShownWorlds } from "../../lib/world-list";
import { FLOWER, FLOWER_COLORS, GHOST, GHOST_COLORS, NINJA, NINJA_COLORS, type Colors } from "./art";
import * as kit from "./games/kit";

type Rows = string[];
const rows = (sprite: readonly string[]) => sprite as Rows;
const colorsOf = (colors: Colors) => colors as Record<string, string>;

/** Cada dibujo que se puede cambiar, con los lugares donde vive. */
const TARGETS = {
  hero: { frames: [...NINJA.run, NINJA.jump, NINJA.stand].map(rows), colors: [colorsOf(NINJA_COLORS)] },
  heroSmall: { frames: kit.NINJA.map(rows), colors: [colorsOf(kit.NINJA_COLORS)] },
  friend: { frames: [GHOST.open, GHOST.blink].map(rows), colors: [colorsOf(GHOST_COLORS)] },
  friendSmall: { frames: kit.SPIRIT.map(rows), colors: kit.SPIRIT_COLORS.map(colorsOf) },
  prize: { frames: [rows(FLOWER)], colors: [colorsOf(FLOWER_COLORS)] },
  prizeSmall: { frames: [rows(kit.FLOWER)], colors: [colorsOf(kit.FLOWER_COLORS)] },
  car: { frames: [rows(kit.CAR)], colors: [colorsOf(kit.CAR_COLORS)] },
} as const;

// Copia de los originales, para volver a ellos.
const ORIGINAL = Object.fromEntries(
  Object.entries(TARGETS).map(([id, target]) => [id, { frames: target.frames.map((frame) => [...frame]), colors: target.colors.map((map) => ({ ...map })) }]),
) as Record<keyof typeof TARGETS, { frames: Rows[]; colors: Record<string, string>[] }>;
const ORIGINAL_SCARED = { ...colorsOf(kit.SCARED_COLORS) };

const fill = (target: Rows, source: readonly string[]) => target.splice(0, target.length, ...source);
const swap = (target: Record<string, string>, source: Record<string, string>) => {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
};

/** El mismo dibujo en tonos azules (los compañeros asustados del laberinto), según lo claro de cada color. */
function blued(colors: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(colors).map(([key, hex]) => {
      const n = parseInt(hex.slice(1), 16);
      const light = (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255;
      return [key, light > 0.6 ? "#c9d0ff" : light > 0.3 ? "#5964c8" : "#232a6e"];
    }),
  );
}

let current: GameTheme = defaultTheme();
let version = 0;

/** La personalización en uso. */
export const currentTheme = () => current;
/** Cambia cada vez que se aplica otra (para rehacer lo que se guardó ya dibujado). */
export const themeVersion = () => version;
/** Si un personaje tiene dibujo propio. */
export const hasCustom = (slot: keyof typeof TARGETS) => !!current.sprites[slot];

export function applyTheme(input: unknown) {
  const theme = cleanTheme(input).theme;
  for (const [id, target] of Object.entries(TARGETS) as [keyof typeof TARGETS, (typeof TARGETS)[keyof typeof TARGETS]][]) {
    const art: SpriteArt | undefined = theme.sprites[id];
    target.frames.forEach((frame, index) => fill(frame, art ? art.rows : ORIGINAL[id].frames[index]));
    target.colors.forEach((map, index) => swap(map, art ? art.colors : ORIGINAL[id].colors[index]));
  }
  swap(colorsOf(kit.SCARED_COLORS), theme.sprites.friendSmall ? blued(theme.sprites.friendSmall.colors) : ORIGINAL_SCARED);
  setGameName(theme.name);
  setShownWorlds(theme.worlds);
  setFoundations(theme.foundations);
  for (const id of Object.keys(TARGETS) as (keyof typeof TARGETS)[]) kit.CUSTOM[id] = !!theme.sprites[id];
  current = theme;
  version += 1;
  kit.CUSTOM.version = version;
}

/** Pide la personalización guardada. Si no llega a tiempo (sin conexión, o en la demo), quedan los valores de siempre. */
export async function loadTheme(): Promise<void> {
  try {
    const response = await fetch("/juego/tema", { cache: "no-store", signal: AbortSignal.timeout(2500) });
    if (!response.ok) return;
    const body = (await response.json()) as { theme?: unknown };
    if (body.theme) applyTheme(body.theme);
  } catch {
    // Se juega con lo de siempre.
  }
}
