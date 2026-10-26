"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/panel", label: "Inicio", match: [] as string[] },
  { href: "/panel/pedidos", label: "Pedidos", match: ["/panel/pedidos"] },
  { href: "/panel/menu", label: "Menú", match: ["/panel/menu"] },
  // "Reportes" reúne las ventas y la lista de clientes.
  { href: "/panel/reportes", label: "Reportes", match: ["/panel/reportes", "/panel/clientes"] },
  // "Tienda" reúne los datos del negocio, las entregas, los horarios, la publicidad y los cupones.
  {
    href: "/panel/perfil",
    label: "Tienda",
    match: ["/panel/perfil", "/panel/entregas", "/panel/horarios", "/panel/publicidad", "/panel/cupones"],
  },
];

/** Pestañas del panel; marca la sección en la que estás y avisa de los pedidos sin atender. */
export function PanelNav({ newOrders }: { newOrders: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones del panel" className="flex justify-between sm:justify-start sm:gap-1">
      {LINKS.map((link) => {
        const active =
          link.match.length === 0 ? pathname === link.href : link.match.some((prefix) => pathname.startsWith(prefix));
        const badge = link.href === "/panel/pedidos" && newOrders > 0 ? newOrders : 0;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-2 text-sm font-semibold max-[339px]:px-1 max-[339px]:text-[13px] min-[400px]:px-2.5 sm:px-3.5 sm:text-base ${
              active ? "bg-brand-tint text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {link.label}
            {badge > 0 && (
              <span className="absolute -top-0.5 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-xs font-bold text-on-accent tabular-nums sm:static">
                <span className="sr-only">: </span>
                {badge > 99 ? "99+" : badge}
                <span className="sr-only"> {badge === 1 ? "nuevo" : "nuevos"}</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
