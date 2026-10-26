"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { APP_NAME } from "../../lib/config";
import { partsIn } from "../../lib/dates";
import { getOpenStatus, hasAnyHours, scheduleLines } from "../../lib/hours";
import { formatMoney } from "../../lib/money";
import { CartSheet } from "./CartSheet";
import { ProductCard } from "./ProductCard";
import { ProductDialog } from "./ProductDialog";
import { PromoCarousel } from "./PromoCarousel";
import { SecretTap } from "../secret/SecretTap";
import { CloseIcon } from "../ui/icons";
import type { CheckCoupon, MenuBanners, MenuBusiness, MenuCategoryData, OrderReceipt, SubmitOrder } from "./types";
import { useCart } from "./useCart";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Props = {
  business: MenuBusiness;
  categories: MenuCategoryData[];
  /** Publicidad opcional del negocio: carrusel principal y barra pequeña. */
  banners?: MenuBanners;
  /** Registra el pedido y devuelve su número y el enlace de WhatsApp. */
  submitOrder: SubmitOrder;
  /** Revisa si un cupón sirve. Sin ella, el menú no ofrece el campo de cupón. */
  checkCoupon?: CheckCoupon;
  /** Contenido opcional encima del menú (lo usa la demo para mostrar un aviso). */
  topSlot?: ReactNode;
};

/**
 * Vista del cliente: catálogo por categorías, carrito y pedido por WhatsApp.
 * Pensada primero para el celular; en pantallas anchas los productos van en dos columnas.
 */
