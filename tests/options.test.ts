import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePriceToCents } from "../src/lib/money";
import {
  checkSelection,
  lineKey,
  optionsSummary,
  parseChosen,
  parseOptions,
  priceRange,
  serializeOptions,
  validateOptionDrafts,
  type OptionGroup,
} from "../src/lib/options";

const size: OptionGroup = {
  id: "tamano1",
  name: "Tamaño",
  min: 1,
  max: 1,
  choices: [
    { id: "mediana1", name: "Mediana", priceCents: 0, costCents: null, available: true },
    { id: "grande01", name: "Grande", priceCents: 300000, costCents: 100000, available: true },
    { id: "gigante1", name: "Gigante", priceCents: 600000, costCents: 200000, available: false },
  ],
};
const extras: OptionGroup = {
  id: "extras01",
  name: "Adiciones",
  min: 0,
  max: 2,
  choices: [
    { id: "queso001", name: "Queso extra", priceCents: 200000, costCents: 80000, available: true },
    { id: "tocineta", name: "Tocineta", priceCents: 300000, costCents: 140000, available: true },
    { id: "huevo001", name: "Huevo frito", priceCents: 200000, costCents: null, available: true },
  ],
};
const groups = [size, extras];

test("opciones guardadas: ida y vuelta, y lo dañado se descarta sin fallar", () => {
  assert.equal(serializeOptions([]), "");
  assert.deepEqual(parseOptions(serializeOptions(groups)), groups);
  assert.deepEqual(parseOptions(""), []);
  assert.deepEqual(parseOptions(null), []);
  assert.deepEqual(parseOptions("{no es json"), []);
  assert.deepEqual(parseOptions('{"id":"x"}'), []);
  // Un grupo sin opciones válidas no se conserva; el máximo nunca supera las opciones que hay.
  const odd = JSON.stringify([
    { id: "vacio001", name: "Vacío", min: 0, max: 1, choices: [] },
    { id: "sabor001", name: "  Sabor  ", min: 5, max: 9, choices: [{ id: "cola0001", name: "Cola", priceCents: -5 }, { id: "x", name: "id malo" }] },
  ]);
  assert.deepEqual(parseOptions(odd), [
    { id: "sabor001", name: "Sabor", min: 1, max: 1, choices: [{ id: "cola0001", name: "Cola", priceCents: 0, costCents: null, available: true }] },
  ]);
});

test("lo que elige el cliente: mínimos, máximos, disponibilidad y precio", () => {
  const ok = checkSelection(groups, ["tocineta", "grande01", "queso001"]);
  assert.ok(ok.ok);
  if (ok.ok) {
    // Las opciones quedan en el orden del menú, sin importar el orden en que se marcaron.
    assert.deepEqual(ok.choiceIds, ["grande01", "queso001", "tocineta"]);
    assert.deepEqual(ok.chosen.map((option) => `${option.group}: ${option.name}`), [
      "Tamaño: Grande",
      "Adiciones: Queso extra",
      "Adiciones: Tocineta",
    ]);
    assert.equal(ok.extraCents, 800000);
    assert.equal(ok.extraCostCents, 320000);
    assert.equal(optionsSummary(ok.chosen), "Grande, Queso extra, Tocineta");
  }
  // Una opción sin costo registrado cuenta como costo cero.
  const noCost = checkSelection(groups, ["mediana1", "huevo001"]);
  assert.ok(noCost.ok && noCost.extraCostCents === 0 && noCost.extraCents === 200000);

  const message = (ids: string[]) => {
    const result = checkSelection(groups, ids);
    return result.ok ? "" : result.message;
  };
  assert.match(message([]), /Elige una opción de “Tamaño”/);
  assert.match(message(["mediana1", "grande01"]), /solo puedes elegir una/);
  assert.match(message(["mediana1", "queso001", "tocineta", "huevo001"]), /máximo 2 opciones/);
  assert.match(message(["gigante1"]), /ya no está disponible/);
  assert.match(message(["mediana1", "noexiste"]), /ya no existe/);
  // Un producto sin opciones solo acepta una selección vacía.
  assert.ok(checkSelection([], []).ok);
  assert.ok(!checkSelection([], ["mediana1"]).ok);
});

