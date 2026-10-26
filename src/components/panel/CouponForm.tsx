"use client";

import { useActionState, useState } from "react";
import { createCouponAction } from "@/lib/actions/coupons";
import { COUPON_CODE_MAX, COUPON_KINDS, normalizeCode } from "@/lib/coupons";
import { EMPTY_FORM, type FormState } from "@/lib/form";
import { FieldError, FormMessage } from "../ui/FormMessage";

/** Formulario para crear un cupón de descuento. */
export function CouponForm({ today }: { today: string }) {
  const [kind, setKind] = useState("percent");
  const [code, setCode] = useState("");
  const [state, formAction, pending] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await createCouponAction(previous, formData);
    if (result.ok) {
      setCode("");
      setKind("percent");
    }
    return result;
  }, EMPTY_FORM);
  // Tras guardar, el formulario vuelve a quedar vacío.
  const { errors = {}, values } = state.ok ? EMPTY_FORM : state;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="cupon-code">
            Código
          </label>
          <input
            id="cupon-code"
            name="code"
            className="field uppercase placeholder:normal-case"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={COUPON_CODE_MAX}
            placeholder="BIENVENIDO10"
            value={code}
            onChange={(event) => setCode(normalizeCode(event.target.value))}
            aria-invalid={errors.code ? true : undefined}
            aria-describedby={errors.code ? "cupon-code-error" : "cupon-code-hint"}
          />
          {errors.code ? (
            <FieldError id="cupon-code-error" message={errors.code} />
          ) : (
            <p id="cupon-code-hint" className="hint">
              Lo que escribe el cliente al pedir. Solo letras y números.
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="cupon-kind">
            ¿Qué hace?
          </label>
          <select
            id="cupon-kind"
            name="kind"
            className="field"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            aria-invalid={errors.kind ? true : undefined}
          >
            {COUPON_KINDS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <FieldError id="cupon-kind-error" message={errors.kind} />
        </div>
      </div>

      {kind !== "free_delivery" && (
        <div className="sm:max-w-[calc(50%-0.5rem)]">
          <label className="label" htmlFor="cupon-value">
            {kind === "percent" ? "Porcentaje de descuento" : "Valor del descuento"}
          </label>
          <input
            id="cupon-value"
            name="value"
            className="field"
            inputMode="decimal"
            autoComplete="off"
            placeholder={kind === "percent" ? "10" : "5000"}
            defaultValue={values?.value ?? ""}
            aria-invalid={errors.value ? true : undefined}
            aria-describedby={errors.value ? "cupon-value-error" : "cupon-value-hint"}
          />
          {errors.value ? (
            <FieldError id="cupon-value-error" message={errors.value} />
          ) : (
            <p id="cupon-value-hint" className="hint">
              {kind === "percent"
                ? "Un número del 1 al 100. Se descuenta del valor de los productos, no del domicilio."
                : "Se resta del valor de los productos, no del domicilio."}
            </p>
          )}
        </div>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="label">
          Condiciones <span className="font-normal text-muted">(opcionales)</span>
        </legend>
        <div>
          <label className="mb-1.5 block text-sm text-muted" htmlFor="cupon-min">
            Pedido mínimo
          </label>
          <input
            id="cupon-min"
            name="minSubtotal"
            className="field"
            inputMode="decimal"
            autoComplete="off"
            placeholder="30000"
            defaultValue={values?.minSubtotal ?? ""}
            aria-invalid={errors.minSubtotal ? true : undefined}
            aria-describedby={errors.minSubtotal ? "cupon-min-error" : undefined}
          />
          <FieldError id="cupon-min-error" message={errors.minSubtotal} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-muted" htmlFor="cupon-ends">
            Sirve hasta
          </label>
          <input
            id="cupon-ends"
            name="endsOn"
            type="date"
            className="field"
            min={today}
            defaultValue={values?.endsOn ?? ""}
            aria-invalid={errors.endsOn ? true : undefined}
            aria-describedby={errors.endsOn ? "cupon-ends-error" : undefined}
          />
          <FieldError id="cupon-ends-error" message={errors.endsOn} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-muted" htmlFor="cupon-max">
            Veces que se puede usar
          </label>
          <input
            id="cupon-max"
            name="maxUses"
            className="field"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Sin límite"
            defaultValue={values?.maxUses ?? ""}
            aria-invalid={errors.maxUses ? true : undefined}
            aria-describedby={errors.maxUses ? "cupon-max-error" : undefined}
          />
          <FieldError id="cupon-max-error" message={errors.maxUses} />
        </div>
      </fieldset>

      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creando…" : "Crear cupón"}
        </button>
      </div>
    </form>
  );
}
