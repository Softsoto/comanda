"use client";

import { PrintIcon } from "../ui/icons";

/** Abre el cuadro de impresión del navegador con la comanda del pedido. */
export function PrintButton() {
  return (
    <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
      <PrintIcon width={20} height={20} />
      Imprimir comanda
    </button>
  );
}
