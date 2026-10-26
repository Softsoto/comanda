import ExcelJS from "exceljs";
import { formatDateTime, formatDay, partsIn, type DateRange } from "./dates";
import { getCurrency } from "./money";
import { optionsSummary } from "./options";
import { deliveryLabel, statusLabel, type OrderStatus } from "./orders";
import type { OrderWithItems } from "./orders-data";

/**
 * Construye el archivo de Excel de pedidos.
 *
 * Los totales se escriben como fórmulas (SUMIFS, COUNTIF…) junto con su
 * resultado ya calculado: así el archivo se ve bien en cualquier visor y, si
 * alguien corrige un dato en Excel, los totales se actualizan solos.
 */

/** En la exportación de todos los comercios cada pedido lleva el nombre y la zona horaria de su negocio. */
export type ExportOrder = OrderWithItems & { businessName?: string; timezone?: string };

export type ExportProduct = {
  category: string;
  name: string;
  priceCents: number;
  costCents: number | null;
  isAvailable: boolean;
  stock: number | null;
};

export type ExportInput = {
  /** Nombre del negocio, o "Todos los comercios" en la exportación del servicio. */
  businessName: string;
  currency: string;
  timezone: string;
  range: DateRange;
  status?: OrderStatus;
  generatedAt: Date;
  /** Del más reciente al más antiguo. */
  orders: ExportOrder[];
  /** Inventario actual. Si no se pasa, no se crea esa hoja. */
  products?: ExportProduct[];
  /** Exportación de todos los comercios: añade columnas de negocio y moneda. */
  allBusinesses?: boolean;
  /** Si el período tenía más pedidos de los que caben en el archivo, cuántos había en total. */
  totalInRange?: number;
};

const FONT = "Arial";
const HEADER_FILL = "FF0E7A4B";
const COMPLETED = statusLabel("completado");
const CANCELLED = statusLabel("cancelado");

/** Día como número de serie de Excel (los días contados desde el 30 de diciembre de 1899). */
const excelDay = (date: Date) => Math.round((date.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000);

/**
 * Clave que identifica a un cliente: su teléfono reducido a las cifras, con un
 * prefijo de texto. El prefijo evita que Excel la trate como un número (y
 * confunda, por ejemplo, teléfonos que solo se diferencian en un cero inicial).
 */
const customerKey = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits ? `tel:${digits}` : "";
};

/** Letra de columna de Excel: 1 → A, 27 → AA. */
function letter(index: number): string {
  let name = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** Formato de número para dinero en la moneda del negocio: positivo; negativo; cero como guion. */
function moneyFormat(currencyCode: string | null): string {
  if (!currencyCode) return '#,##0.00;-#,##0.00;"-"';
  const currency = getCurrency(currencyCode);
  const number = currency.decimals === 0 ? "#,##0" : "#,##0.00";
  const symbol = `"${currency.symbol}"`;
  const one = currency.symbolAfter ? `${number} ${symbol}` : `${symbol} ${number}`;
  return `${one};-${one};"-"`;
}

const units = (cents: number) => cents / 100;
const round2 = (value: number) => Math.round(value * 100) / 100;

type Column = {
  header: string;
  width: number;
  numFmt?: string;
  wrap?: boolean;
  align?: "left" | "right" | "center";
  /** Sangría, para separar un texto de la cifra de la columna anterior. */
  indent?: number;
};

function setupSheet(sheet: ExcelJS.Worksheet, columns: Column[], rowCount: number) {
  sheet.columns = columns.map((column) => ({ width: column.width }));
  const header = sheet.getRow(1);
  columns.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: column.align ?? "left", wrapText: true, indent: column.indent };
  });
  header.height = 22;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rowCount + 1), column: columns.length } };
  return (rowIndex: number, values: (ExcelJS.CellValue | undefined)[]) => {
    const row = sheet.getRow(rowIndex);
    columns.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      const value = values[index];
      if (value !== undefined && value !== null) cell.value = value;
      cell.font = { name: FONT, size: 10 };
      if (column.numFmt) cell.numFmt = column.numFmt;
      cell.alignment = {
        vertical: "top",
        horizontal: column.align ?? "left",
        wrapText: Boolean(column.wrap),
        indent: column.indent,
      };
    });
  };
}

