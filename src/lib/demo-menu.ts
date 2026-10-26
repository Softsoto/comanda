/**
 * Contenido del negocio de ejemplo ("El Antojo"): menú con opciones, zonas de
 * domicilio, un cupón, publicidad, horario y unos pedidos de muestra para que
 * el panel tenga algo que enseñar.
 * Cambia aquí nombres, descripciones y precios; las imágenes están en seed/img.
 */

/** Grupo de opciones de un producto de ejemplo. Los valores van en pesos. */
export type DemoOptionGroup = {
  name: string;
  /** Mínimo y máximo de opciones que se pueden elegir. */
  min: number;
  max: number;
  choices: { name: string; price?: number; cost?: number }[];
};

const ADICIONES: DemoOptionGroup = {
  name: "Adiciones",
  min: 0,
  max: 3,
  choices: [
    { name: "Queso extra", price: 2000, cost: 800 },
    { name: "Tocineta", price: 3000, cost: 1400 },
    { name: "Huevo frito", price: 2000, cost: 600 },
  ],
};

export type DemoProduct = {
  name: string;
  description: string;
  /** Precio en pesos; se guarda multiplicado por 100. */
  price: number;
  /** Lo que le cuesta al negocio, en pesos. Con esto los reportes muestran la ganancia. */
  cost: number;
  image: string;
  available?: boolean;
  /** Existencias; sin este dato no se controlan. */
  stock?: number;
  /** Tamaños, adicionales y extras. */
  options?: DemoOptionGroup[];
};

export const DEMO_BUSINESS = {
  name: "El Antojo",
  currency: "COP",
  paymentMethods: ["Efectivo", "Nequi", "Tarjeta al recibir"],
  logo: "logo.png",
  deliveryModes: "domicilio,recoger,local",
  /** Zonas de domicilio con su precio, en pesos. */
  zones: [
    { name: "Centro", fee: 4000 },
    { name: "Norte", fee: 6000 },
    { name: "Sur", fee: 6000 },
  ],
  /** Domicilio gratis desde este valor en productos, en pesos. */
  freeDeliveryFrom: 60000,
  /** Cupón de ejemplo: 10 % de descuento en pedidos desde $ 20.000. */
  coupon: { code: "BIENVENIDO10", percent: 10, minSubtotal: 20000 },
  /**
   * Horario de muestra (0 = domingo … 6 = sábado). La tienda arranca en
   * "Abierto" fijo para poder probarla a cualquier hora; el horario se activa
   * eligiendo "Según horario" en el panel.
   */
  schedule: [
    [{ from: "12:00", to: "21:00" }],
    [{ from: "11:30", to: "22:00" }],
    [{ from: "11:30", to: "22:00" }],
    [{ from: "11:30", to: "22:00" }],
    [{ from: "11:30", to: "22:00" }],
    [{ from: "11:30", to: "23:30" }],
    [{ from: "11:30", to: "23:30" }],
  ],
  banners: [
    { slot: "principal", image: "promo-cupon.jpg", title: "Cupón de bienvenida: 10 % de descuento. Usa el cupón BIENVENIDO10." },
    { slot: "principal", image: "promo-nuevo.jpg", title: "Nuevo: Pollo crispy por $ 21.000." },
    { slot: "barra", image: "barra-domicilio.jpg", title: "Domicilio gratis en pedidos desde $ 60.000." },
  ],
};

