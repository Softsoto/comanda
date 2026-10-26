import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { chipClass } from "@/components/panel/RangeFilter";
import { ReportTabs } from "@/components/panel/ReportTabs";
import { SendIcon } from "@/components/ui/icons";
import { formatWhen } from "@/lib/dates";
import { firstParam, type SearchParams } from "@/lib/filters";
import { formatMoney } from "@/lib/money";
import { CUSTOMER_SORTS, listCustomers, type CustomerSort } from "@/lib/orders-data";
import { requireBusiness } from "@/lib/panel";
import { customerWhatsapp } from "@/lib/phone";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { business } = await requireBusiness();
  const params = await searchParams;
  const search = (firstParam(params.q) ?? "").trim().slice(0, 60);
  const sortParam = firstParam(params.orden);
  const sort: CustomerSort = CUSTOMER_SORTS.find((item) => item.value === sortParam)?.value ?? "recientes";
  const pageParam = Math.floor(Number(firstParam(params.pagina)));
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.min(pageParam, 10_000) : 1;

  const { customers, total } = await listCustomers(business.id, {
    search,
    sort,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = new Date();
  const link = (changes: { orden?: string; pagina?: number }) => {
    const query = new URLSearchParams();
    if (search) query.set("q", search);
    const order = changes.orden ?? sort;
    if (order !== "recientes") query.set("orden", order);
    if (changes.pagina && changes.pagina > 1) query.set("pagina", String(changes.pagina));
    const text = query.toString();
    return `/panel/clientes${text ? `?${text}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-display font-bold">Reportes</h1>
        <p className="mt-1 max-w-xl text-muted">
          Quiénes te han pedido, cuántas veces y cuánto han comprado. Los clientes se reconocen por su teléfono.
        </p>
      </div>
      <ReportTabs current="clientes" />

      {firstParam(params.borrado) === "1" && (
        <p role="status" className="rounded-field bg-brand-tint px-3 py-2.5 text-sm font-semibold">
          Se borraron los datos de ese cliente. Sus pedidos siguen en tus cuentas, sin su nombre ni su teléfono.
        </p>
      )}

      <Form action="/panel/clientes" className="flex flex-wrap items-end gap-2">
        {sort !== "recientes" && <input type="hidden" name="orden" value={sort} />}
        <div className="min-w-0 flex-1 basis-56">
          <label className="label" htmlFor="buscar-cliente">
            Buscar por nombre o teléfono
          </label>
          <input id="buscar-cliente" name="q" type="search" className="field" defaultValue={search} maxLength={60} />
        </div>
        <button type="submit" className="btn btn-secondary min-h-12">
          Buscar
        </button>
        {search && (
          <Link href={sort === "recientes" ? "/panel/clientes" : `/panel/clientes?orden=${sort}`} className="btn btn-ghost min-h-12">
            Ver todos
          </Link>
        )}
      </Form>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ordenar">
        {CUSTOMER_SORTS.map((item) => (
          <Link
            key={item.value}
            href={link({ orden: item.value })}
            aria-current={sort === item.value ? "true" : undefined}
            className={chipClass(sort === item.value)}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {customers.length === 0 ? (
        <div className="card text-muted">
          <p>{search ? "Ningún cliente coincide con esa búsqueda." : "Todavía no tienes clientes."}</p>
          {!search && <p className="mt-1 text-sm">Aparecerán aquí cuando recibas tu primer pedido.</p>}
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">
            {total} {total === 1 ? "cliente" : "clientes"}
            {search ? " con esa búsqueda" : ""}
          </p>
          <ul className="card divide-y divide-line/25 py-1">
            {customers.map((customer) => {
              const chatNumber = customerWhatsapp(customer.phoneText, business.whatsapp);
              return (
                <li key={customer.phone} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="wrap-anywhere">
                      <span className="font-semibold">{customer.name}</span>{" "}
                      <span className="whitespace-nowrap text-muted">· {customer.phoneText}</span>
                    </p>
                    <p className="text-sm">
                      {customer.orders} {customer.orders === 1 ? "pedido" : "pedidos"}
                      {customer.completed > 0 && (
                        <>
                          {" · "}
                          <span className="font-semibold tabular-nums">{formatMoney(customer.spentCents, business.currency)}</span>{" "}
                          en compras
                        </>
                      )}
                    </p>
                    <p className="text-sm text-muted">Último pedido: {formatWhen(customer.lastOrderAt, business.timezone, now)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {chatNumber && (
                      <a
                        href={buildWhatsAppUrl(chatNumber, `Hola ${customer.name}, te escribimos de ${business.name}.`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                        aria-label={`Escribirle a ${customer.name} por WhatsApp`}
                      >
                        <SendIcon width={18} height={18} />
                        Escribirle
                      </a>
                    )}
                    <Link
                      href={`/panel/pedidos?cliente=${customer.phone}`}
                      className="btn btn-secondary btn-sm"
                      aria-label={`Ver los pedidos de ${customer.name}`}
                    >
                      Ver pedidos
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {pages > 1 && (
        <nav aria-label="Páginas" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Página {Math.min(page, pages)} de {pages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={link({ pagina: page - 1 })} className="btn btn-secondary btn-sm">
                Anteriores
              </Link>
            )}
            {page < pages && (
              <Link href={link({ pagina: page + 1 })} className="btn btn-secondary btn-sm">
                Siguientes
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
