import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/panel/AutoRefresh";
import { StatusBadge, itemsSummary } from "@/components/panel/OrderBits";
import { RangeFilter, chipClass } from "@/components/panel/RangeFilter";
import { DownloadIcon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { OrderAlertToggle } from "@/components/panel/OrderWatcher";
import { forgetCustomerAction, setOrderStatusAction } from "@/lib/actions/orders";
import { formatWhen, rangeInstants } from "@/lib/dates";
import { filtersToQuery, firstParam, readFilters, type SearchParams } from "@/lib/filters";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUSES, deliveryLabel, type OrderStatus } from "@/lib/orders";
import { countNewOrders, listOrders, summarizeByStatus, totalsOf, type OrderWithItems } from "@/lib/orders-data";
import { requireBusiness } from "@/lib/panel";
import { customerWhatsapp } from "@/lib/phone";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export async function generateMetadata(): Promise<Metadata> {
  const { business } = await requireBusiness();
  const pending = await countNewOrders(business.id);
  // El número de pedidos sin atender se ve en la pestaña del navegador.
  return { title: pending > 0 ? `(${pending}) Pedidos` : "Pedidos" };
}

/** Nombre del paso "listo" según cómo se entrega el pedido. */
const readyLabel = (delivery: string) =>
  delivery === "domicilio" ? "En camino" : delivery === "recoger" ? "Listo para recoger" : "Listo";

