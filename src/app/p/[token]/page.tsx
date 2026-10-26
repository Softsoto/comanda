import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/panel/AutoRefresh";
import { SecretTap } from "@/components/secret/SecretTap";
import { CheckIcon, SendIcon } from "@/components/ui/icons";
import { APP_NAME } from "@/lib/config";
import { getBusinessById } from "@/lib/data";
import { formatWhen } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { optionsSummary } from "@/lib/options";
import { deliveryLabel, trackingIndex, trackingMessage, trackingSteps } from "@/lib/orders";
import { getOrderByToken, totalsOf } from "@/lib/orders-data";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

/** El código del enlace: corto, aleatorio y sin relación con el número del pedido. */
const isToken = (value: string) => /^[A-Za-z0-9_-]{8,40}$/.test(value);

async function findOrder(params: Props["params"]) {
  const { token } = await params;
  const order = isToken(token) ? await getOrderByToken(token) : null;
  const business = order ? await getBusinessById(order.businessId) : null;
  return order && business ? { order, business } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await findOrder(params);
  return {
    title: found ? { absolute: `Pedido #${found.order.number} · ${found.business.name}` } : "Pedido no encontrado",
    // Es una página personal: no debe aparecer en buscadores.
    robots: { index: false, follow: false },
  };
}

/**
 * Seguimiento del pedido para el cliente. Cualquiera que tenga el enlace puede
 * verla, así que no muestra teléfono ni dirección: solo qué se pidió y en qué va.
 */
export default async function TrackOrderPage({ params }: Props) {
  const found = await findOrder(params);
  if (!found) notFound();
  const { order, business } = found;

  const money = (cents: number) => formatMoney(cents, order.currency);
  const totals = totalsOf(order);
  const toHome = order.deliveryMode === "domicilio";
  const cancelled = order.status === "cancelado";
  const current = trackingIndex(order.status);
  const steps = trackingSteps(order.deliveryMode);
  const finished = cancelled || order.status === "completado";
  const chatUrl = business.whatsapp
    ? buildWhatsAppUrl(business.whatsapp, `Hola, les escribo por mi pedido #${order.number}.`)
    : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4">
      {/* Mientras el pedido sigue en curso, la página se actualiza sola. */}
      {!finished && <AutoRefresh seconds={20} />}

      <header className="flex items-center gap-3 pt-6 pb-2">
        {business.logoImageId && (
          <img
            src={`/img/${business.logoImageId}`}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 rounded-field bg-raised object-contain"
          />
        )}
        <p className="min-w-0 font-display text-title font-bold wrap-anywhere">{business.name}</p>
      </header>

      <main className="flex flex-1 flex-col gap-4 pb-8">
        <section className="card" aria-labelledby="estado">
          <p className="text-sm text-muted">
            Pedido #{order.number} · {formatWhen(order.createdAt, business.timezone)}
          </p>
          <h1 id="estado" className="mt-1 font-display text-display font-bold wrap-anywhere">
            {cancelled ? "Cancelado" : steps[current]}
          </h1>
          <p className="mt-1 text-muted" role="status">
            {trackingMessage(order.status, order.deliveryMode)}
          </p>

          {!cancelled && (
            <ol className="mt-5 flex flex-col">
              {steps.map((step, index) => {
                const done = index <= current;
                return (
                  <li
                    key={step}
                    aria-current={index === current ? "step" : undefined}
                    className="relative flex min-h-11 items-start gap-3 pb-3 last:min-h-0 last:pb-0"
                  >
                    {/* Línea que une cada paso con el siguiente. */}
                    {index < steps.length - 1 && (
                      <span
                        aria-hidden="true"
                        className={`absolute top-7 bottom-0 left-[13px] w-0.5 ${index < current ? "bg-brand" : "bg-line/40"}`}
                      />
                    )}
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                        done ? "bg-brand text-on-brand" : "border-2 border-line/60 text-transparent"
                      }`}
                    >
                      <CheckIcon width={16} height={16} strokeWidth={3} />
                    </span>
                    <span className={`pt-0.5 ${index === current ? "font-semibold" : done ? "" : "text-muted"}`}>
                      {step}
                      <span className="sr-only">{done ? " (hecho)" : " (pendiente)"}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="card" aria-labelledby="resumen">
          <h2 id="resumen" className="font-display text-title font-bold">
            Tu pedido
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 wrap-anywhere">
                  <span className="font-semibold tabular-nums">{item.quantity} x</span> {item.name}
                  {item.options.length > 0 && (
                    <span className="block text-sm text-muted">{optionsSummary(item.options)}</span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums">{money(item.unitPriceCents * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 flex flex-col gap-1 border-t border-line/40 pt-3">
            {(toHome || order.discountCents > 0) && (
              <div className="flex items-baseline justify-between gap-3">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{money(order.subtotalCents)}</dd>
              </div>
            )}
            {order.discountCents > 0 && (
              <div className="flex items-baseline justify-between gap-3">
                <dt>Descuento</dt>
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
              <dd className="font-display text-title font-bold tabular-nums">{money(order.totalCents)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-muted">
            Entrega: {deliveryLabel(order.deliveryMode).toLowerCase()}
            {order.deliveryZone ? ` (${order.deliveryZone})` : ""}
            {order.paymentMethod ? ` · Pago: ${order.paymentMethod}` : ""}
          </p>
        </section>

        <div className="flex flex-col gap-2">
          {chatUrl && (
            <a href={chatUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary min-h-12">
              <SendIcon width={20} height={20} />
              Escribir a {business.name}
            </a>
          )}
          <Link href={`/m/${business.slug}`} className="btn btn-secondary">
            Ver el menú
          </Link>
        </div>

        {!finished && <p className="text-center text-caption text-muted">Esta página se actualiza sola.</p>}
      </main>

      <footer className="pb-4 text-center text-caption text-muted">
        <SecretTap>Hecho con {APP_NAME}</SecretTap>
      </footer>
    </div>
  );
}
