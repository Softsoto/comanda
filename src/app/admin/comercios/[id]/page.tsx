import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SetPasswordForm } from "@/components/admin/AdminForms";
import { BillingBadge } from "@/components/admin/BillingBadge";
import { BusinessPlanForm, PaymentForm } from "@/components/admin/BillingForms";
import { StatusBadge, itemsSummary } from "@/components/panel/OrderBits";
import { RangeFilter } from "@/components/panel/RangeFilter";
import { ChevronLeftIcon, DownloadIcon, ExternalIcon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { adminDeleteBusinessAction, adminSuspendAction } from "@/lib/actions/admin";
import { deletePaymentAction } from "@/lib/actions/billing";
import { requireAdmin } from "@/lib/admin";
import { getAdminBusiness } from "@/lib/admin-data";
import { billingStatus, extendPaidUntil } from "@/lib/billing";
import { TIMEZONES, addDays, dayKey, dayStart, formatDay, formatWhen, rangeInstants, todayKey } from "@/lib/dates";
import { filtersToQuery, readFilters, type SearchParams } from "@/lib/filters";
import { formatMoney } from "@/lib/money";
import { listOrders, summarizeByStatus } from "@/lib/orders-data";
import { formatWhatsapp } from "@/lib/phone";
import { listPayments, listPlans } from "@/lib/plans-data";
import { getSettings } from "@/lib/settings";
import { isUuid } from "@/lib/slug";

export const metadata: Metadata = { title: "Comercio" };
export const dynamic = "force-dynamic";

const SHOWN = 50;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> };

