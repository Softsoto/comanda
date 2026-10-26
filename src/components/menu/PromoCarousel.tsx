"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "../ui/icons";
import type { MenuBanner } from "./types";

/** Cada cuánto pasa sola a la siguiente imagen. */
const INTERVAL_MS = 5000;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Distancia entre el comienzo de una imagen y el de la siguiente. */
function stepOf(track: HTMLElement): number {
  const first = track.children[0] as HTMLElement | undefined;
  const second = track.children[1] as HTMLElement | undefined;
  return first && second ? second.offsetLeft - first.offsetLeft : track.clientWidth;
}

type Props = {
  slides: MenuBanner[];
  /** "principal": imágenes grandes, el doble de anchas que altas. "barra": franja delgada. */
  variant: "principal" | "barra";
  /** Nombre del carrusel para lectores de pantalla. */
  label: string;
};

/**
 * Carrusel de publicidad. Se desliza con el dedo (es una lista con scroll
 * horizontal), pasa solo cada pocos segundos y se detiene cuando la persona
 * lo toca, lo pausa o prefiere menos movimiento en su dispositivo.
 * En pantallas anchas muestra dos imágenes a la vez.
 */
export function PromoCarousel({ slides, variant, label }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // Posiciones a las que se puede desplazar (menos que imágenes cuando se ven dos a la vez).
  const [stops, setStops] = useState(1);
  const [canRotate, setCanRotate] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  // Hasta cuándo un desplazamiento se considera "del carrusel" y no de la persona.
  const autoScrollUntil = useRef(0);

  useEffect(() => {
    setCanRotate(!reducedMotion());
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const step = stepOf(track);
      setStops(step > 0 ? Math.round((track.scrollWidth - track.clientWidth) / step) + 1 : 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [slides.length]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      // Si el movimiento no lo inició el carrusel, la persona tomó el control: deja de pasar solo.
      if (Date.now() > autoScrollUntil.current) setPlaying(false);
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const step = stepOf(track);
        if (step > 0) setIndex(Math.round(track.scrollLeft / step));
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const goTo = useCallback((target: number) => {
    const track = trackRef.current;
    if (!track) return;
    autoScrollUntil.current = Date.now() + 1500;
    track.scrollTo({ left: target * stepOf(track), behavior: reducedMotion() ? "auto" : "smooth" });
  }, []);

  const current = Math.min(index, stops - 1);
  const rotating = canRotate && playing && !hovering && !focused && stops > 1;

  useEffect(() => {
    if (!rotating) return;
    // Se rearma con cada cambio de imagen; si la pestaña está oculta, espera a la siguiente vuelta.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") goTo((current + 1) % stops);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [rotating, current, stops, goTo]);

  if (slides.length === 0) return null;
  const single = slides.length === 1;
  const principal = variant === "principal";

  return (
    <section
      aria-roledescription="carrusel"
      aria-label={label}
      className="mt-3"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovering(true);
      }}
      onPointerLeave={() => setHovering(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {/* Con varias imágenes la tira recibe el foco, para poder recorrerla también con las flechas del teclado. */}
      <div
        ref={trackRef}
        tabIndex={stops > 1 ? 0 : undefined}
        role={stops > 1 ? "group" : undefined}
        aria-label={stops > 1 ? "Imágenes: desliza o usa las flechas para verlas" : undefined}
        className={`no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain rounded-card ${
          single ? "md:max-w-[640px]" : ""
        }`}
      >
        {slides.map((slide, position) => (
          <div
            key={slide.id}
            role="group"
            aria-roledescription="imagen"
            aria-label={`${position + 1} de ${slides.length}`}
            className={`shrink-0 basis-full snap-start overflow-hidden rounded-card bg-raised ${
              principal ? "aspect-[2/1]" : "aspect-[4/1]"
            } ${single ? "" : "md:basis-[calc(50%-6px)]"}`}
          >
            <img
              src={slide.imageUrl}
              alt={slide.title || "Imagen promocional"}
              width={1200}
              height={principal ? 600 : 300}
              loading={position === 0 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>

      {stops > 1 && (
        <div className="mt-1 flex items-center justify-center">
          {Array.from({ length: stops }, (_, position) => (
            <button
              key={position}
              type="button"
              className="grid h-6 w-6 cursor-pointer place-items-center"
              aria-label={`Ver imagen ${position + 1}`}
              aria-current={position === current ? "true" : undefined}
              onClick={() => {
                setPlaying(false);
                goTo(position);
              }}
            >
              <span
                className={`h-2 rounded-full transition-[width,background-color] duration-200 ${
                  position === current ? "w-5 bg-ink" : "w-2 bg-line"
                }`}
              />
            </button>
          ))}
          {canRotate && (
            <button
              type="button"
              className="ml-1 grid h-6 w-6 cursor-pointer place-items-center rounded-full text-muted hover:text-ink"
              aria-label={playing ? "Pausar el paso automático de imágenes" : "Reanudar el paso automático de imágenes"}
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? <PauseIcon width={14} height={14} /> : <PlayIcon width={14} height={14} />}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
