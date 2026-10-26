"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  children: ReactNode;
  className?: string;
  pendingText?: string;
  /** Si se indica, pide confirmación antes de enviar (para acciones que borran). */
  confirm?: string;
  ariaLabel?: string;
  /** Para formularios con varios botones: el servidor recibe el valor del que se pulsó. */
  name?: string;
  value?: string;
  /** En grupos de opciones, indica cuál está elegida. */
  pressed?: boolean;
};

/** Botón de envío que se desactiva mientras el servidor procesa el formulario. */
export function SubmitButton({
  children,
  className = "btn btn-primary",
  pendingText,
  confirm,
  ariaLabel,
  name,
  value,
  pressed,
}: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      disabled={pending}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