export default async function AdminBusinessPage({ params, searchParams }: Props) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  // Primero el negocio, para usar su zona horaria en las fechas.
  const base = await getAdminBusiness(id, new Date(0));
  if (!base) notFound();
  const timeZone = base.timezone;
  const business = (await getAdminBusiness(id, dayStart(addDays(todayKey(timeZone), -29), timeZone))) ?? base;

  const filters = readFilters(await searchParams, timeZone, "30d");
  const { start, end } = rangeInstants(filters.range, timeZone);
  const [summary, orders, plans, payments, settings] = await Promise.all([
    summarizeByStatus(business.id, { start, end }),
    listOrders(business.id, { start, end }, SHOWN),
    listPlans(),
    listPayments({ businessId: business.id, limit: 24 }),
    getSettings(),
  ]);
  const today = todayKey(timeZone);
  const billing = billingStatus(business.paidUntil, today, settings.graceDays);
  const plan = plans.find((item) => item.id === business.planId) ?? null;
  // Lo que cubriría un pago de un mes registrado hoy.
  const nextPeriod = extendPaidUntil(business.paidUntil, today, 1);
  const inRange = Object.values(summary).reduce((sum, item) => sum + item.count, 0);
  const path = `/admin/comercios/${business.id}`;
  const zone = TIMEZONES.find((item) => item.value === timeZone)?.label ?? timeZone;
  const now = new Date();
  const isSelf = business.ownerId === admin.id;

  const facts: { label: string; value: string }[] = [
    { label: "Correo de la cuenta", value: business.email },
    { label: "WhatsApp", value: business.whatsapp ? formatWhatsapp(business.whatsapp) : "Sin configurar" },
    { label: "Moneda", value: business.currency },
    { label: "Zona horaria", value: zone },
    { label: "Registrado", value: formatDay(dayKey(business.createdAt, timeZone)) },
    { label: "Productos", value: String(business.products) },
    { label: "Pedidos en total", value: String(business.ordersTotal) },
    { label: "Pedidos en 30 días", value: String(business.ordersRecent) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin" className="link inline-flex min-h-11 items-center gap-1 self-start">
        <ChevronLeftIcon width={18} height={18} />
        Comercios
      </Link>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-display text-display font-bold wrap-anywhere">{business.name}</h1>
        <span
          className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-sm font-semibold ${
            business.isSuspended ? "border border-danger text-danger" : "bg-brand-tint text-ink"
          }`}
        >
          {business.isSuspended ? "Suspendido" : "Activo"}
        </span>
      </div>

      <section className="card" aria-label="Datos del comercio">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-sm text-muted">{fact.label}</dt>
              <dd className="font-semibold wrap-anywhere">{fact.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line/25 pt-4">
          <Link href={`/m/${business.slug}`} target="_blank" className="btn btn-secondary">
            Abrir su menú
            <ExternalIcon width={18} height={18} />
          </Link>
          {!isSelf && (
            <form action={adminSuspendAction}>
              <input type="hidden" name="id" value={business.id} />
              <input type="hidden" name="suspended" value={business.isSuspended ? "0" : "1"} />
              <SubmitButton
                className={`btn ${business.isSuspended ? "btn-outline-brand" : "btn-danger"}`}
                confirm={
                  business.isSuspended
                    ? undefined
                    : `¿Suspender "${business.name}"? Su menú dejará de mostrarse y no recibirá pedidos hasta que lo reactives.`
                }
              >
                {business.isSuspended ? "Reactivar comercio" : "Suspender comercio"}
              </SubmitButton>
            </form>
          )}
        </div>
        {business.isSuspended && (
          <p className="mt-3 text-sm text-muted">
            Mientras está suspendido, su menú muestra un aviso de “no disponible” y no recibe pedidos. Sus datos se
            conservan.
          </p>
        )}
      </section>

      <section id="plan" className="card flex scroll-mt-4 flex-col gap-4" aria-labelledby="comercio-plan">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id="comercio-plan" className="font-display text-title font-bold">
            Plan y pagos
          </h2>
          <BillingBadge billing={billing} />
        </div>
        <p className="text-sm text-muted">
          {plan
            ? `Plan ${plan.name}: ${plan.priceCents > 0 ? `${formatMoney(plan.priceCents, settings.serviceCurrency)} al mes` : "gratis"}, ${
                plan.maxProducts === null ? "productos sin límite" : `hasta ${plan.maxProducts} productos`
              }.`
            : "Este comercio no tiene plan."}{" "}
          {billing.state === "sin-vencimiento"
            ? "No tiene fecha de vencimiento, así que nunca se bloquea."
            : billing.state === "vencido"
              ? "Está vencido: su menú no se muestra hasta que registres un pago o cambies la fecha."
              : billing.state === "gracia"
                ? `Está en días de gracia: su menú funciona hasta el ${formatDay(billing.lastDay as string)}.`
                : ""}
        </p>

        <BusinessPlanForm
          businessId={business.id}
          plans={plans.map((item) => ({
            id: item.id,
            label: `${item.name} · ${item.priceCents > 0 ? `${formatMoney(item.priceCents, settings.serviceCurrency)} al mes` : "gratis"}`,
          }))}
          planId={business.planId ?? ""}
          paidUntil={business.paidUntil ?? ""}
        />

        <div className="border-t border-line/25 pt-4">
          <h3 className="font-semibold">Registrar un pago</h3>
          <p className="mt-1 mb-3 text-sm text-muted">
            Al registrarlo, el vencimiento se extiende solo. Un pago de un mes hecho hoy cubriría del{" "}
            {formatDay(nextPeriod.from)} al {formatDay(nextPeriod.to)}.
          </p>
          <PaymentForm businessId={business.id} monthlyCents={plan?.priceCents ?? null} currency={settings.serviceCurrency} />
        </div>

        {payments.length > 0 && (
          <div className="border-t border-line/25 pt-4">
            <h3 className="font-semibold">Pagos registrados</h3>
            <ul className="mt-1 divide-y divide-line/25">
              {payments.map((payment) => (
                <li key={payment.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <div className="min-w-0 flex-1 basis-56 text-sm">
                    <p>
                      <span className="font-semibold">{formatDay(payment.paidOn)}</span>
                      <span className="text-muted">
                        {" "}
                        · {payment.months === 1 ? "1 mes" : `${payment.months} meses`}
                        {payment.planName ? ` · ${payment.planName}` : ""}
                      </span>
                    </p>
                    <p className="wrap-anywhere text-muted">
                      {payment.periodFrom && payment.periodTo
                        ? `Cubre del ${formatDay(payment.periodFrom)} al ${formatDay(payment.periodTo)}`
                        : ""}
                      {payment.method ? ` · ${payment.method}` : ""}
                      {payment.note ? ` · ${payment.note}` : ""}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatMoney(payment.amountCents, payment.currency)}</span>
                  <form action={deletePaymentAction}>
                    <input type="hidden" name="id" value={payment.id} />
                    <SubmitButton
                      className="btn btn-ghost btn-sm text-danger"
                      ariaLabel={`Eliminar el pago del ${formatDay(payment.paidOn)}`}
                      confirm="¿Eliminar este registro de pago? La fecha de vencimiento no cambia: si hace falta, corrígela arriba."
                    >
                      Eliminar
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-3" aria-labelledby="comercio-pedidos">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="comercio-pedidos" className="font-display text-title font-bold">
            Pedidos
          </h2>
          <a href={`${path}/exportar${filtersToQuery(filters)}`} className="btn btn-secondary btn-sm" download>
            <DownloadIcon width={18} height={18} />
            Exportar a Excel
          </a>
        </div>
        <RangeFilter path={path} filters={filters} />
        <p className="text-sm">
          <strong className="font-semibold">{inRange}</strong> {inRange === 1 ? "pedido" : "pedidos"} en el período ·{" "}
          {summary.completado.count} {summary.completado.count === 1 ? "completado" : "completados"} por{" "}
          <strong className="font-semibold">{formatMoney(summary.completado.totalCents, business.currency)}</strong>
        </p>
        {orders.length > 0 && (
          <ul className="divide-y divide-line/25 border-t border-line/25">
            {orders.map((order) => (
              <li key={order.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">#{order.number}</span>
                  <StatusBadge status={order.status} delivery={order.deliveryMode} />
                  <span className="text-sm text-muted">{formatWhen(order.createdAt, timeZone, now)}</span>
                  <span className="ml-auto font-semibold tabular-nums">{formatMoney(order.totalCents, order.currency)}</span>
                </div>
                <p className="text-sm wrap-anywhere text-muted">
                  {order.customerName} · {itemsSummary(order.items)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {inRange > orders.length && (
          <p className="text-sm text-muted">
            Se muestran los {orders.length} más recientes. El archivo de Excel los incluye todos.
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="comercio-clave">
        <h2 id="comercio-clave" className="font-display text-title font-bold">
          Contraseña
        </h2>
        <p className="mt-1 mb-3 text-sm text-muted">
          Si el comercio olvidó su contraseña, escribe una nueva y entrégasela. Se cerrarán sus sesiones abiertas.
        </p>
        <SetPasswordForm businessId={business.id} />
      </section>

      {!isSelf && (
        <section className="card" aria-labelledby="comercio-eliminar">
          <h2 id="comercio-eliminar" className="font-display text-title font-bold">
            Eliminar comercio
          </h2>
          <p className="mt-1 mb-3 text-sm text-muted">
            Borra la cuenta con su menú, fotos, pedidos y reportes. No se puede deshacer. Si solo quieres que deje de
            funcionar por un tiempo, usa “Suspender”. Los pagos que registraste se conservan en la lista de pagos.
          </p>
          <form action={adminDeleteBusinessAction}>
            <input type="hidden" name="id" value={business.id} />
            <SubmitButton
              className="btn btn-danger"
              confirm={`¿Eliminar "${business.name}" con todos sus datos? Esta acción no se puede deshacer.`}
            >
              Eliminar comercio
            </SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}
