"use client";

import { useEffect, useRef, useState } from "react";
import { LIMITS } from "../../lib/config";
import { COUPON_CODE_MAX, describeCoupon, normalizeCode, type AppliedCoupon } from "../../lib/coupons";
import { formatMoney } from "../../lib/money";
import { optionsSummary } from "../../lib/options";
import { DELIVERY_MODES, computeTotals, deliveryFeeFor, type DeliveryMode } from "../../lib/orders";
import { validateCustomer, type CustomerErrors, type OrderCustomer } from "../../lib/whatsapp";
import { CheckIcon, CloseIcon, SendIcon } from "../ui/icons";
import { QuantityControl } from "./ProductCard";
import type { CheckCoupon, CheckCouponResult, MenuBusiness, OrderReceipt, SubmitOrder, SubmitOrderResult } from "./types";
import type { Cart } from "./useCart";

const CUSTOMER_KEY = "comanda:cliente";

const choiceClass = (selected: boolean, padding = "px-4") =>
  [
    `inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full ${padding} text-center font-semibold`,
    "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
    // El aro (ring) engrosa el borde sin cambiar el tamaño del botón.
    selected ? "border border-brand bg-brand-tint text-ink ring-1 ring-brand" : "border border-line bg-raised text-ink",
  ].join(" ");

/**
 * Abre una pestaña en blanco mientras dura el toque de la persona. Después
 * de consultar al servidor el navegador ya no dejaría abrirla, así que se
 * abre antes y luego se le indica a dónde ir.
 */
function openBlankTab(): Window | null {
  let tab: Window | null = null;
  try {
    tab = window.open("", "_blank");
  } catch {
    return null;
  }
  if (!tab) return null;
  try {
    tab.opener = null;
    tab.document.title = "WhatsApp";
    tab.document.body.innerHTML = '<p style="font:16px system-ui,sans-serif;padding:24px">Abriendo WhatsApp…</p>';
  } catch {
    // La pestaña sirve igual aunque no se pueda escribir en ella.
  }
  return tab;
}

const isFramed = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

type Props = {
  open: boolean;
  onClose: () => void;
  business: MenuBusiness;
  cart: Cart;
  submitOrder: SubmitOrder;
  /** Revisa un cupón en el servidor. Sin esta función no se ofrece el campo de cupón. */
  checkCoupon?: CheckCoupon;
  onOrderPlaced: (receipt: OrderReceipt) => void;
};

