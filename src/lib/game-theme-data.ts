import "server-only";

import { query } from "./db";
import { cleanTheme, type GameTheme } from "./game-theme";

/** Dónde se guarda la personalización de los juegos escondidos, dentro de la tabla de ajustes. */
const KEY = "game_theme";
/** Tope del texto guardado: con dibujos de 16 × 12 y todos los mensajes, sobra. */
export const THEME_MAX_BYTES = 120_000;

/** La personalización guardada (o la de siempre, si nunca se cambió o lo guardado no sirve). */
export async function getGameTheme(): Promise<GameTheme> {
  const rows = await query<{ value: string }>("select value from settings where key = $1", [KEY]);
  if (rows.length === 0) return cleanTheme(null).theme;
  try {
    return cleanTheme(JSON.parse(rows[0].value)).theme;
  } catch {
    return cleanTheme(null).theme;
  }
}

export async function saveGameTheme(theme: GameTheme): Promise<void> {
  await query("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [KEY, JSON.stringify(theme)]);
}

/** Vuelve a lo de siempre. */
export async function resetGameTheme(): Promise<void> {
  await query("delete from settings where key = $1", [KEY]);
}
