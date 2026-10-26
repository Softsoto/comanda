import Link from "next/link";

const TABS = [
  { key: "datos", href: "/panel/perfil", label: "Datos" },
  { key: "entregas", href: "/panel/entregas", label: "Entregas" },
  { key: "horarios", href: "/panel/horarios", label: "Horarios" },
  { key: "publicidad", href: "/panel/publicidad", label: "Publicidad" },
  { key: "cupones", href: "/panel/cupones", label: "Cupones" },
] as const;

/** Encabezado y apartados de la sección "Tienda". Si no caben en una línea, pasan a la siguiente. */
export function StoreTabs({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <div className="min-w-0">
      <h1 className="font-display text-display font-bold">Tienda</h1>
      <nav aria-label="Apartados de la tienda" className="mt-3 flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const active = tab.key === current;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-10 items-center rounded-full px-3.5 font-semibold ${
                active
                  ? "border border-brand bg-brand-tint text-ink ring-1 ring-brand"
                  : "border border-line bg-raised text-ink hover:border-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
