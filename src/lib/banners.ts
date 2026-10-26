/**
 * Publicidad de la tienda: dos espacios opcionales encima del menú.
 *
 * - "principal": carrusel de imágenes grandes (promociones, anuncios).
 * - "barra": franja delgada debajo del carrusel, para avisos cortos.
 *
 * Cada espacio tiene una proporción fija. La imagen se recorta a esa forma en
 * el navegador antes de subirla, así todas quedan parejas y el menú no "salta".
 */
export const BANNER_SLOTS = [
  {
    value: "principal",
    label: "Carrusel principal",
    help: "Imágenes grandes arriba del menú: promociones, anuncios, novedades. Pasan solas y se deslizan con el dedo.",
    shape: "el doble de ancha que alta",
    width: 1200,
    height: 600,
    max: 6,
  },
  {
    value: "barra",
    label: "Barra pequeña",
    help: "Una franja delgada debajo del carrusel, para avisos cortos: domicilio gratis, nuevo horario, medios de pago.",
    shape: "cuatro veces más ancha que alta",
    width: 1200,
    height: 300,
    max: 4,
  },
] as const;

export type BannerSlot = (typeof BANNER_SLOTS)[number]["value"];

export const isBannerSlot = (value: unknown): value is BannerSlot =>
  BANNER_SLOTS.some((slot) => slot.value === value);

export const getBannerSlot = (value: BannerSlot) => BANNER_SLOTS.find((slot) => slot.value === value) ?? BANNER_SLOTS[0];

/** Largo máximo del texto que describe la imagen (para quien no puede verla). */
export const BANNER_TITLE_MAX = 120;
