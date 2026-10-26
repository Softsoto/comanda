import Link from "next/link";

const TABS = [
  { key: "ventas", href: "/panel/reportes", label: "Ventas" },
  { key: "clientes", href: "/panel/clientes", label: "Clientes" },
] as const;

/** Pestañas de la sección "Reportes": las ventas y la lista de clientes. */
export function ReportTabs({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Apartados de reportes" className="flex gap-1 border-b border-line/40">
      {TABS.map((tab) => {
        const active = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 font-semibold ${
              active ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
