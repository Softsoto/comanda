/**
 * Los dibujos originales de cada personaje, para mostrarlos en el panel y para
 * empezar a editar desde ellos.
 *
 * Ojo: los juegos cambian el contenido de estos dibujos cuando se aplica una
 * personalización (ver secret/theme.ts). Si en esta página ya se aplicó una
 * (por ejemplo, alguien abrió los juegos antes de llegar aquí), se ponen un
 * momento los de siempre para copiarlos y luego se vuelve a la que estaba.
 */

import { FLOWER, FLOWER_COLORS, GHOST, GHOST_COLORS, NINJA, NINJA_COLORS } from "@/components/secret/art";
import * as kit from "@/components/secret/games/kit";
import { applyTheme, currentTheme } from "@/components/secret/theme";
import { defaultTheme, type SpriteArt, type SpriteSlot } from "@/lib/game-theme";
import { toArt, toEditable } from "@/lib/sprite-edit";

const copy = (rows: readonly string[], colors: Readonly<Record<string, string>>) => ({ rows: [...rows], colors: { ...colors } });
const read = () => ({
  hero: copy(NINJA.stand, NINJA_COLORS),
  heroSmall: copy(kit.NINJA[0], kit.NINJA_COLORS),
  friend: copy(GHOST.open, GHOST_COLORS),
  friendSmall: copy(kit.SPIRIT[0], kit.SPIRIT_COLORS[0]),
  prize: copy(FLOWER, FLOWER_COLORS),
  prizeSmall: copy(kit.FLOWER, kit.FLOWER_COLORS),
  car: copy(kit.CAR, kit.CAR_COLORS),
});

function snapshot(): Record<SpriteSlot, { rows: string[]; colors: Record<string, string> }> {
  const inUse = currentTheme();
  if (Object.keys(inUse.sprites).length === 0) return read();
  applyTheme(defaultTheme());
  const originals = read();
  applyTheme(inUse);
  return originals;
}

const RAW = snapshot();

/** El dibujo original de un personaje, con caracteres válidos para editarlo y guardarlo. */
export function originalArt(slot: SpriteSlot): SpriteArt {
  const raw = RAW[slot];
  const { grid, palette } = toEditable(raw, raw.rows[0].length, raw.rows.length);
  return toArt(grid, palette);
}

/** El pequeño que corresponde a cada grande ("Hacer a partir del grande"). */
export const BIG_OF: Partial<Record<SpriteSlot, SpriteSlot>> = { heroSmall: "hero", friendSmall: "friend", prizeSmall: "prize" };
