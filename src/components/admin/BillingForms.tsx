"use client";

import { useActionState, useState } from "react";
import {
  registerPaymentAction,
  saveBillingSettingsAction,
  savePlanAction,
  savePrivacySettingsAction,
  setBusinessPlanAction,
} from "@/lib/actions/billing";
import { PAYMENT_MONTHS } from "@/lib/billing";
import { CURRENCIES, LIMITS } from "@/lib/config";
import { EMPTY_FORM, type FormState } from "@/lib/form";
import { centsToInput } from "@/lib/money";
import { PRIVACY_TEXT_MAX } from "@/lib/privacy";
import { FieldError, FormMessage } from "../ui/FormMessage";
import { PhoneField } from "../ui/PhoneField";

type PlanValues = { id?: string; name: string; price: string; maxProducts: string };

/** Campos de un plan: nombre, precio por mes y tope de productos. */
function PlanFields({ idPrefix, state, plan, currency }: { idPrefix: string; state: FormState; plan: PlanValues; currency: string }) {
  const { errors = {}, values } = state;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div>
        <label className="label" htmlFor={`${idPrefix}-nombre`}>
          Nombre del plan
        </label>
        <input
          id={`${idPrefix}-nombre`}
          name="name"
          className="field"
          maxLength={LIMITS.planName}
          placeholder="Básico"
          defaultValue={values?.name ?? plan.name}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${idPrefix}-nombre-error` : undefined}
        />
        <FieldError id={`${idPrefix}-nombre-error`} message={errors.name} />
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-precio`}>
          Precio por mes ({currency})
        </label>
        <input
          id={`${idPrefix}-precio`}
          name="price"
          className="field"
          inputMode="decimal"
          autoComplete="off"
          placeholder="35000"
          defaultValue={values?.price ?? plan.price}
          aria-invalid={errors.price ? true : undefined}
          aria-describedby={errors.price ? `${idPrefix}-precio-error` : undefined}
        />
        <FieldError id={`${idPrefix}-precio-error`} message={errors.price} />
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-max`}>
          Máximo de productos
        </label>
        <input
          id={`${idPrefix}-max`}
          name="maxProducts"
          className="field"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Sin límite"
          defaultValue={values?.maxProducts ?? plan.maxProducts}
          aria-invalid={errors.maxProducts ? true : undefined}
          aria-describedby={errors.maxProducts ? `${idPrefix}-max-error` : undefined}
        />
        <FieldError id={`${idPrefix}-max-error`} message={errors.maxProducts} />
      </div>
    </div>
  );
}

/** Formulario para crear un plan. */
export function NewPlanForm({ currency }: { currency: string }) {
  const [state, formAction, pending] = useActionState(savePlanAction, EMPTY_FORM);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      {/* Tras guardar, los campos vuelven a quedar vacíos para crear otro. */}
      <PlanFields idPrefix="plan-nuevo" state={state.ok ? EMPTY_FORM : state} plan={{ name: "", price: "", maxProducts: "" }} currency={currency} />
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creando…" : "Crear plan"}
        </button>
      </div>
    </form>
  );
}

/** Botón "Editar" de un plan, que abre sus campos. */
export function PlanEditor({ plan, currency }: { plan: Required<PlanValues>; currency: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await savePlanAction(previous, formData);
    if (result.ok) setEditing(false);
    return result;
  }, EMPTY_FORM);

  if (!editing) {
    return (
      <button type="button" className="btn btn-secondary btn-sm" aria-label={`Editar el plan ${plan.name}`} onClick={() => setEditing(true)}>
        Editar
      </button>
    );
  }
  return (
    <form action={formAction} className="order-last flex basis-full flex-col gap-3 pt-1" noValidate>
      <input type="hidden" name="id" value={plan.id} />
      {!state.ok && <FormMessage state={state} />}
      <PlanFields idPrefix={`plan-${plan.id}`} state={state} plan={plan} currency={currency} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Plan y último día pagado de un comercio, para corregirlos a mano. */
export function BusinessPlanForm({
  businessId,
  plans,
  planId,
  paidUntil,
}: {
  businessId: string;
  plans: { id: string; label: string }[];
  planId: string;
  paidUntil: string;
}) {
  const [state, formAction, pending] = useActionState(setBusinessPlanAction, EMPTY_FORM);
  const { errors = {} } = state;
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="plan-comercio">
            Plan
          </label>
          {/* key: al guardar, el <select> se vuelve a montar con el valor que quedó. */}
          <select key={planId} id="plan-comercio" name="planId" className="field" defaultValue={planId}>
            <option value="">Sin plan</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pagado-hasta">
            Pagado hasta
          </label>
          <input
            key={paidUntil}
            id="pagado-hasta"
            name="paidUntil"
            type="date"
            className="field"
            defaultValue={paidUntil}
            aria-invalid={errors.paidUntil ? true : undefined}
            aria-describedby={errors.paidUntil ? "pagado-hasta-error" : "pagado-hasta-hint"}
          />
          {errors.paidUntil ? (
            <FieldError id="pagado-hasta-error" message={errors.paidUntil} />
          ) : (
            <p id="pagado-hasta-hint" className="hint">
              Último día cubierto. Vacío: el comercio no vence nunca.
            </p>
          )}
        </div>
      </div>
      <div>
        <button type="submit" className="btn btn-secondary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar plan y fecha"}
        </button>
      </div>
    </form>
  );
}

/** Registro de un pago recibido. Al guardarlo, el vencimiento del comercio se extiende los meses pagados. */
export function PaymentForm({
  businessId,
  monthlyCents,
  currency,
}: {
  businessId: string;
  /** Precio por mes del plan del comercio, para proponer el valor; null si no tiene plan. */
  monthlyCents: number | null;
  currency: string;
}) {
  const suggested = (months: number) => (monthlyCents ? centsToInput(monthlyCents * months) : "");
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(suggested(1));
  const [state, formAction, pending] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await registerPaymentAction(previous, formData);
    if (result.ok) {
      setMonths(1);
      setAmount(suggested(1));
    }
    return result;
  }, EMPTY_FORM);
  const { errors = {}, values } = state.ok ? EMPTY_FORM : state;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pago-meses">
            Meses que paga
          </label>
          <select
            id="pago-meses"
            name="months"
            className="field"
            value={months}
            onChange={(event) => {
              const next = Number(event.target.value);
              // Si el valor es el que se propuso para los meses anteriores, se actualiza solo.
              if (amount === suggested(months)) setAmount(suggested(next));
              setMonths(next);
            }}
          >
            {PAYMENT_MONTHS.map((option) => (
              <option key={option} value={option}>
                {option === 1 ? "1 mes" : `${option} meses`}
              </option>
            ))}
          </select>
          <FieldError id="pago-meses-error" message={errors.months} />
        </div>
        <div>
          <label className="label" htmlFor="pago-valor">
            Valor recibido ({currency})
          </label>
          <input
            id="pago-valor"
            name="amount"
            className="field"
            inputMode="decimal"
            autoComplete="off"
            placeholder="35000"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? "pago-valor-error" : undefined}
          />
          <FieldError id="pago-valor-error" message={errors.amount} />
        </div>
        <div>
          <label className="label" htmlFor="pago-medio">
            Medio de pago <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input
            id="pago-medio"
            name="method"
            className="field"
            maxLength={LIMITS.paymentMethod}
            placeholder="Transferencia, Nequi, efectivo…"
            defaultValue={values?.method ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="pago-nota">
            Nota <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input
            id="pago-nota"
            name="note"
            className="field"
            maxLength={LIMITS.paymentNote}
            placeholder="Número de comprobante, quién pagó…"
            defaultValue={values?.note ?? ""}
          />
        </div>
      </div>
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Registrando…" : "Registrar pago"}
        </button>
      </div>
    </form>
  );
}

/** Ajustes de cobro: días de prueba, días de gracia, moneda y WhatsApp de soporte. */
export function BillingSettingsForm({
  trialDays,
  graceDays,
  serviceCurrency,
  countryCode,
  phone,
}: {
  trialDays: string;
  graceDays: string;
  serviceCurrency: string;
  countryCode: string;
  phone: string;
}) {
  const [state, formAction, pending] = useActionState(saveBillingSettingsAction, EMPTY_FORM);
  const { errors = {}, values } = state;
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="trialDays">
            Días de prueba
          </label>
          <input
            id="trialDays"
            name="trialDays"
            className="field"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={values?.trialDays ?? trialDays}
            aria-invalid={errors.trialDays ? true : undefined}
            aria-describedby={errors.trialDays ? "trialDays-error" : "trialDays-hint"}
          />
          {errors.trialDays ? (
            <FieldError id="trialDays-error" message={errors.trialDays} />
          ) : (
            <p id="trialDays-hint" className="hint">
              Los recibe un comercio nuevo cuando hay un plan “para nuevos”. Con 0, queda sin fecha de vencimiento.
            </p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="graceDays">
            Días de gracia
          </label>
          <input
            id="graceDays"
            name="graceDays"
            className="field"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={values?.graceDays ?? graceDays}
            aria-invalid={errors.graceDays ? true : undefined}
            aria-describedby={errors.graceDays ? "graceDays-error" : "graceDays-hint"}
          />
          {errors.graceDays ? (
            <FieldError id="graceDays-error" message={errors.graceDays} />
          ) : (
            <p id="graceDays-hint" className="hint">
              Después de vencer, el menú sigue funcionando estos días. Luego deja de mostrarse hasta registrar un pago.
            </p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="serviceCurrency">
            Moneda de los planes
          </label>
          <select
            key={values?.serviceCurrency ?? serviceCurrency}
            id="serviceCurrency"
            name="serviceCurrency"
            className="field"
            defaultValue={values?.serviceCurrency ?? serviceCurrency}
            aria-invalid={errors.serviceCurrency ? true : undefined}
          >
            {CURRENCIES.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.label}
              </option>
            ))}
          </select>
          <FieldError id="serviceCurrency-error" message={errors.serviceCurrency} />
        </div>
      </div>
      <PhoneField
        label="Tu WhatsApp de soporte (opcional)"
        countryCode={values?.countryCode ?? countryCode}
        phone={values?.phone ?? phone}
        error={errors.phone}
        hint="Los comercios lo ven en los avisos de vencimiento y al recuperar la contraseña, para escribirte."
      />
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar ajustes"}
        </button>
      </div>
    </form>
  );
}

/** Aviso de tratamiento de datos: texto propio (o la plantilla) y si se exige marcar una casilla. */
export function PrivacySettingsForm({ privacyText, privacyCheckbox, template }: { privacyText: string; privacyCheckbox: boolean; template: string }) {
  const [state, formAction, pending] = useActionState(savePrivacySettingsAction, EMPTY_FORM);
  const [text, setText] = useState(privacyText);
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="privacyCheckbox"
          id="privacyCheckbox"
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]"
          defaultChecked={privacyCheckbox}
        />
        <span>
          <span className="font-semibold">Pedir que el cliente marque una casilla de aceptación</span>
          <span className="block text-caption text-muted">
            Sin marcar esto, el menú muestra el aviso junto al botón de enviar y se entiende aceptado al enviar el
            pedido. Con la casilla queda una aceptación expresa en cada pedido, a cambio de un toque más.
          </span>
        </span>
      </label>
      <div>
        <label className="label" htmlFor="privacyText">
          Texto del aviso <span className="font-normal text-muted">(opcional)</span>
        </label>
        <textarea
          id="privacyText"
          name="privacyText"
          className="field"
          rows={10}
          maxLength={PRIVACY_TEXT_MAX}
          placeholder="Vacío: se usa la plantilla incluida."
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-describedby="privacyText-hint"
        />
        <p id="privacyText-hint" className="hint">
          Se muestra como lo escribes: deja una línea en blanco entre párrafos, y una línea que empieza con # es un
          título. Puedes usar{" "}
          {"{negocio}"}, {"{contacto}"} y {"{servicio}"}: se reemplazan solos en el menú de cada comercio.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setText(template)}>
            Partir de la plantilla
          </button>
          {text !== "" && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setText("")}>
              Vaciar (usar la plantilla tal cual)
            </button>
          )}
        </div>
      </div>
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar aviso"}
        </button>
      </div>
    </form>
  );
}
