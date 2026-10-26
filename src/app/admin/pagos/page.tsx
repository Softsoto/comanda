import type { Metadata } from "next";
import Link from "next/link";
import { BillingBadge } from "@/components/admin/BillingBadge";
import { RangeFilter } from "@/components/panel/RangeFilter";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { deletePaymentAction } from "@/lib/actions/billing";
import { adminTimezone, requireAdmin } from "@/lib/admin";
import { listBusinesses } from "@/lib/admin-data";
import { billingStatus } from "@/lib/billing";
import { formatDay, todayKey } from "@/lib/dates";
import { readFilters, type SearchParams } from "@/lib/filters";
import { formatMoney } from "@/lib/money";
import { listPayments, sumPayments } from "@/lib/plans-data";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Pagos" };
export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await requireAdmin();
  const timeZone = await adminTimezone(admin.id);
  const filters = readFilters(await searchParams, timeZone, "mes");
  const [payments, totals, businesses, settings] = await Promise.all([
    listPayments({ from: filters.range.from, to: filters.range.to }),
    sumPayments(filters.range.from, filters.range.to),
    listBusinesses(new Date()),
    getSettings(),
  ]);

  // Comercios que necesitan atención: por vencer, en gracia o vencidos.
  const pending = businesses
    .map((business) => ({
      business,
      billing: billingStatus(business.paidUntil, todayKey(business.timezone), settings.graceDays),
    }))
    .filter(({ billing }) => billing.state === "por-vencer" || billing.state === "gracia" || billing.state === "vencido")
    .sort((a, b) => (a.billing.paidUntil ?? "").localeCompare(b.billing.paidUntil ?? ""));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-display font-bold">Pagos</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Lo que te han pagado los comercios. Los pagos se registran a mano en la ficha de cada comercio: la app lleva
          la cuenta, no cobra con tarjeta.
        </p>
      </div>

      <section className="card" aria-labelledby="por-cobrar">
        <h2 id="por-cobrar" className="font-display text-title font-bold">
          Por cobrar
        </h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-muted">Ningún comercio está por vencer ni vencido.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line/25">
            {pending.map(({ business, billing }) => (
              <li key={business.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                <p className="min-w-0 flex-1 basis-48 wrap-anywhere">
                  <span className="font-semibold">{business.name}</span>
                  {business.planName ? <span className="text-muted"> · {business.planName}</span> : null}
                </p>
                <BillingBadge billing={billing} />
                <Link href={`/admin/comercios/${business.id}#plan`} className="btn btn-secondary btn-sm">
                  Registrar pago
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card flex flex-col gap-3" aria-labelledby="pagos-recibidos">
        <h2 id="pagos-recibidos" className="font-display text-title font-bold">
          Pagos recibidos
        </h2>
        <RangeFilter path="/admin/pagos" filters={filters} />
        <p className="text-sm">
          {totals.length === 0 ? (
            "No hay pagos registrados en este período."
          ) : (
            <>
              <strong className="font-semibold">{payments.length}</strong> {payments.length === 1 ? "pago" : "pagos"} ·
              total{" "}
              {totals.map((total, index) => (
                <strong key={total.currency} className="font-semibold tabular-nums">
                  {index > 0 ? " + " : ""}
                  {formatMoney(total.amountCents, total.currency)}
                </strong>
              ))}
            </>
          )}
        </p>
        {payments.length > 0 && (
          <ul className="divide-y divide-line/25 border-t border-line/25">
            {payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="wrap-anywhere">
                    {payment.businessId ? (
                      <Link
                        href={`/admin/comercios/${payment.businessId}`}
                        className="font-semibold underline-offset-4 hover:underline"
                      >
                        {payment.businessName}
                      </Link>
                    ) : (
                      <span className="font-semibold">{payment.businessName} (eliminado)</span>
                    )}
                    <span className="text-muted">
                      {" "}
                      · {formatDay(payment.paidOn)}
                      {payment.planName ? ` · ${payment.planName}` : ""}
                    </span>
                  </p>
                  <p className="text-sm wrap-anywhere text-muted">
                    {payment.months === 1 ? "1 mes" : `${payment.months} meses`}
                    {payment.periodFrom && payment.periodTo
                      ? `: del ${formatDay(payment.periodFrom)} al ${formatDay(payment.periodTo)}`
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
                    ariaLabel={`Eliminar el pago de ${payment.businessName} del ${formatDay(payment.paidOn)}`}
                    confirm="¿Eliminar este registro de pago? La fecha de vencimiento del comercio no cambia: si hace falta, corrígela en su ficha."
                  >
                    Eliminar
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
