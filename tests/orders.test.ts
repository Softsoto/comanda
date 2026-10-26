import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeTotals,
  deliveryFeeFor,
  deliveryLabel,
  isDeliveryMode,
  isOrderStatus,
  parseDeliveryModes,
  statusLabel,
  statusLabelFor,
  trackingIndex,
  trackingMessage,
  trackingSteps,
} from "../src/lib/orders";

test("formas de entrega guardadas: se leen en orden fijo y sin repetidos", () => {
  assert.deepEqual(parseDeliveryModes("local,domicilio"), ["domicilio", "local"]);
  assert.deepEqual(parseDeliveryModes("recoger, recoger ,domicilio"), ["domicilio", "recoger"]);
  // Vacío o irreconocible: las dos de siempre.
  assert.deepEqual(parseDeliveryModes(""), ["domicilio", "recoger"]);
  assert.deepEqual(parseDeliveryModes(null), ["domicilio", "recoger"]);
  assert.deepEqual(parseDeliveryModes("dron,teletransporte"), ["domicilio", "recoger"]);
});

const lines = [
  { priceCents: 1800000, quantity: 2 },
  { priceCents: 500000, quantity: 1 },
];
const nothing = { discountCents: 0, deliveryCents: 0, deliveryPending: false, deliveryFree: false };

test("totales: el domicilio solo se cobra en pedidos a domicilio", () => {
  assert.deepEqual(computeTotals({ lines, delivery: "domicilio", deliveryFeeCents: 400000 }), {
    ...nothing,
    subtotalCents: 4100000,
    deliveryCents: 400000,
    totalCents: 4500000,
  });
  assert.deepEqual(computeTotals({ lines, delivery: "recoger", deliveryFeeCents: 400000 }), {
    ...nothing,
    subtotalCents: 4100000,
    totalCents: 4100000,
  });
  assert.equal(computeTotals({ lines, delivery: "local", deliveryFeeCents: 400000 }).totalCents, 4100000);
  assert.deepEqual(computeTotals({ lines: [], delivery: "recoger", deliveryFeeCents: null }), {
    ...nothing,
    subtotalCents: 0,
    totalCents: 0,
  });
});

test("totales: domicilio por confirmar, gratis por la zona y gratis desde un valor", () => {
  // Sin costo conocido: se acuerda por WhatsApp y el total no lo incluye.
  const pending = computeTotals({ lines, delivery: "domicilio", deliveryFeeCents: null });
  assert.equal(pending.deliveryPending, true);
  assert.equal(pending.deliveryFree, false);
  assert.equal(pending.totalCents, 4100000);

  // Una zona con precio cero es domicilio gratis, no "por confirmar". Un costo negativo tampoco rebaja el pedido.
  for (const fee of [0, -500]) {
    const free = computeTotals({ lines, delivery: "domicilio", deliveryFeeCents: fee });
    assert.deepEqual([free.deliveryFree, free.deliveryPending, free.totalCents], [true, false, 4100000]);
  }

  // Gratis desde un valor: cuenta el valor de los productos, justo desde el límite.
  const fee = { lines, delivery: "domicilio" as const, deliveryFeeCents: 400000 };
  assert.equal(computeTotals({ ...fee, freeDeliveryFromCents: 4100000 }).deliveryFree, true);
  assert.equal(computeTotals({ ...fee, freeDeliveryFromCents: 4100000 }).totalCents, 4100000);
  assert.equal(computeTotals({ ...fee, freeDeliveryFromCents: 4100100 }).deliveryCents, 400000);
  assert.equal(computeTotals({ ...fee, freeDeliveryFromCents: 0 }).deliveryCents, 400000);
  // Si el pedido llega al valor, tampoco queda "por confirmar" aunque el negocio no tenga costo fijo.
  const waived = computeTotals({ lines, delivery: "domicilio", deliveryFeeCents: null, freeDeliveryFromCents: 4000000 });
  assert.deepEqual([waived.deliveryFree, waived.deliveryPending], [true, false]);
});

