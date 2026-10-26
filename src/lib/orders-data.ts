import "server-only";

import { randomBytes } from "node:crypto";
import { couponProblem, type Coupon } from "./coupons";
import { findCoupon } from "./coupons-data";
import type { Business } from "./data";
import { dayKey, rangeInstants, todayKey, type DateRange } from "./dates";
import { query, queryOne, transaction, type QueryFn } from "./db";
import { checkSelection, lineKey, parseChosen, parseOptions, type ChosenOption } from "./options";
import { computeTotals, type DeliveryMode, type OrderStatus, type OrderTotals } from "./orders";
import { buildDayStats, type DayStats } from "./reports";
import type { OrderCustomer } from "./whatsapp";

/**
 * Pedidos: creación, consulta y cambio de estado.
 *
 * Al crear un pedido el servidor vuelve a leer cada producto de la base de
 * datos: los precios, las opciones, la disponibilidad, las existencias, el
 * costo de domicilio y el cupón nunca se toman de lo que envía el navegador.
 */

export type OrderItem = {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  /** Precio de una unidad, con sus opciones incluidas. */
  unitPriceCents: number;
  unitCostCents: number | null;
  /** Opciones elegidas (tamaño, adicionales…), como estaban al pedir. */
  options: ChosenOption[];
};

export type Order = {
  id: string;
  businessId: string;
  number: number;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  deliveryMode: DeliveryMode;
  address: string;
  /** Zona o barrio de domicilio, si el negocio las usa. */
  deliveryZone: string;
  paymentMethod: string;
  notes: string;
  currency: string;
  subtotalCents: number;
  deliveryCents: number;
  /** A domicilio y sin cobro. Con deliveryCents = 0 y esto en false, el domicilio quedó por confirmar. */
  deliveryFree: boolean;
  discountCents: number;
  couponCode: string;
  totalCents: number;
  /** Costo de los productos que tenían costo registrado; null si ninguno lo tenía. */
  costCents: number | null;
  /** Venta menos costo de esos mismos productos, menos el descuento. */
  profitCents: number | null;
  /** Código del enlace de seguimiento que recibe el cliente. */
  publicToken: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

export type OrderWithItems = Order & { items: OrderItem[] };

type OrderRow = {
  id: string;
  business_id: string;
  number: number;
  status: OrderStatus;
  customer_name: string;
  customer_phone: string;
  delivery_mode: DeliveryMode;
  address: string;
  delivery_zone: string;
  payment_method: string;
  notes: string;
  currency: string;
  subtotal_cents: number | string;
  delivery_cents: number | string;
  delivery_free: boolean;
  discount_cents: number | string;
  coupon_code: string;
  total_cents: number | string;
  cost_cents: number | string | null;
  profit_cents: number | string | null;
  public_token: string | null;
  created_at: Date;
  completed_at: Date | null;
};

type ItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit_price_cents: number;
  unit_cost_cents: number | null;
  options: string;
};

const ORDER_COLUMNS = `id, business_id, number, status, customer_name, customer_phone, delivery_mode, address,
  delivery_zone, payment_method, notes, currency, subtotal_cents, delivery_cents, delivery_free, discount_cents,
  coupon_code, total_cents, cost_cents, profit_cents, public_token, created_at, completed_at`;

const ITEM_COLUMNS = "id, order_id, product_id, name, quantity, unit_price_cents, unit_cost_cents, options";

const toOrder = (row: OrderRow): Order => ({
  id: row.id,
  businessId: row.business_id,
  number: Number(row.number),
  status: row.status,
  customerName: row.customer_name,
  customerPhone: row.customer_phone,
  deliveryMode: row.delivery_mode,
  address: row.address,
  deliveryZone: row.delivery_zone,
  paymentMethod: row.payment_method,
  notes: row.notes,
  currency: row.currency,
  subtotalCents: Number(row.subtotal_cents),
  deliveryCents: Number(row.delivery_cents),
  deliveryFree: row.delivery_free,
  discountCents: Number(row.discount_cents),
  couponCode: row.coupon_code,
  totalCents: Number(row.total_cents),
  costCents: row.cost_cents === null ? null : Number(row.cost_cents),
  profitCents: row.profit_cents === null ? null : Number(row.profit_cents),
  publicToken: row.public_token,
  createdAt: new Date(row.created_at),
  completedAt: row.completed_at ? new Date(row.completed_at) : null,
});

