import "server-only";

import { billingStatus, extendPaidUntil, type Billing } from "./billing";
import { todayKey } from "./dates";
import { query, queryOne, transaction } from "./db";
import { getSettings } from "./settings";

/**
 * Planes del servicio y pagos de los comercios.
 * Los pagos se registran a mano: la app no cobra con tarjeta, solo lleva la
 * cuenta de quién pagó, cuánto y hasta cuándo queda cubierto.
 */

export type Plan = {
  id: string;
  name: string;
  /** Precio por mes, en la moneda del servicio. */
  priceCents: number;
  /** Tope de productos del menú; null = sin límite. */
  maxProducts: number | null;
  /** El que reciben los comercios que se registran solos. */
  isDefault: boolean;
  /** Cuántos comercios lo tienen. */
  businesses: number;
};

type PlanRow = {
  id: string;
  name: string;
  price_cents: number | string;
  max_products: number | null;
  is_default: boolean;
  businesses?: number;
};

const toPlan = (row: PlanRow): Plan => ({
  id: row.id,
  name: row.name,
  priceCents: Number(row.price_cents),
  maxProducts: row.max_products === null ? null : Number(row.max_products),
  isDefault: row.is_default,
  businesses: Number(row.businesses ?? 0),
});

export async function listPlans(): Promise<Plan[]> {
  const rows = await query<PlanRow>(
    `select p.id, p.name, p.price_cents, p.max_products, p.is_default,
            (select count(*)::int from businesses b where b.plan_id = p.id) as businesses
       from plans p order by p.position, p.created_at`,
  );
  return rows.map(toPlan);
}

export async function getPlan(planId: string | null): Promise<Plan | null> {
  if (!planId) return null;
  const row = await queryOne<PlanRow>("select id, name, price_cents, max_products, is_default from plans where id = $1", [
    planId,
  ]);
  return row ? toPlan(row) : null;
}

export type PlanInput = { name: string; priceCents: number; maxProducts: number | null };

export async function createPlan(input: PlanInput): Promise<void> {
  await query(
    `insert into plans (name, price_cents, max_products, position)
     values ($1, $2, $3, (select coalesce(max(position), -1) + 1 from plans))`,
    [input.name, input.priceCents, input.maxProducts],
  );
}

export async function updatePlan(planId: string, input: PlanInput): Promise<void> {
  await query("update plans set name = $2, price_cents = $3, max_products = $4 where id = $1", [
    planId,
    input.name,
    input.priceCents,
    input.maxProducts,
  ]);
}

/** Borra un plan. Los comercios que lo tenían quedan sin plan, con su misma fecha de vencimiento. */
export async function deletePlan(planId: string): Promise<void> {
  await query("delete from plans where id = $1", [planId]);
}

/** Marca el plan que reciben los comercios nuevos (o ninguno, con null). */
export async function setDefaultPlan(planId: string | null): Promise<void> {
  await transaction(async (q) => {
    await q("update plans set is_default = false where is_default");
    if (planId) await q("update plans set is_default = true where id = $1", [planId]);
  });
}

/** Cambia a mano el plan de un comercio y su último día pagado (null = no vence). */
export async function setBusinessPlan(businessId: string, planId: string | null, paidUntil: string | null): Promise<void> {
  await query("update businesses set plan_id = $2, paid_until = $3 where id = $1", [businessId, planId, paidUntil]);
}

/** En qué estado de cobro está un comercio hoy, con el reloj del propio comercio. */
export async function billingOf(business: { paidUntil: string | null; timezone: string }): Promise<Billing> {
  const settings = await getSettings();
  return billingStatus(business.paidUntil, todayKey(business.timezone), settings.graceDays);
}

/* ---------- Pagos ---------- */

export type Payment = {
  id: string;
  businessId: string | null;
  businessName: string;
  planName: string;
  amountCents: number;
  currency: string;
  months: number;
  /** Día en que se recibió el pago. */
  paidOn: string;
  periodFrom: string | null;
  periodTo: string | null;
  method: string;
  note: string;
};

