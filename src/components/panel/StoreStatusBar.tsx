import Link from "next/link";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { setOpenModeAction } from "@/lib/actions/store";
import type { Billing } from "@/lib/billing";
import { APP_NAME } from "@/lib/config";
import type { Business } from "@/lib/data";
import { formatDay } from "@/lib/dates";
import { OPEN_MODES, getOpenStatus, hasAnyHours } from "@/lib/hours";
import { billingOf } from "@/lib/plans-data";
import { getSettings } from "@/lib/settings";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const optionClass = (selected: boolean) =>
  `btn btn-sm px-3 ${
    selected ? "border border-brand bg-brand-tint text-ink ring-1 ring-brand" : "border border-line bg-raised text-ink hover:border-ink"
  }`;

/** Aviso sobre el plan del comercio: por vencer, en días de gracia o vencido. */
function BillingNotice({ billing, business, supportWhatsapp }: { billing: Billing; business: Business; supportWhatsapp: string }) {
  if (billing.state !== "por-vencer" && billing.state !== "gracia" && billing.state !== "vencido") return null;
  const paidUntil = formatDay(billing.paidUntil as string);
  const expired = billing.state === "vencido";
  const contactUrl = supportWhatsapp
    ? buildWhatsAppUrl(supportWhatsapp, `Hola, quiero renovar el plan de ${business.name} en ${APP_NAME}.`)
    : null;
  return (
    <div className={`border-b print:hidden ${expired ? "border-danger/40" : "border-line/25 bg-brand-tint"}`} role="status">
      <p className="mx-auto w-full max-w-4xl px-4 py-2.5 text-sm">
        {billing.state === "por-vencer" && (
          <>
            <strong className="font-semibold">
              Tu plan vence {billing.daysLeft === 1 ? "hoy" : billing.daysLeft === 2 ? "mañana" : `el ${paidUntil}`}.
            </strong>{" "}
            Renuévalo para que tu menú siga recibiendo pedidos.
          </>
        )}
        {billing.state === "gracia" && (
          <>
            <strong className="font-semibold">Tu plan venció el {paidUntil}.</strong> Tu menú seguirá funcionando hasta
            el {formatDay(billing.lastDay as string)}; después dejará de mostrarse hasta que renueves.
          </>
        )}
        {expired && (
          <>
            <strong className="font-semibold text-danger">Tu plan venció el {paidUntil}.</strong> Tu menú no se muestra
            a los clientes ni recibe pedidos hasta que renueves. Tus datos se conservan.
          </>
        )}{" "}
        {contactUrl ? (
          <a href={contactUrl} target="_blank" rel="noopener noreferrer" className="link">
            Escribir para renovar
          </a>
        ) : (
          "Comunícate con el administrador del servicio para renovar."
        )}
      </p>
    </div>
  );
}

/**
 * Franja fija en lo alto del panel: dice si la tienda está recibiendo pedidos
 * y deja cambiarlo con un toque: abierto, cerrado o según el horario. Encima
 * va el aviso del plan cuando está por vencer o vencido.
 */
export async function StoreStatusBar({ business }: { business: Business }) {
  // Suspendida por el administrador del servicio: abrir o cerrar no cambia nada, así que se explica.
  if (business.isSuspended) {
    return (
      <div className="border-b border-danger/40 print:hidden" role="status">
        <p className="mx-auto w-full max-w-4xl px-4 py-2.5 text-sm">
          <strong className="font-semibold text-danger">Tu tienda está suspendida.</strong> Tu menú no se muestra a
          los clientes ni recibe pedidos. Comunícate con el administrador del servicio para reactivarla.
        </p>
      </div>
    );
  }

  const [billing, settings] = await Promise.all([billingOf(business), getSettings()]);
  const notice = <BillingNotice billing={billing} business={business} supportWhatsapp={settings.supportWhatsapp} />;
  // Con el plan vencido el menú está fuera de línea: abrir o cerrar la tienda no cambia nada.
  if (billing.state === "vencido") return notice;

  const status = getOpenStatus(business.openMode, business.schedule, new Date(), business.timezone);
  const missingHours = business.openMode === "horario" && !hasAnyHours(business.schedule);

  return (
    <>
    {notice}
    <div className="border-b border-line/25 print:hidden">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <p className="flex min-w-0 flex-1 basis-56 items-baseline gap-2 text-sm">
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 shrink-0 translate-y-px rounded-full ${status.open ? "bg-brand" : "bg-danger"}`}
          />
          <span>
            <strong className="font-semibold">
              {status.open ? "Tu tienda está abierta." : "Tu tienda está cerrada."}
            </strong>{" "}
            <span className="text-muted">
              {missingHours
                ? "Elegiste “Según horario”, pero aún no has definido las horas."
                : status.detail || (status.open ? "Recibes pedidos." : "No recibes pedidos hasta que la abras.")}
            </span>
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <form action={setOpenModeAction} role="group" aria-label="Recibir pedidos" className="flex flex-wrap gap-1.5">
            {OPEN_MODES.map((mode) => (
              <SubmitButton
                key={mode.value}
                name="mode"
                value={mode.value}
                pressed={business.openMode === mode.value}
                className={optionClass(business.openMode === mode.value)}
              >
                {mode.label}
              </SubmitButton>
            ))}
          </form>
          <Link href="/panel/horarios" className="link text-sm">
            Horarios
          </Link>
        </div>
      </div>
    </div>
    </>
  );
}
