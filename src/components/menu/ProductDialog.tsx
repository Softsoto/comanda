"use client";

import { useState } from "react";
import { formatMoney } from "../../lib/money";
import { checkSelection } from "../../lib/options";
import { CloseIcon, MinusIcon, PlusIcon } from "../ui/icons";
import { QuantityControl, productPriceLabel } from "./ProductCard";
import type { MenuOptionChoice, MenuOptionGroup, MenuProduct } from "./types";
import { useDialog } from "./useDialog";

type Props = {
  /** Producto que se está viendo, o null si la ficha está cerrada. */
  product: MenuProduct | null;
  currency: string;
  /** Unidades de este producto que ya están en el pedido. */
  quantity: number;
  /** Cuántas unidades más se pueden añadir (por existencias). */
  room: number;
  /** False cuando la tienda está cerrada: se ve el producto, pero no se puede añadir. */
  canOrder: boolean;
  /** Añade unidades con las opciones elegidas (ninguna, si el producto no tiene). */
  onAdd: (choiceIds: string[], quantity: number) => void;
  /** Quita una unidad (solo productos sin opciones). */
  onRemove: () => void;
  onClose: () => void;
};

/** Lo que hay que elegir en un grupo, dicho en pocas palabras. */
function requirement(group: MenuOptionGroup): string {
  const all = group.max >= group.choices.length;
  if (group.min === 0) return group.max === 1 || all ? "Opcional" : `Opcional · hasta ${group.max}`;
  if (group.max === 1) return "Elige 1";
  if (group.min === group.max) return `Elige ${group.min}`;
  return all ? `Elige al menos ${group.min}` : `Elige de ${group.min} a ${group.max}`;
}

/**
 * Ficha de un producto: la foto en grande, la descripción completa, sus
 * opciones (tamaños, adicionales) y el botón para añadirlo. En el celular sube
 * desde abajo; en pantallas anchas aparece centrada.
 */
export function ProductDialog({ product, currency, quantity, room, canOrder, onAdd, onRemove, onClose }: Props) {
  const dialogRef = useDialog(product !== null);

  return (
    <dialog
      ref={dialogRef}
      className="product-dialog"
      aria-labelledby="producto-titulo"
      onClose={onClose}
      onClick={(event) => {
        // Un toque fuera de la ficha (en el fondo oscuro) la cierra.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {product && (
        // La "key" hace que cada producto empiece con sus opciones sin marcar.
        <ProductSheet
          key={product.id}
          product={product}
          currency={currency}
          quantity={quantity}
          room={room}
          canOrder={canOrder}
          onAdd={onAdd}
          onRemove={onRemove}
          onClose={onClose}
        />
      )}
    </dialog>
  );
}

