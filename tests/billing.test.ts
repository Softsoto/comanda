import assert from "node:assert/strict";
import { test } from "node:test";
import { addMonths, billingLabel, billingStatus, extendPaidUntil, isBillingBlocked } from "../src/lib/billing";
import { DEFAULT_PRIVACY_TEXT, renderPrivacy } from "../src/lib/privacy";

test("estado de cobro de un comercio según su último día pagado", () => {
  const state = (paidUntil: string | null, today: string, grace = 3) => billingStatus(paidUntil, today, grace);

  // Sin fecha, el comercio no vence nunca.
  assert.deepEqual(state(null, "2026-10-04"), { state: "sin-vencimiento", paidUntil: null, daysLeft: 0, lastDay: null });
  assert.equal(state("2026-10-31", "2026-10-04").state, "activo");
  assert.equal(state("2026-10-31", "2026-10-04").daysLeft, 28);
  // Avisa desde cinco días antes, y el último día pagado todavía está al día.
  assert.equal(state("2026-10-09", "2026-10-04").state, "activo");
  assert.equal(state("2026-10-08", "2026-10-04").state, "por-vencer");
  assert.deepEqual([state("2026-10-04", "2026-10-04").state, state("2026-10-04", "2026-10-04").daysLeft], ["por-vencer", 1]);
  // Después vienen los días de gracia, en los que el menú sigue funcionando…
  assert.equal(state("2026-10-04", "2026-10-05").state, "gracia");
  assert.equal(state("2026-10-04", "2026-10-07").state, "gracia");
  assert.equal(state("2026-10-04", "2026-10-07").lastDay, "2026-10-07");
  // …y luego queda vencido: solo entonces se bloquea.
  assert.equal(state("2026-10-04", "2026-10-08").state, "vencido");
  assert.ok(isBillingBlocked(state("2026-10-04", "2026-10-08")));
  assert.ok(!isBillingBlocked(state("2026-10-04", "2026-10-07")));
  assert.ok(!isBillingBlocked(state(null, "2026-10-08")));
  // Sin días de gracia, vence al día siguiente.
  assert.equal(state("2026-10-04", "2026-10-05", 0).state, "vencido");
});

test("el estado de cobro, dicho en pocas palabras", () => {
  const label = (paidUntil: string | null, today: string) => billingLabel(billingStatus(paidUntil, today, 3));
  assert.equal(label(null, "2026-10-04"), "Sin vencimiento");
  assert.equal(label("2026-10-31", "2026-10-04"), "Al día · vence el 31 oct 2026");
  assert.equal(label("2026-10-04", "2026-10-04"), "Vence hoy");
  assert.equal(label("2026-10-05", "2026-10-04"), "Vence mañana");
  assert.equal(label("2026-10-07", "2026-10-04"), "Vence en 3 días");
  assert.equal(label("2026-10-04", "2026-10-06"), "Venció el 4 oct 2026 · en días de gracia");
  assert.equal(label("2026-10-04", "2026-11-20"), "Vencido desde el 4 oct 2026");
});

test("sumar meses y extender el vencimiento con un pago", () => {
  assert.equal(addMonths("2026-10-04", 1), "2026-11-04");
  assert.equal(addMonths("2026-10-04", 12), "2027-10-04");
  assert.equal(addMonths("2026-11-15", 3), "2027-02-15");
  // Si el mes de destino es más corto, se queda en su último día.
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonths("2026-08-31", 1), "2026-09-30");

  // Al día: el pago empieza donde termina lo que ya tenía pagado.
  assert.deepEqual(extendPaidUntil("2026-10-20", "2026-10-04", 1), { from: "2026-10-21", to: "2026-11-20" });
  assert.deepEqual(extendPaidUntil("2026-10-04", "2026-10-04", 3), { from: "2026-10-05", to: "2027-01-04" });
  // Vencido o sin fecha: empieza hoy; no se cobran los días sin servicio.
  assert.deepEqual(extendPaidUntil("2026-09-20", "2026-10-04", 1), { from: "2026-10-04", to: "2026-11-03" });
  assert.deepEqual(extendPaidUntil(null, "2026-10-04", 12), { from: "2026-10-04", to: "2027-10-03" });
});

test("aviso de tratamiento de datos: plantilla con los datos del negocio", () => {
  const values = { business: "El Antojo", contact: "Puedes escribirle por WhatsApp al +57 300 123 4567.", service: "Comanda" };
  const blocks = renderPrivacy("", values);
  assert.equal(blocks[0].kind, "title");
  assert.ok(blocks.filter((block) => block.kind === "title").length >= 6);
  const text = blocks.map((block) => block.text).join("\n");
  assert.ok(text.includes("El Antojo es el responsable"));
  assert.ok(text.includes("+57 300 123 4567"));
  assert.ok(!/\{(negocio|contacto|servicio)\}/.test(text), "no deben quedar palabras entre llaves sin reemplazar");
  assert.ok(DEFAULT_PRIVACY_TEXT.includes("{negocio}"));

  // Un texto propio: títulos con "#", párrafos separados por una línea en blanco y saltos de línea respetados.
  assert.deepEqual(
    renderPrivacy("# Aviso\r\nUsamos tus datos en {negocio}:\n-  tu nombre  \n- tu teléfono\n\n\nSegundo párrafo.\n## Otro título\n", values),
    [
      { kind: "title", text: "Aviso" },
      { kind: "text", text: "Usamos tus datos en El Antojo:\n- tu nombre\n- tu teléfono" },
      { kind: "text", text: "Segundo párrafo." },
      { kind: "title", text: "Otro título" },
    ],
  );
});
