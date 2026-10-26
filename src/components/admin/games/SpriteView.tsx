"use client";

import { useEffect, useRef } from "react";
import type { SpriteArt } from "@/lib/game-theme";

/**
 * Un dibujo de píxeles en un <canvas>, agrandado `scale` veces sin suavizar.
 * Lo transparente deja ver el fondo: cuadritos (para ver qué es transparente)
 * o la noche de los juegos (para ver cómo queda allá).
 */
export function SpriteView({
  art,
  scale,
  backdrop = "checker",
  label,
  className = "",
}: {
  art: SpriteArt;
  scale: number;
  backdrop?: "checker" | "night" | "none";
  /** Lo que oye un lector de pantalla; sin `label`, el dibujo es decorativo. */
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = art.rows[0]?.length ?? 0;
  const height = art.rows.length;

  useEffect(() => {
    const canvas = ref.current;
    const c = canvas?.getContext("2d");
    if (!canvas || !c) return;
    // Se dibuja a la medida real y el navegador lo agranda en bloques nítidos (image-rendering: pixelated).
    c.clearRect(0, 0, width, height);
    art.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const color = art.colors[row[x]];
        if (!color) continue;
        c.fillStyle = color;
        c.fillRect(x, y, 1, 1);
      }
    });
  }, [art, width, height]);

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className={`pixelated ${backdrop === "checker" ? "checker" : backdrop === "night" ? "bg-[#0b0a24]" : ""} ${className}`}
      style={{ width: width * scale, height: height * scale, ["--checker-size" as string]: `${Math.max(4, scale / 2)}px` }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
