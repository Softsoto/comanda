import type { Metadata } from "next";
import Link from "next/link";
import { NewPlanForm, PlanEditor } from "@/components/admin/BillingForms";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { deletePlanAction, setDefaultPlanAction } from "@/lib/actions/billing";
import { requireAdmin } from "@/lib/admin";
import { BILLING_WARN_DAYS } from "@/lib/billing";
import { centsToInput, formatMoney } from "@/lib/money";
import { listPlans } from "@/lib/plans-data";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Planes" };
export const dynamic = "force-dynamic";

export default async function PlansPage() {
  await requireAdmin();
  const [plans, settings] = await Promise.all([listPlans(), getSettings()]);
  const currency = settings.serviceCurrency;
  const forNew = plans.find((plan) => plan.isDefault);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="font-display text-display font-bold">Planes</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Lo que les cobras a los comercios por usar el servicio. Cada comercio puede tener un plan y una fecha hasta la
          que pagó; los pagos los registras tú en la ficha de cada comercio.
        </p>
      </div>

      <section className="card" aria-labelledby="planes-lista">
        <h2 id="planes-lista" className="font-display text-title font-bold">
          Tus planes
        </h2>
        {plans.length === 0 ? (
          <p className="mt-2 text-muted">
            Aún no hay planes. Sin planes, los comercios no tienen fecha de vencimiento y nada se bloquea.
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-line/25">
            {plans.map((plan) => (
              <li key={plan.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold wrap-anywhere">{plan.name}</span>
                    {plan.isDefault && (
                      <span className="inline-flex min-h-6 items-center rounded-full bg-brand-tint px-2.5 text-sm font-semibold">
                        Para comercios nuevos
                      </span>
                    )}
                  </p>
                  <p className="text-sm">
                    <span className="font-semibold tabular-nums">
                      {plan.priceCents > 0 ? `${formatMoney(plan.priceCents, currency)} al mes` : "Gratis"}
                    </span>
                    {" · "}
                    {plan.maxProducts === null ? "productos sin límite" : `hasta ${plan.maxProducts} productos`}
                  </p>
                  <p className="text-sm text-muted">
                    {plan.businesses === 0
                      ? "Ningún comercio lo tiene"
                      : `Lo ${plan.businesses === 1 ? "tiene 1 comercio" : `tienen ${plan.businesses} comercios`}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <form action={setDefaultPlanAction}>
                    <input type="hidden" name="id" value={plan.isDefault ? "" : plan.id} />
                    <SubmitButton className="btn btn-ghost btn-sm">
                      {plan.isDefault ? "No darlo a los nuevos" : "Darlo a los nuevos"}
                    </SubmitButton>
                  </form>
                  <form action={deletePlanAction}>
                    <input type="hidden" name="id" value={plan.id} />
                    <SubmitButton
                      className="btn btn-ghost btn-sm text-danger"
                      ariaLabel={`Eliminar el plan ${plan.name}`}
                      confirm={
                        plan.businesses > 0
                          ? `¿Eliminar el plan "${plan.name}"? Los comercios que lo tienen quedarán sin plan, con su misma fecha de vencimiento.`
                          : `¿Eliminar el plan "${plan.name}"?`
                      }
                    >
                      Eliminar
                    </SubmitButton>
                  </form>
                </div>
                <PlanEditor
                  currency={currency}
                  plan={{
                    id: plan.id,
                    name: plan.name,
                    price: plan.priceCents > 0 ? centsToInput(plan.priceCents) : "",
                    maxProducts: plan.maxProducts === null ? "" : String(plan.maxProducts),
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="plan-nuevo">
        <h2 id="plan-nuevo" className="mb-3 font-display text-title font-bold">
          Nuevo plan
        </h2>
        <NewPlanForm currency={currency} />
      </section>

      <section className="card text-sm" aria-labelledby="planes-como">
        <h2 id="planes-como" className="font-display text-title font-bold">
          Cómo funciona el cobro
        </h2>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5">
          <li>
            {forNew ? (
              <>
                Quien se registra recibe el plan <strong className="font-semibold">{forNew.name}</strong>
                {settings.trialDays > 0
                  ? ` con ${settings.trialDays} días de prueba.`
                  : " sin fecha de vencimiento (los días de prueba están en 0)."}
              </>
            ) : (
              "Ahora ningún plan se da a los comercios nuevos: quien se registra queda sin plan y sin fecha de vencimiento."
            )}
          </li>
          <li>
            Cuando un comercio paga, abre su ficha y registra el pago: su fecha de vencimiento se extiende los meses
            pagados.
          </li>
          <li>
            Desde {BILLING_WARN_DAYS} días antes de vencer, el comercio ve un aviso en su panel. Al vencer tiene {settings.graceDays}{" "}
            {settings.graceDays === 1 ? "día" : "días"} de gracia; después su menú deja de mostrarse hasta que registres
            un pago. Sus datos no se borran.
          </li>
          <li>Un comercio sin fecha de vencimiento no se bloquea nunca.</li>
        </ul>
        <p className="mt-3">
          Los días de prueba, los de gracia y la moneda se cambian en{" "}
          <Link href="/admin/ajustes" className="link">
            Ajustes
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
