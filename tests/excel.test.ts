import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { buildOrdersWorkbook, type ExportOrder } from "../src/lib/excel";

/** Pedido de prueba; `items` son [nombre, cantidad, precio, costo o null, opciones] en centavos. */
function order(
  number: number,
  status: ExportOrder["status"],
  createdAt: string,
  items: [name: string, quantity: number, price: number, cost: number | null, options?: string[]][],
  extra: Partial<ExportOrder> = {},
): ExportOrder {
  const subtotalCents = items.reduce((sum, [, quantity, price]) => sum + quantity * price, 0);
  const withCost = items.filter(([, , , cost]) => cost !== null);
  const deliveryCents = extra.deliveryCents ?? 0;
  const discountCents = extra.discountCents ?? 0;
  return {
    id: `id-${number}`,
    businessId: "negocio",
    number,
    status,
    customerName: `Cliente ${number}`,
    customerPhone: `300 555 010${number}`,
    deliveryMode: deliveryCents > 0 ? "domicilio" : "recoger",
    address: deliveryCents > 0 ? "Calle 1 # 2-3" : "",
    deliveryZone: "",
    deliveryFree: false,
    paymentMethod: "Efectivo",
    notes: "",
    currency: "COP",
    subtotalCents,
    deliveryCents,
    discountCents,
    couponCode: "",
    totalCents: subtotalCents - discountCents + deliveryCents,
    costCents: withCost.length ? withCost.reduce((sum, [, quantity, , cost]) => sum + quantity * (cost as number), 0) : null,
    profitCents: withCost.length
      ? withCost.reduce((sum, [, quantity, price, cost]) => sum + quantity * (price - (cost as number)), 0) - discountCents
      : null,
    publicToken: `token-${number}`,
    createdAt: new Date(createdAt),
    completedAt: null,
    items: items.map(([name, quantity, unitPriceCents, unitCostCents, options = []], index) => ({
      id: `item-${number}-${index}`,
      productId: null,
      name,
      quantity,
      unitPriceCents,
      unitCostCents,
      options: options.map((option) => ({ group: "Adiciones", name: option, priceCents: 0 })),
    })),
    ...extra,
  };
}

// Del más reciente al más antiguo, como los entrega la consulta.
const orders: ExportOrder[] = [
  // Con opciones y con cupón. Es la misma clienta del pedido #1, con el teléfono escrito de otra forma.
  order(5, "completado", "2026-10-04T02:10:00Z", [["Hamburguesa", 1, 2300000, 1090000, ["Queso extra", "Tocineta"]]], {
    discountCents: 230000,
    couponCode: "BIENVENIDO10",
    customerName: "Laura G.",
    customerPhone: "3005550101",
  }),
  order(4, "nuevo", "2026-10-04T01:30:00Z", [["Gaseosa", 1, 500000, 280000]]),
  order(3, "cancelado", "2026-10-03T18:00:00Z", [["Hamburguesa", 1, 1800000, 950000]]),
  // Un producto con costo y otro sin él: la ganancia solo cuenta el primero.
  order(2, "completado", "2026-10-02T17:45:00Z", [
    ["Hamburguesa", 2, 1800000, 950000],
    ["Postre del día", 1, 800000, null],
  ]),
  order(1, "completado", "2026-10-01T23:10:00Z", [["Papas", 3, 700000, 250000]], {
    deliveryCents: 400000,
    deliveryZone: "Centro",
    customerName: "Laura Gómez",
  }),
];

const input = {
  businessName: "El Antojo",
  currency: "COP",
  timezone: "America/Bogota",
  range: { from: "2026-10-01", to: "2026-10-03" },
  generatedAt: new Date("2026-10-04T02:00:00Z"),
  orders,
  products: [
    { category: "Hamburguesas", name: "Hamburguesa", priceCents: 1800000, costCents: 950000, isAvailable: true, stock: null },
    { category: "Postres", name: "Postre del día", priceCents: 800000, costCents: null, isAvailable: false, stock: 0 },
    { category: "Acompañamientos", name: "Papas", priceCents: 700000, costCents: 250000, isAvailable: true, stock: 12 },
  ],
};

