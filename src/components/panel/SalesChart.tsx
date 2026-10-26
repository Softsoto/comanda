"use client";

import { useState, type KeyboardEvent } from "react";
import { formatCompactMoney, formatMoney } from "@/lib/money";

export type ChartBar = {
  key: string;
  /** Nombre completo del período: "sáb 3 oct", "29 sep – 5 oct"… */
  label: string;
  /** Nombre corto para el eje. */
  shortLabel: string;
  salesCents: number;
  completed: number;
};

type Props = {
  bars: ChartBar[];
  /** Marcas del eje vertical, en centavos, de menor a mayor. */
  ticks: number[];
  currency: string;
  /** "día", "semana" o "mes": cómo están agrupadas las barras. */
  unit: string;
};

/**
 * Gráfica de barras de ventas. Una sola serie, así que no lleva leyenda: el
 * título de la sección dice qué muestra. Al pasar el cursor, tocar o moverse
 * con las flechas del teclado aparece el detalle de cada barra.
 */
export function SalesChart({ bars, ticks, currency, unit }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const top = ticks[ticks.length - 1] || 1;
  const count = bars.length;
  // En el eje no caben todos los nombres: se muestra uno de cada tantos.
  const every = Math.max(1, Math.ceil(count / 6));
  const current = active !== null ? bars[active] : null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = {
      ArrowRight: Math.min(count - 1, (active ?? -1) + 1),
      ArrowLeft: Math.max(0, (active ?? count) - 1),
      Home: 0,
      End: count - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]);
    } else if (event.key === "Escape") {
      setActive(null);
    }
  }

  const describe = (bar: ChartBar) =>
    `${bar.label}: ${formatMoney(bar.salesCents, currency)} en ${bar.completed} ${
      bar.completed === 1 ? "pedido completado" : "pedidos completados"
    }`;

  // El detalle se alinea a la izquierda, al centro o a la derecha para no salirse de la gráfica.
  const position = active === null ? 0 : ((active + 0.5) / count) * 100;
  const align = position < 30 ? "translate-x-0" : position > 70 ? "-translate-x-full" : "-translate-x-1/2";

  return (
    <figure className="mt-4">
      <div className="flex">
        {/* Eje vertical */}
        <div className="relative w-16 shrink-0 text-right text-caption text-muted" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-2 translate-y-1/2 whitespace-nowrap tabular-nums"
              style={{ bottom: `${(tick / top) * 100}%` }}
            >
              {formatCompactMoney(tick, currency)}
            </span>
          ))}
        </div>

        <div
          role="group"
          tabIndex={0}
          aria-label={`Ventas por ${unit}. Usa las flechas izquierda y derecha para recorrer cada ${unit}.`}
          className="relative h-52 min-w-0 flex-1 rounded-field"
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
        >
          {/* Líneas de referencia */}
          {ticks.map((tick) => (
            <span
              key={tick}
              aria-hidden="true"
              className={`absolute inset-x-0 border-t ${tick === 0 ? "border-line" : "border-line/25"}`}
              style={{ bottom: `${(tick / top) * 100}%` }}
            />
          ))}

          {/* Barras: cada columna completa responde al cursor, no solo la barra. */}
          <div className="absolute inset-0 flex items-end">
            {bars.map((bar, index) => (
              <div
                key={bar.key}
                className="flex h-full min-w-0 flex-1 items-end justify-center px-px"
                onPointerEnter={() => setActive(index)}
                onPointerDown={() => setActive(index)}
              >
                <div
                  className={`w-full max-w-6 rounded-t-[4px] bg-chart transition-opacity duration-100 ${
                    active !== null && active !== index ? "opacity-45" : ""
                  }`}
                  style={{
                    height: `${(bar.salesCents / top) * 100}%`,
                    minHeight: bar.salesCents > 0 ? 2 : 0,
                  }}
                />
              </div>
            ))}
          </div>

          {current && (
            <div
              className={`pointer-events-none absolute top-0 z-10 w-max max-w-56 rounded-field border border-line/50 bg-raised px-3 py-2 text-sm shadow-[0_4px_14px_rgb(0_0_0/0.12)] ${align}`}
              style={{ left: `${position}%` }}
            >
              <p className="text-caption text-muted">{current.label}</p>
              <p className="font-semibold tabular-nums">{formatMoney(current.salesCents, currency)}</p>
              <p className="text-caption text-muted">
                {current.completed} {current.completed === 1 ? "pedido completado" : "pedidos completados"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Eje horizontal: cada nombre queda centrado bajo su barra. */}
      <div className="mt-1 flex h-5 pl-16 text-caption text-muted" aria-hidden="true">
        {bars.map((bar, index) => (
          <span key={bar.key} className="relative min-w-0 flex-1">
            {index % every === 0 && (
              <span
                className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap ${
                  // En pantallas pequeñas se muestra uno sí y uno no, para que no se monten.
                  (index / every) % 2 === 1 ? "hidden sm:block" : ""
                }`}
              >
                {bar.shortLabel}
              </span>
            )}
          </span>
        ))}
      </div>

      {/* Para lectores de pantalla: anuncia la barra elegida con el teclado. */}
      <p className="sr-only" role="status" aria-live="polite">
        {current ? describe(current) : ""}
      </p>
    </figure>
  );
}