function ProductSheet({ product, currency, quantity, room, canOrder, onAdd, onRemove, onClose }: Props & { product: MenuProduct }) {
  const hasOptions = product.options.length > 0;
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState(1);
  const [problem, setProblem] = useState("");
  const money = (cents: number) => formatMoney(cents, currency);

  const extraCents = product.options
    .flatMap((group) => group.choices)
    .filter((choice) => selected.includes(choice.id))
    .reduce((sum, choice) => sum + choice.priceCents, 0);
  const unitCents = product.priceCents + extraCents;
  const units = Math.min(amount, Math.max(room, 1));

  function toggle(group: MenuOptionGroup, choice: MenuOptionChoice) {
    setProblem("");
    setSelected((current) => {
      const inGroup = group.choices.map((item) => item.id);
      const checked = current.includes(choice.id);
      if (group.max === 1) {
        // Una sola opción: elegir otra reemplaza la anterior; si el grupo es opcional, se puede desmarcar.
        const others = current.filter((id) => !inGroup.includes(id));
        return checked && group.min === 0 ? others : [...others, choice.id];
      }
      if (checked) return current.filter((id) => id !== choice.id);
      const count = current.filter((id) => inGroup.includes(id)).length;
      return count >= group.max ? current : [...current, choice.id];
    });
  }

  function addToOrder() {
    const check = checkSelection(product.options, selected);
    if (!check.ok) {
      setProblem(check.message);
      // Lleva a la vista el primer grupo al que le falta una elección.
      const missing = product.options.find(
        (group) => group.choices.filter((choice) => selected.includes(choice.id)).length < group.min,
      );
      if (missing) document.getElementById(`grupo-${missing.id}`)?.scrollIntoView({ block: "center" });
      return;
    }
    onAdd(check.choiceIds, units);
    onClose();
  }

  return (
    <div className="flex max-h-[92dvh] flex-col md:max-h-[min(92dvh,760px)]">
      <div className="relative shrink-0">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className={`w-full bg-raised object-contain ${
              hasOptions ? "max-h-[30dvh] md:max-h-[260px]" : "max-h-[52dvh] md:max-h-[420px]"
            }`}
          />
        ) : (
          <div className="h-14" />
        )}
        <button
          type="button"
          className="absolute top-2 right-2 grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-surface text-ink shadow-[0_0_0_1px_color-mix(in_srgb,var(--line)_40%,transparent)] hover:bg-raised"
          aria-label="Cerrar"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-2">
        <h2 id="producto-titulo" className="font-display text-title font-bold wrap-anywhere">
          {product.name}
        </h2>
        {product.description && <p className="mt-2 wrap-anywhere text-muted">{product.description}</p>}
        {hasOptions && <p className="mt-2 font-display text-price font-bold tabular-nums">{productPriceLabel(product, currency)}</p>}

        {product.options.map((group) => {
          const count = group.choices.filter((choice) => selected.includes(choice.id)).length;
          const single = group.max === 1;
          return (
            <fieldset key={group.id} id={`grupo-${group.id}`} className="mt-5">
              <legend className="flex w-full items-baseline justify-between gap-3">
                <span className="font-semibold wrap-anywhere">{group.name}</span>
                <span className="shrink-0 text-caption text-muted">{requirement(group)}</span>
              </legend>
              <div className="mt-1 divide-y divide-line/25">
                {group.choices.map((choice) => {
                  const checked = selected.includes(choice.id);
                  // Al llegar al máximo del grupo, las demás opciones se desactivan hasta desmarcar alguna.
                  const disabled = !choice.available || (!single && !checked && count >= group.max);
                  return (
                    <label
                      key={choice.id}
                      className={`flex min-h-12 items-center gap-3 py-1.5 ${
                        disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"
                      }`}
                    >
                      <input
                        type={single && group.min === 1 ? "radio" : "checkbox"}
                        name={`grupo-${group.id}`}
                        className="h-5 w-5 shrink-0 accent-[var(--brand)]"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(group, choice)}
                      />
                      <span className="min-w-0 flex-1 wrap-anywhere">{choice.name}</span>
                      <span className="shrink-0 text-sm text-muted tabular-nums">
                        {!choice.available ? "Agotado" : choice.priceCents > 0 ? `+ ${money(choice.priceCents)}` : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-line/30 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
        {problem && (
          <p role="alert" className="mb-2 text-sm font-semibold text-danger">
            {problem}
          </p>
        )}
        {!hasOptions ? (
          <div className="flex min-h-12 items-center justify-between gap-3">
            <p className="font-display text-title font-bold tabular-nums">{money(product.priceCents)}</p>
            {!product.available ? (
              <span className="rounded-full border border-line px-3 py-1 text-sm font-semibold text-muted">Agotado</span>
            ) : canOrder ? (
              <QuantityControl
                name={product.name}
                quantity={quantity}
                max={product.maxQuantity}
                onAdd={() => onAdd([], 1)}
                onRemove={onRemove}
              />
            ) : (
              <span className="text-sm text-muted">La tienda está cerrada</span>
            )}
          </div>
        ) : !product.available ? (
          <div className="flex min-h-12 items-center justify-between gap-3">
            <p className="font-display text-title font-bold tabular-nums">{money(unitCents)}</p>
            <span className="rounded-full border border-line px-3 py-1 text-sm font-semibold text-muted">Agotado</span>
          </div>
        ) : !canOrder ? (
          <div className="flex min-h-12 items-center justify-between gap-3">
            <p className="font-display text-title font-bold tabular-nums">{money(unitCents)}</p>
            <span className="text-sm text-muted">La tienda está cerrada</span>
          </div>
        ) : room <= 0 ? (
          <p className="flex min-h-12 items-center text-sm text-muted">
            Ya tienes en tu pedido todas las unidades disponibles de este producto.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <div className="inline-flex shrink-0 items-center rounded-full border border-line bg-raised">
              <button
                type="button"
                className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-ink hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Una unidad menos"
                disabled={units <= 1}
                onClick={() => setAmount(units - 1)}
              >
                <MinusIcon width={20} height={20} />
              </button>
              <span className="min-w-7 text-center font-semibold tabular-nums" aria-live="polite" aria-atomic="true">
                <span className="sr-only">Cantidad: </span>
                {units}
              </span>
              <button
                type="button"
                className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-ink hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label={units >= room ? "No hay más unidades" : "Una unidad más"}
                disabled={units >= room}
                onClick={() => setAmount(units + 1)}
              >
                <PlusIcon width={20} height={20} />
              </button>
            </div>
            <button type="button" id="anadir-al-pedido" className="btn btn-primary min-h-12 flex-1 px-4" onClick={addToOrder}>
              <span>Añadir</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{money(unitCents * units)}</span>
            </button>
          </div>
        )}
        {hasOptions && canOrder && product.available && quantity > 0 && (
          <p className="mt-2 text-center text-caption text-muted">
            Ya llevas {quantity} en tu pedido. Puedes añadir otro con opciones distintas.
          </p>
        )}
      </div>
    </div>
  );
}
