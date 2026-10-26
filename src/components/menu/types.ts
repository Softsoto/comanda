import type { AppliedCoupon } from "../../lib/coupons";
import type { OpenMode, OpenStatus, WeeklySchedule } from "../../lib/hours";
import type { ChosenOption } from "../../lib/options";
import type { DeliveryMode } from "../../lib/orders";
import type { OrderCustomer } from "../../lib/whatsapp";

/** Datos que necesita la vista del cliente. Los prepara el servidor a partir de la base de datos. */

/** Zona o barrio de domicilio con su precio. */
export type MenuZone = { id: string; name: string; feeCents: number };

export type MenuBusiness = {
  name: string;
  slug: string;
  /** Solo cifras, con indicativo. Vacío si el negocio aún no lo ha configurado. */
  whatsapp: string;
  currency: string;
  paymentMethods: string[];
  logoUrl: string | null;
  /** Formas de entrega que ofrece el negocio. */
  deliveryModes: DeliveryMode[];
  /** Costo fijo de domicilio; 0 = se confirma por WhatsApp. Si hay zonas, manda el precio de la zona. */
  deliveryFeeCents: number;
  /** Zonas de domicilio. Si hay alguna, el cliente elige la suya. */
  zones: MenuZone[];
  /** Domicilio gratis desde este valor en productos; 0 = no aplica. */
  freeDeliveryFromCents: number;
  /** Pedido mínimo; 0 = sin mínimo. */
  minOrderCents: number;
  /** El negocio tiene cupones activos: se muestra el campo para escribir uno. */
  hasCoupons: boolean;
  /** Aviso de tratamiento de datos: su dirección y si hay que marcar una casilla para aceptarlo. */
  privacy: { url: string; checkbox: boolean } | null;
  /** Abierto, cerrado o según horario. Con esto el navegador mantiene al día el aviso mientras la página sigue abierta. */
  openMode: OpenMode;
  schedule: WeeklySchedule;
  timezone: string;
  /** Si la tienda recibe pedidos, tal como lo calculó el servidor al cargar la página. */
  openStatus: OpenStatus;
};

/** Opción de un producto tal como la ve el cliente (sin el costo, que se queda en el servidor). */
export type MenuOptionChoice = { id: string; name: string; priceCents: number; available: boolean };

export type MenuOptionGroup = { id: string; name: string; min: number; max: number; choices: MenuOptionChoice[] };

export type MenuProduct = {
  id: string;
  name: string;
  description: string;
  /** Precio base. Las opciones elegidas se suman a este valor. */
  priceCents: number;
  imageUrl: string | null;
  available: boolean;
  /** Tope por pedido: las existencias, si el negocio las controla, o el máximo general. */
  maxQuantity: number;
  /** Tamaños, adicionales y extras. Vacío si el producto no tiene opciones. */
  options: MenuOptionGroup[];
};

export type MenuCategoryData = {
  id: string;
  name: string;
  products: MenuProduct[];
};

/** Imagen de publicidad. `title` dice lo que muestra, para quien no puede verla. */
export type MenuBanner = { id: string; imageUrl: string; title: string };

/** Publicidad opcional: carrusel principal y barra pequeña. */
export type MenuBanners = { principal: MenuBanner[]; barra: MenuBanner[] };

/** Renglón del carrito: un producto con unas opciones concretas. */
export type CartLine = {
  /** Identifica el renglón: el mismo producto con otras opciones es otro renglón. */
  key: string;
  product: MenuProduct;
  choiceIds: string[];
  chosen: ChosenOption[];
  /** Precio de una unidad con sus opciones. */
  unitPriceCents: number;
  quantity: number;
};

/** Lo que el navegador envía al registrar un pedido: qué y cuánto, nunca precios. */
export type OrderDraft = {
  items: { productId: string; quantity: number; choiceIds: string[] }[];
  customer: OrderCustomer;
  /** Zona de domicilio elegida, si el negocio las usa. */
  zoneId?: string | null;
  couponCode?: string;
  /** El cliente marcó la casilla del aviso de datos (cuando el servicio la exige). */
  privacyAccepted?: boolean;
};

/** Lo que devuelve el servidor cuando el pedido quedó registrado. */
export type OrderReceipt = {
  number: number;
  totalCents: number;
  /** El domicilio quedó por confirmar: el total todavía no lo incluye. */
  deliveryPending?: boolean;
  /** Texto del pedido, ya con su número. */
  message: string;
  whatsappUrl: string;
  /** Página donde el cliente ve cómo va su pedido. */
  trackUrl?: string;
};

export type SubmitOrderResult =
  | { ok: true; receipt: OrderReceipt }
  | { ok: false; error: string; menuChanged?: boolean; field?: "zone" | "coupon" | "privacy" };

export type SubmitOrder = (draft: OrderDraft) => Promise<SubmitOrderResult>;

export type CheckCouponResult = { ok: true; coupon: AppliedCoupon } | { ok: false; error: string };

/** Pregunta al servidor si un cupón sirve para un pedido de ese valor. */
export type CheckCoupon = (code: string, subtotalCents: number) => Promise<CheckCouponResult>;
