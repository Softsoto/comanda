"use server";

import { currentSessionHash, requireUser } from "@/lib/auth";
import { getPasswordHash, setPassword } from "@/lib/data";
import type { FormState } from "@/lib/form";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { isLimited, recordAttempt } from "@/lib/rate-limit";

/** Cambia la contraseña de la cuenta que tiene la sesión abierta. */
export async function changePasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const repeat = String(formData.get("repeatPassword") ?? "");

  const errors: Record<string, string> = {};
  const problem = passwordProblem(next, "La contraseña nueva");
  if (problem) errors.newPassword = problem;
  else if (next !== repeat) errors.repeatPassword = "Las dos contraseñas nuevas no coinciden.";
  if (Object.keys(errors).length > 0) return { errors };

  const limitKey = `clave:${user.id}`;
  if (isLimited(limitKey, 8)) return { message: "Demasiados intentos. Espera unos minutos y vuelve a probar." };

  const stored = await getPasswordHash(user.id);
  if (!stored || !(await verifyPassword(current, stored))) {
    recordAttempt(limitKey);
    return { errors: { currentPassword: "Esa no es tu contraseña actual." } };
  }

  // Las sesiones abiertas en otros dispositivos se cierran; esta se conserva.
  await setPassword(user.id, await hashPassword(next), await currentSessionHash());
  return { ok: true, message: "Contraseña cambiada." };
}
