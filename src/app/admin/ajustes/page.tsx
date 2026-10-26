import type { Metadata } from "next";
import Link from "next/link";
import { BillingSettingsForm, PrivacySettingsForm } from "@/components/admin/BillingForms";
import { BackupRestore, EmailTestButton } from "@/components/admin/ServiceTools";
import { DownloadIcon } from "@/components/ui/icons";
import { requireAdmin } from "@/lib/admin";
import { DEFAULT_COUNTRY_CODE, DEMO_SLUG } from "@/lib/config";
import { isLocalDatabase } from "@/lib/db";
import { emailMode } from "@/lib/email";
import { getTrustedBaseUrl } from "@/lib/panel";
import { splitWhatsapp } from "@/lib/phone";
import { DEFAULT_PRIVACY_TEXT } from "@/lib/privacy";
import { getSettings } from "@/lib/settings";
import { AUTO_BACKUP_DIR, AUTO_BACKUP_EVERY, autoBackupsEnabled, listAutoBackups } from "@/lib/auto-backup";

export const metadata: Metadata = { title: "Ajustes" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const admin = await requireAdmin();
  const settings = await getSettings();
  const support = splitWhatsapp(settings.supportWhatsapp);
  const mail = emailMode();
  const local = isLocalDatabase();
  // El enlace del correo se arma con una dirección fija, nunca con la de la petición.
  const linkBase = getTrustedBaseUrl();
  const autoOn = autoBackupsEnabled();
  const autoList = autoOn ? listAutoBackups() : [];
  const lastAuto = autoList[0];
  const autoCount = autoList.length;
  const autoDir = AUTO_BACKUP_DIR;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="font-display text-display font-bold">Ajustes</h1>
        <p className="mt-1 max-w-2xl text-muted">Lo que vale para todo el servicio, no para un comercio en particular.</p>
      </div>

      <section className="card" aria-labelledby="ajustes-cobro">
        <h2 id="ajustes-cobro" className="font-display text-title font-bold">
          Cobro a los comercios
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Los planes se crean en{" "}
          <Link href="/admin/planes" className="link">
            Planes
          </Link>
          . Aquí decides cuánto dura la prueba y qué pasa al vencer.
        </p>
        <BillingSettingsForm
          trialDays={String(settings.trialDays)}
          graceDays={String(settings.graceDays)}
          serviceCurrency={settings.serviceCurrency}
          countryCode={settings.supportWhatsapp ? support.code : DEFAULT_COUNTRY_CODE}
          phone={support.local}
        />
      </section>

      <section className="card" aria-labelledby="ajustes-datos">
        <h2 id="ajustes-datos" className="font-display text-title font-bold">
          Aviso de tratamiento de datos
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Cada menú enlaza a un aviso que explica qué datos se piden al cliente y para qué.{" "}
          <Link href={`/m/${DEMO_SLUG}/privacidad`} target="_blank" className="link">
            Ver cómo se ve
          </Link>
          . El texto incluido es una plantilla general: pídele a un abogado que la revise según las normas de tu país
          antes de usar el servicio con clientes reales.
        </p>
        <PrivacySettingsForm
          privacyText={settings.privacyText}
          privacyCheckbox={settings.privacyCheckbox}
          template={DEFAULT_PRIVACY_TEXT}
        />
      </section>

      <section className="card" aria-labelledby="ajustes-correo">
        <h2 id="ajustes-correo" className="font-display text-title font-bold">
          Correo
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Se usa para que un comercio recupere su contraseña sin tener que escribirte.{" "}
          {mail === "smtp" && linkBase && (
            <>
              <strong className="font-semibold text-ink">Está conectado:</strong> los correos se envían de verdad, y
              el enlace para cambiar la contraseña lleva a <span className="break-all">{linkBase}</span>.
            </>
          )}
          {mail === "smtp" && !linkBase && (
            <>
              <strong className="font-semibold text-ink">Falta un dato:</strong> el correo ya está conectado, pero
              para enviar el enlace de cambio de contraseña la app necesita saber su dirección pública. Añade{" "}
              <code>APP_URL</code> con la dirección de tu página (por ejemplo{" "}
              <code>https://menu.tudominio.com</code>) y reinicia. Mientras tanto, la página de recuperar contraseña
              les dice a los comercios que te escriban.
            </>
          )}
          {mail === "archivo" && (
            <>
              <strong className="font-semibold text-ink">Aún no hay un servicio de correo conectado:</strong> los
              mensajes no se envían; quedan guardados como archivos de texto en la carpeta <code>data/correos</code>.
              Para enviarlos de verdad, añade <code>SMTP_URL</code>, <code>EMAIL_FROM</code> y{" "}
              <code>APP_URL</code> (la guía explica cómo).
            </>
          )}
          {mail === "ninguno" && (
            <>
              <strong className="font-semibold text-ink">No está configurado:</strong> la página de recuperar
              contraseña les dice a los comercios que te escriban. Para activarlo, añade <code>SMTP_URL</code> y{" "}
              <code>EMAIL_FROM</code> (la guía explica cómo).
            </>
          )}
        </p>
        {mail !== "ninguno" && (
          <>
            <EmailTestButton />
            <p className="mt-3 text-sm text-muted">El correo de prueba llega a tu cuenta: {admin.email}.</p>
          </>
        )}
      </section>

      <section className="card" aria-labelledby="ajustes-copia">
        <h2 id="ajustes-copia" className="font-display text-title font-bold">
          Copia de seguridad
        </h2>
        <p className="mt-1 text-sm text-muted">
          Un solo archivo con todo: comercios, menús, fotos, pedidos, pagos, ajustes y lo de los juegos escondidos
          (personalización, códigos y puntajes). Descárgala cada cierto tiempo y guárdala fuera de este{" "}
          {local ? "computador" : "servidor"}.
        </p>
        <div className="mt-3">
          <a href="/admin/copia" className="btn btn-primary" download>
            <DownloadIcon width={20} height={20} />
            Descargar copia de seguridad
          </a>
        </div>
        {autoOn ? (
          <p className="mt-3 text-sm text-muted" role="note">
            <strong className="text-ink">Copias automáticas:</strong> mientras la app está encendida, guarda sola una copia{" "}
            {AUTO_BACKUP_EVERY} y conserva las más recientes en la carpeta <code className="break-all">{autoDir}</code>.{" "}
            {lastAuto
              ? `La última es del ${lastAuto.date.toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" })} (${autoCount} guardadas).`
              : "Todavía no hay ninguna: la primera se hace a los pocos minutos de encender la app."}
          </p>
        ) : null}

        <details className="mt-4 border-t border-line/25 pt-3">
          <summary className="link inline-flex min-h-9 cursor-pointer items-center">Restaurar una copia</summary>
          <p className="mt-2 mb-4 text-sm text-muted">
            Sirve para recuperarte de un daño o para mudarte a otro servidor. Reemplaza todo lo que hay ahora, así que
            primero descarga una copia de lo actual.{" "}
            {local
              ? "Antes de reemplazar, la app guarda sola una copia de lo que había en la carpeta data/copias."
              : "Con copias grandes (muchas fotos) algunos servidores cortan la subida: en ese caso usa el comando “npm run restaurar”, que está en la guía."}
          </p>
          <BackupRestore />
        </details>
      </section>
    </div>
  );
}
