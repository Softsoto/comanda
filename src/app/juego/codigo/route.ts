import { clientAddress } from "@/lib/auth";
import { findCode } from "@/lib/game-codes";
import { getGameCodes, recordCodeUse } from "@/lib/game-codes-data";
import { isLimited, recordAttempt } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Revisa un código escrito en la consola de los juegos escondidos. Si existe y
 * está activo, devuelve su anuncio; si no, solo dice que no. Limita los intentos
 * por visitante para que nadie pruebe códigos a ciegas.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const address = await clientAddress();
  const key = `codigo:${address}`;
  if (isLimited(key, address === "local" ? 200 : 20)) {
    return Response.json({ ok: false, reason: "limite" }, { status: 429, headers: { "cache-control": "no-store" } });
  }
  recordAttempt(key);
  const found = findCode(await getGameCodes(), body?.code);
  if (!found) return Response.json({ ok: false, reason: "no" }, { headers: { "cache-control": "no-store" } });
  await recordCodeUse(found.code);
  return Response.json({ ok: true, code: found.code, title: found.title, text: found.text }, { headers: { "cache-control": "no-store" } });
}
