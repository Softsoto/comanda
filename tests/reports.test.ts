import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays } from "../src/lib/dates";
import { filtersToQuery, presetRange, readFilters } from "../src/lib/filters";
import { bucketDays, buildDayStats, niceScale, sumStats, type DayStats } from "../src/lib/reports";

const range = { from: "2026-10-01", to: "2026-10-03" };

test("resumen por día: solo los pedidos completados cuentan como venta", () => {
  const days = buildDayStats(
    range,
    [
      { day: "2026-10-01", status: "completado", totalCents: 5000000, profitCents: 2000000 },
      { day: "2026-10-01", status: "completado", totalCents: 3000000, profitCents: null },
      { day: "2026-10-01", status: "cancelado", totalCents: 9900000, profitCents: 5000000 },
      { day: "2026-10-03", status: "nuevo", totalCents: 1200000, profitCents: 400000 },
      { day: "2026-09-30", status: "completado", totalCents: 7700000, profitCents: 100 }, // fuera del rango
    ],
    new Map([
      ["2026-10-02", 14],
      ["2026-10-03", 3],
    ]),
  );

  assert.equal(days.length, 3); // una fila por día, también el día sin pedidos
  assert.deepEqual(days[0], {
    day: "2026-10-01",
    orders: 3,
    completed: 2,
    cancelled: 1,
    salesCents: 8000000,
    profitCents: 2000000,
    completedWithCost: 1,
    visits: 0,
  });
  assert.deepEqual(days[1], {
    day: "2026-10-02",
    orders: 0,
    completed: 0,
    cancelled: 0,
    salesCents: 0,
    profitCents: 0,
    completedWithCost: 0,
    visits: 14,
  });
  assert.equal(days[2].orders, 1);
  assert.equal(days[2].salesCents, 0);

  const totals = sumStats(days);
  assert.equal(totals.orders, 4);
  assert.equal(totals.completed, 2);
  assert.equal(totals.salesCents, 8000000);
  assert.equal(totals.averageCents, 4000000);
  assert.equal(totals.visits, 17);
  assert.equal(sumStats([]).averageCents, 0); // sin pedidos no se divide entre cero
});

const fakeDays = (from: string, count: number): DayStats[] =>
  Array.from({ length: count }, (_, index) => ({
    day: addDays(from, index),
    orders: 1,
    completed: 1,
    cancelled: 0,
    salesCents: 100,
    profitCents: 0,
    completedWithCost: 0,
    visits: 2,
  }));

test("la gráfica agrupa por día, por semana o por mes según el largo del período", () => {
  const daily = bucketDays(fakeDays("2026-10-01", 31));
  assert.equal(daily.unit, "día");
  assert.equal(daily.buckets.length, 31);
  assert.deepEqual(
    { label: daily.buckets[2].label, shortLabel: daily.buckets[2].shortLabel },
    { label: "sáb 3 oct", shortLabel: "3 oct" },
  );

  // 2026-09-01 es martes: la primera semana queda incompleta (martes a domingo).
  const weekly = bucketDays(fakeDays("2026-09-01", 60));
  assert.equal(weekly.unit, "semana");
  assert.equal(weekly.buckets[0].label, "1 sep – 6 sep");
  assert.equal(weekly.buckets[0].salesCents, 600);
  assert.equal(weekly.buckets[1].label, "7 sep – 13 sep");
  assert.equal(weekly.buckets[1].completed, 7);
  assert.equal(
    weekly.buckets.reduce((sum, bucket) => sum + bucket.salesCents, 0),
    6000,
  );

  const monthly = bucketDays(fakeDays("2026-01-01", 365));
  assert.equal(monthly.unit, "mes");
  assert.equal(monthly.buckets.length, 12);
  assert.deepEqual(
    { label: monthly.buckets[1].label, shortLabel: monthly.buckets[1].shortLabel, visits: monthly.buckets[1].visits },
    { label: "feb 2026", shortLabel: "feb", visits: 56 },
  );
});

test("marcas del eje de la gráfica", () => {
  assert.deepEqual(niceScale(12_345_600), [0, 5_000_000, 10_000_000, 15_000_000]);
  assert.deepEqual(niceScale(10_000_000), [0, 2_500_000, 5_000_000, 7_500_000, 10_000_000]);
  assert.deepEqual(niceScale(4250), [0, 2000, 4000, 6000]);
  assert.deepEqual(niceScale(0), [0, 1]);
  // El tope nunca queda por debajo del valor más alto.
  for (const max of [1, 7, 99, 101, 5_555, 123_456_789]) {
    const ticks = niceScale(max);
    assert.ok(ticks[ticks.length - 1] >= max, `tope para ${max}`);
    assert.ok(ticks.length >= 2 && ticks.length <= 6, `cantidad de marcas para ${max}`);
  }
});

test("filtros de la dirección", () => {
  const zone = "America/Bogota";
  const month = presetRange("mes", zone);
  assert.match(month.from, /^\d{4}-\d{2}-01$/);
  assert.equal(presetRange("hoy", zone).from, presetRange("hoy", zone).to);
  assert.equal(presetRange("7d", zone).from, addDays(presetRange("7d", zone).to, -6));

  // Sin nada: el período por defecto, todos los estados, primera página.
  const base = readFilters({}, zone, "7d");
  assert.deepEqual({ preset: base.preset, status: base.status, page: base.page }, { preset: "7d", status: undefined, page: 1 });

  const custom = readFilters({ desde: "2026-09-10", hasta: "2026-09-01", estado: "nuevo", pagina: "3" }, zone, "7d");
  assert.deepEqual(custom, { range: { from: "2026-09-01", to: "2026-09-10" }, preset: null, status: "nuevo", page: 3 });

  // Valores inventados se ignoran; si llegan repetidos se usa el primero.
  const odd = readFilters({ periodo: "siempre", estado: ["cancelado", "nuevo"], pagina: "-4" }, zone, "30d");
  assert.deepEqual({ preset: odd.preset, status: odd.status, page: odd.page }, { preset: "30d", status: "cancelado", page: 1 });

  assert.equal(filtersToQuery(base), "?periodo=7d");
  assert.equal(filtersToQuery(custom, { pagina: 2 }), "?desde=2026-09-01&hasta=2026-09-10&estado=nuevo&pagina=2");
  assert.equal(filtersToQuery({ ...base, status: "completado" }, { pagina: undefined }), "?periodo=7d&estado=completado");
});
