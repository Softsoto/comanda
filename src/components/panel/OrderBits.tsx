import { optionsSummary } from "@/lib/options";
import { statusLabel, statusLabelFor, type OrderStatus } from "@/lib/orders";

const STATUS_STYLE: Record<OrderStatus, string> = {
  nuevo: "bg-accent text-on-accent",
  preparando: "bg-brand-tint text-ink",
  listo: "bg-brand text-on-brand",
  completado: "border border-brand text-ink",
  cancelado: "border border-line text-muted",
};

/**
 * Etiqueta con el estado de un pedido. El texto siempre acompaña al color.
 * Con `delivery`, un pedido listo dice "En camino" o "Listo para recoger" según cómo se entrega.
 */
export function StatusBadge({ status, delivery }: { status: OrderStatus; delivery?: string }) {
  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-sm font-semibold whitespace-nowrap ${STATUS_STYLE[status]}`}
    >
      {delivery ? statusLabelFor(status, delivery) : statusLabel(status)}
    </span>
  );
}

/** "2 x Hamburguesa clásica (Doble carne), 1 x Gaseosa" */
export const itemsSummary = (items: { name: string; quantity: number; options?: { name: string }[] }[]) =>
  items
    .map((item) => {
      const options = optionsSummary(item.options ?? []);
      return `${item.quantity} x ${item.name}${options ? ` (${options})` : ""}`;
    })
    .join(", ");