test("precio desde: el base más lo mínimo obligatorio", () => {
  // Un tamaño obligatorio que cambia el precio: se anuncia "desde" el más barato disponible.
  assert.deepEqual(priceRange(700000, groups), { fromCents: 700000, varies: true });
  // Solo adicionales opcionales: el producto se puede pedir tal cual, así que no hay "desde".
  assert.deepEqual(priceRange(1800000, [extras]), { fromCents: 1800000, varies: false });
  // Si todas las opciones obligatorias cuestan, el "desde" ya las incluye (y no cuenta las agotadas).
  const paid = [{ min: 1, choices: [{ priceCents: 500000, available: false }, { priceCents: 300000, available: true }, { priceCents: 400000, available: true }] }];
  assert.deepEqual(priceRange(1000000, paid), { fromCents: 1300000, varies: true });
  // Una elección obligatoria que cuesta siempre lo mismo se suma, pero no es "desde".
  const fixed = [{ min: 1, choices: [{ priceCents: 200000, available: true }, { priceCents: 200000, available: true }] }];
  assert.deepEqual(priceRange(1000000, fixed), { fromCents: 1200000, varies: false });
  // Opciones que no cambian el precio: no se anuncia "desde".
  const flavors = [{ min: 1, choices: [{ priceCents: 0, available: true }, { priceCents: 0, available: true }] }];
  assert.deepEqual(priceRange(500000, flavors), { fromCents: 500000, varies: false });
  assert.deepEqual(priceRange(500000, []), { fromCents: 500000, varies: false });
});

test("renglones del carrito y opciones guardadas en el pedido", () => {
  assert.equal(lineKey("producto", []), "producto");
  assert.equal(lineKey("producto", ["b", "a"]), lineKey("producto", ["a", "b"]));
  assert.notEqual(lineKey("producto", ["a"]), lineKey("producto", ["b"]));
  assert.deepEqual(parseChosen('[{"group":"Tamaño","name":"Grande","priceCents":300000}]'), [
    { group: "Tamaño", name: "Grande", priceCents: 300000 },
  ]);
  assert.deepEqual(parseChosen(""), []);
  assert.deepEqual(parseChosen("no es json"), []);
});

test("opciones escritas en el panel: se revisan y se convierten a centavos", () => {
  let next = 0;
  const newId = () => `nuevo${String((next += 1)).padStart(3, "0")}`;
  const check = (raw: unknown) => validateOptionDrafts(raw, parsePriceToCents, newId);

  const result = check([
    {
      id: "tamano1",
      name: " Tamaño ",
      min: 1,
      max: 1,
      choices: [
        { id: "mediana1", name: "Mediana", price: "", cost: "" },
        { name: "Grande", price: "3.000", cost: "1000", available: false },
        { name: "   ", price: "999" }, // renglón sin nombre: se ignora
      ],
    },
    { name: "", choices: [{ name: "" }] }, // grupo vacío del todo: se ignora
    { name: "Adiciones", min: 0, max: 99, choices: [{ name: "Queso" , price: "2000" }, { name: "Tocineta", price: "3000" }] },
  ]);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.groups.length, 2);
    const [first, second] = result.groups;
    // Los identificadores existentes se conservan (así los carritos guardados siguen sirviendo); los nuevos se generan.
    assert.equal(first.id, "tamano1");
    assert.deepEqual(first.choices, [
      { id: "mediana1", name: "Mediana", priceCents: 0, costCents: null, available: true },
      { id: "nuevo001", name: "Grande", priceCents: 300000, costCents: 100000, available: false },
    ]);
    // "Todas las que quiera": el máximo queda en el número de opciones.
    assert.deepEqual([second.name, second.min, second.max], ["Adiciones", 0, 2]);
    assert.match(second.id, /^nuevo/);
  }

  const message = (raw: unknown) => {
    const outcome = check(raw);
    return outcome.ok ? "" : outcome.message;
  };
  assert.deepEqual(check(""), { ok: true, groups: [] });
  assert.deepEqual(check([]), { ok: true, groups: [] });
  assert.match(message("texto"), /No se pudieron leer/);
  assert.match(message([{ name: "", choices: [{ name: "Grande" }] }]), /Ponle nombre/);
  assert.match(message([{ name: "Tamaño", choices: [] }]), /al menos una opción/);
  assert.match(message([{ name: "Tamaño", choices: [{ name: "Grande" }, { name: "grande" }] }]), /repetida/);
  assert.match(message([{ name: "Tamaño", choices: [{ name: "Grande", price: "caro" }] }]), /precio de “Grande”/);
  assert.match(message([{ name: "Tamaño", choices: [{ name: "Grande", cost: "x" }] }]), /costo de “Grande”/);
  assert.match(message(Array.from({ length: 9 }, () => ({ name: "G", choices: [{ name: "x" }] }))), /máximo 8 grupos/);
});
