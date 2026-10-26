"use client";

import { useActionState } from "react";
import { loginAction, registerAction } from "@/lib/actions/auth";
import { requestPasswordResetAction, resetPasswordAction } from "@/lib/actions/recovery";
import { LIMITS } from "@/lib/config";
import { EMPTY_FORM } from "@/lib/form";
import { FieldError, FormMessage } from "../ui/FormMessage";
import { PhoneField } from "../ui/PhoneField";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, EMPTY_FORM);
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
          autoComplete="organization"
          maxLength={LIMITS.businessName}
          defaultValue={values.businessName ?? ""}
          aria-invalid={errors.businessName ? true : undefined}
          aria-describedby={errors.businessName ? "businessName-error" : undefined}
        />
        <FieldError id="businessName-error" message={errors.businessName} />
      </div>

      <PhoneField countryCode={values.countryCode} phone={values.phone} error={errors.phone} />

      <div>
        <label className="label" htmlFor="email">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="field"
          autoComplete="email"
          defaultValue={values.email ?? ""}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
        />
        <FieldError id="email-error" message={errors.email} />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="field"
          autoComplete="new-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "password-error" : "password-hint"}
        />
        {errors.password ? (
          <FieldError id="password-error" message={errors.password} />
        ) : (
          <p id="password-hint" className="hint">
            Mínimo 8 caracteres.
          </p>
        )}
      </div>

      <button type="submit" className="btn btn-primary min-h-12" disabled={pending}>
        {pending ? "Creando tu menú…" : "Crear mi menú"}
      </button>
    </form>
  );
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, EMPTY_FORM);
  const { values = {} } = state;
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <div>
        <label className="label" htmlFor="email">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="field"
          autoComplete="email"
          defaultValue={values.email ?? ""}
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Contraseña
        </label>
        <input id="password" name="password" type="password" className="field" autoComplete="current-password" />
      </div>
      <button type="submit" className="btn btn-primary min-h-12" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

/** Pide el correo de la cuenta para enviarle un enlace con el que cambiar la contraseña. */
export function RecoverForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, EMPTY_FORM);
  const { errors = {}, values = {} } = state;
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <div>
        <label className="label" htmlFor="email">
          Correo de tu cuenta
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="field"
          autoComplete="email"
          defaultValue={state.ok ? "" : (values.email ?? "")}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
        />
        <FieldError id="email-error" message={errors.email} />
      </div>
      <button type="submit" className="btn btn-primary min-h-12" disabled={pending}>
        {pending ? "Enviando…" : "Enviarme el enlace"}
      </button>
    </form>
  );
}

/** Elige la contraseña nueva. Llega aquí quien abre el enlace recibido por correo. */
export function ResetForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, EMPTY_FORM);
  const { errors = {} } = state;
  const fields = [
    { name: "newPassword", label: "Contraseña nueva", hint: "Mínimo 8 caracteres." },
    { name: "repeatPassword", label: "Repite la contraseña nueva", hint: "" },
  ];
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      {fields.map((field) => (
        <div key={field.name}>
          <label className="label" htmlFor={field.name}>
            {field.label}
          </label>
          <input
            id={field.name}
            name={field.name}
            type="password"
            className="field"
            autoComplete="new-password"
            aria-invalid={errors[field.name] ? true : undefined}
            aria-describedby={errors[field.name] ? `${field.name}-error` : field.hint ? `${field.name}-hint` : undefined}
          />
          {errors[field.name] ? (
            <FieldError id={`${field.name}-error`} message={errors[field.name]} />
          ) : field.hint ? (
            <p id={`${field.name}-hint`} className="hint">
              {field.hint}
            </p>
          ) : null}
        </div>
      ))}
      <button type="submit" className="btn btn-primary min-h-12" disabled={pending}>
        {pending ? "Guardando…" : "Guardar contraseña nueva"}
      </button>
    </form>
  );
}
