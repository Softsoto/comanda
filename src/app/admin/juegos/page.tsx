import type { Metadata } from "next";
import { GameDesigner } from "@/components/admin/games/GameDesigner";
import { requireAdmin } from "@/lib/admin";
import { FOOTER_CREDIT } from "@/lib/config";
import { codeUseCounts, getGameCodes } from "@/lib/game-codes-data";
import { getGameTheme } from "@/lib/game-theme-data";

export const metadata: Metadata = { title: "Juegos" };
export const dynamic = "force-dynamic";

/** Panel de diseño de los juegos escondidos ("Dos Lunas"): textos, nombre, logros, secreto final, códigos, personajes, paisajes y fundaciones. */
export default async function GamesDesignPage() {
  await requireAdmin();
  const [theme, codes, codeUses] = await Promise.all([getGameTheme(), getGameCodes(), codeUseCounts()]);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="font-display text-display font-bold">Juegos</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Los juegos escondidos “Dos Lunas” se abren tocando 5 veces seguidas “{FOOTER_CREDIT}”, al pie de las páginas. Aquí cambias sus textos, el nombre que se
          junta en los juegos, los logros y el secreto final, los códigos de la consola, los personajes, los paisajes y las fundaciones de animales. Nada cambia para los demás hasta que pulses Guardar.
        </p>
      </div>
      <GameDesigner initial={theme} codes={codes} codeUses={codeUses} />
    </div>
  );
}