/** Botones para avanzar un pedido sin entrar a verlo. */
function QuickActions({ order }: { order: OrderWithItems }) {
  const ready = { status: "listo" as OrderStatus, label: readyLabel(order.deliveryMode) };
  const done = { status: "completado" as OrderStatus, label: "Completar", primary: true };
  const next: { status: OrderStatus; label: string; primary?: boolean }[] =
    order.status === "nuevo"
      ? [{ status: "preparando", label: "Preparar" }, done]
      : order.status === "preparando"
        ? [ready, done]
        : order.status === "listo"
          ? [done]
          : [];
  if (next.length === 0) return null;
  return (
    <form action={setOrderStatusAction} className="flex flex-wrap gap-2">
      <input type="hidden" name="id" value={order.id} />
      {next.map((step) => (
        <SubmitButton
          key={step.status}
          name="status"
          value={step.status}
          className={`btn btn-sm ${step.primary ? "btn-primary" : "btn-outline-brand"}`}
          ariaLabel={`${step.label} el pedido ${order.number}`}
        >
          {step.label}
        </SubmitButton>
      ))}
    </form>
  );
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { business } = await requireBusiness();
  const params = await searchParams;
  const filters = readFilters(params, business.timezone, "7d");
  // Con "?cliente=…" se ven todos los pedidos de ese cliente, de cualquier fecha.
  const customer = (firstParam(params.cliente) ?? "").replace(/\D/g, "").slice(0, 20);
  const period = customer ? {} : rangeInstants(filters.range, business.timezone);

  const [summary, orders] = await Promise.all([
    summarizeByStatus(business.id, { ...period, customer }),
    listOrders(business.id, { status: filters.status, ...period, customer }, PAGE_SIZE, (filters.page - 1) * PAGE_SIZE),
  ]);

  const all = Object.values(summary).reduce((sum, item) => sum + item.count, 0);
  const total = filters.status ? summary[filters.status].count : all;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const money = (cents: number) => formatMoney(cents, business.currency);
  const link = (status: OrderStatus | undefined, page?: number) =>
    `/panel/pedidos${filtersToQuery(
      { range: filters.range, preset: filters.preset, status },
      { pagina: page && page > 1 ? page : undefined, cliente: customer || undefined },
    )}`;
  const now = new Date();
  // El cliente se presenta con los datos de su pedido más reciente.
  const latest = customer ? orders[0] : undefined;
  const chatNumber = latest ? customerWhatsapp(latest.customerPhone, business.whatsapp) : "";

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={30} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-display font-bold">Pedidos</h1>
          <p className="mt-1 max-w-xl text-muted">
            Cada pedido que te envían queda guardado aquí con su número. Esta lista se actualiza sola.
          </p>
        </div>
        {!customer && (
          <a href={`/panel/pedidos/exportar${filtersToQuery(filters)}`} className="btn btn-secondary" download>
            <DownloadIcon width={20} height={20} />
            Exportar a Excel
          </a>
        )}
      </div>

      {customer ? (
        <section className="card flex flex-col gap-3" aria-label="Cliente">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="min-w-0 flex-1 basis-56 wrap-anywhere">
              Pedidos de <strong className="font-semibold">{latest?.customerName ?? "este cliente"}</strong>
              {latest ? <span className="text-muted"> · {latest.customerPhone}</span> : null}
            </p>
            {chatNumber && latest && (
              <a
                href={buildWhatsAppUrl(chatNumber, `Hola ${latest.customerName}, te escribimos de ${business.name}.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
              >
                Escribirle por WhatsApp
              </a>
            )}
            <Link href="/panel/pedidos" className="btn btn-secondary btn-sm">
              Ver todos los pedidos
            </Link>
          </div>
          {all > 0 && (
            <form action={forgetCustomerAction} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line/25 pt-3">
              <input type="hidden" name="phone" value={customer} />
              <p className="min-w-0 flex-1 basis-56 text-sm text-muted">
                Si este cliente te pide que borres sus datos, puedes quitar su nombre, teléfono, dirección y notas de
                todos sus pedidos. Los pedidos se conservan para tus cuentas.
              </p>
              <SubmitButton
                className="btn btn-danger btn-sm"
                confirm="¿Borrar el nombre, el teléfono, la dirección y las notas de este cliente en todos sus pedidos? No se puede deshacer."
              >
                Borrar sus datos
              </SubmitButton>
            </form>
          )}
        </section>
      ) : (
        <>
          <OrderAlertToggle />
          <RangeFilter path="/panel/pedidos" filters={filters} />
        </>
      )}

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
        <div className="card text-muted">
          <p>
            {all === 0
              ? customer
                ? "No hay pedidos de ese cliente."
                : "No hay pedidos en este período."
              : "No hay pedidos con ese estado."}
          </p>
          {all === 0 && !customer && (
            <p className="mt-1 text-sm">
              Cuando un cliente envíe un pedido desde tu menú, aparecerá aquí.{" "}
              <Link href="/panel" className="link">
                Comparte tu menú
              </Link>
              .
            </p>
          )}
        </div>
      ) : (
        <ul className="card divide-y divide-line/25 py-1">
          {orders.map((order) => (
            <li key={order.id} className="py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link
                  href={`/panel/pedidos/${order.id}`}
                  className="font-display text-title font-bold underline-offset-4 hover:underline"
                >
                  #{order.number}
                </Link>
                <StatusBadge status={order.status} delivery={order.deliveryMode} />
                <span className="ml-auto text-sm text-muted">{formatWhen(order.createdAt, business.timezone, now)}</span>
              </div>
              <p className="mt-1 wrap-anywhere">
                <span className="font-semibold">{order.customerName}</span>{" "}
                <span className="text-muted">
                  · {deliveryLabel(order.deliveryMode)}
                  {order.deliveryZone ? ` · ${order.deliveryZone}` : ""}
                  {order.address ? ` · ${order.deliveryMode === "local" ? "Mesa " : ""}${order.address}` : ""}
                </span>
              </p>
              <p className="line-clamp-2 text-sm wrap-anywhere text-muted">{itemsSummary(order.items)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="mr-auto font-display text-price font-bold tabular-nums">
                  {money(order.totalCents)}
                  {totalsOf(order).deliveryPending && (
                    <span className="ml-1.5 font-sans text-caption font-normal text-muted">+ domicilio</span>
                  )}
                </p>
                <QuickActions order={order} />
                <Link
                  href={`/panel/pedidos/${order.id}`}
                  className="btn btn-secondary btn-sm"
                  aria-label={`Ver el pedido ${order.number}`}
                >
                  Ver
                </Link>
              </div>
            </li>
          ))}
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
