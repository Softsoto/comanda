import assert from "node:assert/strict";
import { test } from "node:test";
import { CODE_LIMITS, EXAMPLE_CODES, cleanCodes, codeKey, findCode, normalizeCode } from "../src/lib/game-codes";

test("códigos: se comparan sin importar mayúsculas, tildes ni signos", () => {
  assert.equal(normalizeCode("  Dos lunas! "), "DOSLUNAS");
  assert.equal(normalizeCode("niña-2026"), "NINA-2026");
  assert.equal(normalizeCode("Canción"), "CANCION");
  assert.equal(normalizeCode(7), "");
  assert.equal(normalizeCode("x".repeat(40)).length, CODE_LIMITS.code);
});

test("códigos: solo quedan los completos, sin repetidos", () => {
  const list = cleanCodes([
    { code: "hola", title: "Hola", text: ["Un saludo"], active: true },
    { code: "HOLA", title: "Otro", text: ["Repetido"] },
    { code: "ab", title: "Corto", text: ["x"] },
    { code: "SIN-TEXTO", title: "Nada", text: [] },
    { code: "SIN-TITULO", title: "", text: ["x"] },
    { code: "apagado", title: "Apagado", text: "Un solo párrafo", active: false },
    null,
  ]);
  assert.deepEqual(
    list.map((item) => [item.code, item.active, item.text.length]),
    [
      ["HOLA", true, 1],
      ["APAGADO", false, 1],
    ],
  );
  assert.deepEqual(cleanCodes("nada"), []);
});

test("códigos: se encuentra el activo, nunca el apagado", () => {
  const list = cleanCodes([
    { code: "LUNA", title: "Luna", text: ["Hola"] },
    { code: "SOL", title: "Sol", text: ["Hola"], active: false },
  ]);
  assert.equal(findCode(list, "luna")?.title, "Luna");
  assert.equal(findCode(list, "SOL"), undefined);
  assert.equal(findCode(list, ""), undefined);
  assert.equal(findCode(EXAMPLE_CODES, "dos lunas")?.code, "DOSLUNAS");
});

test("códigos: los guiones y espacios no cuentan al comparar", () => {
  const list = cleanCodes([
    { code: "PRUEBA-2026", title: "Prueba", text: ["Hola"] },
    { code: "prueba2026", title: "Repetido sin guion", text: ["Hola"] },
  ]);
  assert.equal(list.length, 1);
  assert.equal(codeKey("Prueba - 2026"), "PRUEBA2026");
  assert.equal(findCode(list, "prueba 2026")?.code, "PRUEBA-2026");
  assert.equal(findCode(list, "PRUEBA2026")?.code, "PRUEBA-2026");
  assert.equal(findCode(list, "---"), undefined);
});
