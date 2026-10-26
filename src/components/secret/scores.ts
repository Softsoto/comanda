/**
 * Puntajes del juego escondido, del lado del navegador.
 *
 * La tabla de verdad vive en la base de datos de la app y la comparten todos.
 * Si no se puede llegar a ella (sin internet, o en la demo, que no tiene
 * servidor), se usa una tabla guardada en este dispositivo para que el juego
 * siga funcionando igual.
 */

import { cleanName, withScore, type GameId, type ScoreRow } from "../../lib/scores";

export type Board = { rows: ScoreRow[]; /** false: es la tabla de este dispositivo. */ shared: boolean };

const URL = "/juego/puntajes";
const localKey = (game: GameId) => `dos-lunas:puntajes:${game}`;
const NAME_KEY = "dos-lunas:nombre";

function readLocal(game: GameId): ScoreRow[] {
  try {
    const rows = JSON.parse(window.localStorage.getItem(localKey(game)) ?? "[]") as unknown;
    if (!Array.isArray(rows)) return [];
    return rows.filter((row): row is ScoreRow => !!row && typeof row.name === "string" && Number.isInteger(row.score));
  } catch {
    return [];
  }
}

function writeLocal(game: GameId, rows: ScoreRow[]) {
  try {
    window.localStorage.setItem(localKey(game), JSON.stringify(rows));
  } catch {
    // Sin permiso para guardar: la tabla dura lo que dure la página.
  }
}

async function ask(input: string, init?: RequestInit): Promise<ScoreRow[] | null> {
  try {
    const response = await fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { scores?: ScoreRow[] };
    return Array.isArray(body.scores) ? body.scores : null;
  } catch {
    return null;
  }
}

/** Los mejores puntajes de un juego. */
export async function loadScores(game: GameId): Promise<Board> {
  const rows = await ask(`${URL}?juego=${game}`);
  return rows ? { rows, shared: true } : { rows: readLocal(game), shared: false };
}

/** Guarda un puntaje y devuelve la tabla ya actualizada. */
export async function saveScore(game: GameId, name: string, score: number): Promise<Board> {
  const row = { name: cleanName(name), score };
  const rows = await ask(URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ game, ...row }) });
  if (rows) return { rows, shared: true };
  const local = withScore(readLocal(game), row);
  writeLocal(game, local);
  return { rows: local, shared: false };
}

/** El nombre que se usó la última vez, para no tener que escribirlo de nuevo. */
export function rememberedName(): string {
  try {
    return cleanName(window.localStorage.getItem(NAME_KEY) ?? "");
  } catch {
    return "";
  }
}

export function rememberName(name: string) {
  try {
    window.localStorage.setItem(NAME_KEY, cleanName(name));
  } catch {
    // No pasa nada: la próxima vez se escribe de nuevo.
  }
}
