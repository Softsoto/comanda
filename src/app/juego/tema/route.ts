import { getGameTheme } from "@/lib/game-theme-data";

export const dynamic = "force-dynamic";

/** La personalización de los juegos escondidos (textos, nombre y dibujos). Es pública: la usa cualquiera que abra los juegos. */
export async function GET() {
  return Response.json({ theme: await getGameTheme() }, { headers: { "cache-control": "no-store" } });
}
