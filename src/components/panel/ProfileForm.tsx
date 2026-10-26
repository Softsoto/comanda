"use client";

import { useActionState, useRef, useState } from "react";
import { changePasswordAction } from "@/lib/actions/account";
import { saveProfileAction } from "@/lib/actions/profile";
import { CURRENCIES, LIMITS } from "@/lib/config";
import { TIMEZONES } from "@/lib/dates";
import { EMPTY_FORM, type FormState } from "@/lib/form";
import { FieldError, FormMessage } from "../ui/FormMessage";
import { PhoneField } from "../ui/PhoneField";
import { ImageField } from "./ImageField";

type Props = {
  baseUrl: string;
  business: {
    name: string;
    slug: string;
    countryCode: string;
    phone: string;
    currency: string;
    paymentMethods: string;
    logoUrl: string | null;
    timezone: string;
  };
};

export function ProfileForm({ baseUrl, business }: Props) {
  const logoRef = useRef<Blob | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [slug, setSlug] = useState(business.slug);

  const [state, formAction, pending] = useActionState(async (previous: FormState, formData: FormData) => {
    formData.delete("image");
    if (logoRef.current) formData.set("image", logoRef.current, "logo.png");
    const result = await saveProfileAction(previous, formData);
    if (result.ok) {
      // Guardado: se limpia la imagen pendiente y se vuelve a mostrar la que quedó en el servidor.
      logoRef.current = null;
      setSavedCount((count) => count + 1);
    }
    return result;
  }, EMPTY_FORM);

  const { errors = {}, values } = state;

  return (
    <form action={formAction} className="flex flex-col gap-8" noValidate>
      <FormMessage state={state} />

      <section aria-labelledby="perfil-datos" className="flex flex-col gap-5">
        <h2 id="perfil-datos" className="font-display text-title font-bold">
          Datos del negocio
        </h2>

        <div>
          <label className="label" htmlFor="name">
            Nombre del negocio
          </label>
          <input
            id="name"
            name="name"
            className="field"
            maxLength={LIMITS.businessName}
            defaultValue={values?.name ?? business.name}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "name-error" : undefined}
          />
          <FieldError id="name-error" message={errors.name} />
        </div>

        <ImageField
          key={savedCount}
          label="Logo"
          variant="logo"
          currentUrl={business.logoUrl}
          error={errors.image}
          onChange={(image) => {
            logoRef.current = image;
          }}
        />

        <PhoneField
          countryCode={values?.countryCode ?? business.countryCode}
          phone={values?.phone ?? business.phone}
          error={errors.phone}
          hint="A este número llegan los pedidos. Si lo dejas vacío, el cliente tendrá que elegir a quién enviarlo."
        />
      </section>

      <section aria-labelledby="perfil-pagos" className="flex flex-col gap-5">
        <h2 id="perfil-pagos" className="font-display text-title font-bold">
          Pagos y región
        </h2>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-5">
            <div>
              <label className="label" htmlFor="currency">
                Moneda
              </label>
              <select
                key={values?.currency ?? business.currency}
                id="currency"
                name="currency"
                className="field"
                defaultValue={values?.currency ?? business.currency}
                aria-invalid={errors.currency ? true : undefined}
                aria-describedby={errors.currency ? "currency-error" : "currency-hint"}
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.label}
                  </option>
                ))}
              </select>
              {errors.currency ? (
                <FieldError id="currency-error" message={errors.currency} />
              ) : (
                <p id="currency-hint" className="hint">
                  Cambiar la moneda no convierte los precios: solo cambia cómo se muestran.
                </p>
              )}
            </div>

            <div>
              <label className="label" htmlFor="timezone">
                Zona horaria
              </label>
              <select
                key={values?.timezone ?? business.timezone}
                id="timezone"
                name="timezone"
                className="field"
                defaultValue={values?.timezone ?? business.timezone}
                aria-invalid={errors.timezone ? true : undefined}
                aria-describedby={errors.timezone ? "timezone-error" : "timezone-hint"}
              >
                {TIMEZONES.map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.label}
                  </option>
                ))}
              </select>
              {errors.timezone ? (
                <FieldError id="timezone-error" message={errors.timezone} />
              ) : (
                <p id="timezone-hint" className="hint">
                  Con ella se muestran la fecha y la hora de tus pedidos y reportes.
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="paymentMethods">
              Formas de pago
            </label>
            <textarea
              id="paymentMethods"
              name="paymentMethods"
              className="field"
              rows={5}
              defaultValue={values?.paymentMethods ?? business.paymentMethods}
              aria-invalid={errors.paymentMethods ? true : undefined}
              aria-describedby={errors.paymentMethods ? "paymentMethods-error" : "paymentMethods-hint"}
            />
            {errors.paymentMethods ? (
              <FieldError id="paymentMethods-error" message={errors.paymentMethods} />
            ) : (
              <p id="paymentMethods-hint" className="hint">
                Una por línea. Por ejemplo: Efectivo, Nequi, Daviplata, Tarjeta.
              </p>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="perfil-enlace" className="flex flex-col gap-5">
        <h2 id="perfil-enlace" className="font-display text-title font-bold">
          Enlace
        </h2>
        <div>
          <label className="label" htmlFor="slug">
            Enlace de tu menú
          </label>
          <input
            id="slug"
            name="slug"
            className="field"
            maxLength={40}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={slug}
            onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            aria-invalid={errors.slug ? true : undefined}
            aria-describedby={errors.slug ? "slug-error" : "slug-hint"}
          />
          {errors.slug ? (
            <FieldError id="slug-error" message={errors.slug} />
          ) : (
            <p id="slug-hint" className="hint break-all">
              {baseUrl}/m/{slug || "…"}
              {slug !== business.slug && (
                <span className="mt-1 block font-semibold text-ink">
                  Al cambiarlo, el enlace y el código QR anteriores dejan de funcionar.
                </span>
              )}
            </p>
          )}
        </div>
      </section>

      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

/** Cambio de contraseña de la cuenta. */
export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, EMPTY_FORM);
  const { errors = {} } = state;
  const fields = [
    { name: "currentPassword", label: "Contraseña actual", autoComplete: "current-password" },
    { name: "newPassword", label: "Contraseña nueva", autoComplete: "new-password" },
    { name: "repeatPassword", label: "Repite la contraseña nueva", autoComplete: "new-password" },
  ];
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <h2 className="font-display text-title font-bold">Contraseña</h2>
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
            autoComplete={field.autoComplete}
            aria-invalid={errors[field.name] ? true : undefined}
            aria-describedby={errors[field.name] ? `${field.name}-error` : undefined}
          />
          <FieldError id={`${field.name}-error`} message={errors[field.name]} />
        </div>
      ))}
      <div>
        <button type="submit" className="btn btn-secondary" disabled={pending}>
          {pending ? "Cambiando…" : "Cambiar contraseña"}
        </button>
      </div>
    </form>
  );
}
