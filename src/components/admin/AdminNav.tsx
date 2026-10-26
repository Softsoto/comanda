"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Comercios", prefixes: ["/admin/comercios"] },
  { href: "/admin/pedidos", label: "Pedidos", prefixes: ["/admin/pedidos"] },
  { href: "/admin/planes", label: "Planes", prefixes: ["/admin/planes"] },
  { href: "/admin/pagos", label: "Pagos", prefixes: ["/admin/pagos"] },
  { href: "/admin/juegos", label: "Juegos", prefixes: ["/admin/juegos"] },
  { href: "/admin/ajustes", label: "Ajustes", prefixes: ["/admin/ajustes"] },
];

/** Pestañas de la administración del servicio. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Secciones de administración"
      // En el celular las seis pestañas van en dos filas de tres; desde tableta, en una sola fila.
      className="grid min-w-0 grid-cols-3 gap-x-1 sm:flex sm:justify-start sm:gap-1"
    >
      {LINKS.map((link) => {
        const active = pathname === link.href || link.prefixes.some((prefix) => pathname.startsWith(prefix));
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-1 text-[13px] font-semibold min-[360px]:text-sm min-[380px]:px-2 sm:px-3.5 sm:text-base ${
              active ? "bg-brand-tint text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
