import "server-only";

import { getBusinessLabels } from "./admin-data";
import { getMenu, type Business } from "./data";
import { rangeInstants } from "./dates";
import { buildOrdersWorkbook } from "./excel";
import { readFilters, type SearchParams } from "./filters";
import { listOrders, summarizeByStatus, type StatusSummary } from "./orders-data";

/** Tope de pedidos por archivo: mantiene la descarga rápida y el archivo manejable. */
const EXPORT_LIMIT = 5000;

const countIn = (summary: StatusSummary, status?: keyof StatusSummary) =>
  status ? summary[status].count : Object.values(summary).reduce((sum, item) => sum + item.count, 0);

function download(buffer: Buffer, fileName: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Excel de un negocio: pedidos del período, productos vendidos, resumen e inventario actual. */
export async function exportBusinessOrders(business: Business, params: SearchParams): Promise<Response> {
  const filters = readFilters(params, business.timezone, "30d");
  const { start, end } = rangeInstants(filters.range, business.timezone);
  const [orders, summary, menu] = await Promise.all([
    listOrders(business.id, { status: filters.status, start, end }, EXPORT_LIMIT),
    summarizeByStatus(business.id, { start, end }),
    getMenu(business.id),
  ]);

  const buffer = await buildOrdersWorkbook({
    businessName: business.name,
    currency: business.currency,
    timezone: business.timezone,
    range: filters.range,
    status: filters.status,
    generatedAt: new Date(),
    orders,
    totalInRange: countIn(summary, filters.status),
    products: menu.flatMap((category) =>
      category.products.map((product) => ({
        category: category.name,
        name: product.name,
        priceCents: product.priceCents,
        costCents: product.costCents,
        isAvailable: product.isAvailable,
        stock: product.stock,
      })),
    ),
  });
  return download(buffer, `pedidos-${business.slug}-${filters.range.from}_a_${filters.range.to}.xlsx`);
}

/** Excel del servicio: los pedidos de todos los comercios en un período. */
export async function exportAllOrders(params: SearchParams, timeZone: string): Promise<Response> {
  const filters = readFilters(params, timeZone, "30d");
  const { start, end } = rangeInstants(filters.range, timeZone);
  const [orders, summary, labels] = await Promise.all([
    listOrders(null, { status: filters.status, start, end }, EXPORT_LIMIT),
    summarizeByStatus(null, { start, end }),
    getBusinessLabels(),
  ]);

  const buffer = await buildOrdersWorkbook({
    businessName: "Todos los comercios",
    currency: "",
    timezone: timeZone,
    range: filters.range,
    status: filters.status,
    generatedAt: new Date(),
    allBusinesses: true,
    totalInRange: countIn(summary, filters.status),
    orders: orders.map((order) => ({
      ...order,
      businessName: labels.get(order.businessId)?.name ?? "",
      timezone: labels.get(order.businessId)?.timezone,
    })),
  });
  return download(buffer, `pedidos-todos-${filters.range.from}_a_${filters.range.to}.xlsx`);
}
