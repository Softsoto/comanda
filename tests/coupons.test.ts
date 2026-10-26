import assert from "node:assert/strict";
import { test } from "node:test";
import { couponProblem, describeCoupon, isCouponKind, normalizeCode, type Coupon } from "../src/lib/coupons";

const NBSP = " ";
const coupon: Coupon = {
  id: "c1",
  code: "BIENVENIDO10",
  kind: "percent",
  value: 10,
  minSubtotalCents: 2000000,
  endsOn: "2026-10-31",
  maxUses: 3,
  usedCount: 2,
  isActive: true,
};

test("códigos de cupón: mayúsculas, sin espacios, tildes ni símbolos", () => {
  assert.equal(normalizeCode(" bienvenido 10 "), "BIENVENIDO10");
  assert.equal(normalizeCode("niño-2x1!"), "NINO2X1");
  assert.equal(normalizeCode(undefined), "");
  assert.equal(normalizeCode("a".repeat(40)).length, 20);
  assert.ok(isCouponKind("free_delivery") && !isCouponKind("regalo"));
});

test("descripción de un cupón", () => {
  assert.equal(describeCoupon({ kind: "percent", value: 10 }, "COP"), "10 % de descuento");
  assert.equal(describeCoupon({ kind: "amount", value: 500000 }, "COP"), `$${NBSP}5.000 de descuento`);
  assert.equal(describeCoupon({ kind: "free_delivery", value: 0 }, "COP"), "Domicilio gratis");
});

test("cuándo sirve un cupón", () => {
  const problem = (changes: Partial<Coupon>, subtotal = 3000000, today = "2026-10-15") =>
    couponProblem({ ...coupon, ...changes }, subtotal, today, "COP");

  assert.equal(problem({}), null);
  // Sirve hasta el último día, incluido, y con el último uso disponible.
  assert.equal(problem({}, 2000000, "2026-10-31"), null);
  assert.match(problem({}, 3000000, "2026-11-01") ?? "", /venció el 31 oct 2026/);
  assert.match(problem({ usedCount: 3 }) ?? "", /todas las veces permitidas/);
  assert.match(problem({ isActive: false }) ?? "", /no está activo/);
  assert.match(problem({}, 1999900) ?? "", /pedidos desde \$.20\.000 en productos/);
  // Sin fecha y sin tope de usos no vence ni se agota.
  assert.equal(problem({ endsOn: null, maxUses: null, usedCount: 99999 }, 2000000, "2099-01-01"), null);
});