type PaymentRow = {
  id: string;
  business_id: string | null;
  business_name: string;
  plan_name: string;
  amount_cents: number | string;
  currency: string;
  months: number;
  paid_on: string;
  period_from: string | null;
  period_to: string | null;
  method: string;
  note: string;
};

const PAYMENT_COLUMNS = `id, business_id, business_name, plan_name, amount_cents, currency, months,
  paid_on::text as paid_on, period_from::text as period_from, period_to::text as period_to, method, note`;

const toPayment = (row: PaymentRow): Payment => ({
  id: row.id,
  businessId: row.business_id,
  businessName: row.business_name,
  planName: row.plan_name,
  amountCents: Number(row.amount_cents),
  currency: row.currency,
  months: Number(row.months),
  paidOn: row.paid_on,
  periodFrom: row.period_from,
  periodTo: row.period_to,
  method: row.method,
  note: row.note,
});

/** Pagos de un comercio, o de todos entre dos días (ambos incluidos), del más reciente al más antiguo. */
export async function listPayments(filter: { businessId?: string; from?: string; to?: string; limit?: number }): Promise<Payment[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.businessId) {
    params.push(filter.businessId);
    conditions.push(`business_id = $${params.length}`);
  }
  if (filter.from) {
    params.push(filter.from);
    conditions.push(`paid_on >= $${params.length}`);
  }
  if (filter.to) {
    params.push(filter.to);
    conditions.push(`paid_on <= $${params.length}`);
  }
  const rows = await query<PaymentRow>(
    `select ${PAYMENT_COLUMNS} from payments
      ${conditions.length > 0 ? `where ${conditions.join(" and ")}` : ""}
      order by paid_on desc, created_at desc
      limit ${Math.max(1, Math.floor(filter.limit ?? 500))}`,
    params,
  );
  return rows.map(toPayment);
}

/** Cuánto suman los pagos recibidos entre dos días, por moneda. */
export async function sumPayments(from: string, to: string): Promise<{ currency: string; amountCents: number; count: number }[]> {
  const rows = await query<{ currency: string; amount: number | string; count: number }>(
    `select currency, coalesce(sum(amount_cents), 0)::bigint as amount, count(*)::int as count
       from payments where paid_on >= $1 and paid_on <= $2 group by currency order by amount desc`,
    [from, to],
  );
  return rows.map((row) => ({ currency: row.currency, amountCents: Number(row.amount), count: Number(row.count) }));
}

export type PaymentInput = {
  amountCents: number;
  currency: string;
  months: number;
  paidOn: string;
  method: string;
  note: string;
};

/**
 * Registra un pago y extiende el vencimiento del comercio los meses pagados.
 * Devuelve el período que quedó cubierto, o null si el comercio no existe.
 */
export async function registerPayment(businessId: string, input: PaymentInput): Promise<{ from: string; to: string } | null> {
  return transaction(async (q) => {
    // "for update" evita que dos pagos registrados a la vez extiendan desde la misma fecha.
    const rows = await q<{ name: string; timezone: string; paid_until: string | null; plan_name: string | null }>(
      `select b.name, b.timezone, b.paid_until::text as paid_until,
              (select p.name from plans p where p.id = b.plan_id) as plan_name
         from businesses b where b.id = $1 for update of b`,
      [businessId],
    );
    const business = rows[0];
    if (!business) return null;
    const period = extendPaidUntil(business.paid_until, todayKey(business.timezone), input.months);
    await q(
      `insert into payments
         (business_id, business_name, plan_name, amount_cents, currency, months, paid_on, period_from, period_to, method, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        businessId,
        business.name,
        business.plan_name ?? "",
        input.amountCents,
        input.currency,
        input.months,
        input.paidOn,
        period.from,
        period.to,
        input.method,
        input.note,
      ],
    );
    await q("update businesses set paid_until = $2 where id = $1", [businessId, period.to]);
    return period;
  });
}

/** Borra el registro de un pago. No cambia el vencimiento del comercio: eso se corrige a mano. */
export async function deletePayment(paymentId: string): Promise<void> {
  await query("delete from payments where id = $1", [paymentId]);
}