async function open(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

const isFormula = (cell: ExcelJS.Cell) => typeof (cell.value as { formula?: string } | null)?.formula === "string";

/**
 * Valor ya calculado de una celda (el resultado, si es una fórmula).
 * Al leer el archivo, ExcelJS descarta los resultados "vacíos" de una fórmula
 * (el cero y el texto vacío), aunque en el archivo sí están guardados. Aquí
 * esos dos casos se devuelven como EMPTY.
 */
const EMPTY = "(cero o vacío)";
function valueOf(cell: ExcelJS.Cell): unknown {
  if (!isFormula(cell)) return cell.value;
  const result = (cell.value as { result?: unknown }).result;
  return result === undefined || result === 0 || result === "" ? EMPTY : result;
}

/** Fracción del día (0 a 1) de una celda de hora; ExcelJS la devuelve como fecha. */
function dayFraction(cell: ExcelJS.Cell): number {
  const value = cell.value;
  if (value instanceof Date) return (value.getUTCHours() * 3600 + value.getUTCMinutes() * 60 + value.getUTCSeconds()) / 86400;
  return Number(value);
}

/** Busca en la hoja "Resumen" la cifra que acompaña a un rótulo. */
function summaryValue(sheet: ExcelJS.Worksheet, label: string): { value: unknown; cell: ExcelJS.Cell } {
  for (let row = 1; row <= sheet.rowCount; row++) {
    if (String(sheet.getCell(`A${row}`).value ?? "").trim() === label) {
      const cell = sheet.getCell(`B${row}`);
      return { value: valueOf(cell), cell };
    }
  }
  throw new Error(`No está "${label}" en el resumen`);
}

test("Excel de un negocio: hojas, datos y totales", async () => {
  const workbook = await open(await buildOrdersWorkbook(input));
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ["Resumen", "Pedidos", "Productos vendidos", "Clientes", "Inventario"],
  );

  const sheet = workbook.getWorksheet("Pedidos") as ExcelJS.Worksheet;
  const headers = (sheet.getRow(1).values as unknown[]).slice(1);
  assert.deepEqual(headers, [
    "Nº", "Fecha", "Hora", "Estado", "Cliente", "Teléfono", "Entrega", "Zona", "Dirección o mesa", "Pago", "Productos",
    "Subtotal", "Descuento", "Cupón", "Domicilio", "Total", "Costo", "Ganancia", "Notas", "Clave del cliente",
  ]);
  assert.equal(sheet.rowCount, 6); // encabezado + 5 pedidos
  const column = (name: string) => headers.indexOf(name) + 1;
  const cell = (row: number, name: string) => sheet.getRow(row).getCell(column(name));

  // Fila 2: pedido #5, con opciones y con cupón.
  assert.equal(cell(2, "Nº").value, 5);
  assert.equal(cell(2, "Productos").value, "1 x Hamburguesa (Queso extra, Tocineta)");
  assert.equal(cell(2, "Subtotal").value, 23000);
  assert.equal(cell(2, "Descuento").value, 2300);
  assert.equal(cell(2, "Cupón").value, "BIENVENIDO10");
  assert.equal(valueOf(cell(2, "Total")), 20700); // 23.000 − 2.300
  assert.equal(valueOf(cell(2, "Ganancia")), 9800); // 23.000 − 10.900 de costo − 2.300 de descuento
  assert.equal(cell(2, "Clave del cliente").value, "tel:3005550101");

  // Fila 3: pedido #4, hecho el 3 de octubre a las 8:30 p. m. hora de Bogotá (ya era día 4 en UTC).
  assert.equal(cell(3, "Nº").value, 4);
  assert.equal((cell(3, "Fecha").value as Date).toISOString().slice(0, 10), "2026-10-03");
  assert.ok(Math.abs(dayFraction(cell(3, "Hora")) - (20 * 60 + 30) / 1440) < 1e-6);
  assert.equal(cell(3, "Estado").value, "Nuevo");
  assert.equal(valueOf(cell(3, "Ganancia")), EMPTY); // aún no se completa: no hay ganancia

  // Fila 5: pedido #2, completado, con un producto sin costo.
  assert.equal(cell(5, "Estado").value, "Completado");
  assert.equal(cell(5, "Productos").value, "2 x Hamburguesa\n1 x Postre del día");
  assert.equal(cell(5, "Subtotal").value, 44000);
  assert.equal(valueOf(cell(5, "Total")), 44000);
  assert.equal(cell(5, "Costo").value, 19000);
  assert.equal(valueOf(cell(5, "Ganancia")), 17000); // (18.000 − 9.500) × 2; el postre no cuenta
  assert.ok(isFormula(cell(5, "Total")) && isFormula(cell(5, "Ganancia")));

  // Fila 6: pedido #1, a domicilio.
  assert.equal(cell(6, "Zona").value, "Centro");
  assert.equal(cell(6, "Domicilio").value, 4000);
  assert.equal(valueOf(cell(6, "Total")), 25000);
  assert.equal(valueOf(cell(6, "Ganancia")), 13500);
  assert.equal(cell(6, "Clave del cliente").value, "tel:3005550101");

  // Fila 4: cancelado. Tenía costo, pero no cuenta como ganancia.
  assert.equal(valueOf(cell(4, "Ganancia")), EMPTY);

  const summary = workbook.getWorksheet("Resumen") as ExcelJS.Worksheet;
  assert.equal(summary.getCell("A1").value, "Pedidos · El Antojo");
  assert.equal(summary.getCell("B2").value, "1 oct 2026 a 3 oct 2026");
  assert.equal(summaryValue(summary, "Pedidos en el período").value, 5);
  assert.equal(summaryValue(summary, "Completados").value, 3);
  assert.equal(summaryValue(summary, "Listo / en camino").value, EMPTY);
  assert.equal(summaryValue(summary, "Cancelados").value, 1);
  assert.equal(summaryValue(summary, "Nuevos (sin atender)").value, 1);
  assert.equal(summaryValue(summary, "Clientes distintos").value, 3);
  assert.equal(summaryValue(summary, "Ventas de pedidos completados").value, 89700);
  assert.equal(summaryValue(summary, "En productos").value, 88000);
  assert.equal(summaryValue(summary, "Descuentos por cupones").value, 2300);
  assert.equal(summaryValue(summary, "En domicilios").value, 4000);
  assert.equal(summaryValue(summary, "Pedido promedio").value, 29900);
  assert.equal(summaryValue(summary, "Costo de lo vendido").value, 37400);
  assert.equal(summaryValue(summary, "Ganancia estimada").value, 40300);
  // Los totales son fórmulas: si alguien corrige un dato en Excel, se recalculan.
  for (const label of ["Completados", "Ventas de pedidos completados", "Pedido promedio", "Ganancia estimada"]) {
    assert.ok(isFormula(summaryValue(summary, label).cell), `${label} debe ser una fórmula`);
  }
  // El promedio se calcula con las celdas de "ventas" y "completados", estén en la fila que estén.
  const average = summaryValue(summary, "Pedido promedio").cell.value as { formula: string };
  const cellOfLabel = (label: string) => summaryValue(summary, label).cell.address;
  assert.equal(
    average.formula,
    `IF(${cellOfLabel("Completados")}=0,0,${cellOfLabel("Ventas de pedidos completados")}/${cellOfLabel("Completados")})`,
  );

  const items = workbook.getWorksheet("Productos vendidos") as ExcelJS.Worksheet;
  assert.equal(items.rowCount, 7); // encabezado + 6 productos vendidos
  const itemHeaders = (items.getRow(1).values as unknown[]).slice(1);
  const itemCell = (row: number, name: string) => items.getRow(row).getCell(itemHeaders.indexOf(name) + 1);
  assert.equal(itemCell(2, "Opciones").value, "Queso extra, Tocineta");
  assert.equal(valueOf(itemCell(2, "Ganancia")), 12100); // por renglón, antes del descuento del pedido
  assert.equal(itemCell(5, "Producto").value, "Hamburguesa"); // primer producto del pedido #2
  assert.equal(valueOf(itemCell(5, "Total")), 36000);
  assert.equal(valueOf(itemCell(5, "Costo total")), 19000);
  assert.equal(valueOf(itemCell(5, "Ganancia")), 17000);
  assert.equal(valueOf(itemCell(6, "Ganancia")), EMPTY); // el postre no tenía costo

  // Clientes: los pedidos #5 y #1 son de la misma persona, aunque el teléfono se escribió distinto.
  const customers = workbook.getWorksheet("Clientes") as ExcelJS.Worksheet;
  assert.deepEqual((customers.getRow(1).values as unknown[]).slice(1), [
    "Cliente", "Teléfono", "Pedidos", "Completados", "Compras", "Último pedido", "Clave del cliente",
  ]);
  assert.equal(customers.rowCount, 4); // encabezado + 3 clientes
  // Primero quien más ha comprado, con el nombre de su pedido más reciente.
  assert.equal(customers.getCell("A2").value, "Laura G.");
  assert.equal(valueOf(customers.getCell("C2")), 2);
  assert.equal(valueOf(customers.getCell("D2")), 2);
  assert.equal(valueOf(customers.getCell("E2")), 45700); // 20.700 + 25.000
  const lastDay = valueOf(customers.getCell("F2"));
  const serial = Math.round((Date.UTC(2026, 9, 3) - Date.UTC(1899, 11, 30)) / 86_400_000);
  assert.ok(lastDay instanceof Date ? lastDay.toISOString().startsWith("2026-10-03") : lastDay === serial, String(lastDay));
  assert.equal(customers.getCell("G2").value, "tel:3005550101");
  assert.equal(customers.getCell("A3").value, "Cliente 2");
  assert.equal(valueOf(customers.getCell("E3")), 44000);
  // Un pedido sin completar cuenta como pedido, pero no como compra.
  assert.equal(customers.getCell("A4").value, "Cliente 4");
  assert.deepEqual([valueOf(customers.getCell("C4")), valueOf(customers.getCell("E4"))], [1, EMPTY]);
  // Quien solo tiene un pedido cancelado (el #3) no aparece como cliente.
  assert.equal(customers.getCell("A5").value, null);

  const inventory = workbook.getWorksheet("Inventario") as ExcelJS.Worksheet;
  assert.equal(inventory.rowCount, 4);
  assert.deepEqual((inventory.getRow(1).values as unknown[]).slice(1, 5), ["Categoría", "Producto", "Precio", "Costo"]);
  assert.equal(valueOf(inventory.getCell("E2")), 8500); // ganancia por unidad de la hamburguesa
  assert.equal(inventory.getCell("G3").value, "No"); // el postre no está disponible
  assert.equal(inventory.getCell("H4").value, 12); // existencias de las papas
  assert.equal(valueOf(inventory.getCell("I4")), 30000); // 12 unidades × 2.500 de costo
});

