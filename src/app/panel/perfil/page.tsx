import type { Metadata } from "next";
import { PasswordForm, ProfileForm } from "@/components/panel/ProfileForm";
import { StoreTabs } from "@/components/panel/StoreTabs";
import { billingLabel } from "@/lib/billing";
import { DEFAULT_COUNTRY_CODE } from "@/lib/config";
import { countMenu } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { getBaseUrl, requireBusiness } from "@/lib/panel";
import { splitWhatsapp } from "@/lib/phone";
import { billingOf, getPlan } from "@/lib/plans-data";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Datos de la tienda" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { user, business } = await requireBusiness();
  const [baseUrl, plan, billing, settings, counts] = await Promise.all([
    getBaseUrl(),
    getPlan(business.planId),
    billingOf(business),
    getSettings(),
    countMenu(business.id),
  ]);
  const phone = splitWhatsapp(business.whatsapp);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <StoreTabs current="datos" />
      <p className="text-muted">Estos datos aparecen en tu menú y en cada pedido.</p>
      <div className="card">
        <ProfileForm
          baseUrl={baseUrl}
          business={{
            name: business.name,
            slug: business.slug,
            countryCode: business.whatsapp ? phone.code : DEFAULT_COUNTRY_CODE,
            phone: phone.local,
            currency: business.currency,
            paymentMethods: business.paymentMethods.join("\n"),
            logoUrl: business.logoImageId ? `/img/${business.logoImageId}` : null,
            timezone: business.timezone,
          }}
        />
      </div>
      {(plan || billing.state !== "sin-vencimiento") && (
        <section className="card" aria-labelledby="tu-plan">
          <h2 id="tu-plan" className="font-display text-title font-bold">
            Tu plan
          </h2>
          <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-muted">Plan</dt>
              <dd className="font-semibold wrap-anywhere">
                {plan
                  ? `${plan.name} · ${plan.priceCents > 0 ? `${formatMoney(plan.priceCents, settings.serviceCurrency)} al mes` : "gratis"}`
                  : "Sin plan"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Estado</dt>
              <dd className="font-semibold">{billingLabel(billing)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Productos</dt>
              <dd className="font-semibold">
                {plan?.maxProducts ? `${counts.products} de ${plan.maxProducts}` : `${counts.products} · sin límite`}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-sm text-muted">
            El plan y los pagos los maneja el administrador del servicio. Escríbele para renovar o cambiar de plan.
          </p>
        </section>
      )}
      <div className="card">
        <PasswordForm />
      </div>
      <p className="text-center text-caption text-muted">Cuenta: {user.email}</p>
    </div>
  );
}