const toItem = (row: ItemRow): OrderItem => ({
  id: row.id,
  productId: row.product_id,
  name: row.name,
  quantity: Number(row.quantity),
  unitPriceCents: Number(row.unit_price_cents),
  unitCostCents: row.unit_cost_cents === null ? null : Number(row.unit_cost_cents),
  options: parseChosen(row.options),
});

/** "$1, $2, $3" a partir de la posición `start`, para listas dentro de un IN (...). */
const placeholders = (count: number, start: number) =>
  Array.from({ length: count }, (_, index) => `$${start + index}`).join(", ");

/** Teléfono reducido a sus cifras, en SQL: así "300 555 0101" y "3005550101" son el mismo cliente. */
const PHONE_DIGITS = "regexp_replace(customer_phone, '[^0-9]', '', 'g')";

/** Cómo quedó el domicilio de un pedido ya guardado. */
export const totalsOf = (order: Order): OrderTotals => ({
  subtotalCents: order.subtotalCents,
  discountCents: order.discountCents,
  deliveryCents: order.deliveryCents,
  totalCents: order.totalCents,
  deliveryFree: order.deliveryFree,
  deliveryPending: order.deliveryMode === "domicilio" && order.deliveryCents === 0 && !order.deliveryFree,
});

/* ---------- Crear ---------- */

export type NewOrderInput = {
  items: { productId: string; quantity: number; choiceIds: string[] }[];
  customer: OrderCustomer;
  /** Zona de domicilio elegida (si el negocio las usa). */
  zoneId?: string | null;
  couponCode?: string;
  /** Cómo aceptó el cliente el aviso de datos: "aviso" (al enviar) o "casilla" (la marcó). */
  privacyConsent?: "" | "aviso" | "casilla";
};

export type CreateOrderResult =
  | { ok: true; order: OrderWithItems; totals: OrderTotals }
  | { ok: false; message: string; menuChanged: boolean; field?: "zone" | "coupon" };

type ProductForOrder = {
  id: string;
  name: string;
  price_cents: number;
  cost_cents: number | null;
  stock: number | null;
  is_available: boolean;
  options: string;
};

