import "server-only";

import { isCouponKind, type Coupon, type CouponKind } from "./coupons";
import { query, queryOne, type QueryFn } from "./db";

/** Cupones de un negocio: consultas y cambios. */

type CouponRow = {
  id: string;
  code: string;
  kind: string;
  value: number;
  min_subtotal_cents: number;
  ends_on: string | null;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
};

const COLUMNS =
  "id, code, kind, value, min_subtotal_cents, ends_on::text as ends_on, max_uses, used_count, is_active";

const toCoupon = (row: CouponRow): Coupon => ({
  id: row.id,
  code: row.code,
  kind: isCouponKind(row.kind) ? row.kind : "amount",
  value: Number(row.value),
  minSubtotalCents: Number(row.min_subtotal_cents),
  endsOn: row.ends_on,
  maxUses: row.max_uses === null ? null : Number(row.max_uses),
  usedCount: Number(row.used_count),
  isActive: row.is_active,
});

export async function listCoupons(businessId: string): Promise<Coupon[]> {
  const rows = await query<CouponRow>(
    `select ${COLUMNS} from coupons where business_id = $1 order by is_active desc, created_at desc`,
    [businessId],
  );
  return rows.map(toCoupon);
}

/** ¿El negocio tiene algún cupón activo? De eso depende que el menú muestre el campo para escribirlo. */
export async function hasActiveCoupons(businessId: string): Promise<boolean> {
  const row = await queryOne("select 1 as found from coupons where business_id = $1 and is_active limit 1", [businessId]);
  return row !== null;
}

/**
 * Busca un cupón por su código. Dentro de una transacción (`q`) y con
 * `lock`, reserva la fila para que dos pedidos simultáneos no gasten el
 * mismo último uso.
 */
export async function findCoupon(businessId: string, code: string, q: QueryFn = query, lock = false): Promise<Coupon | null> {
  const rows = await q<CouponRow>(
    `select ${COLUMNS} from coupons where business_id = $1 and code = $2${lock ? " for update" : ""}`,
    [businessId, code],
  );
  return rows[0] ? toCoupon(rows[0]) : null;
}

export async function createCoupon(
  businessId: string,
  input: { code: string; kind: CouponKind; value: number; minSubtotalCents: number; endsOn: string | null; maxUses: number | null },
): Promise<void> {
  await query(
    `insert into coupons (business_id, code, kind, value, min_subtotal_cents, ends_on, max_uses)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [businessId, input.code, input.kind, input.value, input.minSubtotalCents, input.endsOn, input.maxUses],
  );
}

export async function setCouponActive(businessId: string, couponId: string, active: boolean): Promise<void> {
  await query("update coupons set is_active = $3 where id = $2 and business_id = $1", [businessId, couponId, active]);
}

export async function deleteCoupon(businessId: string, couponId: string): Promise<void> {
  await query("delete from coupons where id = $2 and business_id = $1", [businessId, couponId]);
}