/** Hoja del pedido: productos elegidos, datos de entrega, cupón y envío. */
export function CartSheet({ open, onClose, business, cart, submitOrder, checkCoupon, onOrderPlaced }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [customer, setCustomer] = useState<OrderCustomer>({
    name: "",
    phone: "",
    delivery: business.deliveryModes[0] ?? "recoger",
    address: "",
    payment: business.paymentMethods[0] ?? "",
    notes: "",
  });
  const [table, setTable] = useState("");
  // Zona de domicilio elegida ("" = ninguna todavía).
  const [zoneId, setZoneId] = useState("");
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [couponText, setCouponText] = useState("");
  const [couponError, setCouponError] = useState("");
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [sending, setSending] = useState(false);
  // Evita registrar el pedido dos veces si el botón se toca dos veces seguidas.
  const busy = useRef(false);
  const [problem, setProblem] = useState<{ message: string; menuChanged: boolean } | null>(null);
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const [copied, setCopied] = useState(false);

  // Abre y cierra el <dialog> nativo; mientras está abierto, la página de fondo no se desplaza.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  // Recuerda nombre, teléfono y dirección para el próximo pedido (solo en este navegador).
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(CUSTOMER_KEY) ?? "null");
      if (saved && typeof saved === "object") {
        setCustomer((current) => ({
          ...current,
          name: typeof saved.name === "string" ? saved.name : current.name,
          phone: typeof saved.phone === "string" ? saved.phone : current.phone,
          address: typeof saved.address === "string" ? saved.address : current.address,
          delivery: business.deliveryModes.includes(saved.delivery) ? (saved.delivery as DeliveryMode) : current.delivery,
        }));
        if (business.zones.some((zone) => zone.id === saved.zoneId)) setZoneId(saved.zoneId);
      }
    } catch {
      // Sin almacenamiento: el formulario empieza vacío.
    }
    // Solo al abrir la página: si se repitiera, pisaría lo que la persona está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof OrderCustomer>(key: K, value: OrderCustomer[K]) =>
    setCustomer((current) => ({ ...current, [key]: value }));

  const money = (cents: number) => formatMoney(cents, business.currency);
  const toHome = customer.delivery === "domicilio";
  const usesZones = business.zones.length > 0;
  const zone = business.zones.find((item) => item.id === zoneId) ?? null;
  // El cupón solo cuenta si el pedido llega al mínimo que pide.
  const couponApplies = coupon !== null && cart.subtotalCents >= coupon.minSubtotalCents;
  const totals = computeTotals({
    lines: cart.lines.map((line) => ({ priceCents: line.unitPriceCents, quantity: line.quantity })),
    delivery: customer.delivery,
    deliveryFeeCents: deliveryFeeFor(business, zoneId),
    freeDeliveryFromCents: business.freeDeliveryFromCents,
    coupon: couponApplies ? coupon : null,
    currency: business.currency,
  });
  const missingForMinimum = Math.max(0, business.minOrderCents - totals.subtotalCents);
  const missingForFreeDelivery =
    toHome && business.freeDeliveryFromCents > 0 && !totals.deliveryFree
      ? business.freeDeliveryFromCents - totals.subtotalCents
      : 0;
  const modes = DELIVERY_MODES.filter((mode) => business.deliveryModes.includes(mode.value));
  const needsPrivacyCheck = Boolean(business.privacy?.checkbox);

  const findProblems = (): CustomerErrors =>
    validateCustomer(
      { ...customer, zone: zone?.name ?? "" },
      {
        deliveryModes: business.deliveryModes,
        paymentMethods: business.paymentMethods,
        zones: business.zones.map((item) => item.name),
      },
    );
  const errors: CustomerErrors = showErrors ? findProblems() : {};
  const privacyError = showErrors && needsPrivacyCheck && !privacyChecked;

  /** Pregunta al servidor si el cupón escrito sirve para este pedido. */
  async function applyCoupon() {
    if (!checkCoupon || checkingCoupon) return;
    const code = normalizeCode(couponText);
    if (!code) {
      setCouponError("Escribe el código del cupón.");
      return;
    }
    setCouponError("");
    setCheckingCoupon(true);
    let result: CheckCouponResult;
    try {
      result = await checkCoupon(code, cart.subtotalCents);
    } catch {
      result = { ok: false, error: "No se pudo revisar el cupón. Revisa tu conexión y vuelve a intentar." };
    }
    setCheckingCoupon(false);
    if (!result.ok) {
      setCoupon(null);
      setCouponError(result.error);
      return;
    }
    setCoupon(result.coupon);
    setCouponText("");
  }

  /**
   * Registra el pedido en el servidor y, con el número que este devuelve,
   * abre WhatsApp con el mensaje listo.
   */
  async function handleSubmit() {
    if (busy.current) return;
    const problems = findProblems();
    const firstProblem = (Object.keys(problems) as (keyof CustomerErrors)[])[0];
    const missingPrivacy = needsPrivacyCheck && !privacyChecked;
    if (cart.lines.length === 0 || firstProblem || missingForMinimum > 0 || missingPrivacy) {
      setShowErrors(true);
      const fieldId = firstProblem
        ? {
            name: "cliente-nombre",
            phone: "cliente-telefono",
            zone: "cliente-zona",
            address: "cliente-direccion",
            delivery: "",
            payment: "",
          }[firstProblem]
        : missingPrivacy
          ? "cliente-privacidad"
          : "";
      if (fieldId) window.setTimeout(() => document.getElementById(fieldId)?.focus(), 0);
      return;
    }

    try {
      window.localStorage.setItem(
        CUSTOMER_KEY,
        JSON.stringify({
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          delivery: customer.delivery,
          zoneId,
        }),
      );
    } catch {
      // Ignorado.
    }

    setProblem(null);
    busy.current = true;
    setSending(true);
    const tab = openBlankTab();
    let result: SubmitOrderResult;
    try {
      result = await submitOrder({
        items: cart.lines.map((line) => ({ productId: line.product.id, quantity: line.quantity, choiceIds: line.choiceIds })),
        customer: {
          ...customer,
          zone: toHome ? (zone?.name ?? "") : "",
          address: toHome ? customer.address : customer.delivery === "local" ? table : "",
        },
        zoneId: toHome && zone ? zone.id : null,
        couponCode: couponApplies && coupon ? coupon.code : undefined,
        privacyAccepted: needsPrivacyCheck ? privacyChecked : undefined,
      });
    } catch {
      result = { ok: false, error: "No se pudo registrar el pedido. Revisa tu conexión y vuelve a intentar." };
    }
    busy.current = false;
    setSending(false);

    if (!result.ok) {
      tab?.close();
      if (result.field === "coupon") {
        // El cupón dejó de servir (venció, se agotó…): se quita y se explica junto a su campo.
        setCoupon(null);
        setCouponError(result.error);
        window.setTimeout(() => document.getElementById("cupon-codigo")?.focus(), 0);
        return;
      }
      setProblem({ message: result.error, menuChanged: Boolean(result.menuChanged) });
      return;
    }

    setReceipt(result.receipt);
    onOrderPlaced(result.receipt);
    cart.clear();
    setShowErrors(false);
    setCoupon(null);
    setCouponError("");
    set("notes", "");
    if (tab) {
      tab.location.replace(result.receipt.whatsappUrl);
    } else if (!isFramed()) {
      // Navegadores que no abren pestañas nuevas (por ejemplo, dentro de otras apps).
      window.location.assign(result.receipt.whatsappUrl);
    }
  }

  async function copyMessage() {
    if (!receipt) return;
    try {
      await navigator.clipboard.writeText(receipt.message);
    } catch {
      const area = document.getElementById("pedido-texto");
      if (area) window.getSelection()?.selectAllChildren(area);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setReceipt(null);
    setProblem(null);
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby="pedido-titulo"
      onClose={handleClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div className="flex h-full flex-col pt-[env(safe-area-inset-top,0px)]">
        <header className="flex items-center gap-3 border-b border-line/30 py-2 pr-2 pl-4">
          <h2 id="pedido-titulo" className="font-display text-title font-bold">
            {receipt ? `Pedido #${receipt.number}` : "Tu pedido"}
          </h2>
          <button type="button" className="btn btn-ghost ml-auto w-11 px-0" aria-label="Cerrar" onClick={handleClose}>
            <CloseIcon />
          </button>
        </header>

        {receipt ? (
          <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-tint text-brand">
                <CheckIcon width={28} height={28} />
              </span>
              <h3 className="font-display text-title font-bold">Pedido registrado</h3>
              <p className="max-w-sm text-muted">
                Tu pedido es el <strong className="font-semibold text-ink">#{receipt.number}</strong>, por{" "}
                {money(receipt.totalCents)}
                {receipt.deliveryPending ? " más el domicilio, que te confirman por WhatsApp" : ""}.{" "}
                {business.whatsapp
                  ? `Falta un paso: toca enviar en el chat de WhatsApp para que ${business.name} lo reciba.`
                  : "Falta un paso: elige el chat en WhatsApp y toca enviar."}
              </p>
            </div>
            <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
              <a className="btn btn-primary min-h-12" href={receipt.whatsappUrl} target="_blank" rel="noopener noreferrer">
                <SendIcon width={20} height={20} />
                Abrir WhatsApp
              </a>
              {receipt.trackUrl && (
                <a className="btn btn-outline-brand" href={receipt.trackUrl} target="_blank" rel="noopener noreferrer">
                  Ver cómo va mi pedido
                </a>
              )}
              <button type="button" className="btn btn-secondary" onClick={copyMessage}>
                {copied ? "Copiado" : "Copiar el pedido"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={handleClose}>
                Volver al menú
              </button>
            </div>
            <details className="mx-auto w-full max-w-sm">
              <summary className="cursor-pointer py-2 text-sm font-semibold text-muted">Ver el texto del pedido</summary>
              <pre
                id="pedido-texto"
                className="mt-1 rounded-field border border-line/40 bg-raised p-3 font-sans text-sm wrap-anywhere whitespace-pre-wrap"
              >
                {receipt.message}
              </pre>
            </details>
          </div>
        ) : cart.lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-muted">Tu pedido está vacío. Añade productos del menú.</p>
            <button type="button" className="btn btn-secondary" onClick={handleClose}>
              Volver al menú
            </button>
          </div>
        ) : (
          <>
            {/* "relative": lo que va oculto a la vista (las casillas de las opciones) se mueve con esta zona y no desborda la hoja. */}
            <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <ul className="flex flex-col divide-y divide-line/25">
                {cart.lines.map((line) => {
                  const options = optionsSummary(line.chosen);
                  const label = options ? `${line.product.name} (${options})` : line.product.name;
                  return (
                    <li key={line.key} className="flex items-center gap-3 py-3 first:pt-0">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold wrap-anywhere">{line.product.name}</p>
                        {options && <p className="text-caption wrap-anywhere text-muted">{options}</p>}
                        <p className="tabular-nums">
                          <span className="mr-2 font-display font-bold">{money(line.unitPriceCents * line.quantity)}</span>
                          {line.quantity > 1 && (
                            <span className="inline-block text-caption whitespace-nowrap text-muted">
                              {line.quantity} x {money(line.unitPriceCents)}
                            </span>
                          )}
                        </p>
                      </div>
                      <QuantityControl
                        compact
                        name={label}
                        quantity={line.quantity}
                        max={line.quantity + cart.roomFor(line.product.id)}
                        onAdd={() => cart.increment(line.key)}
                        onRemove={() => cart.decrement(line.key)}
                      />
                    </li>
                  );
                })}
              </ul>

              {business.hasCoupons && checkCoupon && (
                <div className="mt-2 border-t border-line/40 pt-4">
                  {coupon ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-field bg-brand-tint px-3 py-2">
                      <p className="min-w-0 flex-1 basis-40 text-sm">
                        <strong className="font-semibold">Cupón {coupon.code}</strong> ·{" "}
                        {describeCoupon(coupon, business.currency)}
                      </p>
                      <button
                        type="button"
                        className="link min-h-9 cursor-pointer text-sm"
                        onClick={() => {
                          setCoupon(null);
                          setCouponError("");
                        }}
                      >
                        Quitar
                      </button>
                      {!couponApplies && (
                        <p role="status" className="basis-full text-sm">
                          Sirve para pedidos desde {money(coupon.minSubtotalCents)} en productos. Te faltan{" "}
                          {money(coupon.minSubtotalCents - cart.subtotalCents)}.
                        </p>
                      )}
                      {couponApplies && coupon.kind === "free_delivery" && !toHome && (
                        <p role="status" className="basis-full text-sm">
                          Este cupón quita el costo del domicilio: úsalo eligiendo entrega a domicilio.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="label" htmlFor="cupon-codigo">
                        ¿Tienes un cupón?
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="cupon-codigo"
                          className="field min-w-0 flex-1 uppercase placeholder:normal-case"
                          autoComplete="off"
                          autoCapitalize="characters"
                          spellCheck={false}
                          maxLength={COUPON_CODE_MAX + 4}
                          placeholder="Escribe el código"
                          value={couponText}
                          onChange={(event) => {
                            setCouponText(event.target.value);
                            setCouponError("");
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void applyCoupon();
                            }
                          }}
                          aria-invalid={couponError ? true : undefined}
                          aria-describedby={couponError ? "error-cupon" : undefined}
                        />
                        <button
                          type="button"
                          id="cupon-aplicar"
                          className="btn btn-secondary min-h-12"
                          disabled={checkingCoupon}
                          onClick={() => void applyCoupon()}
                        >
                          {checkingCoupon ? "Revisando…" : "Aplicar"}
                        </button>
                      </div>
                      {couponError && (
                        <p id="error-cupon" role="alert" className="field-error">
                          {couponError}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <dl className="mt-2 flex flex-col gap-1 border-t border-line/40 pt-4">
                {(toHome || totals.discountCents > 0) && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt>Subtotal</dt>
                    <dd className="font-semibold tabular-nums">{money(totals.subtotalCents)}</dd>
                  </div>
                )}
                {totals.discountCents > 0 && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt>Descuento</dt>
                    <dd className="font-semibold tabular-nums">{money(-totals.discountCents)}</dd>
                  </div>
                )}
                {toHome && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt>Domicilio</dt>
                    <dd
                      className={
                        totals.deliveryPending ? "text-caption text-muted" : "font-semibold tabular-nums"
                      }
                    >
                      {totals.deliveryFree
                        ? "Gratis"
                        : totals.deliveryPending
                          ? usesZones
                            ? "Elige tu zona"
                            : "Se confirma por WhatsApp"
                          : money(totals.deliveryCents)}
                    </dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="font-semibold">Total</dt>
                  <dd className="font-display text-title font-bold tabular-nums">{money(totals.totalCents)}</dd>
                </div>
              </dl>
              {missingForFreeDelivery > 0 && (
                <p className="mt-2 text-sm text-muted">
                  Domicilio gratis desde {money(business.freeDeliveryFromCents)} en productos: te faltan{" "}
                  {money(missingForFreeDelivery)}.
                </p>
              )}
              {missingForMinimum > 0 && (
                <p role="status" className="mt-3 rounded-field border border-line/50 bg-raised px-3 py-2.5 text-sm">
                  El pedido mínimo es de <strong className="font-semibold">{money(business.minOrderCents)}</strong>. Te
                  faltan {money(missingForMinimum)}.
                </p>
              )}

              <form
                id="pedido-form"
                className="mt-6 flex flex-col gap-4"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSubmit();
                }}
                // La tecla Intro envía el pedido. Se atiende aquí y no con el envío
                // nativo del formulario, que algunos visores incrustados bloquean.
                onKeyDown={(event) => {
                  if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
                    event.preventDefault();
                    void handleSubmit();
                  }
                }}
              >
                <h3 className="font-display text-title font-bold">Tus datos</h3>

                <div>
                  <label className="label" htmlFor="cliente-nombre">
                    Nombre
                  </label>
                  <input
                    id="cliente-nombre"
                    className="field"
                    autoComplete="name"
                    maxLength={LIMITS.customerName}
                    value={customer.name}
                    onChange={(event) => set("name", event.target.value)}
                    aria-invalid={errors.name ? true : undefined}
                    aria-describedby={errors.name ? "error-nombre" : undefined}
                  />
                  {errors.name && (
                    <p id="error-nombre" className="field-error">
                      {errors.name}
                    </p>
                  )}
                </div>

                <div>
                  <label className="label" htmlFor="cliente-telefono">
                    Teléfono
                  </label>
                  <input
                    id="cliente-telefono"
                    className="field"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={24}
                    value={customer.phone}
                    onChange={(event) => set("phone", event.target.value)}
                    aria-invalid={errors.phone ? true : undefined}
                    aria-describedby={errors.phone ? "error-telefono" : undefined}
                  />
                  {errors.phone && (
                    <p id="error-telefono" className="field-error">
                      {errors.phone}
                    </p>
                  )}
                </div>

                {modes.length > 1 && (
                  <fieldset>
                    <legend className="label">¿Cómo lo recibes?</legend>
                    <div className="flex flex-wrap gap-2">
                      {modes.map((mode) => (
                        <label
                          key={mode.value}
                          // Con tres formas de entrega el margen interior se reduce para que "A domicilio" quepa en una línea.
                          className={`${choiceClass(customer.delivery === mode.value, modes.length > 2 ? "px-2" : "px-4")} flex-1`}
                        >
                          <input
                            type="radio"
                            name="entrega"
                            id={`entrega-${mode.value}`}
                            className="sr-only"
                            checked={customer.delivery === mode.value}
                            onChange={() => set("delivery", mode.value)}
                          />
                          {mode.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}

                {toHome && usesZones && (
                  <div>
                    <label className="label" htmlFor="cliente-zona">
                      Zona o barrio
                    </label>
                    <select
                      id="cliente-zona"
                      className="field"
                      value={zoneId}
                      onChange={(event) => setZoneId(event.target.value)}
                      aria-invalid={errors.zone ? true : undefined}
                      aria-describedby={errors.zone ? "error-zona" : undefined}
                    >
                      <option value="">Elige tu zona</option>
                      {business.zones.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.feeCents > 0 ? money(item.feeCents) : "gratis"}
                        </option>
                      ))}
                    </select>
                    {errors.zone && (
                      <p id="error-zona" className="field-error">
                        {errors.zone}
                      </p>
                    )}
                  </div>
                )}

                {toHome && (
                  <div>
                    <label className="label" htmlFor="cliente-direccion">
                      Dirección de entrega
                    </label>
                    <input
                      id="cliente-direccion"
                      className="field"
                      autoComplete="street-address"
                      maxLength={LIMITS.address}
                      placeholder="Calle, número, barrio, apto"
                      value={customer.address}
                      onChange={(event) => set("address", event.target.value)}
                      aria-invalid={errors.address ? true : undefined}
                      aria-describedby={errors.address ? "error-direccion" : undefined}
                    />
                    {errors.address && (
                      <p id="error-direccion" className="field-error">
                        {errors.address}
                      </p>
                    )}
                  </div>
                )}

                {customer.delivery === "local" && (
                  <div>
                    <label className="label" htmlFor="cliente-mesa">
                      Mesa <span className="font-normal text-muted">(opcional)</span>
                    </label>
                    <input
                      id="cliente-mesa"
                      className="field"
                      autoComplete="off"
                      maxLength={LIMITS.tableLabel}
                      placeholder="Número de mesa"
                      value={table}
                      onChange={(event) => setTable(event.target.value)}
                    />
                  </div>
                )}

                {business.paymentMethods.length > 0 && (
                  <fieldset>
                    <legend className="label">¿Cómo pagas?</legend>
                    <div className="flex flex-wrap gap-2">
                      {business.paymentMethods.map((method, index) => (
                        <label key={method} className={choiceClass(customer.payment === method)}>
                          <input
                            type="radio"
                            name="pago"
                            id={`pago-${index}`}
                            className="sr-only"
                            checked={customer.payment === method}
                            onChange={() => set("payment", method)}
                          />
                          {method}
                        </label>
                      ))}
                    </div>
                    {errors.payment && <p className="field-error">{errors.payment}</p>}
                  </fieldset>
                )}

                <div>
                  <label className="label" htmlFor="cliente-notas">
                    Notas <span className="font-normal text-muted">(opcional)</span>
                  </label>
                  <textarea
                    id="cliente-notas"
                    className="field"
                    rows={2}
                    maxLength={LIMITS.notes}
                    placeholder="Sin cebolla, timbre dañado, pago con billete de 50…"
                    value={customer.notes}
                    onChange={(event) => set("notes", event.target.value)}
                  />
                </div>

                {business.privacy && needsPrivacyCheck && (
                  <div>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
                      <input
                        type="checkbox"
                        id="cliente-privacidad"
                        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]"
                        checked={privacyChecked}
                        onChange={(event) => setPrivacyChecked(event.target.checked)}
                        aria-invalid={privacyError ? true : undefined}
                        aria-describedby={privacyError ? "error-privacidad" : undefined}
                      />
                      <span className="text-sm">
                        Acepto el{" "}
                        <a className="link" href={business.privacy.url} target="_blank" rel="noopener noreferrer">
                          tratamiento de mis datos
                        </a>{" "}
                        para gestionar este pedido.
                      </span>
                    </label>
                    {privacyError && (
                      <p id="error-privacidad" className="field-error">
                        Marca la casilla para enviar tu pedido.
                      </p>
                    )}
                  </div>
                )}
              </form>
            </div>

            <footer className="border-t border-line/30 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
              {problem && (
                <div role="alert" className="mb-3 rounded-field border border-danger px-3 py-2.5 text-sm">
                  <p className="font-semibold text-danger">{problem.message}</p>
                  {problem.menuChanged && (
                    <button type="button" className="link mt-1 text-sm" onClick={() => window.location.reload()}>
                      Actualizar el menú
                    </button>
                  )}
                </div>
              )}
              <button
                type="button"
                id="enviar-pedido"
                className="btn btn-primary min-h-14 w-full"
                disabled={sending || missingForMinimum > 0}
                onClick={() => void handleSubmit()}
              >
                <SendIcon width={20} height={20} className="max-[359px]:hidden" />
                {sending ? "Registrando tu pedido…" : "Enviar pedido por WhatsApp"}
              </button>
              <p className="hint text-center">
                Tu pedido queda registrado y se abre WhatsApp para enviarlo
                {business.whatsapp ? ` a ${business.name}` : ""}.
                {business.privacy && !needsPrivacyCheck && (
                  <>
                    {" "}
                    Al enviarlo aceptas el{" "}
                    <a className="underline underline-offset-2" href={business.privacy.url} target="_blank" rel="noopener noreferrer">
                      tratamiento de tus datos
                    </a>
                    .
                  </>
                )}
              </p>
            </footer>
          </>
        )}
      </div>
    </dialog>
  );
}
