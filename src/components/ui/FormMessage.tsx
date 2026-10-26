import type { FormState } from "@/lib/form";

/** Aviso general de un formulario: verde si se guardó, rojo si hubo un problema. */
export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return state.ok ? (
    <p role="status" className="rounded-field bg-brand-tint px-3 py-2.5 text-sm font-semibold text-ink">
      {state.message}
    </p>
  ) : (
    <p role="alert" className="rounded-field border border-danger px-3 py-2.5 text-sm font-semibold text-danger">
      {state.message}
    </p>
  );
}

/** Mensaje de error debajo de un campo. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="field-error">
      {message}
    </p>
  );
}