export async function createOrder(business: Business, input: NewOrderInput): Promise<CreateOrderResult> {
  const productIds = [...new Set(input.items.map((item) => item.productId))];
  if (productIds.length === 0) return { ok: false, message: "Tu pedido está vacío.", menuChanged: false };

  return transaction(async (q): Promise<CreateOrderResult> => {
    const fail = (message: string, menuChanged = false, field?: "zone" | "coupon"): CreateOrderResult => ({
      ok: false,
      message,
      menuChanged,
      field,
    });

    // "for update" reserva esas filas hasta terminar: dos pedidos simultáneos
    // no pueden llevarse la misma última unidad.
    const found = await q<ProductForOrder>(
      `select p.id, p.name, p.price_cents, p.cost_cents, p.stock, p.is_available, p.options
         from products p join categories c on c.id = p.category_id
        where p.business_id = $1 and p.id in (${placeholders(productIds.length, 2)})
        order by c.position, c.created_at, p.position, p.created_at
          for update of p`,
      [business.id, ...productIds],
    );
    const products = new Map(found.map((product) => [product.id, product]));

    const gone = productIds.filter((id) => {
      const product = products.get(id);
      return !product || !product.is_available || product.stock === 0;
    });
    if (gone.length > 0) {
      const names = gone.map((id) => products.get(id)?.name).filter(Boolean);
      return fail(
        names.length > 0
          ? `Ya no ${names.length === 1 ? "está disponible" : "están disponibles"}: ${names.join(", ")}. Actualiza el menú y revisa tu pedido.`
          : "El menú cambió mientras hacías tu pedido. Actualízalo y revisa tu pedido.",
        true,
      );
    }

    // Renglones: el mismo producto con las mismas opciones se junta en uno solo.
    type Line = {
      productId: string;
      name: string;
      quantity: number;
      priceCents: number;
      costCents: number | null;
      options: ChosenOption[];
      tracksStock: boolean;
      order: number;
    };
    const lines = new Map<string, Line>();
    const perProduct = new Map<string, number>();
    for (const item of input.items) {
      const product = products.get(item.productId) as ProductForOrder;
      const selection = checkSelection(parseOptions(product.options), item.choiceIds);
      if (!selection.ok) return fail(`${product.name}: ${selection.message} Actualiza el menú y revisa tu pedido.`, true);

      perProduct.set(product.id, (perProduct.get(product.id) ?? 0) + item.quantity);
      const key = lineKey(product.id, selection.choiceIds);
      const existing = lines.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        continue;
      }
      const baseCost = product.cost_cents === null ? null : Number(product.cost_cents);
      lines.set(key, {
        productId: product.id,
        name: product.name,
        quantity: item.quantity,
        priceCents: Number(product.price_cents) + selection.extraCents,
        // El costo de una opción sin costo registrado cuenta como cero.
        costCents: baseCost === null ? null : baseCost + selection.extraCostCents,
        options: selection.chosen,
        tracksStock: product.stock !== null,
        order: found.findIndex((candidate) => candidate.id === product.id),
      });
    }

    for (const [id, quantity] of perProduct) {
      const product = products.get(id) as ProductForOrder;
      if (product.stock !== null && Number(product.stock) < quantity) {
        const left = Number(product.stock);
        return fail(
          `De ${product.name} solo ${left === 1 ? "queda 1 unidad" : `quedan ${left} unidades`}. Ajusta la cantidad.`,
          true,
        );
      }
    }

    // Los renglones siguen el orden del menú.
    const ordered = [...lines.values()].sort((a, b) => a.order - b.order);
    const subtotalCents = ordered.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
    if (business.minOrderCents > 0 && subtotalCents < business.minOrderCents) {
      return fail("Tu pedido no llega al mínimo de compra de este negocio.");
    }

    // Domicilio: el costo de la zona elegida o, si el negocio no usa zonas, su costo fijo.
    const toHome = input.customer.delivery === "domicilio";
    let deliveryFeeCents: number | null = business.deliveryFeeCents > 0 ? business.deliveryFeeCents : null;
    let zoneName = "";
    if (toHome) {
      const zones = await q<{ id: string; name: string; fee_cents: number }>(
        "select id, name, fee_cents from delivery_zones where business_id = $1",
        [business.id],
      );
      if (zones.length > 0) {
        const zone = zones.find((candidate) => candidate.id === input.zoneId);
        if (!zone) return fail("Elige tu zona o barrio para calcular el domicilio.", false, "zone");
        zoneName = zone.name;
        deliveryFeeCents = Number(zone.fee_cents);
      }
    }

    // Cupón: se reserva su fila para que no se use más veces de las permitidas.
    let coupon: Coupon | null = null;
    if (input.couponCode) {
      coupon = await findCoupon(business.id, input.couponCode, q, true);
      if (!coupon) return fail("Ese cupón no existe. Revisa que esté bien escrito.", false, "coupon");
      const problem = couponProblem(coupon, subtotalCents, todayKey(business.timezone), business.currency);
      if (problem) return fail(problem, false, "coupon");
    }

    const totals = computeTotals({
      lines: ordered,
      delivery: input.customer.delivery,
      deliveryFeeCents,
      freeDeliveryFromCents: business.freeDeliveryFromCents,
      coupon,
      currency: business.currency,
    });

    // Costo y ganancia se calculan solo con los productos que tienen costo
    // registrado; así la ganancia nunca incluye ventas cuyo costo se desconoce.
    const withCost = ordered.filter((line) => line.costCents !== null);
    const costCents =
      withCost.length > 0 ? withCost.reduce((sum, line) => sum + (line.costCents as number) * line.quantity, 0) : null;
    const profitCents =
      withCost.length > 0
        ? withCost.reduce((sum, line) => sum + (line.priceCents - (line.costCents as number)) * line.quantity, 0) -
          totals.discountCents
        : null;

    // Número consecutivo del negocio: 1, 2, 3…
    const [{ order_seq: number }] = await q<{ order_seq: number }>(
      "update businesses set order_seq = order_seq + 1 where id = $1 returning order_seq",
      [business.id],
    );

    const [row] = await q<OrderRow>(
      `insert into orders
         (business_id, number, status, customer_name, customer_phone, delivery_mode, address, delivery_zone,
          payment_method, notes, currency, subtotal_cents, delivery_cents, delivery_free, discount_cents, coupon_code,
          total_cents, cost_cents, profit_cents, public_token, privacy_consent)
       values ($1, $2, 'nuevo', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       returning ${ORDER_COLUMNS}`,
      [
        business.id,
        Number(number),
        input.customer.name,
        input.customer.phone,
        input.customer.delivery,
        input.customer.address,
        zoneName,
        input.customer.payment,
        input.customer.notes,
        business.currency,
        totals.subtotalCents,
        totals.deliveryCents,
        totals.deliveryFree,
        totals.discountCents,
        coupon?.code ?? "",
        totals.totalCents,
        costCents,
        profitCents,
        // Código corto e imposible de adivinar para el enlace de seguimiento.
        randomBytes(9).toString("base64url"),
        input.privacyConsent ?? "",
      ],
    );

    const items: OrderItem[] = [];
    for (const [position, line] of ordered.entries()) {
      const [item] = await q<ItemRow>(
        `insert into order_items (order_id, product_id, name, quantity, unit_price_cents, unit_cost_cents, options, position)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning ${ITEM_COLUMNS}`,
        [
          row.id,
          line.productId,
          line.name,
          line.quantity,
          line.priceCents,
          line.costCents,
          line.options.length > 0 ? JSON.stringify(line.options) : "",
          position,
        ],
      );
      items.push(toItem(item));
    }
    for (const [id, quantity] of perProduct) {
      if ((products.get(id) as ProductForOrder).stock === null) continue;
      await q("update products set stock = stock - $3 where id = $2 and business_id = $1 and stock is not null", [
        business.id,
        id,
        quantity,
      ]);
    }
    if (coupon) await q("update coupons set used_count = used_count + 1 where id = $1", [coupon.id]);

    return { ok: true, order: { ...toOrder(row), items }, totals };
  });
}

