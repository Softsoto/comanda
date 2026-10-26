"use client";

import { useEffect, useRef } from "react";

/**
 * Abre y cierra un <dialog> nativo según `open`. Mientras está abierto, la
 * página de fondo no se desplaza.
 */
export function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);
  return ref;
}
