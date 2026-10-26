import type { Metadata } from "next";
import Link from "next/link";
import { RangeFilter } from "@/components/panel/RangeFilter";
import { ReportTabs } from "@/components/panel/ReportTabs";
import { SalesChart } from "@/components/panel/SalesChart";
import { DownloadIcon } from "@/components/ui/icons";
import { formatDayShort } from "@/lib/dates";
import { filtersToQuery, readFilters, type SearchParams } from "@/lib/filters";
import { formatMoney, roundToCurrency } from "@/lib/money";
import { getReport } from "@/lib/orders-data";
import { requireBusiness } from "@/lib/panel";
import { bucketDays, niceScale, sumStats } from "@/lib/reports";

export const metadata: Metadata = { title: "Reportes" };
export const dynamic = "force-dynamic";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-[1.625rem] leading-8 font-semibold wrap-anywhere">{value}</p>
      {hint && <p className="mt-1 text-caption text-muted">{hint}</p>}
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { business } = await requireBusiness();
  const filters = readFilters(await searchParams, business.timezone, "30d");
  const report = await getReport(business, filters.range);

  const totals = sumStats(report.days);
  const { unit, buckets } = bucketDays(report.days);
  const ticks = niceScale(Math.max(...buckets.map((bucket) => bucket.salesCents), 0));
  const money = (cents: number) => formatMoney(cents, business.currency);
  const unitTitle = unit === "día" ? "día" : unit;
  // La tabla diaria muestra primero lo más reciente y omite los días sin movimiento.
  const activeDays = report.days.filter((day) => day.orders > 0 || day.visits > 0).reverse();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-display font-bold">Reportes</h1>
          <p className="mt-1 max-w-xl text-muted">
            Ventas, pedidos y visitas a tu menú. Las ventas cuentan solo los pedidos que marcaste como completados.
          </p>
        </div>
        <a href={`/panel/pedidos/exportar${filtersToQuery(filters)}`} className="btn btn-secondary" download>
          <DownloadIcon width={20} height={20} />
          Exportar a Excel
        </a>
      </div>

      <ReportTabs current="ventas" />

      <RangeFilter path="/panel/reportes" filters={filters} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Ventas"
          value={money(totals.salesCents)}
          hint={`${totals.completed} ${totals.completed === 1 ? "pedido completado" : "pedidos completados"}`}
        />
        <Tile
          label="Pedido promedio"
          value={totals.completed > 0 ? money(roundToCurrency(totals.averageCents, business.currency)) : "—"}
          hint="Ventas entre pedidos completados"
        />
        <Tile
          label="Ganancia estimada"
          value={totals.completedWithCost > 0 ? money(totals.profitCents) : "—"}
          hint={
            totals.completedWithCost > 0
              ? "Venta menos costo de los productos con costo registrado y menos descuentos"
              : "Registra el costo de tus productos para verla"
          }
        />
        <Tile
          label="Visitas al menú"
          value={String(totals.visits)}
          hint={`${totals.orders} ${totals.orders === 1 ? "pedido recibido" : "pedidos recibidos"}${
            totals.cancelled > 0 ? `, ${totals.cancelled} ${totals.cancelled === 1 ? "cancelado" : "cancelados"}` : ""
          }`}
        />
      </div>

      <section className="card" aria-labelledby="reporte-ventas">
        <h2 id="reporte-ventas" className="font-display text-title font-bold">
          Ventas por {unitTitle}
        </h2>
        {totals.salesCents === 0 ? (
          <p className="mt-2 text-muted">
            No hay ventas completadas en este período. Cuando marques pedidos como completados, aparecerán aquí.
          </p>
        ) : (
          <>
            <SalesChart
              bars={buckets.map((bucket) => ({
                key: bucket.key,
                label: bucket.label,
                shortLabel: bucket.shortLabel,
                salesCents: bucket.salesCents,
                completed: bucket.completed,
              }))}
              ticks={ticks}
              currency={business.currency}
              unit={unit}
            />
            <details className="mt-3">
              <summary className="link inline-flex min-h-9 cursor-pointer items-center text-sm">Ver los datos en tabla</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-line/40 text-left text-muted">
                      <th className="py-2 pr-3 font-semibold capitalize">{unit}</th>
                      <th className="px-3 py-2 text-right font-semibold">Ventas</th>
                      <th className="px-3 py-2 text-right font-semibold">Completados</th>
                      <th className="px-3 py-2 text-right font-semibold">Recibidos</th>
                      <th className="py-2 pl-3 text-right font-semibold">Visitas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/25">
                    {buckets.map((bucket) => (
                      <tr key={bucket.key}>
                        <th scope="row" className="py-2 pr-3 text-left font-normal whitespace-nowrap">
                          {bucket.label}
                        </th>
                        <td className="px-3 py-2 text-right tabular-nums">{money(bucket.salesCents)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{bucket.completed}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{bucket.orders}</td>
                        <td className="py-2 pl-3 text-right tabular-nums">{bucket.visits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>

      {/* grid-cols-1 y min-w-0: en pantallas angostas las tablas se ajustan a la tarjeta en vez de ensancharla. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card min-w-0" aria-labelledby="reporte-productos">
          <h2 id="reporte-productos" className="font-display text-title font-bold">
            Productos más vendidos
          </h2>
          {report.topProducts.length === 0 ? (
            <p className="mt-2 text-muted">Todavía no hay pedidos completados en este período.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-line/40 text-left text-muted">
                  <th className="py-2 pr-3 font-semibold">Producto</th>
                  <th className="px-3 py-2 text-right font-semibold">Unidades</th>
                  <th className="py-2 pl-3 text-right font-semibold">Ventas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/25">
                {report.topProducts.map((product) => (
                  <tr key={product.name}>
                    <th scope="row" className="py-2 pr-3 text-left font-normal wrap-anywhere">
                      {product.name}
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">{product.units}</td>
                    <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums">{money(product.salesCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card min-w-0" aria-labelledby="reporte-dias">
          <h2 id="reporte-dias" className="font-display text-title font-bold">
            Día por día
          </h2>
          {activeDays.length === 0 ? (
            <p className="mt-2 text-muted">Sin pedidos ni visitas en este período.</p>
          ) : (
            // Con foco: si la tabla no cabe, también se puede recorrer con el teclado.
            <div className="mt-2 max-h-96 overflow-auto rounded-field" tabIndex={0} role="group" aria-labelledby="reporte-dias">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-raised">
                  <tr className="border-b border-line/40 text-left text-muted">
                    <th className="py-2 pr-3 font-semibold">Día</th>
                    <th className="px-2 py-2 text-right font-semibold sm:px-3">Pedidos</th>
                    <th className="px-2 py-2 text-right font-semibold sm:px-3">Ventas</th>
                    <th className="py-2 pl-2 text-right font-semibold sm:pl-3">Visitas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/25">
                  {activeDays.map((day) => (
                    <tr key={day.day}>
                      <th scope="row" className="py-2 pr-3 text-left font-normal whitespace-nowrap">
                        {formatDayShort(day.day)}
                      </th>
                      <td className="px-2 py-2 text-right tabular-nums sm:px-3">{day.orders}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums sm:px-3">{money(day.salesCents)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums sm:pl-3">{day.visits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <p className="text-sm text-muted">
        ¿Quieres ver cada pedido?{" "}
        <Link href={`/panel/pedidos${filtersToQuery(filters)}`} className="link">
          Abre la lista de pedidos de este período
        </Link>
        .
      </p>
    </div>
  );
}
