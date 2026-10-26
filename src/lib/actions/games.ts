"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { cleanTheme, unknownSigns } from "@/lib/game-theme";
import { cleanCodes } from "@/lib/game-codes";
import { saveGameCodes } from "@/lib/game-codes-data";
import { THEME_MAX_BYTES, resetGameTheme, saveGameTheme } from "@/lib/game-theme-data";

/**
 * Guardar la personalización de los juegos escondidos desde /admin/juegos.
 * Solo el administrador puede hacerlo; lo que llega se revisa entero antes de guardarlo.
 */

export type ThemeSaveResult = { ok: boolean; message: string; problems: string[] };

export async function saveGameThemeAction(json: string): Promise<ThemeSaveResult> {
  await requireAdmin();
  if (typeof json !== "string" || json.length > THEME_MAX_BYTES) return { ok: false, message: "La personalización es demasiado grande.", problems: [] };
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    return { ok: false, message: "No se pudo leer la personalización.", problems: [] };
  }
  const { theme, problems } = cleanTheme(input);
  await saveGameTheme(theme);
  revalidatePath("/admin/juegos");
  const signs = unknownSigns(theme);
  if (signs.length > 0) problems.push(`Estos signos no existen en las letras de píxeles y saldrán como "?": ${signs.join(" ")}`);
  return { ok: true, message: problems.length > 0 ? "Guardado, con avisos." : "Guardado. Los juegos ya usan los cambios.", problems };
}

/** Guarda los códigos de la consola (van aparte de la personalización, porque esa es pública). */
export async function saveGameCodesAction(json: string): Promise<ThemeSaveResult> {
  await requireAdmin();
  if (typeof json !== "string" || json.length > 200_000) return { ok: false, message: "Son demasiados códigos.", problems: [] };
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    return { ok: false, message: "No se pudieron leer los códigos.", problems: [] };
  }
  const codes = cleanCodes(input);
  const given = Array.isArray(input) ? input.length : 0;
  await saveGameCodes(codes);
  revalidatePath("/admin/juegos");
  const problems = given > codes.length ? [`Se descartaron ${given - codes.length} códigos sin código, título o texto, o repetidos.`] : [];
  return { ok: true, message: "Códigos guardados.", problems };
}

export async function resetGameThemeAction(): Promise<ThemeSaveResult> {
  await requireAdmin();
  await resetGameTheme();
  revalidatePath("/admin/juegos");
  return { ok: true, message: "Listo: los juegos vuelven a lo de siempre.", problems: [] };
}
