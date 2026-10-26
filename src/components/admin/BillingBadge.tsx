import { billingLabel, type Billing, type BillingState } from "@/lib/billing";

const STYLE: Record<BillingState, string> = {
  "sin-vencimiento": "border border-line text-muted",
  activo: "bg-brand-tint text-ink",
  "por-vencer": "bg-accent text-on-accent",
  gracia: "border border-danger text-danger",
  vencido: "border-2 border-danger text-danger",
};

/** Etiqueta con el estado de cobro de un comercio. El texto siempre acompaña al color. */
export function BillingBadge({ billing }: { billing: Billing }) {
  return (
    <span className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-sm font-semibold ${STYLE[billing.state]}`}>
      {billingLabel(billing)}
    </span>
  );
}