export function MenuView({ business, categories, banners, submitOrder, checkCoupon, topSlot }: Props) {
  const visibleCategories = useMemo(() => categories.filter((category) => category.products.length > 0), [categories]);
  const products = useMemo(() => visibleCategories.flatMap((category) => category.products), [visibleCategories]);
  const cart = useCart(`comanda:pedido:${business.slug}`, products);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Producto cuya ficha (foto grande y descripción) se está viendo.
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailProduct = useMemo(
    () => products.find((product) => product.id === detailId) ?? null,
    [products, detailId],
  );

  // Abierto o cerrado. El servidor lo calcula al cargar; aquí se revisa cada
  // medio minuto por si la tienda abre o cierra mientras la página sigue abierta.
  const { openMode, schedule, timezone } = business;
  const [status, setStatus] = useState(business.openStatus);
  const [today, setToday] = useState<number | null>(null);
  const [hoursOpen, setHoursOpen] = useState(false);
  useEffect(() => {
    const check = () => {
      const now = new Date();
      setStatus(getOpenStatus(openMode, schedule, now, timezone));
      const parts = partsIn(now, timezone);
      setToday(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay());
    };
    check();
    const timer = window.setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [openMode, schedule, timezone]);
  const canOrder = status.open;
  const showsHours = openMode === "horario" && hasAnyHours(schedule);
  const hours = useMemo(() => scheduleLines(schedule), [schedule]);

  // Último pedido registrado en esta visita. Se guarda por si la página se
  // recarga al volver de WhatsApp: así la persona puede reabrir el chat.
  const receiptKey = `comanda:recibo:${business.slug}`;
  const [lastReceipt, setLastReceipt] = useState<OrderReceipt | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(receiptKey) ?? "null");
      if (saved && typeof saved.number === "number" && typeof saved.whatsappUrl === "string") setLastReceipt(saved);
    } catch {
      // Sin almacenamiento: no hay aviso que recuperar.
    }
  }, [receiptKey]);
  function rememberReceipt(receipt: OrderReceipt | null) {
    setLastReceipt(receipt);
    try {
      if (receipt) window.sessionStorage.setItem(receiptKey, JSON.stringify(receipt));
      else window.sessionStorage.removeItem(receiptKey);
    } catch {
      // Ignorado.
    }
  }

  const categoryIds = useMemo(() => visibleCategories.map((category) => category.id), [visibleCategories]);
  const [activeId, setActiveId] = useState(categoryIds[0] ?? "");
  const navRef = useRef<HTMLDivElement>(null);

  // Marca en la barra la categoría que se está viendo al desplazarse.
  useEffect(() => {
    if (categoryIds.length < 2) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = categoryIds[0];
      for (const id of categoryIds) {
        const section = document.getElementById(`categoria-${id}`);
        if (section && section.getBoundingClientRect().top <= 150) current = id;
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom && window.scrollY > 0) current = categoryIds[categoryIds.length - 1];
      setActiveId(current);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [categoryIds]);

  // Mantiene a la vista el botón de la categoría activa dentro de la barra.
  useEffect(() => {
    const nav = navRef.current;
    const chip = nav?.querySelector<HTMLElement>(`[data-category="${activeId}"]`);
    if (!nav || !chip) return;
    const left = chip.offsetLeft - nav.clientWidth / 2 + chip.clientWidth / 2;
    nav.scrollTo({ left, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [activeId]);

  function goToCategory(id: string) {
    setActiveId(id);
    document
      .getElementById(`categoria-${id}`)
      ?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  const showCartBar = canOrder && cart.count > 0;

  return (
    <div className={`mx-auto w-full max-w-5xl px-4 ${showCartBar ? "pb-28" : "pb-4"}`}>
      {topSlot}

      {lastReceipt && !sheetOpen && (
        <section
          aria-label="Tu último pedido"
          className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card bg-brand-tint py-3 pr-2 pl-4"
        >
          <p className="min-w-0 flex-1 basis-48 text-sm">
            <strong className="font-semibold">Pedido #{lastReceipt.number} registrado.</strong> Si aún no lo enviaste,
            ábrelo en WhatsApp y toca enviar.
          </p>
          <a
            className="btn btn-primary btn-sm"
            href={lastReceipt.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir WhatsApp
          </a>
          {lastReceipt.trackUrl && (
            <a className="btn btn-secondary btn-sm" href={lastReceipt.trackUrl} target="_blank" rel="noopener noreferrer">
              Ver cómo va
            </a>
          )}
          <button
            type="button"
            className="btn btn-ghost w-11 px-0"
            aria-label="Ocultar este aviso"
            onClick={() => rememberReceipt(null)}
          >
            <CloseIcon width={20} height={20} />
          </button>
        </section>
      )}

      <header className="pt-6 pb-3">
        <div className="flex items-center gap-3">
          {business.logoUrl && (
            <img
              src={business.logoUrl}
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 shrink-0 rounded-field bg-raised object-contain"
            />
          )}
          <div className="min-w-0">
            <h1 className="font-display text-display font-bold wrap-anywhere">{business.name}</h1>
            <p className="text-caption text-muted">Arma tu pedido y envíalo por WhatsApp</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${
                status.open ? "bg-brand-tint text-ink" : "border border-line bg-raised text-ink"
              }`}
            >
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${status.open ? "bg-brand" : "bg-danger"}`} />
              {status.label}
            </span>
            {status.detail && <span className="text-muted">{status.detail}</span>}
          </p>
          {showsHours && (
            <button
              type="button"
              className="link min-h-8 cursor-pointer text-sm"
              aria-expanded={hoursOpen}
              aria-controls="horarios"
              onClick={() => setHoursOpen((value) => !value)}
            >
              {hoursOpen ? "Ocultar horarios" : "Ver horarios"}
            </button>
          )}
        </div>

        {showsHours && (
          <div id="horarios" hidden={!hoursOpen} className="card mt-3 max-w-sm">
            <h2 className="font-semibold">Horario de atención</h2>
            <dl className="mt-2 flex flex-col gap-1 text-sm">
              {hours.map((line, position) => {
                // scheduleLines va de lunes a domingo; `today` usa 0 = domingo.
                const isToday = today !== null && (position + 1) % 7 === today;
                return (
                  <div key={line.day} className={`flex justify-between gap-4 ${isToday ? "font-semibold" : ""}`}>
                    <dt>
                      {line.day}
                      {isToday && <span className="font-normal text-muted"> (hoy)</span>}
                    </dt>
                    <dd className={`text-right tabular-nums ${line.text === "Cerrado" && !isToday ? "text-muted" : ""}`}>
                      {line.text}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        )}
      </header>

      {!canOrder && (
        <p role="status" className="mb-1 rounded-card border border-line/60 bg-raised px-4 py-3 text-sm">
          <strong className="font-semibold">Ahora estamos cerrados.</strong> {status.detail} Puedes ver el menú, pero
          por el momento no recibimos pedidos.
        </p>
      )}

      {banners && (
        <>
          <PromoCarousel slides={banners.principal} variant="principal" label="Promociones" />
          <PromoCarousel slides={banners.barra} variant="barra" label="Avisos" />
        </>
      )}

      {visibleCategories.length > 1 && (
        <nav
          aria-label="Categorías"
          className="sticky top-[env(safe-area-inset-top,0px)] z-10 -mx-4 mt-2 border-b border-line/25 bg-surface"
        >
          <div ref={navRef} className="no-scrollbar relative flex gap-2 overflow-x-auto px-4 py-2">
            {visibleCategories.map((category) => {
              const active = category.id === activeId;
              return (
                <button
                  key={category.id}
                  type="button"
                  data-category={category.id}
                  aria-current={active ? "true" : undefined}
                  onClick={() => goToCategory(category.id)}
                  className={`min-h-11 shrink-0 cursor-pointer rounded-full px-4 font-semibold whitespace-nowrap ${
                    active ? "bg-brand-tint text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <main>
        {visibleCategories.length === 0 && (
          <p className="card mt-6 text-center text-muted">Este menú todavía no tiene productos. Vuelve pronto.</p>
        )}
        {visibleCategories.map((category) => (
          <section
            key={category.id}
            id={`categoria-${category.id}`}
            aria-labelledby={`titulo-${category.id}`}
            className="scroll-mt-[calc(env(safe-area-inset-top,0px)+68px)] pt-6"
          >
            <h2 id={`titulo-${category.id}`} className="font-display text-title font-bold wrap-anywhere">
              {category.name}
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {category.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  currency={business.currency}
                  quantity={cart.quantityOf(product.id)}
                  canOrder={canOrder}
                  onAdd={() => cart.add(product.id)}
                  onRemove={() => cart.decrement(product.id)}
                  onOpen={() => setDetailId(product.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer className="pt-10 pb-4 text-center text-caption text-muted">
        <SecretTap>Menú hecho con {APP_NAME}</SecretTap>
        {business.privacy && (
          <>
            {" · "}
            <a className="underline underline-offset-2" href={business.privacy.url}>
              Tratamiento de datos
            </a>
          </>
        )}
      </footer>

      {showCartBar && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line/25 bg-surface px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label={`Ver pedido: ${cart.count} ${cart.count === 1 ? "producto" : "productos"}, ${formatMoney(cart.subtotalCents, business.currency)}`}
            className="cart-bar-in brand-hover mx-auto flex min-h-14 w-full max-w-xl cursor-pointer items-center gap-3 rounded-full bg-brand px-4 text-on-brand"
          >
            <span className="grid h-8 min-w-8 place-items-center rounded-full bg-accent px-2 text-sm font-bold text-on-accent tabular-nums">
              {cart.count}
            </span>
            <span className="font-semibold">Ver pedido</span>
            <span className="ml-auto pr-2 font-display font-bold tabular-nums">
              {formatMoney(cart.subtotalCents, business.currency)}
            </span>
          </button>
        </div>
      )}

      <ProductDialog
        product={detailProduct}
        currency={business.currency}
        quantity={detailProduct ? cart.quantityOf(detailProduct.id) : 0}
        room={detailProduct ? cart.roomFor(detailProduct.id) : 0}
        canOrder={canOrder}
        onAdd={(choiceIds, quantity) => detailProduct && cart.add(detailProduct.id, choiceIds, quantity)}
        onRemove={() => detailProduct && cart.decrement(detailProduct.id)}
        onClose={() => setDetailId(null)}
      />

      <CartSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        business={business}
        cart={cart}
        submitOrder={submitOrder}
        checkCoupon={checkCoupon}
        onOrderPlaced={rememberReceipt}
      />
    </div>
  );
}
