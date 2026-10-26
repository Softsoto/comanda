import type { Metadata } from "next";
import Link from "next/link";
import { RecoverForm } from "@/components/panel/AuthForms";
import { AuthShell } from "@/components/ui/SiteChrome";
import { APP_NAME } from "@/lib/config";
import { emailMode } from "@/lib/email";
import { getTrustedBaseUrl } from "@/lib/panel";
import { getSettings } from "@/lib/settings";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Recuperar contraseña" };
export const dynamic = "force-dynamic";

export default async function RecoverPage() {
  const mode = emailMode();
  // Con correo de verdad hace falta además una dirección de confianza para el enlace (APP_URL).
  const canSend = mode === "archivo" || (mode === "smtp" && getTrustedBaseUrl() !== null);
  const settings = await getSettings();
  const supportUrl = settings.supportWhatsapp
    ? buildWhatsAppUrl(settings.supportWhatsapp, `Hola, olvidé la contraseña de mi cuenta de ${APP_NAME}.`)
    : null;

  return (
    <AuthShell
      title="Recupera tu contraseña"
      intro={
        canSend
          ? "Escribe el correo con el que creaste tu cuenta y te enviamos un enlace para elegir una contraseña nueva."
          : "Este servicio todavía no envía correos, así que la contraseña la cambia el administrador."
      }
      footer={
        <p className="text-muted">
          <Link href="/entrar" className="link">
            Volver a entrar
          </Link>
        </p>
      }
    >
      {canSend ? (
        <RecoverForm />
      ) : (
        <p>
          Escríbele al administrador del servicio y pídele una contraseña nueva. Después podrás cambiarla en tu panel,
          en <strong className="font-semibold">Tienda</strong>.
        </p>
      )}
      {supportUrl && (
        <p className="mt-4 text-sm text-muted">
          ¿No te llega el correo o ya no usas ese correo?{" "}
          <a href={supportUrl} target="_blank" rel="noopener noreferrer" className="link">
            Escríbele al administrador
          </a>
          .
        </p>
      )}
    </AuthShell>
  );
}
