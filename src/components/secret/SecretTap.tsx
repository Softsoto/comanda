"use client";

import { useRef, useState, type ComponentType, type ReactNode } from "react";

/** Cuántos toques seguidos abren el juego, y cuánto puede pasar entre uno y otro. */
const TAPS = 5;
const GAP_MS = 600;

type Game = ComponentType<{ onClose: () => void }>;

/**
 * La puerta del juego escondido: envuelve un texto cualquiera y, si alguien lo
 * toca cinco veces seguidas, abre "Dos Lunas". No tiene dirección
 * propia ni se nota en la página; el juego solo se descarga cuando se abre.
 */
export function SecretTap({ children }: { children: ReactNode }) {
  const [Game, setGame] = useState<Game | null>(null);
  const [open, setOpen] = useState(false);
  const taps = useRef({ count: 0, last: 0 });

  const onClick = () => {
    const now = performance.now();
    taps.current.count = now - taps.current.last <= GAP_MS ? taps.current.count + 1 : 1;
    taps.current.last = now;
    if (taps.current.count < TAPS) return;
    taps.current.count = 0;
    setOpen(true);
    if (!Game) {
      // El juego y su personalización (textos, nombre, dibujos) se piden a la vez.
      Promise.all([import("./BlocksGame"), import("./theme").then((theme) => theme.loadTheme())])
        .then(([loaded]) => setGame(() => loaded.default))
        // Si no se pudo descargar (sin conexión, por ejemplo), no pasa nada: la página sigue igual.
        .catch(() => setOpen(false));
    }
  };

  return (
    <>
      <span
        onClick={onClick}
        style={{ touchAction: "manipulation", userSelect: "none", WebkitUserSelect: "none", WebkitTapHighlightColor: "transparent" }}
      >
        {children}
      </span>
      {open && Game && <Game onClose={() => setOpen(false)} />}
    </>
  );
}
