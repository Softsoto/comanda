"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { clientAddress } from "@/lib/auth";
import { APP_NAME } from "@/lib/config";
import { findUserByEmail } from "@/lib/data";
import { emailMode, sendEmail, type EmailMode } from "@/lib/email";
import { isEmail, readText, type FormState } from "@/lib/form";
import { getBaseUrl, getTrustedBaseUrl } from "@/lib/panel";
import { hashPassword, passwordProblem } from "@/lib/password";
import { RESET_MINUTES, consumePasswordReset, createPasswordReset } from "@/lib/password-reset";
import { isLimited, recordAttempt } from "@/lib/rate-limit";

/**
 * Dirección con la que se arma el enlace del correo, o null si no hay una de
 * confianza. Probando en el computador (el correo se guarda como archivo y no
 * sale de ahí) vale la dirección con la que se abrió la página.
 */
async function resetLinkBase(mode: EmailMode): Promise<string | null> {
  if (mode === "ninguno") return null;
  return mode === "archivo" ? getBaseUrl() : getTrustedBaseUrl();
}

/** Pide un enlace para cambiar la contraseña. Responde lo mismo exista o no la cuenta. */
export async function requestPasswordResetAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const email = readText(formData, "email", 254).toLowerCase();
  const values = { email };
  if (!isEmail(email)) return { errors: { email: "Escribe el correo de tu cuenta, por ejemplo nombre@correo.com." }, values };

  const mode = emailMode();
  const base = await resetLinkBase(mode);
  if (!base) {
    return { message: "Este servicio todavía no envía correos. Pídele al administrador que te cambie la contraseña.", values };
  }

  // Dos límites: por cuenta (para no llenarle el buzón a nadie) y por origen.
  const accountKey = `recuperar:cuenta:${email}`;
  const addressKey = `recuperar:origen:${await clientAddress()}`;
  if (isLimited(accountKey, 3) || isLimited(addressKey, 10)) {
    return { message: "Demasiados intentos. Espera unos minutos y vuelve a probar.", values };
  }
  recordAttempt(accountKey);
  recordAttempt(addressKey);

  const user = await findUserByEmail(email);
  if (user) {
    const token = await createPasswordReset(user.id);
    const url = `${base}/restablecer/${token}`;
    const result = await sendEmail({
      to: user.email,
      subject: `Cambia tu contraseña de ${APP_NAME}`,
      text: [
        "Hola:",
        "",
        `Recibimos una solicitud para cambiar la contraseña de tu cuenta de ${APP_NAME} (${user.email}).`,
        "",
        `Para elegir una contraseña nueva, abre este enlace. Sirve durante ${RESET_MINUTES} minutos y una sola vez:`,
        "",
        url,
        "",
        "Si no fuiste tú, no hagas nada: tu contraseña sigue igual.",
      ].join("\n"),
    });
    if (!result.ok) {
      return { message: "No pudimos enviar el correo en este momento. Intenta de nuevo en unos minutos.", values };
    }
  }

  // La respuesta es la misma exista o no la cuenta: así nadie puede averiguar qué correos están registrados.
  return {
    ok: true,
    message:
      mode === "archivo"
        ? "Si ese correo tiene una cuenta, el mensaje con el enlace quedó guardado en la carpeta data/correos (esta instalación aún no tiene un servicio de correo conectado)."
        : "Si ese correo tiene una cuenta, le enviamos un enlace para cambiar la contraseña. Revisa también la carpeta de correo no deseado.",
  };
}

/** Cambia la contraseña con el código del enlace recibido por correo. */
export async function resetPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const repeat = String(formData.get("repeatPassword") ?? "");

  const errors: Record<string, string> = {};
  const problem = passwordProblem(next);
  if (problem) errors.newPassword = problem;
  else if (next !== repeat) errors.repeatPassword = "Las dos contraseñas no coinciden.";
  if (Object.keys(errors).length > 0) return { errors };

  const changed = await consumePasswordReset(token, await hashPassword(next));
  if (!changed) return { message: "Este enlace ya no sirve: venció o ya se usó. Pide uno nuevo." };
  redirect("/entrar?clave=cambiada");
}

/** Desde la administración: envía un correo de prueba a la cuenta del administrador. */
export async function sendTestEmailAction(): Promise<FormState> {
  const admin = await requireAdmin();
  const result = await sendEmail({
    to: admin.email,
    subject: `Correo de prueba de ${APP_NAME}`,
    text: `Hola:\n\nSi estás leyendo esto, ${APP_NAME} ya puede enviar correos. No tienes que hacer nada más.`,
  });
  if (!result.ok) return { message: `No se pudo enviar: ${result.error}` };
  return {
    ok: true,
    message:
      result.mode === "smtp"
        ? `Correo enviado a ${admin.email}. Revisa tu buzón (y la carpeta de correo no deseado).`
        : `No hay servicio de correo configurado: el mensaje quedó guardado en ${result.file}.`,
  };
}