test("Excel sin pedidos: se genera igual, con los totales en cero", async () => {
  const workbook = await open(await buildOrdersWorkbook({ ...input, orders: [], products: undefined }));
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ["Resumen", "Pedidos", "Productos vendidos", "Clientes"],
  );
  const summary = workbook.getWorksheet("Resumen") as ExcelJS.Worksheet;
  assert.equal(summaryValue(summary, "Pedidos en el período").value, EMPTY);
  assert.equal(summaryValue(summary, "Clientes distintos").value, EMPTY);
  assert.equal(summaryValue(summary, "Pedido promedio").value, EMPTY);
});

test("Excel del servicio: columnas de negocio y resumen por comercio", async () => {
  const mixed: ExportOrder[] = [
    { ...orders[2], businessName: "La Esquina", timezone: "Europe/Madrid", currency: "EUR" },
    { ...orders[3], businessName: "El Antojo" },
    { ...orders[4], businessName: "El Antojo" },
  ];
  const workbook = await open(
    await buildOrdersWorkbook({
      ...input,
      businessName: "Todos los comercios",
      currency: "",
      allBusinesses: true,
      products: undefined,
      orders: mixed,
      totalInRange: 9000,
    }),
  );
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ["Resumen", "Pedidos", "Productos vendidos", "Por negocio"],
  );

  const sheet = workbook.getWorksheet("Pedidos") as ExcelJS.Worksheet;
  assert.deepEqual((sheet.getRow(1).values as unknown[]).slice(1, 4), ["Negocio", "Moneda", "Nº"]);
  assert.equal(sheet.getCell("A2").value, "La Esquina");
  assert.equal(sheet.getCell("B2").value, "EUR");
  // La hora es la del reloj de cada comercio: 18:00 UTC son las 8:00 p. m. en Madrid.
  assert.ok(Math.abs(dayFraction(sheet.getCell("E2")) - 20 / 24) < 1e-6);

  const perBusiness = workbook.getWorksheet("Por negocio") as ExcelJS.Worksheet;
  assert.equal(perBusiness.getCell("A2").value, "El Antojo");
  assert.equal(valueOf(perBusiness.getCell("C2")), 2); // pedidos
  assert.equal(valueOf(perBusiness.getCell("D2")), 2); // completados
  assert.equal(valueOf(perBusiness.getCell("E2")), 69000);
  assert.equal(perBusiness.getCell("A3").value, "La Esquina");
  assert.equal(valueOf(perBusiness.getCell("E3")), EMPTY); // su único pedido fue cancelado

  // Con más pedidos de los que caben, el resumen lo avisa.
  const summary = workbook.getWorksheet("Resumen") as ExcelJS.Worksheet;
  assert.match(String(summaryValue(summary, "Aviso").value), /9000 pedidos/);
});
