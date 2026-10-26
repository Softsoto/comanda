import assert from "node:assert/strict";
import { test } from "node:test";
import { centsToInput, formatCompactMoney, formatMoney, parsePriceToCents, roundToCurrency } from "../src/lib/money";

const NBSP = " ";

test("formatMoney: pesos colombianos sin decimales innecesarios", () => {
  assert.equal(formatMoney(3600000, "COP"), `$${NBSP}36.000`);
  assert.equal(formatMoney(0, "COP"), `$${NBSP}0`);
  assert.equal(formatMoney(125000000, "COP"), `$${NBSP}1.250.000`);
  assert.equal(formatMoney(3600050, "COP"), `$${NBSP}36.000,50`);
});

test("formatMoney: otras monedas", () => {
  assert.equal(formatMoney(1250, "USD"), "$12.50");
  assert.equal(formatMoney(3200000, "USD"), "$32,000.00");
  assert.equal(formatMoney(45000, "DOP"), "RD$450.00");
  assert.equal(formatMoney(2590, "PEN"), `S/${NBSP}25.90`);
  assert.equal(formatMoney(650000, "CLP"), "$6.500");
  assert.equal(formatMoney(1250, "EUR"), `12,50${NBSP}€`);
  assert.equal(formatMoney(-500, "USD"), "-$5.00");
});

test("formatMoney: moneda desconocida usa su código", () => {
  assert.equal(formatMoney(1000, "XYZ"), `XYZ${NBSP}10.00`);
});

test("parsePriceToCents: enteros y separadores de miles", () => {
  assert.equal(parsePriceToCents("36000"), 3600000);
  assert.equal(parsePriceToCents("36.000"), 3600000);
  assert.equal(parsePriceToCents("36,000"), 3600000);
  assert.equal(parsePriceToCents("1.250.000"), 125000000);
  assert.equal(parsePriceToCents("$ 18.000"), 1800000);
  assert.equal(parsePriceToCents(" 7000 "), 700000);
});

test("parsePriceToCents: decimales", () => {
  assert.equal(parsePriceToCents("12.50"), 1250);
  assert.equal(parsePriceToCents("12,5"), 1250);
  assert.equal(parsePriceToCents("1.500,50"), 150050);
  assert.equal(parsePriceToCents("1,500.50"), 150050);
  assert.equal(parsePriceToCents("0.99"), 99);
  assert.equal(parsePriceToCents(".5"), 50);
  assert.equal(parsePriceToCents("12."), 1200);
  assert.equal(parsePriceToCents("0"), 0);
});

test("parsePriceToCents: entradas que no son un precio", () => {
  for (const bad of ["", "abc", ",", "1.25.000", "12.3456", "0.500", "1.500,5000", "999999999999"]) {
    assert.equal(parsePriceToCents(bad), null, `"${bad}" debería rechazarse`);
  }
});

test("centsToInput es el inverso de parsePriceToCents", () => {
  for (const cents of [0, 99, 1250, 3600000, 125000000]) {
    assert.equal(parsePriceToCents(centsToInput(cents)), cents);
  }
  assert.equal(centsToInput(3600000), "36000");
  assert.equal(centsToInput(1250), "12.50");
});

test("formatCompactMoney: cifras cortas para las gráficas", () => {
  assert.equal(formatCompactMoney(0, "COP"), `$${NBSP}0`);
  assert.equal(formatCompactMoney(95000, "COP"), `$${NBSP}950`);
  assert.equal(formatCompactMoney(500000, "COP"), `$${NBSP}5.000`);
  assert.equal(formatCompactMoney(5000000, "COP"), `$${NBSP}50${NBSP}mil`);
  assert.equal(formatCompactMoney(1250000, "COP"), `$${NBSP}12,5${NBSP}mil`);
  assert.equal(formatCompactMoney(15000000, "COP"), `$${NBSP}150${NBSP}mil`);
  assert.equal(formatCompactMoney(125000000, "COP"), `$${NBSP}1,25${NBSP}M`);
  assert.equal(formatCompactMoney(2000000000, "COP"), `$${NBSP}20${NBSP}M`);
  // Justo por debajo del millón se redondea a "1 M", nunca a "1000 mil".
  assert.equal(formatCompactMoney(99990000, "COP"), `$${NBSP}1${NBSP}M`);
  // Monedas con centavos y con el símbolo al final.
  assert.equal(formatCompactMoney(2000, "USD"), "$20");
  assert.equal(formatCompactMoney(4250, "USD"), "$42.50");
  assert.equal(formatCompactMoney(1250000, "USD"), `$12.5${NBSP}mil`);
  assert.equal(formatCompactMoney(1500000, "EUR"), `15${NBSP}mil${NBSP}€`);
});

test("roundToCurrency: los promedios se redondean a lo que existe en cada moneda", () => {
  assert.equal(roundToCurrency(6066666.67, "COP"), 6066700); // pesos enteros
  assert.equal(roundToCurrency(6066649, "COP"), 6066600);
  assert.equal(roundToCurrency(1234.4, "USD"), 1234); // centavos
});
