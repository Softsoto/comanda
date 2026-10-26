import type { Metadata } from "next";
import { CouponForm } from "@/components/panel/CouponForm";
import { StoreTabs } from "@/components/panel/StoreTabs";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { deleteCouponAction, toggleCouponAction } from "@/lib/actions/coupons";
import { describeCoupon, type Coupon } from "@/lib/coupons";
import { listCoupons } from "@/lib/coupons-data";
import { formatDay, todayKey } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requireBusiness } from "@/lib/panel";

export const metadata: Metadata = { title: "Cupones" };
export const dynamic = "force-dynamic";

/** En qué situación está un cupón hoy. */
function couponState(coupon: Coupon, today: string): { label: string; usable: boolean } {
  if (coupon.endsOn && today > coupon.endsOn) return { label: "Vencido", usable: false };
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return { label: "Agotado", usable: false };
  return coupon.isActive ? { label: "Activo", usable: true } : { label: "Pausado", usable: false };
}

export default async function CouponsPage() {
  const { business } = await requireBusiness();
  const coupons = await listCoupons(business.id);
  const today = todayKey(business.timezone);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <StoreTabs current="cupones" />
      <p className="text-muted">
        Crea códigos de descuento para tus clientes. Quien tenga el código lo escribe al hacer su pedido y el descuento
        se aplica solo. Es opcional: sin cupones, tu menú no muestra ese campo.
      </p>

      <section className="card" aria-labelledby="cupon-nuevo">
        <h2 id="cupon-nuevo" className="mb-3 font-display text-title font-bold">
          Nuevo cupón
        </h2>
        <CouponForm today={today} />
      </section>

      <section className="card" aria-labelledby="cupones-lista">
        <h2 id="cupones-lista" className="font-display text-title font-bold">
          Tus cupones
        </h2>
        {coupons.length === 0 ? (
          <p className="mt-2 text-muted">Aún no has creado cupones.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line/25">
            {coupons.map((coupon) => {
              const state = couponState(coupon, today);
              const conditions = [
                coupon.minSubtotalCents > 0 ? `pedidos desde ${formatMoney(coupon.minSubtotalCents, business.currency)}` : "",
                coupon.endsOn ? `hasta el ${formatDay(coupon.endsOn)}` : "",
              ].filter(Boolean);
              return (
                <li key={coupon.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-display text-price font-bold break-all select-all">{coupon.code}</span>
                      <span
                        className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-sm font-semibold ${
                          state.usable ? "bg-brand-tint text-ink" : "border border-line text-muted"
                        }`}
                      >
                        {state.label}
                      </span>
                    </p>
                    <p className="text-sm">
                      {describeCoupon(coupon, business.currency)}
                      {conditions.length > 0 ? ` · ${conditions.join(" · ")}` : ""}
                    </p>
                    <p className="text-sm text-muted">
                      {coupon.maxUses === null
                        ? `Usado ${coupon.usedCount} ${coupon.usedCount === 1 ? "vez" : "veces"}`
                        : `Usado ${coupon.usedCount} de ${coupon.maxUses} ${coupon.maxUses === 1 ? "vez" : "veces"}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <form action={toggleCouponAction}>
                      <input type="hidden" name="id" value={coupon.id} />
                      <input type="hidden" name="active" value={coupon.isActive ? "0" : "1"} />
                      <SubmitButton
                        className="btn btn-secondary btn-sm"
                        ariaLabel={coupon.isActive ? `Pausar el cupón ${coupon.code}` : `Activar el cupón ${coupon.code}`}
                      >
                        {coupon.isActive ? "Pausar" : "Activar"}
                      </SubmitButton>
                    </form>
                    <form action={deleteCouponAction}>
                      <input type="hidden" name="id" value={coupon.id} />
                      <SubmitButton
                        className="btn btn-ghost btn-sm text-danger"
                        ariaLabel={`Eliminar el cupón ${coupon.code}`}
                        confirm={`¿Eliminar el cupón ${coupon.code}? Los pedidos que ya lo usaron conservan su descuento.`}
                      >
                        Eliminar
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