export const DEMO_MENU: { category: string; products: DemoProduct[] }[] = [
  {
    category: "Hamburguesas",
    products: [
      {
        name: "Hamburguesa clásica",
        description: "Carne de res de 150 g, queso, lechuga, tomate y salsa de la casa.",
        price: 18000,
        cost: 9500,
        image: "hamburguesa-clasica.png",
        options: [
          {
            name: "Término de la carne",
            min: 0,
            max: 1,
            choices: [{ name: "Medio" }, { name: "Tres cuartos" }, { name: "Bien asada" }],
          },
          ADICIONES,
        ],
      },
      {
        name: "Doble queso",
        description: "Doble carne, doble queso cheddar, lechuga y tomate.",
        price: 26000,
        cost: 14000,
        image: "hamburguesa-doble.png",
        options: [ADICIONES],
      },
      {
        name: "Pollo crispy",
        description: "Pechuga apanada, lechuga, tomate y mayonesa de ajo.",
        price: 21000,
        cost: 11000,
        image: "hamburguesa-pollo.png",
      },
    ],
  },
  {
    category: "Acompañamientos",
    products: [
      {
        name: "Papas a la francesa",
        description: "Crocantes y recién hechas. Elige el tamaño.",
        price: 7000,
        cost: 2500,
        image: "papas.png",
        options: [
          {
            name: "Tamaño",
            min: 1,
            max: 1,
            choices: [{ name: "Mediana" }, { name: "Grande", price: 3000, cost: 1000 }],
          },
        ],
      },
    ],
  },
  {
    category: "Bebidas",
    products: [
      {
        name: "Limonada natural",
        description: "Hecha al momento, con hielo.",
        price: 6000,
        cost: 1800,
        image: "limonada.png",
      },
      {
        name: "Gaseosa",
        description: "Vaso de 400 ml con hielo.",
        price: 5000,
        cost: 2800,
        image: "gaseosa.png",
        options: [{ name: "Sabor", min: 1, max: 1, choices: [{ name: "Cola" }, { name: "Naranja" }, { name: "Limón" }] }],
      },
      {
        name: "Malteada de fresa",
        description: "Helado de fresa, leche y crema batida.",
        price: 12000,
        cost: 5200,
        image: "malteada.png",
        available: false,
      },
    ],
  },
  {
    category: "Postres",
    products: [
      {
        name: "Brownie con helado",
        description: "Brownie tibio con una bola de helado de vainilla.",
        price: 10000,
        cost: 4200,
        image: "brownie.png",
        stock: 8,
      },
      { name: "Flan de caramelo", description: "Receta de la casa.", price: 8000, cost: 3000, image: "flan.png" },
    ],
  },
];

export type DemoOrder = {
  /** Hace cuántos días se hizo (0 = hoy). */
  daysAgo: number;
  /** Hora local "HH:MM". En los de hoy se ignora: se crean hace unos minutos. */
  time: string;
  status: "nuevo" | "preparando" | "listo" | "completado" | "cancelado";
  name: string;
  phone: string;
  delivery: "domicilio" | "recoger" | "local";
  /** Zona de domicilio (una de DEMO_BUSINESS.zones). */
  zone?: string;
  /** Dirección, o mesa si es en el local. */
  address?: string;
  payment: string;
  notes?: string;
  /** Usa el cupón de ejemplo. */
  coupon?: boolean;
  /** Producto, cantidad y, si tiene, las opciones elegidas por su nombre. */
  items: [product: string, quantity: number, options?: string[]][];
};

