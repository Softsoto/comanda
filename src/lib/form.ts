/**
 * Estado que devuelven las acciones de formulario al navegador.
 * - errors: mensaje por campo.
 * - values: lo que la persona escribió, para no borrarle el formulario si hay un error.
 */
export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
};

export const EMPTY_FORM: FormState = {};

/** Lee un campo de texto de un formulario: recorta espacios y limita el largo. */
export function readText(formData: FormData, name: string, maxLength: number): string {
  const value = formData.get(name);
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/** Igual que readText pero conserva los saltos de línea (para listas y descripciones). */
export function readMultiline(formData: FormData, name: string, maxLength: number): string {
  const value = formData.get(name);
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
