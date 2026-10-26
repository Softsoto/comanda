"use client";

import { useEffect, useRef } from "react";
import { formatMoney } from "../../lib/money";
import { priceRange } from "../../lib/options";
import { MinusIcon, PlusIcon } from "../ui/icons";
import type { MenuProduct } from "./types";

type QuantityControlProps = {
  name: string;
  quantity: number;
  /** Tope de unidades (por existencias). Al llegar, el botón + se desactiva. */
  max: number;
  onAdd: () => void;
  onRemove: () => void;
  /** En el carrito el control siempre muestra − cantidad +. */
  compact?: boolean;
};

/** Botón "Añadir" que se convierte en − cantidad + cuando el producto ya está en el pedido. */
export function QuantityControl({ name, quantity, max, onAdd, onRemove, compact }: QuantityControlProps) {
  const plusRef = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef<"plus" | "add" | null>(null);

  // Al cambiar de "Añadir" a − 1 + (o al revés) el botón pulsado desaparece;
  // se pasa el foco al nuevo para quien navega con teclado.
  useEffect(() => {
    if (moveFocus.current === "plus") plusRef.current?.focus();
    if (moveFocus.current === "add") addRef.current?.focus();
    moveFocus.current = null;
  }, [quantity]);

  if (quantity === 0 && !compact) {
    return (
      <button
        ref={addRef}
        type="button"
        className="btn btn-outline-brand px-5"
        aria-label={`Añadir ${name} al pedido`}
        onClick={() => {
          moveFocus.current = "plus";
          onAdd();
        }}
      >
        Añadir
      </button>
    );
  }

  return (
    <div className="inline-flex items-center rounded-full border border-line bg-raised">
      <button
        type="button"
        className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-ink hover:bg-ink/5"
        aria-label={`Quitar uno de ${name}`}
        onClick={() => {
          if (quantity === 1 && !compact) moveFocus.current = "add";
          onRemove();
        }}
      >
        <MinusIcon width={20} height={20} />
      </button>
      <span className="min-w-7 text-center font-semibold tabular-nums" aria-live="polite" aria-atomic="true">
        <span className="sr-only">Cantidad: </span>
        {quantity}
      </span>
      <button
        ref={plusRef}
        type="button"
        className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-ink hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-30"
        aria-label={quantity >= max ? `No hay más unidades de ${name}` : `Añadir otro de ${name}`}
        disabled={quantity >= max}
        onClick={onAdd}
      >
        <PlusIcon width={20} height={20} />
      </button>
    </div>
  );
}

/** Precio que se anuncia en el menú: "Desde $ X" cuando las opciones lo pueden cambiar. */
export function productPriceLabel(product: MenuProduct, currency: string): string {
  const { fromCents, varies } = priceRange(product.priceCents, product.options);
  return `${varies ? "Desde " : ""}${formatMoney(fromCents, currency)}`;
}

type ProductCardProps = {
  product: MenuProduct;
  currency: string;
  /** Unidades de este producto en el pedido, sumando todas sus variantes. */
  quantity: number;
  /** False cuando la tienda está cerrada: el producto se ve, pero no se puede añadir. */
  canOrder: boolean;
  onAdd: () => void;
  onRemove: () => void;
  /** Abre la ficha del producto, con la foto en grande y sus opciones. */
  onOpen: () => void;
};

export function ProductCard({ product, currency, quantity, canOrder, onAdd, onRemove, onOpen }: ProductCardProps) {
  // Agotado: la foto se atenúa y el texto pasa a gris, sin bajarle la opacidad (así se sigue leyendo bien).
  const soldOut = !product.available;
  const hasOptions = product.options.length > 0;
  return (
    <article className="card relative flex h-full min-w-0 flex-col gap-3">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <h3 className={`font-semibold wrap-anywhere ${soldOut ? "text-muted" : ""}`}>
            {/* El botón se extiende sobre toda la tarjeta: tocar la foto o el texto abre la ficha. */}
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={onOpen}
              className="card-button"
            >
              {product.name}
            </button>
          </h3>
          {product.description && (
            <p className="mt-1 line-clamp-3 text-caption wrap-anywhere text-muted">{product.description}</p>
          )}
        </div>
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt=""
            width={104}
            height={104}
            loading="lazy"
            decoding="async"
            className={`h-26 w-26 shrink-0 rounded-field object-cover ${soldOut ? "opacity-55" : ""}`}
          />
        )}
      </div>
      <div className="mt-auto flex min-h-12 items-center justify-between gap-3">
        <p className={`font-display text-price font-bold tabular-nums ${soldOut ? "text-muted" : ""}`}>
          {productPriceLabel(product, currency)}
        </p>
        {!product.available ? (
          <span className="rounded-full border border-line px-3 py-1 text-sm font-semibold text-muted">Agotado</span>
        ) : !canOrder ? null : hasOptions ? (
          // Con tamaños o adicionales, "Añadir" abre la ficha para elegirlos.
          <button
            type="button"
            aria-haspopup="dialog"
            className="btn btn-outline-brand relative z-[1] px-5"
            aria-label={
              quantity > 0
                ? `Añadir otro ${product.name}: elige sus opciones. Llevas ${quantity} en tu pedido`
                : `Añadir ${product.name}: elige sus opciones`
            }
            onClick={onOpen}
          >
            Añadir
            {quantity > 0 && (
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1.5 text-sm font-bold text-on-accent tabular-nums">
                {quantity}
              </span>
            )}
          </button>
        ) : (
          // Por encima del botón de la tarjeta, para que añadir no abra la ficha.
          <div className="relative z-[1]">
            <QuantityControl
              name={product.name}
              quantity={quantity}
              max={product.maxQuantity}
              onAdd={onAdd}
              onRemove={onRemove}
            />
          </div>
        )}
      </div>
    </article>
  );
}
