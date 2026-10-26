import "server-only";

import { query, queryOne } from "./db";

/**
 * Consultas de la administración del servicio: todos los comercios a la vez.
 * Solo se usan desde páginas y acciones que ya pasaron por requireAdmin().
 */

export type AdminBusiness = {
  id: string;
  ownerId: string;
  email: string;
  name: string;
  slug: string;
  whatsapp: string;
  currency: string;
  timezone: string;
  isSuspended: boolean;
  createdAt: Date;
  products: number;
  ordersTotal: number;
  /** Pedidos desde la fecha indicada en la consulta. */
  ordersRecent: number;
  lastOrderAt: Date | null;
  /** Plan del servicio que tiene (si el servicio usa planes). */
  planId: string | null;
  planName: string | null;
  /** Último día pagado; null = no vence. */
  paidUntil: string | null;
};

type AdminBusinessRow = {
  id: string;
  owner_id: string;
  email: string;
  name: string;
  slug: string;
  whatsapp: string;
  currency: string;
  timezone: string;
  is_suspended: boolean;
  created_at: Date;
  products: number;
  orders_total: number;
  orders_recent: number;
  last_order_at: Date | null;
  plan_id: string | null;
  plan_name: string | null;
  paid_until: string | null;
};

const ADMIN_BUSINESS_SQL = `
  select b.id, b.owner_id, u.email, b.name, b.slug, b.whatsapp, b.currency, b.timezone, b.is_suspended, b.created_at,
         (select count(*)::int from products p where p.business_id = b.id) as products,
         (select count(*)::int from orders o where o.business_id = b.id) as orders_total,
         (select count(*)::int from orders o where o.business_id = b.id and o.created_at >= $1) as orders_recent,
         (select max(o.created_at) from orders o where o.business_id = b.id) as last_order_at,
         b.plan_id, (select p.name from plans p where p.id = b.plan_id) as plan_name, b.paid_until::text as paid_until
    from businesses b join users u on u.id = b.owner_id`;

const toAdminBusiness = (row: AdminBusinessRow): AdminBusiness => ({
  id: row.id,
  ownerId: row.owner_id,
  email: row.email,
  name: row.name,
  slug: row.slug,
  whatsapp: row.whatsapp,
  currency: row.currency,
  timezone: row.timezone,
  isSuspended: row.is_suspended,
  createdAt: new Date(row.created_at),
  products: Number(row.products),
  ordersTotal: Number(row.orders_total),
  ordersRecent: Number(row.orders_recent),
  lastOrderAt: row.last_order_at ? new Date(row.last_order_at) : null,
  planId: row.plan_id,
  planName: row.plan_name,
  paidUntil: row.paid_until,
});

/** Todos los comercios, del más nuevo al más antiguo. `since` marca desde cuándo se cuentan los pedidos recientes. */
export async function listBusinesses(since: Date): Promise<AdminBusiness[]> {
  const rows = await query<AdminBusinessRow>(`${ADMIN_BUSINESS_SQL} order by b.created_at desc, b.name`, [
    since.toISOString(),
  ]);
  return rows.map(toAdminBusiness);
}

export async function getAdminBusiness(businessId: string, since: Date): Promise<AdminBusiness | null> {
  const row = await queryOne<AdminBusinessRow>(`${ADMIN_BUSINESS_SQL} where b.id = $2`, [
    since.toISOString(),
    businessId,
  ]);
  return row ? toAdminBusiness(row) : null;
}

export async function setSuspended(businessId: string, suspended: boolean): Promise<void> {
  await query("update businesses set is_suspended = $2 where id = $1", [businessId, suspended]);
}

/**
 * Elimina un comercio con todo lo suyo: cuenta, menú, fotos, pedidos y visitas.
 * Al borrar la cuenta, la base de datos borra en cadena todo lo demás.
 */
export async function deleteBusinessAccount(businessId: string): Promise<void> {
  await query("delete from users where id = (select owner_id from businesses where id = $1)", [businessId]);
}

/** Cuántos pedidos se han recibido en todo el servicio desde un instante. */
export async function countOrdersSince(since: Date): Promise<number> {
  const row = await queryOne<{ count: number }>("select count(*)::int as count from orders where created_at >= $1", [
    since.toISOString(),
  ]);
  return Number(row?.count ?? 0);
}

/** Nombre, zona horaria y moneda de cada negocio, para rotular pedidos de varios comercios. */
export async function getBusinessLabels(): Promise<Map<string, { name: string; timezone: string; currency: string }>> {
  const rows = await query<{ id: string; name: string; timezone: string; currency: string }>(
    "select id, name, timezone, currency from businesses",
  );
  return new Map(rows.map((row) => [row.id, { name: row.name, timezone: row.timezone, currency: row.currency }]));
}
