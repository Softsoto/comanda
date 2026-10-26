"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { LIMITS } from "../../lib/config";
import { checkSelection, lineKey } from "../../lib/options";
import type { CartLine, MenuProduct } from "./types";

/**
 * El carrito guarda qué producto, con qué opciones y cuántas unidades.
 * Nombres y precios salen siempre del menú actual, nunca de lo guardado.
 */
type Entry = { key: string; productId: string; choiceIds: string[]; quantity: number };

type Action =
  | { type: "add"; productId: string; choiceIds: string[]; quantity: number; max: number }
  | { type: "decrement"; key: string; shown: number }
  | { type: "clear" }
  | { type: "load"; entries: Entry[] };

function reducer(state: Entry[], action: Action): Entry[] {
  switch (action.type) {
    case "add": {
      // El tope (existencias) es por producto: cuentan todas sus variantes juntas.
      const taken = state
        .filter((entry) => entry.productId === action.productId)
        .reduce((sum, entry) => sum + entry.quantity, 0);
      const room = Math.min(action.max, LIMITS.maxQuantity) - taken;
      if (room <= 0) return state;
      const quantity = Math.min(action.quantity, room);
      const key = lineKey(action.productId, action.choiceIds);
      if (state.some((entry) => entry.key === key)) {
        return state.map((entry) => (entry.key === key ? { ...entry, quantity: entry.quantity + quantity } : entry));
      }
      if (state.length >= LIMITS.orderLines) return state;
      return [...state, { key, productId: action.productId, choiceIds: action.choiceIds, quantity }];
    }
    case "decrement": {
      // Si quedaron guardadas más unidades de las que hay, se parte de lo que se ve en pantalla.
      const next = action.shown - 1;
      if (next <= 0) return state.filter((entry) => entry.key !== action.key);
      return state.map((entry) => (entry.key === action.key ? { ...entry, quantity: next } : entry));
    }
    case "clear":
      return [];
    case "load":
      return action.entries;
  }
}

/** Lee lo guardado en el navegador. Acepta también el formato anterior (cantidades por producto). */
function readSaved(saved: unknown): Entry[] {
  const entries: Entry[] = [];
  const push = (productId: unknown, choiceIds: unknown, value: unknown) => {
    const quantity = Math.floor(Number(value));
    if (typeof productId !== "string" || !(quantity > 0) || entries.length >= LIMITS.orderLines) return;
    const ids = Array.isArray(choiceIds) ? choiceIds.filter((id): id is string => typeof id === "string").slice(0, 60) : [];
    const key = lineKey(productId, ids);
    if (entries.some((entry) => entry.key === key)) return;
    entries.push({ key, productId, choiceIds: ids, quantity: Math.min(quantity, LIMITS.maxQuantity) });
  };
  if (Array.isArray(saved)) {
    for (const item of saved) if (item && typeof item === "object") push(item.productId, item.choiceIds, item.quantity);
  } else if (saved && typeof saved === "object") {
    for (const [productId, value] of Object.entries(saved as Record<string, unknown>)) push(productId, [], value);
  }
  return entries;
}

/**
 * Carrito de compras.
 * Se guarda en el navegador del cliente (localStorage) para que no se pierda
 * si recarga la página. Si el almacenamiento no está disponible, funciona
 * igual pero sin recordar el pedido.
 */
export function useCart(storageKey: string, products: MenuProduct[]) {
  const [entries, dispatch] = useReducer(reducer, []);
  const [ready, setReady] = useState(false);

  // Al abrir la página: recupera el pedido guardado.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
      const restored = readSaved(saved);
      if (restored.length > 0) dispatch({ type: "load", entries: restored });
    } catch {
      // Sin almacenamiento o con datos dañados: se empieza con el carrito vacío.
    }
    setReady(true);
  }, [storageKey]);

  // Cada cambio se guarda.
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify(entries.map(({ productId, choiceIds, quantity }) => ({ productId, choiceIds, quantity }))),
      );
    } catch {
      // Ignorado: el carrito sigue funcionando en memoria.
    }
  }, [entries, ready, storageKey]);

  const byId = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  // Solo cuentan los productos que siguen en el menú y están disponibles, con
  // opciones que todavía existen, y nunca más unidades de las que quedan.
  const lines: CartLine[] = useMemo(() => {
    const position = new Map(products.map((product, index) => [product.id, index]));
    const used = new Map<string, number>();
    const result: CartLine[] = [];
    const ordered = entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => position.has(entry.productId))
      // En el orden del menú; las variantes de un mismo producto, en el orden en que se añadieron.
      .sort(
        (a, b) =>
          (position.get(a.entry.productId) as number) - (position.get(b.entry.productId) as number) || a.index - b.index,
      );
    for (const { entry } of ordered) {
      const product = byId.get(entry.productId) as MenuProduct;
      if (!product.available || product.maxQuantity <= 0) continue;
      const selection = checkSelection(product.options, entry.choiceIds);
      if (!selection.ok) continue;
      const taken = used.get(product.id) ?? 0;
      const quantity = Math.min(entry.quantity, product.maxQuantity - taken);
      if (quantity <= 0) continue;
      used.set(product.id, taken + quantity);
      result.push({
        key: entry.key,
        product,
        choiceIds: selection.choiceIds,
        chosen: selection.chosen,
        unitPriceCents: product.priceCents + selection.extraCents,
        quantity,
      });
    }
    return result;
  }, [products, byId, entries]);

  /** Unidades de cada producto en el pedido, sumando todas sus variantes. */
  const perProduct = useMemo(() => {
    const totals = new Map<string, number>();
    for (const line of lines) totals.set(line.product.id, (totals.get(line.product.id) ?? 0) + line.quantity);
    return totals;
  }, [lines]);

  const count = useMemo(() => lines.reduce((sum, line) => sum + line.quantity, 0), [lines]);
  const subtotalCents = useMemo(
    () => lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0),
    [lines],
  );

  /** Añade unidades de un producto con las opciones elegidas (ninguna, si el producto no tiene). */
  const add = useCallback(
    (productId: string, choiceIds: string[] = [], quantity = 1) =>
      dispatch({ type: "add", productId, choiceIds, quantity, max: byId.get(productId)?.maxQuantity ?? LIMITS.maxQuantity }),
    [byId],
  );
  /** Suma una unidad a un renglón que ya está en el pedido. */
  const increment = useCallback(
    (key: string) => {
      const line = lines.find((item) => item.key === key);
      if (line) dispatch({ type: "add", productId: line.product.id, choiceIds: line.choiceIds, quantity: 1, max: line.product.maxQuantity });
    },
    [lines],
  );
  /** Quita una unidad de un renglón; al llegar a cero, el renglón desaparece. */
  const decrement = useCallback(
    (key: string) => {
      const line = lines.find((item) => item.key === key);
      dispatch({ type: "decrement", key, shown: line?.quantity ?? 0 });
    },
    [lines],
  );
  const clear = useCallback(() => dispatch({ type: "clear" }), []);
  const quantityOf = useCallback((productId: string) => perProduct.get(productId) ?? 0, [perProduct]);
  /** Cuántas unidades más de ese producto se pueden añadir. */
  const roomFor = useCallback(
    (productId: string) => {
      const max = Math.min(byId.get(productId)?.maxQuantity ?? 0, LIMITS.maxQuantity);
      return Math.max(0, max - (perProduct.get(productId) ?? 0));
    },
    [byId, perProduct],
  );

  return { lines, count, subtotalCents, add, increment, decrement, clear, quantityOf, roomFor };
}

export type Cart = ReturnType<typeof useCart>;
