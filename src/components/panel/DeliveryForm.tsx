"use client";

import { useActionState, useState } from "react";
import { addZoneAction, saveDeliveryAction, updateZoneAction } from "@/lib/actions/delivery";
import { LIMITS } from "@/lib/config";
import { EMPTY_FORM, type FormState } from "@/lib/form";
import { DELIVERY_MODES } from "@/lib/orders";
import { FieldError, FormMessage } from "../ui/FormMessage";

const DELIVERY_HELP: Record<string, string> = {
  domicilio: "Llevas el pedido a la dirección del cliente.",
  recoger: "El cliente pasa a recogerlo.",
  local: "El cliente pide desde la mesa, por ejemplo con el código QR.",
};

type Props = {
  /** Formas de entrega activas, separadas por comas. */
  deliveryModes: string;
  deliveryFee: string;
  freeFrom: string;
  minOrder: string;
  /** Con zonas creadas, el costo fijo deja de usarse y el formulario lo explica. */
  hasZones: boolean;
};

/** Formas de entrega, costo fijo del domicilio, domicilio gratis desde un valor y pedido mínimo. */
export function DeliveryForm({ deliveryModes, deliveryFee, freeFrom, minOrder, hasZones }: Props) {
  const [state, formAction, pending] = useActionState(saveDeliveryAction, EMPTY_FORM);
  const { errors = {}, values } = state;
  const activeModes = (values?.deliveryModes ?? deliveryModes).split(",");

  const amounts = [
    {
      name: "deliveryFee",
      label: "Costo fijo del domicilio",
      placeholder: "5000",
      initial: deliveryFee,
      hint: hasZones
        ? "No se está usando: tienes zonas con su propio precio (abajo)."
        : "Se suma a los pedidos a domicilio. Vacío: lo acuerdas con el cliente por WhatsApp.",
    },
    {
      name: "freeFrom",
      label: "Domicilio gratis desde",
      placeholder: "60000",
      initial: freeFrom,
      hint: "Si el cliente pide este valor o más en productos, no se le cobra el domicilio. Vacío: no aplica.",
    },
    {
      name: "minOrder",
      label: "Pedido mínimo",
      placeholder: "20000",
      initial: minOrder,
      hint: "Valor mínimo en productos para poder enviar un pedido. Vacío: sin mínimo.",
    },
  ];

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />

      <fieldset aria-describedby={errors.deliveryModes ? "deliveryModes-error" : undefined}>
        <legend className="label">Formas de entrega que ofreces</legend>
        <div className="flex flex-col">
          {DELIVERY_MODES.map((mode) => (
            <label key={mode.value} className="flex min-h-11 cursor-pointer items-center gap-3 py-1">
              <input
                type="checkbox"
                name="deliveryModes"
                id={`deliveryModes-${mode.value}`}
                value={mode.value}
                className="h-5 w-5 shrink-0 accent-[var(--brand)]"
                defaultChecked={activeModes.includes(mode.value)}
              />
              <span>
                <span className="font-semibold">{mode.label}</span>
                <span className="block text-caption text-muted">{DELIVERY_HELP[mode.value]}</span>
              </span>
            </label>
          ))}
        </div>
        <FieldError id="deliveryModes-error" message={errors.deliveryModes} />
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-3">
        {amounts.map((field) => (
          <div key={field.name}>
            <label className="label" htmlFor={field.name}>
              {field.label} <span className="font-normal text-muted">(opcional)</span>
            </label>
            <input
              id={field.name}
              name={field.name}
              className="field"
              inputMode="decimal"
              autoComplete="off"
              placeholder={field.placeholder}
              defaultValue={values?.[field.name] ?? field.initial}
              aria-invalid={errors[field.name] ? true : undefined}
              aria-describedby={errors[field.name] ? `${field.name}-error` : `${field.name}-hint`}
            />
            {errors[field.name] ? (
              <FieldError id={`${field.name}-error`} message={errors[field.name]} />
            ) : (
              <p id={`${field.name}-hint`} className="hint">
                {field.hint}
              </p>
            )}
          </div>
        ))}
      </div>

      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

/** Campos de una zona: nombre y precio. Los usan el formulario de crear y el de editar. */
function ZoneFields({ idPrefix, state, name, fee }: { idPrefix: string; state: FormState; name: string; fee: string }) {
  const { errors = {}, values } = state;
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div>
        <label className="label" htmlFor={`${idPrefix}-nombre`}>
          Zona o barrio
        </label>
        <input
          id={`${idPrefix}-nombre`}
          name="name"
          className="field"
          maxLength={LIMITS.zoneName}
          placeholder="Centro, Laureles, El Poblado…"
          defaultValue={values?.name ?? name}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${idPrefix}-nombre-error` : undefined}
        />
        <FieldError id={`${idPrefix}-nombre-error`} message={errors.name} />
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-precio`}>
          Precio del domicilio
        </label>
        <input
          id={`${idPrefix}-precio`}
          name="fee"
          className="field"
          inputMode="decimal"
          autoComplete="off"
          placeholder="4000"
          defaultValue={values?.fee ?? fee}
          aria-invalid={errors.fee ? true : undefined}
          aria-describedby={errors.fee ? `${idPrefix}-precio-error` : undefined}
        />
        <FieldError id={`${idPrefix}-precio-error`} message={errors.fee} />
      </div>
    </div>
  );
}

/** Formulario para añadir una zona de domicilio. */
export function NewZoneForm() {
  const [state, formAction, pending] = useActionState(addZoneAction, EMPTY_FORM);
  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      {/* Tras guardar, los campos vuelven a quedar vacíos para escribir la siguiente zona. */}
      <ZoneFields idPrefix="zona-nueva" state={state.ok ? EMPTY_FORM : state} name="" fee="" />
      <div>
        <button type="submit" className="btn btn-outline-brand" disabled={pending}>
          {pending ? "Añadiendo…" : "Añadir zona"}
        </button>
      </div>
    </form>
  );
}

/** Botón "Editar" de una zona, que abre sus campos para cambiar nombre y precio. */
export function ZoneEditor({ id, name, fee }: { id: string; name: string; fee: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await updateZoneAction(previous, formData);
    if (result.ok) setEditing(false);
    return result;
  }, EMPTY_FORM);

  if (!editing) {
    return (
      <button type="button" className="btn btn-secondary btn-sm" aria-label={`Editar la zona ${name}`} onClick={() => setEditing(true)}>
        Editar
      </button>
    );
  }

  return (
    <form action={formAction} className="order-last flex basis-full flex-col gap-3 pt-1" noValidate>
      <input type="hidden" name="id" value={id} />
      {!state.ok && <FormMessage state={state} />}
      <ZoneFields idPrefix={`zona-${id}`} state={state} name={name} fee={fee} />
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
