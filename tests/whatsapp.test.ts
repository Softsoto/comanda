import assert from "node:assert/strict";
import { test } from "node:test";
import { computeTotals } from "../src/lib/orders";
import {
  buildOrderMessage,
  buildWhatsAppUrl,
  subtotalCents,
  validateCustomer,
  type OrderCustomer,
  type OrderLine,
} from "../src/lib/whatsapp";

const business = { name: "El Antojo", whatsapp: "573001234567", currency: "COP" };
const lines = [
  { name: "Hamburguesa clásica", priceCents: 1800000, quantity: 2 },
  { name: "Limonada natural", priceCents: 600000, quantity: 1 },
];
const customer: OrderCustomer = {
  name: "Ana Pérez",
  phone: "300 123 4567",
  delivery: "domicilio",
  address: "Calle 10 # 5-20",
  payment: "Efectivo",
  notes: "",
};
const NBSP = " ";

/** Totales de un pedido de prueba, calculados igual que en la app. */
const totalsFor = (
  data: OrderCustomer,
  extra: { fee?: number | null; freeFrom?: number; coupon?: Parameters<typeof computeTotals>[0]["coupon"]; of?: OrderLine[] } = {},
) =>
  computeTotals({
    lines: extra.of ?? lines,
    delivery: data.delivery,
    deliveryFeeCents: extra.fee === undefined ? null : extra.fee,
    freeDeliveryFromCents: extra.freeFrom,
    coupon: extra.coupon,
    currency: "COP",
  });

test("subtotal suma precio por cantidad", () => {
  assert.equal(subtotalCents(lines), 4200000);
  assert.equal(subtotalCents([]), 0);
});

test("mensaje de pedido a domicilio, con número y costo de domicilio", () => {
  assert.equal(
    buildOrderMessage(business, lines, customer, totalsFor(customer, { fee: 400000 }), { number: 12 }),
    [
      "*Pedido #12 — El Antojo*",
      "",
      `• 2 x Hamburguesa clásica — $${NBSP}36.000`,
      `• 1 x Limonada natural — $${NBSP}6.000`,
      "",
      `*Subtotal:* $${NBSP}42.000`,
      `*Domicilio:* $${NBSP}4.000`,
      `*Total:* $${NBSP}46.000`,
      "",
      "*Nombre:* Ana Pérez",
      "*Teléfono:* 300 123 4567",
      "*Entrega:* A domicilio",
      "*Dirección:* Calle 10 # 5-20",
      "*Pago:* Efectivo",
    ].join("\n"),
  );
});

test("a domicilio sin costo fijo: el domicilio queda por confirmar", () => {
  const message = buildOrderMessage(business, lines, customer, totalsFor(customer));
  assert.match(message, /^\*Nuevo pedido — El Antojo\*\n/);
  assert.ok(message.includes(`*Subtotal:* $${NBSP}42.000\n`));
  assert.match(message, /\*Domicilio:\* por confirmar\n/);
  assert.doesNotMatch(message, /\*Total:\*/);
});

test("el costo de domicilio no se cobra si el pedido se recoge", () => {
  const pickup: OrderCustomer = { ...customer, delivery: "recoger" };
  const message = buildOrderMessage(business, lines, pickup, totalsFor(pickup, { fee: 400000 }));
  assert.match(message, new RegExp(`\\*Total:\\* \\$${NBSP}42\\.000`));
  assert.doesNotMatch(message, /Domicilio:/);
});

test("pedido en el local: muestra la mesa", () => {
  const atTable: OrderCustomer = { ...customer, delivery: "local", address: "7" };
  const message = buildOrderMessage(business, lines, atTable, totalsFor(atTable));
  assert.match(message, /\*Entrega:\* Consume en el local\n\*Mesa:\* 7\n/);
  assert.doesNotMatch(message, /Dirección/);
  // Sin número de mesa no aparece la línea.
  const noTable: OrderCustomer = { ...atTable, address: "" };
  assert.doesNotMatch(buildOrderMessage(business, lines, noTable, totalsFor(noTable)), /Mesa/);
});

test("mensaje para recoger: sin dirección, con notas", () => {
  const pickup: OrderCustomer = { ...customer, delivery: "recoger", notes: "Sin cebolla" };
  const message = buildOrderMessage(business, lines, pickup, totalsFor(pickup));
  assert.match(message, /\*Entrega:\* Recoge en el local/);
  assert.doesNotMatch(message, /Dirección/);
  assert.match(message, /\*Notas:\* Sin cebolla$/);
});

test("lo que escribe el cliente no rompe el formato de WhatsApp", () => {
  const messy: OrderCustomer = { ...customer, name: "*Ana* _P_", notes: "línea 1\nlínea 2 ~x~ `y`" };
  const message = buildOrderMessage(business, lines, messy, totalsFor(messy));
  assert.match(message, /\*Nombre:\* Ana P\n/);
  assert.match(message, /\*Notas:\* línea 1 línea 2 x y$/);
});

