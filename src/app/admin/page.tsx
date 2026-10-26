import Link from "next/link";
import { BillingBadge } from "@/components/admin/BillingBadge";
import { adminTimezone, requireAdmin } from "@/lib/admin";
import { countOrdersSince, listBusinesses } from "@/lib/admin-data";
import { billingStatus } from "@/lib/billing";
import { addDays, dayStart, formatDay, dayKey, formatWhen, todayKey } from "@/lib/dates";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-[1.625rem] leading-8 font-semibold">{value}</p>
      {hint && <p className="mt-1 text-caption text-muted">{hint}</p>}
    </div>
  );
}

export default async function AdminHomePage() {
  const admin = await requireAdmin();
  const timeZone = await adminTimezone(admin.id);
  const today = todayKey(timeZone);
  const monthAgo = dayStart(addDays(today, -29), timeZone);
  const [list, ordersToday, settings] = await Promise.all([
    listBusinesses(monthAgo),
    countOrdersSince(dayStart(today, timeZone)),
    getSettings(),
  ]);
  // El vencimiento de cada comercio se mira con su propio reloj.
  const businesses = list.map((business) => ({
    ...business,
    billing: billingStatus(business.paidUntil, todayKey(business.timezone), settings.graceDays),
  }));

  const suspended = businesses.filter((business) => business.isSuspended).length;
  const active = businesses.length - suspended;
  const toCollect = businesses.filter((business) => ["por-vencer", "gracia", "vencido"].includes(business.billing.state)).length;
  const ordersMonth = businesses.reduce((sum, business) => sum + business.ordersRecent, 0);
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-display font-bold">Comercios</h1>
          <p className="mt-1 max-w-xl text-muted">
            Todos los negocios registrados en tu servicio. Desde aquí los creas, los suspendes y ves sus pedidos.
          </p>
        </div>
        <Link href="/admin/comercios/nuevo" className="btn btn-primary">
          Crear comercio
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Comercios"
          value={String(businesses.length)}
          hint={`${active} ${active === 1 ? "activo" : "activos"}${suspended > 0 ? ` · ${suspended} ${suspended === 1 ? "suspendido" : "suspendidos"}` : ""}`}
        />
        <Tile label="Por cobrar" value={String(toCollect)} hint="Por vencer o vencidos" />
        <Tile label="Pedidos de hoy" value={String(ordersToday)} hint="En todos los comercios" />
        <Tile label="Pedidos en 30 días" value={String(ordersMonth)} hint="En todos los comercios" />
      </div>

      {businesses.length === 0 ? (
        <p className="card text-muted">Aún no hay comercios registrados.</p>
      ) : (
        <div className="card overflow-x-auto py-2">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line/40 text-left text-muted">
                <th className="py-2 pr-3 font-semibold">Comercio</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
                <th className="px-3 py-2 font-semibold">Plan y vencimiento</th>
                <th className="px-3 py-2 text-right font-semibold">Productos</th>
                <th className="px-3 py-2 text-right font-semibold">Pedidos (30 días)</th>
                <th className="px-3 py-2 font-semibold">Último pedido</th>
                <th className="py-2 pl-3 font-semibold">Registrado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/25">
              {businesses.map((business) => (
                <tr key={business.id}>
                  <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                    <Link
                      href={`/admin/comercios/${business.id}`}
                      className="font-semibold underline-offset-4 wrap-anywhere hover:underline"
                    >
                      {business.name}
                    </Link>
                    <span className="block text-caption wrap-anywhere text-muted">{business.email}</span>
                  </th>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex min-h-6 items-center rounded-full px-2.5 font-semibold whitespace-nowrap ${
                        business.isSuspended ? "border border-danger text-danger" : "bg-brand-tint text-ink"
                      }`}
                    >
                      {business.isSuspended ? "Suspendido" : "Activo"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {business.planName && <span className="mb-1 block font-semibold wrap-anywhere">{business.planName}</span>}
                    <BillingBadge billing={business.billing} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{business.products}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{business.ordersRecent}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {business.lastOrderAt ? formatWhen(business.lastOrderAt, business.timezone, now) : "—"}
                  </td>
                  <td className="py-2.5 pl-3 whitespace-nowrap">{formatDay(dayKey(business.createdAt, timeZone))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