/** Celda con fórmula y su resultado ya calculado (para visores que no calculan). */
const formula = (text: string, result: number | string): ExcelJS.CellFormulaValue => ({ formula: text, result });

/**
 * Ganancia de un pedido: venta menos costo de los productos que tenían costo
 * registrado, menos el descuento del cupón. Solo cuenta si el pedido se completó.
 */
function orderProfit(order: ExportOrder): number | "" {
  if (order.status !== "completado" || order.profitCents === null) return "";
  return round2(units(order.profitCents));
}

export async function buildOrdersWorkbook(input: ExportInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Comanda";
  workbook.created = input.generatedAt;
  workbook.calcProperties.fullCalcOnLoad = true;

  const money = moneyFormat(input.allBusinesses ? null : input.currency);
  const { orders } = input;

  // Las hojas se crean en el orden en que se verán; "Resumen" se rellena al final.
  const summary = workbook.addWorksheet("Resumen");
  const ordersSheet = workbook.addWorksheet("Pedidos");
  const itemsSheet = workbook.addWorksheet("Productos vendidos");
  // Los clientes se agrupan por teléfono, y eso solo tiene sentido dentro de un mismo negocio.
  const customersSheet = input.allBusinesses ? null : workbook.addWorksheet("Clientes");

  /* ---------- Hoja "Pedidos": una fila por pedido ---------- */

  const extra: Column[] = input.allBusinesses
    ? [
        { header: "Negocio", width: 24 },
        { header: "Moneda", width: 9 },
      ]
    : [];
  const orderColumns: Column[] = [
    ...extra,
    { header: "Nº", width: 8, align: "center" },
    { header: "Fecha", width: 12, numFmt: "dd/mm/yyyy" },
    { header: "Hora", width: 11, numFmt: "h:mm AM/PM" },
    { header: "Estado", width: 16 },
    { header: "Cliente", width: 24 },
    { header: "Teléfono", width: 16 },
    { header: "Entrega", width: 14 },
    { header: "Zona", width: 16 },
    { header: "Dirección o mesa", width: 30, wrap: true },
    { header: "Pago", width: 16 },
    { header: "Productos", width: 48, wrap: true },
    { header: "Subtotal", width: 14, numFmt: money, align: "right" },
    { header: "Descuento", width: 13, numFmt: money, align: "right" },
    { header: "Cupón", width: 16, indent: 1 },
    { header: "Domicilio", width: 13, numFmt: money, align: "right" },
    { header: "Total", width: 14, numFmt: money, align: "right" },
    { header: "Costo", width: 14, numFmt: money, align: "right" },
    { header: "Ganancia", width: 14, numFmt: money, align: "right" },
    { header: "Notas", width: 32, wrap: true, indent: 1 },
    // Con esta clave la hoja "Clientes" junta los pedidos de un mismo teléfono, aunque se haya escrito distinto.
    ...(input.allBusinesses ? [] : [{ header: "Clave del cliente", width: 20 } as Column]),
  ];
  const itemColumns: Column[] = [
    ...extra,
    { header: "Nº pedido", width: 10, align: "center" },
    { header: "Fecha", width: 12, numFmt: "dd/mm/yyyy" },
    { header: "Estado", width: 16 },
    { header: "Producto", width: 36, wrap: true },
    { header: "Opciones", width: 30, wrap: true },
    { header: "Cantidad", width: 10, align: "right" },
    { header: "Precio unitario", width: 15, numFmt: money, align: "right" },
    { header: "Total", width: 14, numFmt: money, align: "right" },
    { header: "Costo unitario", width: 15, numFmt: money, align: "right" },
    { header: "Costo total", width: 14, numFmt: money, align: "right" },
    { header: "Ganancia", width: 14, numFmt: money, align: "right" },
  ];
  const ic = (header: string) => letter(itemColumns.findIndex((column) => column.header === header) + 1);
  const itemCount = orders.reduce((sum, order) => sum + order.items.length, 0);
  const lastItem = Math.max(2, itemCount + 1);
  const itemRange = (header: string) => `'Productos vendidos'!$${ic(header)}$2:$${ic(header)}$${lastItem}`;

  const oc = (header: string) => letter(orderColumns.findIndex((column) => column.header === header) + 1);
  const writeOrder = setupSheet(ordersSheet, orderColumns, orders.length);

  orders.forEach((order, index) => {
    const row = index + 2;
    // Fecha y hora en el reloj del negocio (o del comercio dueño del pedido, en la exportación general).
    const parts = partsIn(order.createdAt, order.timezone ?? input.timezone);
    const dateOnly = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    const timeOnly = (parts.hour * 3600 + parts.minute * 60 + parts.second) / 86400;
    writeOrder(row, [
      ...(input.allBusinesses ? [order.businessName ?? "", order.currency] : []),
      order.number,
      dateOnly,
      timeOnly,
      statusLabel(order.status),
      order.customerName,
      order.customerPhone,
      deliveryLabel(order.deliveryMode),
      order.deliveryZone,
      order.address,
      order.paymentMethod,
      order.items
        .map((item) => {
          const options = optionsSummary(item.options);
          return `${item.quantity} x ${item.name}${options ? ` (${options})` : ""}`;
        })
        .join("\n"),
      units(order.subtotalCents),
      units(order.discountCents),
      order.couponCode,
      units(order.deliveryCents),
      formula(
        `${oc("Subtotal")}${row}-${oc("Descuento")}${row}+${oc("Domicilio")}${row}`,
        units(order.totalCents),
      ),
      order.costCents === null ? undefined : units(order.costCents),
      // La ganancia del pedido es la suma de la de sus productos (hoja "Productos vendidos") menos el descuento.
      // Con varios comercios el número de pedido se repite, así que ahí va el valor ya calculado.
      input.allBusinesses
        ? orderProfit(order) === ""
          ? undefined
          : orderProfit(order)
        : formula(
            `IF(OR(${oc("Costo")}${row}="",${oc("Estado")}${row}<>"${COMPLETED}"),"",SUMIFS(${itemRange("Ganancia")},${itemRange("Nº pedido")},${oc("Nº")}${row})-${oc("Descuento")}${row})`,
            orderProfit(order),
          ),
      order.notes,
      ...(input.allBusinesses ? [] : [customerKey(order.customerPhone)]),
    ]);
  });

  /* ---------- Hoja "Productos vendidos": una fila por producto de cada pedido ---------- */

  const writeItem = setupSheet(itemsSheet, itemColumns, itemCount);

  let itemRow = 2;
  for (const order of orders) {
    const parts = partsIn(order.createdAt, order.timezone ?? input.timezone);
    const dateOnly = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    for (const item of order.items) {
      const row = itemRow++;
      const total = units(item.unitPriceCents * item.quantity);
      const cost = item.unitCostCents === null ? null : units(item.unitCostCents * item.quantity);
      writeItem(row, [
        ...(input.allBusinesses ? [order.businessName ?? "", order.currency] : []),
        order.number,
        dateOnly,
        statusLabel(order.status),
        item.name,
        optionsSummary(item.options),
        item.quantity,
        units(item.unitPriceCents),
        formula(`${ic("Cantidad")}${row}*${ic("Precio unitario")}${row}`, total),
        item.unitCostCents === null ? undefined : units(item.unitCostCents),
        formula(
          `IF(${ic("Costo unitario")}${row}="","",${ic("Cantidad")}${row}*${ic("Costo unitario")}${row})`,
          cost === null ? "" : cost,
        ),
        formula(
          `IF(OR(${ic("Costo unitario")}${row}="",${ic("Estado")}${row}<>"${COMPLETED}"),"",${ic("Total")}${row}-${ic("Costo total")}${row})`,
          cost === null || order.status !== "completado" ? "" : round2(total - cost),
        ),
      ]);
    }
  }

  /* ---------- Hoja "Clientes": los pedidos agrupados por teléfono ---------- */

  const lastOrder = Math.max(2, orders.length + 1);
  const range = (header: string) => `Pedidos!$${oc(header)}$2:$${oc(header)}$${lastOrder}`;

  type CustomerRow = { key: string; name: string; phone: string; orders: number; completed: number; spent: number; lastDay: number };
  const customers = new Map<string, CustomerRow>();
  for (const order of orders) {
    const key = customerKey(order.customerPhone);
    if (!key) continue;
    const parts = partsIn(order.createdAt, order.timezone ?? input.timezone);
    const day = excelDay(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
    // Los pedidos llegan del más reciente al más antiguo: el primero de cada cliente trae su nombre actual.
    const row = customers.get(key) ?? { key, name: order.customerName, phone: order.customerPhone, orders: 0, completed: 0, spent: 0, lastDay: 0 };
    if (order.status !== "cancelado") row.orders += 1;
    if (order.status === "completado") {
      row.completed += 1;
      row.spent = round2(row.spent + units(order.totalCents));
    }
    row.lastDay = Math.max(row.lastDay, day);
    customers.set(key, row);
  }
  // Primero los que más han comprado. Quien solo tiene pedidos cancelados no cuenta como cliente.
  const customerRows = [...customers.values()].filter((customer) => customer.orders > 0).sort((a, b) => b.spent - a.spent || b.orders - a.orders || a.name.localeCompare(b.name, "es"));
  const lastCustomer = Math.max(2, customerRows.length + 1);

  if (customersSheet) {
    const customerColumns: Column[] = [
      { header: "Cliente", width: 28 },
      { header: "Teléfono", width: 18 },
      { header: "Pedidos", width: 10, numFmt: "#,##0", align: "right" },
      { header: "Completados", width: 13, numFmt: "#,##0", align: "right" },
      { header: "Compras", width: 16, numFmt: money, align: "right" },
      { header: "Último pedido", width: 14, numFmt: "dd/mm/yyyy", align: "right" },
      { header: "Clave del cliente", width: 20, indent: 1 },
    ];
    const writeCustomer = setupSheet(customersSheet, customerColumns, customerRows.length);
    customerRows.forEach((customer, index) => {
      const row = index + 2;
      const key = `$G${row}`;
      writeCustomer(row, [
        customer.name,
        customer.phone,
        formula(`COUNTIFS(${range("Clave del cliente")},${key},${range("Estado")},"<>${CANCELLED}")`, customer.orders),
        formula(`COUNTIFS(${range("Clave del cliente")},${key},${range("Estado")},"${COMPLETED}")`, customer.completed),
        formula(`SUMIFS(${range("Total")},${range("Clave del cliente")},${key},${range("Estado")},"${COMPLETED}")`, customer.spent),
        formula(`SUMPRODUCT(MAX((${range("Clave del cliente")}=${key})*${range("Fecha")}))`, customer.lastDay),
        customer.key,
      ]);
    });
  }

  /* ---------- Hoja "Inventario": los productos como están hoy ---------- */

  if (input.products) {
    const inventory = workbook.addWorksheet("Inventario");
    const inventoryColumns: Column[] = [
      { header: "Categoría", width: 22 },
      { header: "Producto", width: 36, wrap: true },
      { header: "Precio", width: 14, numFmt: money, align: "right" },
      { header: "Costo", width: 14, numFmt: money, align: "right" },
      { header: "Ganancia por unidad", width: 16, numFmt: money, align: "right" },
      { header: "Margen", width: 10, numFmt: "0.0%", align: "right" },
      { header: "Disponible", width: 12 },
      { header: "Existencias", width: 12, align: "right" },
      { header: "Valor de las existencias", width: 18, numFmt: money, align: "right" },
    ];
    const writeProduct = setupSheet(inventory, inventoryColumns, input.products.length);
    input.products.forEach((product, index) => {
      const row = index + 2;
      const price = units(product.priceCents);
      const cost = product.costCents === null ? null : units(product.costCents);
      writeProduct(row, [
        product.category,
        product.name,
        price,
        cost ?? undefined,
        formula(`IF(D${row}="","",C${row}-D${row})`, cost === null ? "" : round2(price - cost)),
        formula(`IF(OR(D${row}="",C${row}=0),"",(C${row}-D${row})/C${row})`, cost === null || price === 0 ? "" : (price - cost) / price),
        product.isAvailable ? "Sí" : "No",
        product.stock ?? undefined,
        formula(
          `IF(OR(H${row}="",D${row}=""),"",H${row}*D${row})`,
          product.stock === null || cost === null ? "" : round2(product.stock * cost),
        ),
      ]);
    });
  }

  /* ---------- Hoja "Resumen" ---------- */

  summary.columns = [{ width: 46 }, { width: 20 }, { width: 60 }];
  const completed = orders.filter((order) => order.status === "completado");
  const sum = (list: ExportOrder[], pick: (order: ExportOrder) => number) =>
    round2(list.reduce((total, order) => total + pick(order), 0));
  const countOf = (status: OrderStatus) => orders.filter((order) => order.status === status).length;
  const sales = sum(completed, (order) => units(order.totalCents));
  const profit = round2(completed.reduce((total, order) => total + (Number(orderProfit(order)) || 0), 0));

  const title = summary.getCell("A1");
  title.value = `Pedidos · ${input.businessName}`;
  title.font = { name: FONT, size: 14, bold: true };
  const meta: [string, string][] = [
    ["Período", `${formatDay(input.range.from)} a ${formatDay(input.range.to)}`],
    ["Estado", input.status ? statusLabel(input.status) : "Todos"],
    ["Generado", formatDateTime(input.generatedAt, input.timezone)],
  ];
  if (input.totalInRange !== undefined && input.totalInRange > orders.length) {
    meta.push(["Aviso", `El período tiene ${input.totalInRange} pedidos; aquí están los ${orders.length} más recientes.`]);
  }
  meta.forEach(([label, value], index) => {
    summary.getCell(`A${index + 2}`).value = label;
    summary.getCell(`A${index + 2}`).font = { name: FONT, size: 10, color: { argb: "FF655F57" } };
    summary.getCell(`B${index + 2}`).value = value;
    summary.getCell(`B${index + 2}`).font = { name: FONT, size: 10 };
  });

  // Las cifras empiezan en la fila 7. Cada renglón tiene una clave para que las
  // fórmulas que dependen de otro renglón lo encuentren aunque cambie el orden.
  const firstRow = 7;
  type SummaryRow = {
    key: string;
    label: string;
    value: (cellOf: (key: string) => string) => ExcelJS.CellValue;
    numFmt?: string;
    note?: string;
    bold?: boolean;
  };
  const countRow = (key: string, label: string, status: OrderStatus): SummaryRow => ({
    key,
    label,
    value: () => formula(`COUNTIF(${range("Estado")},"${statusLabel(status)}")`, countOf(status)),
    numFmt: "#,##0",
  });
  const rows: SummaryRow[] = [
    { key: "pedidos", label: "Pedidos en el período", value: () => formula(`COUNT(${range("Nº")})`, orders.length), numFmt: "#,##0" },
    countRow("completados", "Completados", "completado"),
    countRow("listos", statusLabel("listo"), "listo"),
    countRow("preparando", statusLabel("preparando"), "preparando"),
    countRow("nuevos", "Nuevos (sin atender)", "nuevo"),
    countRow("cancelados", "Cancelados", "cancelado"),
  ];
  if (!input.allBusinesses) {
    rows.push(
      {
        key: "clientes",
        label: "Clientes distintos",
        value: () => formula(`COUNTA(Clientes!$A$2:$A$${lastCustomer})`, customerRows.length),
        numFmt: "#,##0",
        note: "Se cuentan por número de teléfono. El detalle está en la hoja “Clientes”.",
      },
      {
        key: "ventas",
        label: "Ventas de pedidos completados",
        value: () => formula(`SUMIFS(${range("Total")},${range("Estado")},"${COMPLETED}")`, sales),
        numFmt: money,
        bold: true,
        note: "Lo cobrado: productos menos descuentos, más domicilio.",
      },
      {
        key: "productos",
        label: "   En productos",
        value: () =>
          formula(
            `SUMIFS(${range("Subtotal")},${range("Estado")},"${COMPLETED}")`,
            sum(completed, (order) => units(order.subtotalCents)),
          ),
        numFmt: money,
      },
      {
        key: "descuentos",
        label: "   Descuentos por cupones",
        value: () =>
          formula(
            `SUMIFS(${range("Descuento")},${range("Estado")},"${COMPLETED}")`,
            sum(completed, (order) => units(order.discountCents)),
          ),
        numFmt: money,
        note: "Lo que dejaste de cobrar por cupones. Ya está restado de las ventas.",
      },
      {
        key: "domicilios",
        label: "   En domicilios",
        value: () =>
          formula(
            `SUMIFS(${range("Domicilio")},${range("Estado")},"${COMPLETED}")`,
            sum(completed, (order) => units(order.deliveryCents)),
          ),
        numFmt: money,
      },
      {
        key: "promedio",
        label: "Pedido promedio",
        value: (cellOf) =>
          formula(
            `IF(${cellOf("completados")}=0,0,${cellOf("ventas")}/${cellOf("completados")})`,
            completed.length === 0 ? 0 : round2(sales / completed.length),
          ),
        numFmt: money,
        note: "Ventas de pedidos completados dividido entre pedidos completados.",
      },
      {
        key: "costo",
        label: "Costo de lo vendido",
        value: () =>
          formula(
            `SUMIFS(${range("Costo")},${range("Estado")},"${COMPLETED}")`,
            sum(completed, (order) => (order.costCents === null ? 0 : units(order.costCents))),
          ),
        numFmt: money,
        note: "Solo cuenta los productos que tenían costo registrado al hacer el pedido.",
      },
      {
        key: "ganancia",
        label: "Ganancia estimada",
        value: () => formula(`SUM(${range("Ganancia")})`, profit),
        numFmt: money,
        bold: true,
        note: "Venta menos costo de los productos con costo registrado y menos descuentos, en pedidos completados. No incluye el domicilio.",
      },
    );
  }
  const cellOf = (key: string) => `B${firstRow + rows.findIndex((row) => row.key === key)}`;

  rows.forEach((row, index) => {
    const r = firstRow + index;
    const label = summary.getCell(`A${r}`);
    const value = summary.getCell(`B${r}`);
    const note = summary.getCell(`C${r}`);
    label.value = row.label;
    label.font = { name: FONT, size: 10, bold: Boolean(row.bold) };
    value.value = row.value(cellOf);
    value.font = { name: FONT, size: 10, bold: Boolean(row.bold) };
    value.alignment = { horizontal: "right" };
    if (row.numFmt) value.numFmt = row.numFmt;
    if (row.note) {
      note.value = row.note;
      note.font = { name: FONT, size: 9, color: { argb: "FF655F57" } };
      note.alignment = { wrapText: true, vertical: "top" };
    }
  });

  /* ---------- Exportación del servicio: resumen por negocio ---------- */

  if (input.allBusinesses) {
    const perBusiness = workbook.addWorksheet("Por negocio");
    const names = [...new Set(orders.map((order) => order.businessName ?? ""))].sort((a, b) => a.localeCompare(b, "es"));
    const columns: Column[] = [
      { header: "Negocio", width: 28 },
      { header: "Moneda", width: 9 },
      { header: "Pedidos", width: 10, numFmt: "#,##0", align: "right" },
      { header: "Completados", width: 12, numFmt: "#,##0", align: "right" },
      { header: "Ventas completadas", width: 18, numFmt: money, align: "right" },
    ];
    const write = setupSheet(perBusiness, columns, names.length);
    names.forEach((name, index) => {
      const row = index + 2;
      const own = orders.filter((order) => (order.businessName ?? "") === name);
      const done = own.filter((order) => order.status === "completado");
      write(row, [
        name,
        own[0]?.currency ?? "",
        formula(`COUNTIF(${range("Negocio")},A${row})`, own.length),
        formula(`COUNTIFS(${range("Negocio")},A${row},${range("Estado")},"${COMPLETED}")`, done.length),
        formula(
          `SUMIFS(${range("Total")},${range("Negocio")},A${row},${range("Estado")},"${COMPLETED}")`,
          sum(done, (order) => units(order.totalCents)),
        ),
      ]);
    });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
