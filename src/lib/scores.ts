/**
 * Puntajes de los juegos escondidos: qué juegos hay y cómo se limpian los datos
 * antes de guardarlos. No toca la base de datos, así que se puede probar solo.
 */

export const GAMES = ["bloques", "laberinto", "espiritus", "duelo", "tejados", "muro", "dragon", "parejas", "fichas", "carreras", "pinball", "esferas", "mascotas"] as const;
export type GameId = (typeof GAMES)[number];

export const NAME_LENGTH = 8;
export const TOP = 10;
/** Tope de cada juego: un puntaje mayor no es de una partida de verdad. */
export const MAX_SCORE = Object.fromEntries(GAMES.map((game) => [game, 999_999])) as Record<GameId, number>;

export type ScoreRow = { name: string; score: number };

export const isGame = (value: unknown): value is GameId => typeof value === "string" && (GAMES as readonly string[]).includes(value);

/** Deja el nombre en mayúsculas, solo con letras, números y espacios, y de 8 caracteres como mucho. */
export function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .toUpperCase()
    .replace(/[^A-ZÁÉÍÓÚÜÑ0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_LENGTH)
    .trim();
}

/** El puntaje como entero válido para ese juego, o null si no sirve. */
export function cleanScore(game: GameId, value: unknown): number | null {
  const score = Number(value);
  return Number.isInteger(score) && score > 0 && score <= MAX_SCORE[game] ? score : null;
}

/** Mete un puntaje en una tabla y devuelve los mejores, ordenados. */
export function withScore(rows: readonly ScoreRow[], row: ScoreRow): ScoreRow[] {
  return [...rows, row].sort((a, b) => b.score - a.score).slice(0, TOP);
}
