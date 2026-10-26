import type { CSSProperties } from "react";
import type { Colors, Sprite } from "./art";
import { drawWord, normalizeText, type PixelWord } from "./pixel-font";

const words = new Map<string, PixelWord>();

function wordOf(word: string, accents: boolean): PixelWord {
  const key = `${accents ? "^" : ""}${word}`;
  let drawn = words.get(key);
  if (!drawn) {
    drawn = drawWord(word, accents);
    words.set(key, drawn);
  }
  return drawn;
}

export type PixelUnit = "u" | "t" | "l";

type Props = {
  children: string;
  /** Cuántos píxeles del juego mide cada píxel de la letra (1 = letra normal, 4 = título). */
  size?: number;
  /** "u": al tamaño de los píxeles del paisaje. "t": al de los textos, que nunca baja de 2 px. "l": al del mensaje. */
  unit?: PixelUnit;
  /** Color de la letra; si no se indica, el del texto que la rodea. */
  color?: string;
  /** Siete colores, uno por fila de la letra, para un título en franjas. */
  bands?: readonly string[];
  /** Contorno de un píxel alrededor de las letras. */
  outline?: string;
  /** Sombra de un píxel abajo a la derecha. */
  shadow?: string;
  /** Deja siempre el espacio de las tildes, para que varios textos queden a la misma altura. */
  tall?: boolean;
  align?: "start" | "center" | "end";
  as?: "p" | "span" | "div" | "h1" | "h2";
  className?: string;
  /**
   * Lo que oyen los lectores de pantalla. Por defecto, el mismo texto. Con "" no
   * se anuncia nada (para dibujos dentro de un botón que ya tiene su nombre).
   */
  label?: string;
};

/**
 * Texto con las letras de píxeles del juego. Cada palabra es un dibujo; así el
 * texto puede partirse en renglones como cualquier otro. El texto de verdad va
 * oculto al lado, para quien use lector de pantalla.
 */
export function PixelText({
  children,
  size = 1,
  unit = "t",
  color,
  bands,
  outline,
  shadow,
  tall = false,
  align = "start",
  as: Tag = "span",
  className,
  label,
}: Props) {
  const text = normalizeText(children);
  // Si alguna letra lleva tilde, todos los renglones reservan ese espacio y quedan a la misma altura.
  const accents = tall || /[ÁÉÍÓÚÜÑ]/.test(text);
  const margin = outline ? 1 : 0;
  const depth = shadow ? 1 : 0;
  const style = { "--px": `calc(var(--bn-${unit}) * ${size})`, color } as CSSProperties;

  return (
    <Tag className={`bn-text${Tag === "span" ? " bn-text-inline" : ""}${className ? ` ${className}` : ""}`} style={style}>
      {label !== "" && <span className="bn-sr">{label ?? children}</span>}
      {text.split("\n").map((paragraph, index) => (
        <span
          key={index}
          className="bn-line"
          aria-hidden="true"
          style={{ justifyContent: align === "center" ? "center" : `flex-${align}` }}
        >
          {paragraph
            .split(" ")
            .filter(Boolean)
            .map((word, position) => {
              const drawn = wordOf(word, accents);
              const width = drawn.width + margin * 2 + depth;
              const height = drawn.height + margin * 2 + depth;
              const stroke = outline ? { stroke: outline, strokeWidth: 2, paintOrder: "stroke" as const } : {};
              return (
                <svg
                  key={position}
                  viewBox={`${-margin} ${-margin} ${width} ${height}`}
                  style={{ width: `calc(var(--px) * ${width})`, height: `calc(var(--px) * ${height})` }}
                  focusable="false"
                >
                  {shadow && <path d={drawn.path} transform="translate(1 1)" fill={shadow} stroke={shadow} strokeWidth={outline ? 2 : 0} />}
                  <path d={drawn.path} fill={bands ? (outline ?? bands[0]) : "currentColor"} {...stroke} />
                  {bands?.map((band, row) => (drawn.pathsByRow[row] ? <path key={row} d={drawn.pathsByRow[row]} fill={band} /> : null))}
                </svg>
              );
            })}
        </span>
      ))}
    </Tag>
  );
}

/** Un dibujo de píxeles (un muñequito, una flor) puesto en la página como imagen. */
export function PixelSprite({
  rows,
  colors,
  size = 1,
  unit = "u",
  flip = false,
  className,
}: {
  rows: Sprite;
  colors: Colors;
  size?: number;
  unit?: PixelUnit;
  flip?: boolean;
  className?: string;
}) {
  const width = rows[0]?.length ?? 0;
  // Un trazo por color: un rectángulo por cada tramo seguido de píxeles iguales.
  const paths = new Map<string, string>();
  rows.forEach((row, y) => {
    const line = flip ? [...row].reverse().join("") : row;
    for (let start = 0; start < line.length; start++) {
      const color = colors[line[start]];
      if (!color) continue;
      let end = start;
      while (line[end + 1] === line[start]) end += 1;
      paths.set(color, `${paths.get(color) ?? ""}M${start} ${y}h${end - start + 1}v1h-${end - start + 1}z`);
      start = end;
    }
  });
  return (
    <svg
      className={`bn-sprite${className ? ` ${className}` : ""}`}
      viewBox={`0 0 ${width} ${rows.length}`}
      style={{ width: `calc(var(--bn-${unit}) * ${width * size})`, height: `calc(var(--bn-${unit}) * ${rows.length * size})` }}
      aria-hidden="true"
      focusable="false"
    >
      {[...paths].map(([color, d]) => (
        <path key={color} d={d} fill={color} />
      ))}
    </svg>
  );
}
