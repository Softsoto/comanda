import { clientAddress } from "@/lib/auth";
import { query } from "@/lib/db";
import { isLimited, recordAttempt } from "@/lib/rate-limit";
import { TOP, cleanName, cleanScore, isGame, type GameId, type ScoreRow } from "@/lib/scores";

export const dynamic = "force-dynamic";

const top = (game: GameId) =>
  query<ScoreRow>("select name, score from game_scores where game = $1 order by score desc, created_at asc limit $2", [game, TOP]);

/** Los mejores puntajes de un juego escondido. */
export async function GET(request: Request) {
  const game = new URL(request.url).searchParams.get("juego");
  if (!isGame(game)) return Response.json({ error: "Juego desconocido." }, { status: 400 });
  return Response.json({ scores: await top(game) });
}

/** Guarda un puntaje. Cualquiera puede llamarla, así que revisa todo y limita cuántos se guardan por visitante. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const game = body?.game;
  if (!isGame(game)) return Response.json({ error: "Juego desconocido." }, { status: 400 });
  const name = cleanName(body?.name);
  const score = cleanScore(game, body?.score);
  if (!name || score === null) return Response.json({ error: "Falta el nombre o el puntaje." }, { status: 400 });

  const address = await clientAddress();
  const key = `puntaje:${address}`;
  if (isLimited(key, address === "local" ? 300 : 30)) return Response.json({ error: "Demasiados puntajes seguidos." }, { status: 429 });
  recordAttempt(key);

  await query("insert into game_scores (game, name, score) values ($1, $2, $3)", [game, name, score]);
  // Solo hacen falta los mejores: lo que quede muy abajo en la tabla se borra.
  await query(
    "delete from game_scores where game = $1 and id not in (select id from game_scores where game = $1 order by score desc, created_at asc limit 100)",
    [game],
  );
  return Response.json({ scores: await top(game) });
}
