import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge, itemsSummary } from "@/components/panel/OrderBits";
import { RangeFilter, chipClass } from "@/components/panel/RangeFilter";
import { DownloadIcon } from "@/components/ui/icons";
import { adminTimezone, requireAdmin } from "@/lib/admin";
import { getBusinessLabels } from "@/lib/admin-data";
import { formatWhen, rangeInstants } from "@/lib/dates";
import { filtersToQuery, readFilters, type SearchParams } from "@/lib/filters";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders";
import { listOrders, summarizeByStatus } from "@/lib/orders-data";

export const metadata: Metadata = { title: "Pedidos" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await requireAdmin();
  const timeZone = await adminTimezone(admin.id);
  const filters = readFilters(await searchParams, timeZone, "7d");
  const { start, end } = rangeInstants(filters.range, timeZone);

  const [summary, orders, labels] = await Promise.all([
    summarizeByStatus(null, { start, end }),
    listOrders(null, { status: filters.status, start, end }, PAGE_SIZE, (filters.page - 1) * PAGE_SIZE),
    getBusinessLabels(),
  ]);

  const all = Object.values(summary).reduce((sum, item) => sum + item.count, 0);
  const total = filters.status ? summary[filters.status].count : all;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (status: OrderStatus | undefined, page?: number) =>
    `/admin/pedidos${filtersToQuery({ range: filters.range, preset: filters.preset, status }, { pagina: page && page > 1 ? page : undefined })}`;
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-display font-bold">Pedidos</h1>
          <p className="mt-1 max-w-xl text-muted">Los pedidos de todos los comercios, del más reciente al más antiguo.</p>
        </div>
        <a href={`/admin/pedidos/exportar${filtersToQuery(filters)}`} className="btn btn-secondary" download>
          <DownloadIcon width={20} height={20} />
          Exportar a Excel
        </a>
      </div>

      <RangeFilter path="/admin/pedidos" filters={filters} />

      <nav aria-label="Estado de los pedidos" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        <Link href={link(undefined)} aria-current={!filters.status ? "true" : undefined} className={chipClass(!filters.status)}>
          Todos <span className="tabular-nums">{all}</span>
        </Link>
        {ORDER_STATUSES.map((status) => (
          <Link
            key={status.value}
            href={link(status.value)}
            aria-current={filters.status === status.value ? "true" : undefined}
            className={chipClass(filters.status === status.value)}
          >
            {status.plural} <span className="tabular-nums">{summary[status.value].count}</span>
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <p className="card text-muted">No hay pedidos en este período.</p>
      ) : (
        <ul className="card divide-y divide-line/25 py-1">
          {orders.map((order) => {
            const business = labels.get(order.businessId);
            return (
              <li key={order.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/admin/comercios/${order.businessId}`}
                    className="font-semibold underline-offset-4 wrap-anywhere hover:underline"
                  >
                    {business?.name ?? "Comercio"}
                  </Link>
                  <span className="font-semibold">#{order.number}</span>
                  <StatusBadge status={order.status} />
                  <span className="text-sm text-muted">
                    {formatWhen(order.createdAt, business?.timezone ?? timeZone, now)}
                  </span>
                  <span className="ml-auto font-semibold tabular-nums">{formatMoney(order.totalCents, order.currency)}</span>
                </div>
                <p className="text-sm wrap-anywhere text-muted">
                  {order.customerName} · {itemsSummary(order.items)}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Páginas" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Página {Math.min(filters.page, pages)} de {pages} · {total} pedidos
          </p>
          <div className="flex gap-2">
            {filters.page > 1 && (
              <Link href={link(filters.status, filters.page - 1)} className="btn btn-secondary btn-sm">
                Anteriores
              </Link>
            )}
            {filters.page < pages && (
              <Link href={link(filters.status, filters.page + 1)} className="btn btn-secondary btn-sm">
                Siguientes
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
