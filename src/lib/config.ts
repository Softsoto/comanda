/**
 * Ajustes generales de la app. Cambia aquí el nombre y los textos de marca.
 */
export const APP_NAME = "Comanda";
export const APP_TAGLINE = "Tu menú digital. El pedido llega por WhatsApp.";
export const FOOTER_CREDIT = "sotomontessebas · soporte técnico";

/** Dirección del menú de ejemplo que se crea al arrancar por primera vez en local. */
export const DEMO_SLUG = "demo";
export const DEMO_EMAIL = "demo@comanda.test";

export type CurrencyInfo = {
  code: string;
  label: string;
  symbol: string;
  /** El símbolo va después del número (36,50 €). */
  symbolAfter?: boolean;
  /** Lleva espacio entre símbolo y número ($ 36.000). */
  space?: boolean;
  thousands: string;
  decimal: string;
  /** 0 = oculta los decimales cuando el precio es redondo; 2 = siempre los muestra. */
  decimals: 0 | 2;
};

export const CURRENCIES: CurrencyInfo[] = [
  { code: "COP", label: "Peso colombiano (COP)", symbol: "$", space: true, thousands: ".", decimal: ",", decimals: 0 },
  { code: "USD", label: "Dólar (USD)", symbol: "$", thousands: ",", decimal: ".", decimals: 2 },
  { code: "MXN", label: "Peso mexicano (MXN)", symbol: "$", thousands: ",", decimal: ".", decimals: 2 },
  { code: "DOP", label: "Peso dominicano (DOP)", symbol: "RD$", thousands: ",", decimal: ".", decimals: 2 },
  { code: "PEN", label: "Sol peruano (PEN)", symbol: "S/", space: true, thousands: ",", decimal: ".", decimals: 2 },
  { code: "CLP", label: "Peso chileno (CLP)", symbol: "$", thousands: ".", decimal: ",", decimals: 0 },
  { code: "ARS", label: "Peso argentino (ARS)", symbol: "$", space: true, thousands: ".", decimal: ",", decimals: 0 },
  { code: "UYU", label: "Peso uruguayo (UYU)", symbol: "$", space: true, thousands: ".", decimal: ",", decimals: 0 },
  { code: "PYG", label: "Guaraní (PYG)", symbol: "₲", space: true, thousands: ".", decimal: ",", decimals: 0 },
  { code: "BOB", label: "Boliviano (BOB)", symbol: "Bs", space: true, thousands: ".", decimal: ",", decimals: 2 },
  { code: "VES", label: "Bolívar (VES)", symbol: "Bs.", space: true, thousands: ".", decimal: ",", decimals: 2 },
  { code: "BRL", label: "Real brasileño (BRL)", symbol: "R$", space: true, thousands: ".", decimal: ",", decimals: 2 },
  { code: "GTQ", label: "Quetzal (GTQ)", symbol: "Q", thousands: ",", decimal: ".", decimals: 2 },
  { code: "HNL", label: "Lempira (HNL)", symbol: "L", space: true, thousands: ",", decimal: ".", decimals: 2 },
  { code: "NIO", label: "Córdoba (NIO)", symbol: "C$", thousands: ",", decimal: ".", decimals: 2 },
  { code: "CRC", label: "Colón costarricense (CRC)", symbol: "₡", thousands: ".", decimal: ",", decimals: 0 },
  { code: "EUR", label: "Euro (EUR)", symbol: "€", symbolAfter: true, space: true, thousands: ".", decimal: ",", decimals: 2 },
];

export const DEFAULT_CURRENCY = "COP";
export const DEFAULT_PAYMENT_METHODS = ["Efectivo", "Transferencia", "Tarjeta"];

/** Indicativos para el número de WhatsApp del negocio. */
export const COUNTRY_CODES: { code: string; label: string }[] = [
  { code: "57", label: "Colombia (+57)" },
  { code: "54", label: "Argentina (+54)" },
  { code: "591", label: "Bolivia (+591)" },
  { code: "55", label: "Brasil (+55)" },
  { code: "56", label: "Chile (+56)" },
  { code: "506", label: "Costa Rica (+506)" },
  { code: "593", label: "Ecuador (+593)" },
  { code: "503", label: "El Salvador (+503)" },
  { code: "34", label: "España (+34)" },
  { code: "1", label: "EE. UU., Rep. Dominicana, Puerto Rico (+1)" },
  { code: "502", label: "Guatemala (+502)" },
  { code: "504", label: "Honduras (+504)" },
  { code: "52", label: "México (+52)" },
  { code: "505", label: "Nicaragua (+505)" },
  { code: "507", label: "Panamá (+507)" },
  { code: "595", label: "Paraguay (+595)" },
  { code: "51", label: "Perú (+51)" },
  { code: "598", label: "Uruguay (+598)" },
  { code: "58", label: "Venezuela (+58)" },
];
export const DEFAULT_COUNTRY_CODE = "57";

/**
 * Cuántas cifras tiene un número (sin el indicativo) en cada país.
 * Sirve para avisar de un número mal escrito antes de que se pierdan pedidos.
 * Los países que no están aquí solo pasan una revisión general de largo.
 */
export const NATIONAL_NUMBER_LENGTHS: Record<string, number[]> = {
  "57": [10], // Colombia
  "52": [10], // México
  "1": [10], // EE. UU., Rep. Dominicana, Puerto Rico
  "34": [9], // España
  "56": [9], // Chile
  "58": [10], // Venezuela
  "506": [8], // Costa Rica
  "502": [8], // Guatemala
  "503": [8], // El Salvador
  "504": [8], // Honduras
  "505": [8], // Nicaragua
  "591": [8], // Bolivia
  "598": [8], // Uruguay
  "51": [9, 8], // Perú (celular 9, fijo 8)
  "593": [9, 8], // Ecuador (celular 9, fijo 8)
  "507": [8, 7], // Panamá (celular 8, fijo 7)
  "595": [9, 8], // Paraguay
  "54": [10, 11], // Argentina (11 cuando lleva el 9 de celular)
  "55": [11, 10], // Brasil (celular 11, fijo 10)
};

/** Límites de texto usados al validar formularios. */
export const LIMITS = {
  businessName: 60,
  categoryName: 40,
  productName: 80,
  productDescription: 280,
  paymentMethod: 30,
  paymentMethods: 8,
  customerName: 80,
  address: 200,
  notes: 300,
  maxPriceCents: 2_000_000_000,
  maxImageBytes: 2 * 1024 * 1024,
  maxQuantity: 99,
  maxCategories: 30,
  maxProducts: 300,
  /** Productos distintos en un mismo pedido. */
  orderLines: 50,
  /** Pedidos que un mismo visitante puede registrar cada 10 minutos. */
  ordersPerWindow: 20,
  /** Tope por negocio cada 10 minutos cuando no se puede distinguir a los visitantes. */
  ordersPerWindowShared: 300,
  tableLabel: 20,
  maxStock: 1_000_000,
  zoneName: 40,
  maxZones: 40,
  maxCoupons: 50,
  planName: 40,
  paymentNote: 200,
};
