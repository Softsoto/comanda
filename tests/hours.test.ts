import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptySchedule,
  formatClock,
  getOpenStatus,
  hasAnyHours,
  isOpenMode,
  parseSchedule,
  scheduleLines,
  serializeSchedule,
  validateSchedule,
  type WeeklySchedule,
} from "../src/lib/hours";

const BOGOTA = "America/Bogota";
/** Instante a partir de una hora de reloj en Bogotá (UTC−5, sin cambio de hora). */
const at = (day: string, time: string) => new Date(`${day}T${time}:00-05:00`);

// 2026-10-03 es sábado. Índices: 0 = domingo … 6 = sábado.
const schedule: WeeklySchedule = [
  [], // domingo: cerrado
  [{ from: "11:30", to: "22:00" }], // lunes
  [{ from: "11:30", to: "22:00" }],
  [{ from: "11:30", to: "22:00" }],
  [
    { from: "11:30", to: "15:00" },
    { from: "18:00", to: "22:00" },
  ], // jueves: dos tramos
  [{ from: "18:00", to: "02:00" }], // viernes: cierra el sábado a las 2:00 a. m.
  [{ from: "13:00", to: "23:59" }], // sábado
];

test("modos fijos: abierto y cerrado no miran el horario", () => {
  assert.deepEqual(getOpenStatus("abierto", emptySchedule(), at("2026-10-03", "03:00"), BOGOTA), {
    open: true,
    label: "Abierto",
    detail: "",
  });
  assert.deepEqual(getOpenStatus("cerrado", schedule, at("2026-10-05", "12:00"), BOGOTA), {
    open: false,
    label: "Cerrado",
    detail: "",
  });
  assert.ok(isOpenMode("horario") && !isOpenMode("automatico") && !isOpenMode(null));
});

test("según horario: dentro y fuera de las horas", () => {
  const status = (day: string, time: string) => getOpenStatus("horario", schedule, at(day, time), BOGOTA);

  // Lunes 5 de octubre.
  assert.deepEqual(status("2026-10-05", "11:29"), { open: false, label: "Cerrado", detail: "Abre hoy a las 11:30 a. m." });
  assert.deepEqual(status("2026-10-05", "11:30"), { open: true, label: "Abierto", detail: "Cierra a las 10:00 p. m." });
  assert.deepEqual(status("2026-10-05", "21:59"), { open: true, label: "Abierto", detail: "Cierra a las 10:00 p. m." });
  assert.deepEqual(status("2026-10-05", "22:00"), { open: false, label: "Cerrado", detail: "Abre mañana a las 11:30 a. m." });

  // Jueves 8: entre los dos tramos está cerrado y anuncia el de la tarde.
  assert.deepEqual(status("2026-10-08", "14:00"), { open: true, label: "Abierto", detail: "Cierra a las 3:00 p. m." });
  assert.deepEqual(status("2026-10-08", "16:00"), { open: false, label: "Cerrado", detail: "Abre hoy a las 6:00 p. m." });
  assert.deepEqual(status("2026-10-08", "19:00"), { open: true, label: "Abierto", detail: "Cierra a las 10:00 p. m." });
});

test("según horario: tramos que pasan de la medianoche", () => {
  const status = (day: string, time: string) => getOpenStatus("horario", schedule, at(day, time), BOGOTA);
  // Viernes 9 por la noche y madrugada del sábado 10.
  assert.equal(status("2026-10-09", "23:30").open, true);
  assert.deepEqual(status("2026-10-10", "01:30"), { open: true, label: "Abierto", detail: "Cierra a las 2:00 a. m." });
  assert.deepEqual(status("2026-10-10", "02:00"), { open: false, label: "Cerrado", detail: "Abre hoy a la 1:00 p. m." });
  // "23:59" cuenta como fin del día: no cierra un minuto antes de medianoche.
  assert.equal(getOpenStatus("horario", schedule, new Date("2026-10-11T04:59:30Z"), BOGOTA).open, true); // sábado 11:59:30 p. m.
});

