import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/config";
import { FieldError } from "./FormMessage";

type Props = {
  countryCode?: string;
  phone?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  /** Rótulo del campo, si no es el WhatsApp de un negocio. */
  label?: string;
};

/** Número de WhatsApp: indicativo del país + número local. */
export function PhoneField({ countryCode, phone, error, hint, required, label }: Props) {
  const code = countryCode ?? DEFAULT_COUNTRY_CODE;
  const knownCode = COUNTRY_CODES.some((item) => item.code === code);
  return (
    <div>
      <label className="label" htmlFor="phone">
        {label ?? "Número de WhatsApp del negocio"}
      </label>
      <div className="flex gap-2">
        {/* key: React no actualiza la opción por defecto de un <select> ya montado;
            al cambiar el valor se vuelve a montar para que no se pierda tras enviar. */}
        <select
          key={knownCode ? code : ""}
          id="countryCode"
          name="countryCode"
          aria-label="País"
          className="field w-[42%] max-w-52 min-w-0"
          defaultValue={knownCode ? code : ""}
        >
          {COUNTRY_CODES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
          <option value="">Otro país</option>
        </select>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          className="field min-w-0 flex-1"
          placeholder="300 123 4567"
          defaultValue={phone ?? ""}
          required={required}
          maxLength={24}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "phone-error" : "phone-hint"}
        />
      </div>
      {error ? (
        <FieldError id="phone-error" message={error} />
      ) : (
        <p id="phone-hint" className="hint">
          {hint ?? "Aquí llegarán los pedidos. Si eliges “Otro país”, escribe el número con su indicativo."}
        </p>
      )}
    </div>
  );
}
