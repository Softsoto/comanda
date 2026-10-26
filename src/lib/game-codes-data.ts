import "server-only";

import { query } from "./db";
import { EXAMPLE_CODES, cleanCodes, type GameCode } from "./game-codes";

/** Dónde se guardan los códigos, dentro de la tabla de ajustes (no es pública). */
const KEY = "game_codes";

export async function getGameCodes(): Promise<GameCode[]> {
  const rows = await query<{ value: string }>("select value from settings where key = $1", [KEY]);
  if (rows.length === 0) return EXAMPLE_CODES;
  try {
    return cleanCodes(JSON.parse(rows[0].value));
  } catch {
    return [];
  }
}

export async function saveGameCodes(codes: GameCode[]): Promise<void> {
  await query("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [KEY, JSON.stringify(codes)]);
}

/** Anota que alguien usó un código (para que el administrador vea cuántas veces). */
export async function recordCodeUse(code: string): Promise<void> {
  await query("insert into game_code_uses (code) values ($1)", [code]);
}

/** Cuántas veces se ha usado cada código. */
export async function codeUseCounts(): Promise<Record<string, number>> {
  const rows = await query<{ code: string; uses: string }>("select code, count(*)::text as uses from game_code_uses group by code");
  return Object.fromEntries(rows.map((row) => [row.code, Number(row.uses)]));
}