test("según horario: la próxima apertura salta los días cerrados", () => {
  // Sábado 3 a las 12:00 a. m. en punto (ya cerró el tramo del sábado a las 23:59 → es domingo 4).
  const sunday = getOpenStatus("horario", schedule, at("2026-10-04", "10:00"), BOGOTA);
  assert.deepEqual(sunday, { open: false, label: "Cerrado", detail: "Abre mañana a las 11:30 a. m." });

  const onlyThursday = emptySchedule();
  onlyThursday[4] = [{ from: "09:00", to: "17:00" }];
  assert.equal(
    getOpenStatus("horario", onlyThursday, at("2026-10-05", "08:00"), BOGOTA).detail, // lunes
    "Abre el jueves a las 9:00 a. m.",
  );
  // El mismo jueves, después de cerrar: la próxima vez es el jueves siguiente.
  assert.equal(
    getOpenStatus("horario", onlyThursday, at("2026-10-08", "18:00"), BOGOTA).detail,
    "Abre el jueves a las 9:00 a. m.",
  );
});

test("según horario sin horas definidas: cerrado y sin promesa de apertura", () => {
  assert.deepEqual(getOpenStatus("horario", emptySchedule(), at("2026-10-05", "12:00"), BOGOTA), {
    open: false,
    label: "Cerrado",
    detail: "",
  });
  assert.equal(hasAnyHours(emptySchedule()), false);
  assert.equal(hasAnyHours(schedule), true);
});

test("el horario se interpreta en la zona horaria del negocio", () => {
  const instant = new Date("2026-10-05T18:00:00Z"); // lunes: 1:00 p. m. en Bogotá, 8:00 p. m. en Madrid
  const lunch: WeeklySchedule = emptySchedule();
  lunch[1] = [{ from: "12:00", to: "15:00" }];
  assert.equal(getOpenStatus("horario", lunch, instant, BOGOTA).open, true);
  assert.equal(getOpenStatus("horario", lunch, instant, "Europe/Madrid").open, false);
});

test("revisión del horario que llega del formulario", () => {
  const ok = validateSchedule([
    [],
    [
      { from: "18:00", to: "22:00" },
      { from: "11:30", to: "15:00" },
    ],
    [{ from: "20:00", to: "03:00" }],
  ]);
  assert.ok(ok.ok);
  if (ok.ok) {
    // Los tramos quedan ordenados por hora de apertura y los días que faltan, cerrados.
    assert.deepEqual(ok.schedule[1], [
      { from: "11:30", to: "15:00" },
      { from: "18:00", to: "22:00" },
    ]);
    assert.deepEqual(ok.schedule[2], [{ from: "20:00", to: "03:00" }]);
    assert.deepEqual(ok.schedule[6], []);
  }

  const problems = (raw: unknown) => {
    const result = validateSchedule(raw);
    return result.ok ? {} : result.errors;
  };
  assert.match(problems([[{ from: "09:00", to: "09:00" }]])[0], /misma hora/);
  assert.match(problems([[], [{ from: "9:00", to: "18:00" }]])[1], /Completa la hora/);
  assert.match(problems([[], [{ from: "09:00" }]])[1], /Completa la hora/);
  assert.match(
    problems([
      [
        { from: "09:00", to: "14:00" },
        { from: "13:00", to: "18:00" },
      ],
    ])[0],
    /se cruzan/,
  );
  // Un tramo que pasa de medianoche ocupa el resto del día: no cabe otro después.
  assert.match(
    problems([
      [
        { from: "18:00", to: "02:00" },
        { from: "20:00", to: "23:00" },
      ],
    ])[0],
    /se cruzan/,
  );
  assert.match(
    problems([
      [
        { from: "08:00", to: "10:00" },
        { from: "11:00", to: "13:00" },
        { from: "15:00", to: "18:00" },
      ],
    ])[0],
    /máximo 2/,
  );
  // Lo que no es una lista se trata como una semana sin horas.
  assert.ok(validateSchedule("hola").ok);
});

test("guardar y leer el horario", () => {
  assert.deepEqual(parseSchedule(serializeSchedule(schedule)), schedule);
  assert.deepEqual(parseSchedule(""), emptySchedule());
  assert.deepEqual(parseSchedule("{dañado"), emptySchedule());
  assert.deepEqual(parseSchedule('[[{"from":"25:00","to":"26:00"}]]'), emptySchedule());
});

test("textos del horario", () => {
  assert.equal(formatClock("00:00"), "12:00 a. m.");
  assert.equal(formatClock("12:30"), "12:30 p. m.");
  assert.equal(formatClock("17:05"), "5:05 p. m.");
  const lines = scheduleLines(schedule);
  assert.deepEqual(lines[0], { day: "Lunes", text: "11:30 a. m. a 10:00 p. m." });
  assert.deepEqual(lines[3], { day: "Jueves", text: "11:30 a. m. a 3:00 p. m. y 6:00 p. m. a 10:00 p. m." });
  assert.deepEqual(lines[6], { day: "Domingo", text: "Cerrado" });
});
