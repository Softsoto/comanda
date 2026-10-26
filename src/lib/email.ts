import "server-only";

import fs from "node:fs";
import path from "node:path";
import { APP_NAME } from "./config";
import { isLocalDatabase, localDataDir } from "./db";

/**
 * Envío de correos (por ahora, el de recuperar la contraseña).
 *
 * - Con SMTP_URL: se envían de verdad, por el servicio de correo que se indique
 *   (Gmail, Brevo, Mailgun, el correo del hosting… cualquiera que dé datos SMTP).
 * - Sin SMTP_URL, probando en el computador: no se envía nada; cada correo se
 *   guarda como archivo de texto en data/correos para poder leerlo.
 * - Sin SMTP_URL en internet: no hay cómo enviar; la app lo dice con claridad.
 */
export type EmailMode = "smtp" | "archivo" | "ninguno";

export function emailMode(): EmailMode {
  if (process.env.SMTP_URL?.trim()) return "smtp";
  return isLocalDatabase() && !process.env.VERCEL ? "archivo" : "ninguno";
}

export type EmailResult =
  | { ok: true; mode: "smtp" }
  /** `file`: dónde quedó guardado, relativo a la carpeta del proyecto. */
  | { ok: true; mode: "archivo"; file: string }
  | { ok: false; error: string };

/** Remitente: el de EMAIL_FROM o, si no está, el usuario de SMTP_URL cuando es un correo. */
function sender(): string | null {
  const configured = process.env.EMAIL_FROM?.trim();
  if (configured) return configured;
  try {
    const user = decodeURIComponent(new URL(process.env.SMTP_URL as string).username);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user) ? `"${APP_NAME}" <${user}>` : null;
  } catch {
    return null;
  }
}

/**
 * Con "smtp://" la conexión empieza sin cifrar y se cifra enseguida (STARTTLS).
 * Aquí se exige ese cifrado: si el servidor no lo ofrece, no se envía nada, y
 * así el usuario y la contraseña del correo nunca viajan a la vista por
 * internet. No aplica a un servidor en este mismo computador, ni cuando la
 * propia dirección ya dice qué hacer (?requireTLS=… o ?ignoreTLS=…).
 */
function mustEncrypt(smtpUrl: string): boolean {
  try {
    const url = new URL(smtpUrl);
    const sameMachine = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const decided = url.searchParams.has("requireTLS") || url.searchParams.has("ignoreTLS");
    return url.protocol === "smtp:" && !sameMachine && !decided;
  } catch {
    return false; // dirección mal escrita: el error lo da el envío
  }
}

/** Explica en español los fallos más comunes al enviar; el detalle técnico queda al final. */
function explainSendError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: unknown } | null)?.code;
  const unreachable = "No se pudo conectar con el servidor de correo. Revisa el servidor y el puerto en SMTP_URL.";
  const hints: Record<string, string> = {
    EAUTH: "El servidor de correo no aceptó el usuario o la contraseña. Revisa SMTP_URL.",
    ENOAUTH: "Falta el usuario o la contraseña en SMTP_URL.",
    ETLS: "No se pudo cifrar la conexión con el servidor de correo. Prueba con smtps:// y el puerto 465.",
    EDNS: "No se encontró el servidor de correo. Revisa su nombre en SMTP_URL.",
    ECONNECTION: unreachable,
    ESOCKET: unreachable,
    ETIMEDOUT: "El servidor de correo no respondió a tiempo. Revisa el servidor y el puerto en SMTP_URL.",
    EENVELOPE: "El servidor de correo rechazó el remitente o el destinatario. Revisa EMAIL_FROM.",
    EMESSAGE: "El servidor de correo rechazó el mensaje.",
  };
  const hint = typeof code === "string" ? hints[code] : undefined;
  return hint ? `${hint} (Detalle: ${detail})` : detail;
}

export async function sendEmail(message: { to: string; subject: string; text: string }): Promise<EmailResult> {
  const mode = emailMode();

  if (mode === "ninguno") {
    return { ok: false, error: "Este servicio no tiene configurado el envío de correos." };
  }

  if (mode === "archivo") {
    const folder = path.join(localDataDir(), "correos");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const name = `${stamp}-${message.to.replace(/[^a-z0-9@._-]/gi, "_").slice(0, 60)}.txt`;
    try {
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(
        path.join(folder, name),
        `Para: ${message.to}\nAsunto: ${message.subject}\nFecha: ${new Date().toISOString()}\n\n${message.text}\n`,
      );
    } catch (error) {
      return { ok: false, error: `No se pudo guardar el correo: ${error instanceof Error ? error.message : String(error)}` };
    }
    return { ok: true, mode: "archivo", file: path.join("data", "correos", name) };
  }

  const from = sender();
  if (!from) {
    return { ok: false, error: "Falta EMAIL_FROM: el correo desde el que se envían los mensajes (por ejemplo, avisos@tudominio.com)." };
  }
  try {
    const { createTransport } = await import("nodemailer");
    const smtpUrl = (process.env.SMTP_URL as string).trim();
    const transport = createTransport({
      url: smtpUrl,
      ...(mustEncrypt(smtpUrl) ? { requireTLS: true } : {}),
      // Si el servidor de correo no responde, se avisa pronto en vez de dejar a la persona esperando.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    await transport.sendMail({ from, to: message.to, subject: message.subject, text: message.text });
    return { ok: true, mode: "smtp" };
  } catch (error) {
    console.error("[correo] no se pudo enviar:", error);
    return { ok: false, error: explainSendError(error) };
  }
}
