"use client";

import { useActionState } from "react";
import { adminCreateBusinessAction, adminSetPasswordAction } from "@/lib/actions/admin";
import { LIMITS } from "@/lib/config";
import { EMPTY_FORM } from "@/lib/form";
import { FieldError, FormMessage } from "../ui/FormMessage";
import { PhoneField } from "../ui/PhoneField";

/** Alta de un comercio desde la administración. */
export function NewBusinessForm() {
  const [state, formAction, pending] = useActionState(adminCreateBusinessAction, EMPTY_FORM);
  const { errors = {}, values = {} } = state;
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <div>
        <label className="label" htmlFor="businessName">
          Nombre del negocio
        </label>
        <input
          id="businessName"
          name="businessName"
          className="field"
          maxLength={LIMITS.businessName}
          defaultValue={values.businessName ?? ""}
          aria-invalid={errors.businessName ? true : undefined}
          aria-describedby={errors.businessName ? "businessName-error" : undefined}
        />
        <FieldError id="businessName-error" message={errors.businessName} />
      </div>

      <div>
        <label className="label" htmlFor="email">
          Correo del comercio
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="field"
          autoComplete="off"
          defaultValue={values.email ?? ""}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : "email-hint"}
        />
        {errors.email ? (
          <FieldError id="email-error" message={errors.email} />
        ) : (
          <p id="email-hint" className="hint">
            Con este correo entrará a su panel.
          </p>
        )}
      </div>

      <div>
        <label className="label" htmlFor="password">
          Contraseña inicial
        </label>
        <input
          id="password"
          name="password"
          type="text"
          className="field"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "password-error" : "password-hint"}
        />
        {errors.password ? (
          <FieldError id="password-error" message={errors.password} />
        ) : (
          <p id="password-hint" className="hint">
            Mínimo 8 caracteres. Entrégasela al comercio; podrá cambiarla en su panel.
          </p>
        )}
      </div>

      <PhoneField
        countryCode={values.countryCode}
        phone={values.phone}
        error={errors.phone}
        hint="Opcional. A este número llegarán sus pedidos; el comercio puede ponerlo después."
      />

      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creando…" : "Crear comercio"}
        </button>
      </div>
    </form>
  );
}

/** Pone una contraseña nueva a un comercio que olvidó la suya. */
export function SetPasswordForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState(adminSetPasswordAction, EMPTY_FORM);
  const { errors = {} } = state;
  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="id" value={businessId} />
      <FormMessage state={state} />
      <div>
        <label className="label" htmlFor="new-password">
          Contraseña nueva
        </label>
        <input
          id="new-password"
          name="password"
          type="text"
          className="field max-w-sm"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "new-password-error" : undefined}
        />
        <FieldError id="new-password-error" message={errors.password} />
      </div>
      <div>
        <button type="submit" className="btn btn-secondary" disabled={pending}>
          {pending ? "Cambiando…" : "Cambiar contraseña"}
        </button>
      </div>
    </form>
  );
}
