"use client";

import { useState } from "react";

/** Copia un texto al portapapeles y lo confirma en el propio botón. */
export function CopyButton({ text, label = "Copiar enlace" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Sin https (por ejemplo, al probar desde el celular en la red local) el
      // portapapeles moderno no está disponible: se usa el método clásico.
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch {
        // Si tampoco funciona, el enlace sigue visible para copiarlo a mano.
      }
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" className="btn btn-secondary" onClick={copy}>
      <span aria-live="polite">{copied ? "Copiado" : label}</span>
    </button>
  );
}
