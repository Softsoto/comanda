import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TIMEZONES,
  addDays,
  dayKey,
  dayStart,
  daysBetween,
  formatDateTime,
  formatDay,
  formatDayMonth,
  formatDayShort,
  formatMonth,
  formatTime,
  formatWhen,
  isDayKey,
  isTimezone,
  rangeInstants,
  resolveRange,
  weekdayOf,
} from "../src/lib/dates";

const BOGOTA = "America/Bogota";
const MADRID = "Europe/Madrid";

test("el mismo instante cae en días distintos según la zona horaria", () => {
  const instant = new Date("2026-10-04T03:30:00Z");
  assert.equal(dayKey(instant, BOGOTA), "2026-10-03"); // 10:30 p. m. del sábado
  assert.equal(dayKey(instant, MADRID), "2026-10-04"); // 5:30 a. m. del domingo
  assert.equal(formatTime(instant, BOGOTA), "10:30 p. m.");
  assert.equal(formatTime(instant, MADRID), "5:30 a. m.");
  assert.equal(formatDateTime(instant, BOGOTA), "3 oct 2026, 10:30 p. m.");
});

test("horas en formato de 12 horas", () => {
  assert.equal(formatTime(new Date("2026-10-03T05:00:00Z"), BOGOTA), "12:00 a. m.");
  assert.equal(formatTime(new Date("2026-10-03T17:05:00Z"), BOGOTA), "12:05 p. m.");
  assert.equal(formatTime(new Date("2026-10-03T18:00:00Z"), BOGOTA), "1:00 p. m.");
});

test("inicio del día en zonas sin cambio de hora y con él", () => {
  assert.equal(dayStart("2026-10-03", BOGOTA).toISOString(), "2026-10-03T05:00:00.000Z");
  assert.equal(dayStart("2026-10-03", MADRID).toISOString(), "2026-10-02T22:00:00.000Z"); // horario de verano
  assert.equal(dayStart("2026-12-15", MADRID).toISOString(), "2026-12-14T23:00:00.000Z"); // horario de invierno
  // El día del cambio de hora en Nueva York dura 23 horas.
  const start = dayStart("2026-03-08", "America/New_York").getTime();
  const next = dayStart("2026-03-09", "America/New_York").getTime();
  assert.equal((next - start) / 3_600_000, 23);
});

test("inicio del día: correcto todos los días del año en todas las zonas de la lista", () => {
  // Propiedad: el instante devuelto ya es ese día, y un milisegundo antes era la víspera.
  // Cubre los países donde el cambio de hora ocurre a medianoche y ese día empieza a la 1:00.
  for (const zone of TIMEZONES) {
    for (let day = "2026-01-01"; day <= "2026-12-31"; day = addDays(day, 1)) {
      const start = dayStart(day, zone.value);
      assert.equal(dayKey(start, zone.value), day, `${zone.value} ${day}`);
      assert.equal(dayKey(new Date(start.getTime() - 1), zone.value), addDays(day, -1), `${zone.value} víspera de ${day}`);
    }
  }
});

test("operaciones con días", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29"); // bisiesto
  assert.equal(daysBetween("2026-10-01", "2026-10-01"), 1);
  assert.equal(daysBetween("2026-09-04", "2026-10-03"), 30);
  assert.equal(weekdayOf("2026-10-03"), 6); // sábado
  assert.equal(weekdayOf("2026-10-04"), 0); // domingo
  assert.ok(isDayKey("2026-02-28"));
  assert.ok(!isDayKey("2026-02-30") && !isDayKey("2026-2-3") && !isDayKey("hoy") && !isDayKey(undefined));
  assert.ok(isTimezone("America/Lima") && !isTimezone("Marte/Olimpo"));
});

test("textos de fecha", () => {
  assert.equal(formatDay("2026-10-03"), "3 oct 2026");
  assert.equal(formatDayShort("2026-10-03"), "sáb 3 oct");
  assert.equal(formatDayMonth("2026-01-09"), "9 ene");
  assert.equal(formatMonth("2026-10-03"), "oct 2026");
  const now = new Date("2026-10-04T03:30:00Z"); // sábado 3 de octubre, 10:30 p. m. en Bogotá
  assert.equal(formatWhen(new Date("2026-10-03T20:15:00Z"), BOGOTA, now), "Hoy, 3:15 p. m.");
  assert.equal(formatWhen(new Date("2026-10-03T02:00:00Z"), BOGOTA, now), "Ayer, 9:00 p. m.");
  assert.equal(formatWhen(new Date("2026-09-27T17:00:00Z"), BOGOTA, now), "27 sep, 12:00 p. m.");
  assert.equal(formatWhen(new Date("2025-12-31T17:00:00Z"), BOGOTA, now), "31 dic 2025, 12:00 p. m.");
});

test("rangos de fechas: se corrigen solos", () => {
  const today = dayKey(new Date(), BOGOTA);
  assert.deepEqual(resolveRange(undefined, undefined, BOGOTA), { from: addDays(today, -29), to: today });
  assert.deepEqual(resolveRange("2026-09-01", "2026-09-15", BOGOTA), { from: "2026-09-01", to: "2026-09-15" });
  // Al revés: se ordenan.
  assert.deepEqual(resolveRange("2026-09-15", "2026-09-01", BOGOTA), { from: "2026-09-01", to: "2026-09-15" });
  // Fechas inventadas: se ignoran.
  assert.deepEqual(resolveRange("ayer", "2026-13-40", BOGOTA), { from: addDays(today, -29), to: today });
  // Como mucho dos años.
  assert.equal(daysBetween(resolveRange("2001-01-01", "2026-01-01", BOGOTA).from, "2026-01-01"), 731);

  const { start, end } = rangeInstants({ from: "2026-10-01", to: "2026-10-03" }, BOGOTA);
  assert.equal(start.toISOString(), "2026-10-01T05:00:00.000Z");
  assert.equal(end.toISOString(), "2026-10-04T05:00:00.000Z"); // el final es el comienzo del día siguiente
});
