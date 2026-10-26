"use client";

import { useActionState, useState } from "react";
import { createCategoryAction, renameCategoryAction } from "@/lib/actions/menu";
import { LIMITS } from "@/lib/config";
import { EMPTY_FORM, type FormState } from "@/lib/form";
import { FieldError, FormMessage } from "../ui/FormMessage";

/** Formulario de una línea para crear una categoría. */
export function NewCategoryForm() {
  const [state, formAction, pending] = useActionState(createCategoryAction, EMPTY_FORM);
  const error = state.errors?.name;
  return (
    <form action={formAction} className="card flex flex-col gap-3" noValidate>
      <label className="label mb-0" htmlFor="new-category">
        Nueva categoría
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="new-category"
          name="name"
          className="field min-w-0 flex-1 basis-48"
          maxLength={LIMITS.categoryName}
          placeholder="Hamburguesas, Bebidas, Postres…"
          defaultValue={state.values?.name ?? ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "new-category-error" : undefined}
        />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creando…" : "Crear categoría"}
        </button>
      </div>
      <FieldError id="new-category-error" message={error} />
      <FormMessage state={state} />
    </form>
  );
}

/** Título de una categoría con opción de cambiarle el nombre. */
export function CategoryTitle({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await renameCategoryAction(previous, formData);
    if (result.ok) setEditing(false);
    return result;
  }, EMPTY_FORM);

  if (!editing) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-x-2">
        <h2 id={`categoria-${id}`} className="min-w-0 font-display text-title font-bold wrap-anywhere">
          {name}
        </h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm px-3 text-muted"
          onClick={() => setEditing(true)}
          aria-label={`Cambiar el nombre de ${name}`}
        >
          Renombrar
        </button>
      </div>
    );
  }

  const error = state.errors?.name ?? (state.ok ? undefined : state.message);
  return (
    <form action={formAction} className="flex w-full flex-col gap-2" noValidate>
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap gap-2">
        <input
          id={`renombrar-${id}`}
          name="name"
          className="field min-w-0 flex-1 basis-40"
          maxLength={LIMITS.categoryName}
          defaultValue={state.values?.name ?? name}
          aria-label="Nombre de la categoría"
          aria-invalid={error ? true : undefined}
          autoFocus
        />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
          Cancelar
        </button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