/** Pedidos de muestra, del más antiguo al más reciente. Los nombres y teléfonos son inventados. */
export const DEMO_ORDERS: DemoOrder[] = [
  { daysAgo: 9, time: "12:40", status: "completado", name: "Laura Gómez", phone: "300 555 0101", delivery: "domicilio", zone: "Centro", address: "Calle 12 # 34-56", payment: "Nequi", items: [["Hamburguesa clásica", 2, ["Queso extra"]], ["Gaseosa", 2, ["Cola"]]] },
  { daysAgo: 8, time: "19:15", status: "completado", name: "Andrés Ríos", phone: "301 555 0102", delivery: "recoger", payment: "Efectivo", items: [["Doble queso", 1], ["Papas a la francesa", 1, ["Grande"]], ["Limonada natural", 1]] },
  { daysAgo: 7, time: "20:05", status: "completado", name: "Camila Torres", phone: "302 555 0103", delivery: "domicilio", zone: "Norte", address: "Carrera 7 # 45-10, apto 302", payment: "Tarjeta al recibir", notes: "Sin cebolla, por favor.", items: [["Pollo crispy", 2], ["Papas a la francesa", 2, ["Mediana"]], ["Gaseosa", 2, ["Naranja"]], ["Flan de caramelo", 1]] },
  { daysAgo: 6, time: "13:20", status: "cancelado", name: "Julián Pérez", phone: "304 555 0104", delivery: "domicilio", zone: "Sur", address: "Calle 80 # 20-15", payment: "Efectivo", items: [["Hamburguesa clásica", 1, ["Bien asada"]]] },
  { daysAgo: 6, time: "19:50", status: "completado", name: "Valentina Ruiz", phone: "305 555 0105", delivery: "local", address: "4", payment: "Efectivo", items: [["Doble queso", 2, ["Tocineta"]], ["Limonada natural", 2], ["Brownie con helado", 1]] },
  { daysAgo: 4, time: "12:10", status: "completado", name: "Mateo Herrera", phone: "310 555 0106", delivery: "recoger", payment: "Nequi", coupon: true, items: [["Hamburguesa clásica", 1, ["Tres cuartos", "Queso extra", "Tocineta"]], ["Papas a la francesa", 1, ["Mediana"]], ["Gaseosa", 1, ["Limón"]]] },
  { daysAgo: 3, time: "20:30", status: "completado", name: "Sofía Castro", phone: "311 555 0107", delivery: "domicilio", zone: "Norte", address: "Avenida 5 # 10-22, casa 3", payment: "Nequi", items: [["Pollo crispy", 1], ["Doble queso", 1], ["Papas a la francesa", 2, ["Grande"]], ["Limonada natural", 2]] },
  { daysAgo: 2, time: "13:05", status: "completado", name: "Laura Gómez", phone: "300 555 0101", delivery: "domicilio", zone: "Centro", address: "Calle 12 # 34-56", payment: "Nequi", items: [["Hamburguesa clásica", 3, ["Queso extra"]], ["Gaseosa", 3, ["Cola"]], ["Brownie con helado", 2]] },
  { daysAgo: 1, time: "19:40", status: "completado", name: "Daniel Mora", phone: "312 555 0108", delivery: "local", address: "2", payment: "Tarjeta al recibir", items: [["Doble queso", 1], ["Gaseosa", 1, ["Cola"]]] },
  { daysAgo: 1, time: "21:10", status: "completado", name: "Paula Niño", phone: "313 555 0109", delivery: "domicilio", zone: "Sur", address: "Carrera 15 # 93-40, oficina 201", payment: "Efectivo", notes: "Pago con billete de 100.", items: [["Pollo crispy", 2], ["Limonada natural", 2], ["Flan de caramelo", 2]] },
  { daysAgo: 0, time: "", status: "listo", name: "Laura Gómez", phone: "300 555 0101", delivery: "domicilio", zone: "Centro", address: "Calle 12 # 34-56", payment: "Nequi", items: [["Pollo crispy", 1], ["Papas a la francesa", 1, ["Grande"]]] },
  { daysAgo: 0, time: "", status: "preparando", name: "Andrés Ríos", phone: "301 555 0102", delivery: "recoger", payment: "Efectivo", items: [["Hamburguesa clásica", 2, ["Medio"]], ["Papas a la francesa", 1, ["Mediana"]]] },
  { daysAgo: 0, time: "", status: "nuevo", name: "Camila Torres", phone: "302 555 0103", delivery: "domicilio", zone: "Norte", address: "Carrera 7 # 45-10, apto 302", payment: "Nequi", notes: "Timbre dañado, llamar al llegar.", items: [["Doble queso", 1, ["Huevo frito"]], ["Pollo crispy", 1], ["Gaseosa", 2, ["Cola"]]] },
];

/** Planes de ejemplo para la administración del servicio. Precios por mes, en pesos. */
export const DEMO_PLANS: { name: string; price: number; maxProducts: number | null }[] = [
  { name: "Básico", price: 35000, maxProducts: 30 },
  { name: "Completo", price: 60000, maxProducts: null },
];