test("opciones del producto, zona, cupón y enlace de seguimiento", () => {
  const withOptions: OrderLine[] = [
    { name: "Hamburguesa clásica", priceCents: 2300000, quantity: 2, options: "Queso extra, Tocineta" },
    { name: "Gaseosa", priceCents: 500000, quantity: 1, options: "Cola" },
  ];
  const toZone: OrderCustomer = { ...customer, zone: "Norte" };
  const totals = totalsFor(toZone, { of: withOptions, fee: 600000, coupon: { kind: "percent", value: 10 } });
  assert.equal(
    buildOrderMessage(business, withOptions, toZone, totals, {
      number: 31,
      couponCode: "BIENVENIDO10",
      trackUrl: "https://menu.test/p/abc123XYZ_-0",
    }),
    [
      "*Pedido #31 — El Antojo*",
      "",
      `• 2 x Hamburguesa clásica (Queso extra, Tocineta) — $${NBSP}46.000`,
      `• 1 x Gaseosa (Cola) — $${NBSP}5.000`,
      "",
      `*Subtotal:* $${NBSP}51.000`,
      `*Descuento (BIENVENIDO10):* -$${NBSP}5.100`,
      `*Domicilio:* $${NBSP}6.000`,
      `*Total:* $${NBSP}51.900`,
      "",
      "*Nombre:* Ana Pérez",
      "*Teléfono:* 300 123 4567",
      "*Entrega:* A domicilio",
      "*Zona:* Norte",
      "*Dirección:* Calle 10 # 5-20",
      "*Pago:* Efectivo",
      "",
      "Seguimiento: https://menu.test/p/abc123XYZ_-0",
    ].join("\n"),
  );
});

test("domicilio gratis y descuento en un pedido para recoger", () => {
  const free = buildOrderMessage(business, lines, customer, totalsFor(customer, { fee: 400000, freeFrom: 4000000 }));
  assert.match(free, /\*Domicilio:\* gratis\n/);
  assert.ok(free.includes(`*Total:* $${NBSP}42.000`));

  // Para recoger, con cupón: se muestra el subtotal y el descuento, sin línea de domicilio.
  const pickup: OrderCustomer = { ...customer, delivery: "recoger" };
  const discounted = buildOrderMessage(business, lines, pickup, totalsFor(pickup, { coupon: { kind: "amount", value: 500000 } }), {
    couponCode: "CINCO",
  });
  assert.ok(discounted.includes(`*Subtotal:* $${NBSP}42.000\n*Descuento (CINCO):* -$${NBSP}5.000\n*Total:* $${NBSP}37.000`));
  assert.doesNotMatch(discounted, /Domicilio/);

  // Con descuento y el domicilio por confirmar no hay total definitivo: se anuncia el total sin domicilio.
  const pending = buildOrderMessage(business, lines, customer, totalsFor(customer, { coupon: { kind: "amount", value: 500000 } }));
  assert.match(pending, /\*Domicilio:\* por confirmar\n\*Total sin domicilio:\*/);
});

test("enlace de WhatsApp con número y texto codificado", () => {
  const url = new URL(buildWhatsAppUrl("+57 300 123-4567", "Hola & adiós\n¿sí?"));
  assert.equal(url.origin + url.pathname, "https://wa.me/573001234567");
  assert.equal(url.searchParams.get("text"), "Hola & adiós\n¿sí?");
});

test("sin número, WhatsApp deja elegir el chat", () => {
  assert.ok(buildWhatsAppUrl("", "Hola").startsWith("https://wa.me/?text="));
});

test("validación de los datos del cliente", () => {
  const options = { deliveryModes: ["domicilio", "recoger"] as const, paymentMethods: ["Efectivo", "Nequi"] };
  const check = (data: OrderCustomer, zones?: string[]) =>
    validateCustomer(data, { deliveryModes: [...options.deliveryModes], paymentMethods: options.paymentMethods, zones });

  assert.deepEqual(check(customer), {});
  assert.deepEqual(Object.keys(check({ ...customer, name: " ", phone: "12", address: "" })), ["name", "phone", "address"]);
  // Para recoger no se exige dirección.
  assert.deepEqual(check({ ...customer, delivery: "recoger", address: "" }), {});
  // La forma de pago debe ser una de las que ofrece el negocio.
  assert.ok(check({ ...customer, payment: "" }).payment);
  assert.ok(check({ ...customer, payment: "Bitcoin" }).payment);
  // Y la forma de entrega, una de las que tiene activas.
  assert.ok(check({ ...customer, delivery: "local" }).delivery);
  // Con zonas de domicilio, hay que elegir una de las del negocio (solo a domicilio).
  assert.deepEqual(Object.keys(check(customer, ["Centro", "Norte"])), ["zone"]);
  assert.deepEqual(check({ ...customer, zone: "Norte" }, ["Centro", "Norte"]), {});
  assert.ok(check({ ...customer, zone: "Marte" }, ["Centro", "Norte"]).zone);
  assert.deepEqual(check({ ...customer, delivery: "recoger", address: "" }, ["Centro", "Norte"]), {});
  // Un negocio sin formas de pago configuradas no exige elegir una.
  assert.deepEqual(validateCustomer({ ...customer, payment: "" }, { deliveryModes: ["domicilio"], paymentMethods: [] }), {});
});