test("totales: cupones de porcentaje, de valor fijo y de domicilio gratis", () => {
  const base = { lines, delivery: "domicilio" as const, deliveryFeeCents: 400000, currency: "COP" };

  const percent = computeTotals({ ...base, coupon: { kind: "percent", value: 10 } });
  assert.equal(percent.discountCents, 410000);
  // El descuento se aplica a los productos; el domicilio se cobra completo.
  assert.equal(percent.totalCents, 4100000 - 410000 + 400000);

  // En monedas sin centavos el descuento se redondea a pesos enteros.
  const odd = computeTotals({ lines: [{ priceCents: 1255500, quantity: 1 }], delivery: "recoger", deliveryFeeCents: null, currency: "COP", coupon: { kind: "percent", value: 15 } });
  assert.equal(odd.discountCents, 188300);
  const cents = computeTotals({ lines: [{ priceCents: 1255, quantity: 1 }], delivery: "recoger", deliveryFeeCents: null, currency: "USD", coupon: { kind: "percent", value: 15 } });
  assert.equal(cents.discountCents, 188);

  const amount = computeTotals({ ...base, coupon: { kind: "amount", value: 500000 } });
  assert.equal(amount.discountCents, 500000);
  assert.equal(amount.totalCents, 4000000);
  // Un cupón nunca descuenta más de lo que valen los productos.
  const huge = computeTotals({ ...base, coupon: { kind: "amount", value: 99999999 } });
  assert.deepEqual([huge.discountCents, huge.totalCents], [4100000, 400000]);
  assert.equal(computeTotals({ ...base, coupon: { kind: "percent", value: 250 } }).discountCents, 4100000);

  const freeDelivery = computeTotals({ ...base, coupon: { kind: "free_delivery", value: 0 } });
  assert.deepEqual([freeDelivery.discountCents, freeDelivery.deliveryCents, freeDelivery.deliveryFree], [0, 0, true]);
  assert.equal(freeDelivery.totalCents, 4100000);
  // Para recoger, ese cupón no cambia nada.
  assert.equal(computeTotals({ ...base, delivery: "recoger", coupon: { kind: "free_delivery", value: 0 } }).deliveryFree, false);
});

test("costo de domicilio que le toca a un pedido: zona elegida o costo fijo", () => {
  const zones = [
    { id: "centro", feeCents: 400000 },
    { id: "vecinos", feeCents: 0 },
  ];
  assert.equal(deliveryFeeFor({ deliveryFeeCents: 500000, zones }, "centro"), 400000);
  assert.equal(deliveryFeeFor({ deliveryFeeCents: 500000, zones }, "vecinos"), 0);
  // Con zonas, mientras no se elija una no se sabe el costo (el fijo ya no cuenta).
  assert.equal(deliveryFeeFor({ deliveryFeeCents: 500000, zones }, null), null);
  assert.equal(deliveryFeeFor({ deliveryFeeCents: 500000, zones }, "otra"), null);
  // Sin zonas: el costo fijo, o "por confirmar" si no hay.
  assert.equal(deliveryFeeFor({ deliveryFeeCents: 500000, zones: [] }, null), 500000);
  assert.equal(deliveryFeeFor({ deliveryFeeCents: 0, zones: [] }, null), null);
});

test("estados y formas de entrega reconocidos", () => {
  assert.ok(isOrderStatus("nuevo") && isOrderStatus("listo") && isOrderStatus("completado") && isOrderStatus("cancelado"));
  assert.ok(!isOrderStatus("entregado") && !isOrderStatus(undefined) && !isOrderStatus(3));
  assert.ok(isDeliveryMode("local") && !isDeliveryMode("avion"));
  assert.equal(statusLabel("preparando"), "En preparación");
  assert.equal(statusLabel("otro"), "otro");
  assert.equal(deliveryLabel("recoger"), "Recoger");
});

test("seguimiento: el paso 'listo' se nombra según cómo se entrega", () => {
  assert.equal(statusLabelFor("listo", "domicilio"), "En camino");
  assert.equal(statusLabelFor("listo", "recoger"), "Listo para recoger");
  assert.equal(statusLabelFor("listo", "local"), "Listo");
  assert.equal(statusLabelFor("nuevo", "domicilio"), "Nuevo");
  assert.deepEqual(trackingSteps("domicilio"), ["Recibido", "En preparación", "En camino", "Entregado"]);
  assert.deepEqual(
    ["nuevo", "preparando", "listo", "completado", "cancelado"].map(trackingIndex),
    [0, 1, 2, 3, -1],
  );
  // Lo que se le dice al cliente en cada paso.
  assert.match(trackingMessage("nuevo", "domicilio"), /^Recibimos tu pedido/);
  assert.equal(trackingMessage("listo", "domicilio"), "Tu pedido va en camino.");
  assert.match(trackingMessage("listo", "recoger"), /pasar a recogerlo/);
  assert.equal(trackingMessage("listo", "local"), "Tu pedido está listo.");
  assert.match(trackingMessage("completado", "recoger"), /Gracias por tu compra/);
  assert.equal(trackingMessage("cancelado", "domicilio"), "Este pedido fue cancelado.");
});