/* ---------- Consultar ---------- */

export type OrderFilters = {
  status?: OrderStatus;
  /** Instante inicial (incluido) y final (excluido). */
  start?: Date;
  end?: Date;
  /** Teléfono del cliente, solo cifras. */
  customer?: string;
};

function whereClause(businessId: string | null, filters: OrderFilters): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (businessId) {
    params.push(businessId);
    conditions.push(`business_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filters.start) {
    params.push(filters.start.toISOString());
    conditions.push(`created_at >= $${params.length}`);
  }
  if (filters.end) {
    params.push(filters.end.toISOString());
    conditions.push(`created_at < $${params.length}`);
  }
  if (filters.customer) {
    params.push(filters.customer);
    conditions.push(`${PHONE_DIGITS} = $${params.length}`);
  }
  return { sql: conditions.length > 0 ? `where ${conditions.join(" and ")}` : "", params };
}

async function attachItems(orders: Order[], q: QueryFn = query): Promise<OrderWithItems[]> {
  if (orders.length === 0) return [];
  const byOrder = new Map<string, OrderItem[]>(orders.map((order) => [order.id, []]));
  // En bloques, para no armar una consulta con miles de parámetros.
  for (let start = 0; start < orders.length; start += 500) {
    const ids = orders.slice(start, start + 500).map((order) => order.id);
    const rows = await q<ItemRow>(
      `select ${ITEM_COLUMNS} from order_items where order_id in (${placeholders(ids.length, 1)}) order by position`,
      ids,
    );
    for (const row of rows) byOrder.get(row.order_id)?.push(toItem(row));
  }
  return orders.map((order) => ({ ...order, items: byOrder.get(order.id) ?? [] }));
}

/** Pedidos de un negocio (o de todos, si businessId es null), del más reciente al más antiguo. */
export async function listOrders(
  businessId: string | null,
  filters: OrderFilters,
  limit: number,
  offset = 0,
): Promise<OrderWithItems[]> {
  const where = whereClause(businessId, filters);
  const rows = await query<OrderRow>(
    `select ${ORDER_COLUMNS} from orders ${where.sql}
      order by created_at desc, number desc
      limit ${Math.max(1, Math.floor(limit))} offset ${Math.max(0, Math.floor(offset))}`,
    where.params,
  );
  return attachItems(rows.map(toOrder));
}

export type StatusSummary = Record<OrderStatus, { count: number; totalCents: number }>;

/** Cuántos pedidos hay en cada estado (y cuánto suman) dentro de un rango. */
export async function summarizeByStatus(businessId: string | null, filters: OrderFilters): Promise<StatusSummary> {
  const where = whereClause(businessId, { start: filters.start, end: filters.end, customer: filters.customer });
  const rows = await query<{ status: OrderStatus; count: number; total: number | string }>(
    `select status, count(*)::int as count, coalesce(sum(total_cents), 0)::bigint as total
       from orders ${where.sql} group by status`,
    where.params,
  );
  const summary: StatusSummary = {
    nuevo: { count: 0, totalCents: 0 },
    preparando: { count: 0, totalCents: 0 },
    listo: { count: 0, totalCents: 0 },
    completado: { count: 0, totalCents: 0 },
    cancelado: { count: 0, totalCents: 0 },
  };
  for (const row of rows) {
    if (summary[row.status]) summary[row.status] = { count: Number(row.count), totalCents: Number(row.total) };
  }
  return summary;
}

export async function getOrder(businessId: string, orderId: string): Promise<OrderWithItems | null> {
  const row = await queryOne<OrderRow>(`select ${ORDER_COLUMNS} from orders where id = $2 and business_id = $1`, [
    businessId,
    orderId,
  ]);
  if (!row) return null;
  const [order] = await attachItems([toOrder(row)]);
  return order;
}

/** Pedido a partir del código de su enlace de seguimiento (público). */
export async function getOrderByToken(token: string): Promise<OrderWithItems | null> {
  const row = await queryOne<OrderRow>(`select ${ORDER_COLUMNS} from orders where public_token = $1`, [token]);
  if (!row) return null;
  const [order] = await attachItems([toOrder(row)]);
  return order;
}

/** Pedidos nuevos, todavía sin atender. */
export async function countNewOrders(businessId: string): Promise<number> {
  const row = await queryOne<{ count: number }>(
    "select count(*)::int as count from orders where business_id = $1 and status = 'nuevo'",
    [businessId],
  );
  return Number(row?.count ?? 0);
}

/**
 * Lo mínimo para saber si entró un pedido: cuántos hay sin atender y el
 * número del último. El panel lo consulta cada pocos segundos.
 */
export async function getOrderPulse(businessId: string): Promise<{ pending: number; lastNumber: number }> {
  const row = await queryOne<{ pending: number; last_number: number }>(
    `select count(*) filter (where status = 'nuevo')::int as pending, coalesce(max(number), 0)::int as last_number
       from orders where business_id = $1`,
    [businessId],
  );
  return { pending: Number(row?.pending ?? 0), lastNumber: Number(row?.last_number ?? 0) };
}

/* ---------- Clientes ---------- */

export type Customer = {
  /** Teléfono solo con cifras: identifica al cliente. */
  phone: string;
  /** Teléfono y nombre como los escribió en su pedido más reciente. */
  phoneText: string;
  name: string;
  /** Pedidos sin contar los cancelados. */
  orders: number;
  completed: number;
  /** Lo que suman sus pedidos completados. */
  spentCents: number;
  lastOrderAt: Date;
};

export const CUSTOMER_SORTS = [
  { value: "recientes", label: "Pedido más reciente", sql: "last_at desc" },
  { value: "pedidos", label: "Más pedidos", sql: "orders desc, last_at desc" },
  { value: "compras", label: "Más compras", sql: "spent desc, last_at desc" },
] as const;

export type CustomerSort = (typeof CUSTOMER_SORTS)[number]["value"];

const CUSTOMERS_SQL = `
  select ${PHONE_DIGITS} as phone,
         (array_agg(customer_phone order by created_at desc))[1] as phone_text,
         (array_agg(customer_name order by created_at desc))[1] as name,
         count(*) filter (where status <> 'cancelado')::int as orders,
         count(*) filter (where status = 'completado')::int as completed,
         coalesce(sum(total_cents) filter (where status = 'completado'), 0)::bigint as spent,
         max(created_at) as last_at
    from orders
   where business_id = $1 and ${PHONE_DIGITS} <> ''
   group by 1
  having count(*) filter (where status <> 'cancelado') > 0`;

/**
 * Clientes de un negocio, agrupando sus pedidos por teléfono. `search` busca en
 * el nombre y en el teléfono. Quien solo tiene pedidos cancelados no cuenta como cliente.
 */
export async function listCustomers(
  businessId: string,
  options: { search?: string; sort: CustomerSort; limit: number; offset: number },
): Promise<{ customers: Customer[]; total: number }> {
  const params: unknown[] = [businessId];
  let filter = "";
  const search = (options.search ?? "").trim();
  if (search) {
    params.push(`%${search.replace(/[%_\\]/g, "")}%`);
    const digits = search.replace(/\D/g, "");
    filter = `where name ilike $${params.length}`;
    if (digits) {
      params.push(`%${digits}%`);
      filter += ` or phone like $${params.length}`;
    }
  }
  const order = CUSTOMER_SORTS.find((item) => item.value === options.sort)?.sql ?? CUSTOMER_SORTS[0].sql;
  const [rows, count] = await Promise.all([
    query<{
      phone: string;
      phone_text: string;
      name: string;
      orders: number;
      completed: number;
      spent: number | string;
      last_at: Date;
    }>(
      `select * from (${CUSTOMERS_SQL}) t ${filter}
        order by ${order}
        limit ${Math.max(1, Math.floor(options.limit))} offset ${Math.max(0, Math.floor(options.offset))}`,
      params,
    ),
    queryOne<{ total: number }>(`select count(*)::int as total from (${CUSTOMERS_SQL}) t ${filter}`, params),
  ]);
  return {
    customers: rows.map((row) => ({
      phone: row.phone,
      phoneText: row.phone_text,
      name: row.name,
      orders: Number(row.orders),
      completed: Number(row.completed),
      spentCents: Number(row.spent),
      lastOrderAt: new Date(row.last_at),
    })),
    total: Number(count?.total ?? 0),
  };
}

/**
 * Borra los datos personales de un cliente (nombre, teléfono, dirección y
 * notas) de todos sus pedidos. Los pedidos se conservan para las cuentas del
 * negocio, pero ya no dicen de quién eran. Devuelve cuántos pedidos cambió.
 */
export async function forgetCustomer(businessId: string, phoneDigits: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `update orders
        set customer_name = 'Cliente eliminado', customer_phone = '', address = '', notes = ''
      where business_id = $1 and ${PHONE_DIGITS} = $2
      returning id`,
    [businessId, phoneDigits],
  );
  return rows.length;
}

/* ---------- Reportes ---------- */

export type TopProduct = { name: string; units: number; salesCents: number };

export type Report = {
  /** Una fila por día del período, en la zona horaria del negocio. */
  days: DayStats[];
  /** Productos más vendidos en pedidos completados. */
  topProducts: TopProduct[];
};

export async function getReport(business: Business, range: DateRange): Promise<Report> {
  const { start, end } = rangeInstants(range, business.timezone);
  const period = [business.id, start.toISOString(), end.toISOString()];
  const [orders, visits, top] = await Promise.all([
    query<{
      status: OrderStatus;
      total_cents: number | string;
      profit_cents: number | string | null;
      created_at: Date;
    }>(
      `select status, total_cents, profit_cents, created_at
         from orders where business_id = $1 and created_at >= $2 and created_at < $3`,
      period,
    ),
    getVisits(business.id, range.from, range.to),
    query<{ name: string; units: number | string; sales: number | string }>(
      `select i.name, sum(i.quantity)::int as units, sum(i.quantity * i.unit_price_cents)::bigint as sales
         from order_items i join orders o on o.id = i.order_id
        where o.business_id = $1 and o.status = 'completado' and o.created_at >= $2 and o.created_at < $3
        group by i.name
        order by units desc, sales desc, i.name
        limit 10`,
      period,
    ),
  ]);

  return {
    days: buildDayStats(
      range,
      orders.map((order) => ({
        // El día se calcula con el reloj del negocio, no con el del servidor.
        day: dayKey(new Date(order.created_at), business.timezone),
        status: order.status,
        totalCents: Number(order.total_cents),
        profitCents: order.profit_cents === null ? null : Number(order.profit_cents),
      })),
      visits,
    ),
    topProducts: top.map((row) => ({ name: row.name, units: Number(row.units), salesCents: Number(row.sales) })),
  };
}

/* ---------- Cambiar de estado ---------- */

/**
 * Cambia el estado de un pedido. Al cancelar se devuelven las existencias y
 * el uso del cupón; si un pedido cancelado se reabre, se vuelven a descontar.
 */
export async function setOrderStatus(businessId: string, orderId: string, status: OrderStatus): Promise<boolean> {
  return transaction(async (q) => {
    const rows = await q<{ status: OrderStatus; coupon_code: string }>(
      "select status, coupon_code from orders where id = $2 and business_id = $1 for update",
      [businessId, orderId],
    );
    const current = rows[0]?.status;
    if (!current) return false;
    if (current === status) return true;

    if (status === "cancelado" || current === "cancelado") {
      const cancelling = status === "cancelado";
      // Las existencias son por producto: se suman las unidades de todos sus renglones.
      const items = await q<{ product_id: string; quantity: number }>(
        `select product_id, sum(quantity)::int as quantity from order_items
          where order_id = $1 and product_id is not null group by product_id`,
        [orderId],
      );
      if (items.length > 0) {
        // Se reservan los productos en el mismo orden en que los reserva un pedido
        // nuevo: así una cancelación y un pedido simultáneos nunca se bloquean entre sí.
        await q(
          `select p.id from products p join categories c on c.id = p.category_id
            where p.business_id = $1 and p.id in (${placeholders(items.length, 2)})
            order by c.position, c.created_at, p.position, p.created_at
              for update of p`,
          [businessId, ...items.map((item) => item.product_id)],
        );
      }
      for (const item of items) {
        await q(
          cancelling
            ? "update products set stock = stock + $3 where id = $2 and business_id = $1 and stock is not null"
            : "update products set stock = greatest(stock - $3, 0) where id = $2 and business_id = $1 and stock is not null",
          [businessId, item.product_id, Number(item.quantity)],
        );
      }
      if (rows[0].coupon_code) {
        await q(
          cancelling
            ? "update coupons set used_count = greatest(used_count - 1, 0) where business_id = $1 and code = $2"
            : "update coupons set used_count = used_count + 1 where business_id = $1 and code = $2",
          [businessId, rows[0].coupon_code],
        );
      }
    }

    await q(
      `update orders
          set status = $3, updated_at = now(),
              completed_at = case when $3 = 'completado' then now() else null end
        where id = $2 and business_id = $1`,
      [businessId, orderId, status],
    );
    return true;
  });
}

/* ---------- Visitas al menú ---------- */

export async function recordVisit(businessId: string, day: string): Promise<void> {
  await query(
    `insert into menu_visits (business_id, day, visits) values ($1, $2, 1)
     on conflict (business_id, day) do update set visits = menu_visits.visits + 1`,
    [businessId, day],
  );
}

/** Visitas por día ("AAAA-MM-DD" → cantidad) entre dos días, ambos incluidos. */
export async function getVisits(businessId: string, fromDay: string, toDay: string): Promise<Map<string, number>> {
  const rows = await query<{ day: string; visits: number }>(
    "select day::text as day, visits from menu_visits where business_id = $1 and day >= $2 and day <= $3",
    [businessId, fromDay, toDay],
  );
  return new Map(rows.map((row) => [row.day, Number(row.visits)]));
}
