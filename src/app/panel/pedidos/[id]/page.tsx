import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/panel/OrderBits";
import { PrintButton } from "@/components/panel/PrintButton";
import { CopyButton } from "@/components/ui/CopyButton";
import { ChevronLeftIcon, SendIcon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { setOrderStatusAction } from "@/lib/actions/orders";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUSES, deliveryLabel, statusLabelFor } from "@/lib/orders";
import { getOrder, totalsOf } from "@/lib/orders-data";
import { getBaseUrl, requireBusiness } from "@/lib/panel";
import { customerWhatsapp } from "@/lib/phone";
import { isUuid } from "@/lib/slug";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Pedido" };
export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  nuevo: "Volver a “Nuevo”",
  preparando: "En preparación",
  completado: "Completado",
  cancelado: "Cancelar pedido",
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { business } = await requireBusiness();
  const { id } = await params;
  const order = isUuid(id) ? await getOrder(business.id, id) : null;
  if (!order) notFound();

  const money = (cents: number) => formatMoney(cents, order.currency);
  const totals = totalsOf(order);
  const toHome = order.deliveryMode === "domicilio";
  const trackUrl = order.publicToken ? `${await getBaseUrl()}/p/${order.publicToken}` : null;
  const chatNumber = customerWhatsapp(order.customerPhone, business.whatsapp);
  const chatUrl = chatNumber
    ? buildWhatsAppUrl(chatNumber, `Hola ${order.customerName}, te escribimos de ${business.name} por tu pedido #${order.number}.`)
    : null;
  // Mensaje listo para enviarle al cliente el enlace donde ve cómo va su pedido.
  const trackChatUrl =
    chatNumber && trackUrl
      ? buildWhatsAppUrl(
          chatNumber,
          `Hola ${order.customerName}, aquí puedes ver cómo va tu pedido #${order.number} de ${business.name}: ${trackUrl}`,
        )
      : null;
  const withCost = order.items.filter((item) => item.unitCostCents !== null).length;
  // Con las cifras de su teléfono se encuentran los demás pedidos de este cliente.
  const customerDigits = order.customerPhone.replace(/\D/g, "");

  const details: { label: string; value: string }[] = [
    { label: "Cliente", value: order.customerName },
    ...(order.customerPhone ? [{ label: "Teléfono", value: order.customerPhone }] : []),
    { label: "Entrega", value: deliveryLabel(order.deliveryMode) },
    ...(order.deliveryZone ? [{ label: "Zona", value: order.deliveryZone }] : []),
    ...(order.address
      ? [{ label: order.deliveryMode === "local" ? "Mesa" : "Dirección", value: order.address }]
      : []),
    ...(order.paymentMethod ? [{ label: "Pago", value: order.paymentMethod }] : []),
    ...(order.notes ? [{ label: "Notas", value: order.notes }] : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 print:mx-0 print:max-w-[72mm] print:gap-2 print:text-[12px] print:leading-snug">
      <div className="print:hidden">
        <Link href="/panel/pedidos" className="link inline-flex min-h-11 items-center gap-1">
          <ChevronLeftIcon width={18} height={18} />
          Pedidos
        </Link>
      </div>

      {/* Esta tarjeta es la comanda: lo único que sale al imprimir. */}
      <article className="card flex flex-col gap-4 print:gap-2 print:rounded-none print:p-0">
        <header>
          <p className="hidden text-[14px] font-bold print:block">{business.name}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-display font-bold print:text-[20px] print:leading-tight">
              Pedido #{order.number}
            </h1>
            <span className="print:hidden">
              <StatusBadge status={order.status} delivery={order.deliveryMode} />
            </span>
          </div>
          <p className="text-muted">{formatDateTime(order.createdAt, business.timezone)}</p>
        </header>

        <section aria-label="Productos" className="border-t border-line/40 pt-3 print:pt-2">
          <table className="w-full">
            <thead className="sr-only">
              <tr>
                <th>Cantidad</th>
                <th>Producto</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="py-1 pr-3 font-semibold whitespace-nowrap tabular-nums">{item.quantity} x</td>
                  <td className="w-full py-1 wrap-anywhere">
                    {item.name}
                    {item.options.map((option, index) => (
                      <span key={index} className="block pl-2 text-sm text-muted print:text-[11px] print:text-ink">
                        + {option.name}
                      </span>
                    ))}
                    {item.quantity > 1 && (
                      <span className="block text-caption text-muted print:hidden">{money(item.unitPriceCents)} cada uno</span>
                    )}
                  </td>
                  <td className="py-1 pl-3 text-right whitespace-nowrap tabular-nums">
                    {money(item.unitPriceCents * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="mt-2 flex flex-col gap-1 border-t border-line/40 pt-3 print:pt-2">
            {(toHome || order.discountCents > 0) && (
              <div className="flex items-baseline justify-between gap-3">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{money(order.subtotalCents)}</dd>
              </div>
            )}
            {order.discountCents > 0 && (
              <div className="flex items-baseline justify-between gap-3">
                <dt>Descuento{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
                <dd className="tabular-nums">{money(-order.discountCents)}</dd>
              </div>
            )}
            {toHome && (
              <div className="flex items-baseline justify-between gap-3">
                <dt>Domicilio</dt>
                <dd className="tabular-nums">
                  {totals.deliveryFree ? "Gratis" : totals.deliveryPending ? "Por confirmar" : money(order.deliveryCents)}
                </dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="font-semibold">{totals.deliveryPending ? "Total sin domicilio" : "Total"}</dt>
              <dd className="font-display text-title font-bold tabular-nums print:text-[16px]">{money(order.totalCents)}</dd>
            </div>
          </dl>
        </section>

        <section aria-label="Datos del cliente" className="border-t border-line/40 pt-3 print:pt-2">
          <dl className="flex flex-col gap-1.5 print:gap-0.5">
            {details.map((detail) => (
              <div key={detail.label} className="flex gap-3">
                <dt className="w-24 shrink-0 text-muted print:w-16">{detail.label}</dt>
                <dd className="min-w-0 font-semibold wrap-anywhere">{detail.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </article>

      <section className="card flex flex-col gap-3 print:hidden" aria-labelledby="pedido-acciones">
        <h2 id="pedido-acciones" className="font-display text-title font-bold">
          Estado del pedido
        </h2>
        <form action={setOrderStatusAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="id" value={order.id} />
          {ORDER_STATUSES.filter((status) => status.value !== order.status).map((status) => (
            <SubmitButton
              key={status.value}
              name="status"
              value={status.value}
              className={`btn ${
                status.value === "completado"
                  ? "btn-primary"
                  : status.value === "cancelado"
                    ? "btn-danger"
                    : "btn-secondary"
              }`}
              confirm={
                status.value === "cancelado"
                  ? `¿Cancelar el pedido #${order.number}? Si llevas existencias, se devuelven al inventario${
                      order.couponCode ? ", y el cupón recupera ese uso" : ""
                    }.`
                  : undefined
              }
            >
              {status.value === "listo" ? statusLabelFor("listo", order.deliveryMode) : ACTION_LABEL[status.value]}
            </SubmitButton>
          ))}
        </form>
        <div className="flex flex-wrap gap-2 border-t border-line/25 pt-3">
          <PrintButton />
          {chatUrl && (
            <a href={chatUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              <SendIcon width={20} height={20} />
              Escribirle por WhatsApp
            </a>
          )}
          {customerDigits && (
            <Link href={`/panel/pedidos?cliente=${customerDigits}`} className="btn btn-secondary">
              Ver sus pedidos
            </Link>
          )}
        </div>
      </section>

      {trackUrl && (
        <section className="card flex flex-col gap-3 print:hidden" aria-labelledby="pedido-seguimiento">
          <div>
            <h2 id="pedido-seguimiento" className="font-display text-title font-bold">
              Seguimiento para el cliente
            </h2>
            <p className="mt-1 text-sm text-muted">
              El cliente recibió este enlace con su pedido. Al abrirlo ve en qué va: recibido, en preparación,{" "}
              {statusLabelFor("listo", order.deliveryMode).toLowerCase()} y entregado. Cambia cada vez que tú cambias el
              estado.
            </p>
          </div>
          <p className="rounded-field border border-line/50 bg-surface px-3 py-2.5 text-sm font-semibold break-all select-all">
            {trackUrl}
          </p>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={trackUrl} />
            <a href={trackUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              Abrirlo
            </a>
            {trackChatUrl && (
              <a href={trackChatUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                <SendIcon width={20} height={20} />
                Enviárselo por WhatsApp
              </a>
            )}
          </div>
        </section>
      )}

      <section className="card print:hidden" aria-labelledby="pedido-ganancia">
        <h2 id="pedido-ganancia" className="font-display text-title font-bold">
          Costo y ganancia
        </h2>
        {order.costCents === null || order.profitCents === null ? (
          <p className="mt-1 text-sm text-muted">
            Los productos de este pedido no tenían costo registrado. Si escribes el costo de cada producto al editarlo,
            los próximos pedidos mostrarán aquí su ganancia.
          </p>
        ) : (
          <>
            <dl className="mt-2 flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <dt>Costo de los productos</dt>
                <dd className="tabular-nums">{money(order.costCents)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="font-semibold">Ganancia</dt>
                <dd className="font-display text-price font-bold tabular-nums">{money(order.profitCents)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-sm text-muted">
              Solo tú ves estos datos. La ganancia es la venta menos el costo de los productos
              {order.discountCents > 0 ? " y menos el descuento" : ""}; no incluye el domicilio.
              {withCost < order.items.length
                ? " Algunos productos de este pedido no tenían costo registrado y no entran en la cuenta."
                : ""}
              {order.status !== "completado" ? " Se suma a tus reportes cuando el pedido se completa." : ""}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
