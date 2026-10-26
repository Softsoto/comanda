/**
 * Estilos del juego escondido.
 *
 * Van aquí, en un texto, y no en el CSS general de la app: así solo se cargan
 * cuando alguien abre el juego y no se mezclan con el resto de las páginas.
 * Todas las clases empiezan por "bn-".
 *
 * Las medidas salen de tres variables que pone el código según la pantalla:
 *   --bn-u  lado de un píxel del paisaje y del tablero
 *   --bn-t  lado de un píxel de los textos y botones (nunca menos de 2 px)
 *   --bn-l  lado de un píxel de las letras del mensaje
 */

/** Borde de un píxel con las esquinas mordidas, como en los juegos de antes. */
const edge = (unit: string, color: string) =>
  `0 calc(${unit} * -1) ${color}, 0 ${unit} ${color}, calc(${unit} * -1) 0 ${color}, ${unit} 0 ${color}`;

export const STYLES = `
.bn-root {
  --bn-u: 3px;
  --bn-t: max(var(--bn-u), 2px);
  --bn-l: 2px;
  --bn-ink: #f7f2ff;
  --bn-soft: #c9c1f2;
  --bn-gold: #ffd684;
  --bn-night: #06040e;
  --bn-panel: rgba(9, 7, 28, 0.86);
  --bn-edge: #c57f37;
  --bn-key: #2a2168;
  --bn-key-edge: #7460c4;
  --bn-key-hover: #3a2f8a;
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  overflow: hidden;
  background: #0b0a24;
  color: var(--bn-ink);
  /* Todo el texto que se ve está dibujado; sin alto de renglón, cada caja mide justo lo que mide su dibujo. */
  font: 16px/0 ui-monospace, "Courier New", monospace;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  /* Dentro del juego los dedos no desplazan ni amplían la página; solo lo que tenga barra propia. */
  touch-action: none;
  overscroll-behavior: contain;
  cursor: default;
}
.bn-root[data-world="1"] {
  --bn-soft: #a8ddd2;
  --bn-panel: rgba(2, 15, 19, 0.86);
  --bn-edge: #d5422d;
  --bn-key: #0d3a40;
  --bn-key-edge: #3c9c88;
  --bn-key-hover: #165a61;
}
.bn-root[data-world="2"] {
  --bn-soft: #c4e8b0;
  --bn-panel: rgba(6, 20, 10, 0.86);
  --bn-edge: #8fbf4a;
  --bn-key: #1f3d1a;
  --bn-key-edge: #5f9a3c;
  --bn-key-hover: #2c5524;
}
.bn-root[data-world="3"] {
  --bn-soft: #bcd3ff;
  --bn-panel: rgba(4, 10, 30, 0.86);
  --bn-edge: #f0a040;
  --bn-key: #13254d;
  --bn-key-edge: #4f74c4;
  --bn-key-hover: #1d3570;
}
.bn-root[data-world="4"] {
  --bn-soft: #dfeaff;
  --bn-panel: rgba(14, 18, 36, 0.86);
  --bn-edge: #9fc3e8;
  --bn-key: #2b3557;
  --bn-key-edge: #8597c8;
  --bn-key-hover: #3a4772;
}
.bn-root[data-world="5"] {
  --bn-soft: #ffc9e6;
  --bn-panel: rgba(24, 6, 26, 0.86);
  --bn-edge: #ff6fb5;
  --bn-key: #4a1c4e;
  --bn-key-edge: #c25ea8;
  --bn-key-hover: #632768;
}
.bn-root::backdrop { background: #0b0a24; }
.bn-root *, .bn-root *::before, .bn-root *::after { box-sizing: border-box; }
.bn-root canvas { display: block; image-rendering: pixelated; }
.bn-root [hidden] { display: none !important; }
.bn-root :focus { outline: none; }
.bn-root :focus-visible { outline: var(--bn-t) solid #ffffff; outline-offset: calc(var(--bn-t) * 2); }
.bn-bg { position: absolute; left: 0; top: 0; }
.bn-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
  font-size: 12px;
  line-height: 1;
}

/* Textos con letras de píxeles */
.bn-text { display: flex; flex-direction: column; gap: calc(var(--px) * 5); margin: 0; padding: 0; font: inherit; }
.bn-text-inline { display: inline-flex; vertical-align: top; }
.bn-line { display: flex; flex-wrap: wrap; column-gap: calc(var(--px) * 4); row-gap: calc(var(--px) * 3); }
.bn-text svg, .bn-sprite { display: block; flex: none; max-width: 100%; overflow: visible; shape-rendering: crispEdges; }

/* Botones */
.bn-btn {
  -webkit-appearance: none;
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: calc(var(--bn-t) * 58);
  min-height: 44px;
  margin: var(--bn-t) var(--bn-t) calc(var(--bn-t) * 3);
  padding: calc(var(--bn-t) * 4) calc(var(--bn-t) * 6) calc(var(--bn-t) * 5);
  border: 0;
  border-radius: 0;
  background: var(--bn-gold);
  color: #2a1238;
  box-shadow: inset 0 var(--bn-t) #fff4c4, inset 0 calc(var(--bn-t) * -2) #d9973a, ${edge("var(--bn-t)", "var(--bn-night)")},
    0 calc(var(--bn-t) * 3) rgba(6, 4, 14, 0.6);
  font: inherit;
  cursor: pointer;
  touch-action: manipulation;
}
.bn-btn:hover { background: #ffe5ad; }
.bn-btn:active {
  transform: translateY(calc(var(--bn-t) * 2));
  box-shadow: inset 0 var(--bn-t) #fff4c4, inset 0 calc(var(--bn-t) * -1) #d9973a, ${edge("var(--bn-t)", "var(--bn-night)")};
}
.bn-btn-quiet {
  background: var(--bn-key);
  color: var(--bn-ink);
  box-shadow: inset 0 var(--bn-t) var(--bn-key-edge), inset 0 calc(var(--bn-t) * -2) rgba(6, 4, 14, 0.45),
    ${edge("var(--bn-t)", "var(--bn-night)")}, 0 calc(var(--bn-t) * 3) rgba(6, 4, 14, 0.6);
}
.bn-btn-quiet:hover { background: var(--bn-key-hover); }
.bn-btn-quiet:active {
  box-shadow: inset 0 var(--bn-t) var(--bn-key-edge), inset 0 calc(var(--bn-t) * -1) rgba(6, 4, 14, 0.45),
    ${edge("var(--bn-t)", "var(--bn-night)")};
}

/* Barra de arriba: nombre del juego y botones de pausa, sonido y cerrar */
.bn-top {
  position: absolute;
  z-index: 7;
  top: 0;
  left: 0;
  right: 0;
  height: 52px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  pointer-events: none;
}
.bn-brand { flex: 1; min-width: 0; margin: 0; --bn-t: 2px; }
.bn-root[data-brand="false"] .bn-brand .bn-line { display: none; }
.bn-icon {
  -webkit-appearance: none;
  appearance: none;
  position: relative;
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  margin: 2px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: var(--bn-panel);
  color: var(--bn-ink);
  box-shadow: ${edge("2px", "var(--bn-key-edge)")};
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
  --bn-t: 3px;
}
.bn-icon:hover { background: var(--bn-key); }
.bn-icon:active { transform: translateY(2px); }
.bn-icon > * { grid-area: 1 / 1; }
.bn-icon-off { opacity: 0.4; }

/* Portada */
.bn-title {
  position: absolute;
  z-index: 1;
  inset: 0;
  display: flex;
  padding: 54px 12px 14px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
}
.bn-title-box { display: flex; flex-direction: column; align-items: center; gap: calc(var(--bn-t) * 8); max-width: 100%; margin: auto; }
.bn-logo { display: flex; flex-direction: column; align-items: center; gap: calc(var(--bn-u) * 3); max-width: 100%; }
.bn-logo-row { display: flex; align-items: flex-end; justify-content: center; gap: calc(var(--bn-u) * 4); max-width: 100%; }
.bn-tribute { display: flex; flex-direction: column; align-items: center; gap: calc(var(--bn-t) * 4); max-width: min(100%, calc(var(--bn-t) * 290)); }
.bn-tribute-row { display: flex; align-items: center; justify-content: center; gap: calc(var(--bn-t) * 5); max-width: 100%; }
.bn-menu { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: calc(var(--bn-t) * 3) calc(var(--bn-t) * 6); }
.bn-notes { display: flex; flex-direction: column; align-items: center; gap: calc(var(--bn-t) * 4); max-width: min(100%, calc(var(--bn-t) * 290)); }
.bn-title[data-tight="true"] .bn-title-box { gap: calc(var(--bn-t) * 3); }
.bn-title[data-tight="true"] .bn-menu { gap: 0 calc(var(--bn-t) * 2); }
.bn-blink { animation: bn-blink 1.1s steps(1) infinite; }
@keyframes bn-blink { 0%, 60% { opacity: 1; } 61%, 100% { opacity: 0.25; } }

/* Partida: marcador y tablero */
.bn-play {
  position: absolute;
  z-index: 1;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(var(--bn-u) * 4);
}
.bn-field {
  position: relative;
  flex: none;
  width: calc(var(--bn-u) * 128);
  height: calc(var(--bn-u) * 224);
}
.bn-board, .bn-board > canvas { width: 100%; height: 100%; }
.bn-root .bn-board:focus-visible { outline: none; }
.bn-hud { flex: none; display: flex; }
.bn-stats, .bn-stat, .bn-stat dt, .bn-stat dd { margin: 0; padding: 0; }
.bn-preview { flex: none; width: calc(var(--bn-u) * 48); height: calc(var(--bn-u) * 24); }

/* En vertical: el marcador va en una tira encima del tablero */
.bn-root[data-mode="retrato"] .bn-play { flex-direction: column; justify-content: flex-start; gap: calc(var(--bn-u) * 4); padding-top: 54px; }
.bn-root[data-mode="retrato"] .bn-hud {
  width: calc(var(--bn-u) * 126);
  align-items: center;
  gap: calc(var(--bn-u) * 3);
  padding: var(--bn-u);
  background: var(--bn-panel);
  box-shadow: ${edge("var(--bn-u)", "var(--bn-edge)")};
}
.bn-root[data-mode="retrato"] .bn-next { padding: var(--bn-u); }
.bn-root[data-mode="retrato"] .bn-next .bn-line { display: none; }
.bn-root[data-mode="retrato"] .bn-stats { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--bn-u); }
.bn-root[data-mode="retrato"] .bn-stat { display: flex; align-items: flex-end; justify-content: space-between; height: calc(var(--bn-u) * 9); }
.bn-root[data-mode="retrato"] .bn-stat.bn-stat-record { display: none; }

/* En horizontal: el marcador va en una columna al lado del tablero */
.bn-root[data-mode="lado"] .bn-play { flex-direction: row-reverse; }
.bn-root[data-mode="lado"][data-touch="true"] .bn-play { padding-left: 206px; padding-right: 140px; }
.bn-root[data-mode="lado"] .bn-hud {
  width: calc(var(--bn-u) * 54);
  height: calc(var(--bn-u) * 224);
  flex-direction: column;
  gap: calc(var(--bn-u) * 4);
  padding-top: max(var(--bn-u), var(--bn-hud-top, 0px));
}
.bn-root[data-mode="lado"] .bn-stats { display: flex; flex-direction: column; gap: calc(var(--bn-u) * 4); }
.bn-root[data-mode="lado"] .bn-next,
.bn-root[data-mode="lado"] .bn-stat {
  display: flex;
  flex-direction: column;
  gap: calc(var(--bn-u) * 2);
  padding: calc(var(--bn-u) * 3);
  background: var(--bn-panel);
  box-shadow: ${edge("var(--bn-u)", "var(--bn-edge)")};
}

/* Avisos encima del tablero: cambio de nivel, pausa y fin de la partida */
.bn-banner {
  position: absolute;
  left: 50%;
  top: 38%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--bn-t) * 3);
  width: max-content;
  max-width: 96%;
  padding: calc(var(--bn-t) * 4) calc(var(--bn-t) * 6);
  background: rgba(6, 4, 14, 0.92);
  box-shadow: ${edge("var(--bn-t)", "var(--bn-gold)")};
  pointer-events: none;
  animation: bn-banner 2s steps(1) both;
}
@keyframes bn-banner { 0% { opacity: 0; } 4% { opacity: 1; } 92% { opacity: 1; } 100% { opacity: 0; } }
.bn-panel {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: calc(100% - var(--bn-u) * 16);
  max-height: calc(100% - var(--bn-u) * 12);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--bn-t) * 4);
  padding: calc(var(--bn-t) * 7) calc(var(--bn-t) * 4) calc(var(--bn-t) * 5);
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  background: rgba(6, 4, 14, 0.95);
  box-shadow: ${edge("var(--bn-t)", "var(--bn-gold)")};
}
.bn-panel .bn-btn { width: calc(100% - var(--bn-t) * 2); min-width: 0; padding-left: calc(var(--bn-t) * 2); padding-right: calc(var(--bn-t) * 2); }
.bn-panel-late { animation: bn-late 0.75s steps(1) both; }
@keyframes bn-late { 0%, 99% { opacity: 0; } 100% { opacity: 1; } }
.bn-totals { display: flex; flex-direction: column; align-items: center; gap: calc(var(--bn-t) * 3); margin: 0; padding: 0; }
.bn-totals > div { display: flex; align-items: flex-end; gap: calc(var(--bn-t) * 5); }
.bn-totals dt, .bn-totals dd { margin: 0; }

/* Botones táctiles */
.bn-pad {
  position: absolute;
  z-index: 3;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px calc(10px + env(safe-area-inset-bottom, 0px));
  pointer-events: none;
}
.bn-pad-group { display: flex; gap: 8px; }
.bn-key {
  -webkit-appearance: none;
  appearance: none;
  flex: none;
  width: var(--bn-keysize, 56px);
  height: 60px;
  display: grid;
  place-items: center;
  margin: 2px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: var(--bn-key);
  color: var(--bn-ink);
  box-shadow: inset 0 3px var(--bn-key-edge), inset 0 -4px rgba(6, 4, 14, 0.5), ${edge("2px", "var(--bn-night)")};
  font: inherit;
  pointer-events: auto;
  touch-action: none;
  --bn-t: 4px;
}
.bn-key:active { transform: translateY(2px); box-shadow: inset 0 3px var(--bn-key-edge), inset 0 -2px rgba(6, 4, 14, 0.5), ${edge("2px", "var(--bn-night)")}; }
.bn-key-main { background: var(--bn-gold); color: #2a1238; box-shadow: inset 0 3px #fff4c4, inset 0 -4px #d9973a, ${edge("2px", "var(--bn-night)")}; }
.bn-key-main:active { box-shadow: inset 0 3px #fff4c4, inset 0 -2px #d9973a, ${edge("2px", "var(--bn-night)")}; }
.bn-root[data-mode="retrato"] .bn-pad { --bn-keysize: min(66px, calc((100vw - 20px - 32px - 20px) / 5)); }

/* El mensaje: un pergamino colgado */
.bn-letter-wrap {
  position: absolute;
  z-index: 6;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(var(--bn-l) * 4);
  padding: 60px 16px 16px;
  background: rgba(6, 4, 14, 0.8);
  --bn-t: var(--bn-l);
}
.bn-letter {
  position: relative;
  flex: 0 1 auto;
  min-height: 0;
  width: min(100%, calc(var(--bn-l) * 190));
  display: flex;
  flex-direction: column;
  margin: calc(var(--bn-l) * 5) 0;
  background: #f4e8c6;
  color: #2b1b3d;
  box-shadow: ${edge("var(--bn-l)", "#8a6a35")};
  animation: bn-unroll 0.45s steps(9) both;
}
@keyframes bn-unroll {
  from { clip-path: inset(calc(var(--bn-l) * -6) calc(var(--bn-l) * -6) 100% calc(var(--bn-l) * -6)); }
  to { clip-path: inset(calc(var(--bn-l) * -6)); }
}
.bn-letter::before, .bn-letter::after {
  content: "";
  position: absolute;
  left: calc(var(--bn-l) * -4);
  right: calc(var(--bn-l) * -4);
  height: calc(var(--bn-l) * 4);
  background: #6b4423;
  box-shadow: inset 0 var(--bn-l) #a8743c, inset 0 calc(var(--bn-l) * -1) #3f2713;
}
.bn-letter::before { top: calc(var(--bn-l) * -5); }
.bn-letter::after { bottom: calc(var(--bn-l) * -5); }
.bn-letter-body {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--bn-l) * 7);
  padding: calc(var(--bn-l) * 9) calc(var(--bn-l) * 9) calc(var(--bn-l) * 8);
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
}
.bn-root .bn-letter-body:focus-visible { outline-color: #2b1b3d; outline-offset: calc(var(--bn-l) * -3); }
.bn-letter-head { display: flex; flex-direction: column; align-items: center; gap: calc(var(--bn-l) * 5); }
.bn-letter-foot { display: flex; align-items: flex-end; justify-content: space-between; gap: calc(var(--bn-l) * 6); }
.bn-letter-friends { display: flex; align-items: flex-end; gap: calc(var(--bn-l) * 3); }
.bn-letter-more {
  position: absolute;
  right: calc(var(--bn-l) * 3);
  bottom: calc(var(--bn-l) * 3);
  padding: calc(var(--bn-l) * 2) calc(var(--bn-l) * 4);
  background: #f4e8c6;
  color: #b5281f;
  box-shadow: ${edge("var(--bn-l)", "#8a6a35")};
  pointer-events: none;
}
.bn-root[data-mode="lado"] .bn-letter { width: min(100%, calc(var(--bn-l) * 250)); }

/* Puntajes: la tabla de los mejores y la casilla para firmar */
.bn-scores-wrap {
  position: absolute;
  z-index: 6;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 60px 12px 12px;
  background: rgba(6, 4, 14, 0.8);
  --bn-t: 2px;
}
.bn-scores {
  flex: 0 1 auto;
  min-height: 0;
  width: min(100%, calc(var(--bn-t) * 150));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--bn-t) * 6);
  margin: var(--bn-t);
  padding: calc(var(--bn-t) * 8) calc(var(--bn-t) * 7);
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  background: rgba(6, 4, 14, 0.95);
  box-shadow: ${edge("var(--bn-t)", "var(--bn-gold)")};
}
.bn-scores-game { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; min-height: 48px; }
.bn-scores-game .bn-icon { --bn-t: 3px; }
.bn-scores-name { flex: 1; min-width: 0; }
.bn-entry { display: flex; flex-direction: column; align-items: center; gap: calc(var(--bn-t) * 5); width: 100%; margin: 0; }
.bn-entry-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: calc(var(--bn-t) * 4); }
.bn-input {
  -webkit-appearance: none;
  appearance: none;
  width: 11ch;
  min-height: 44px;
  margin: var(--bn-t);
  padding: 4px 8px;
  border: 0;
  border-radius: 0;
  background: #14103a;
  color: var(--bn-ink);
  box-shadow: inset 0 calc(var(--bn-t) * 2) rgba(6, 4, 14, 0.6), ${edge("var(--bn-t)", "var(--bn-key-edge)")};
  font: 700 18px/1.2 ui-monospace, "Courier New", monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: center;
  -webkit-user-select: text;
  user-select: text;
  touch-action: manipulation;
  cursor: text;
}
.bn-btn:disabled { opacity: 0.45; cursor: default; }
.bn-rows { display: flex; flex-direction: column; gap: calc(var(--bn-t) * 4); width: 100%; margin: 0; padding: 0; list-style: none; }
.bn-row { display: flex; align-items: flex-end; gap: calc(var(--bn-t) * 4); }
.bn-row-rank { flex: none; width: calc(var(--bn-t) * 12); color: var(--bn-soft); }
.bn-row-name { flex: 1; min-width: 0; }
.bn-row[data-mine] { color: var(--bn-gold); }
.bn-row[data-mine] .bn-row-rank { color: var(--bn-gold); }
/* Lista de juegos y de mensajes secretos */
.bn-games-list .bn-btn { flex-direction: column; gap: calc(var(--bn-t) * 3); padding-top: calc(var(--bn-t) * 3); }
.bn-thumb { width: calc(var(--bn-t) * 40); height: calc(var(--bn-t) * 40); max-width: 100%; aspect-ratio: 1; box-shadow: 0 0 0 var(--bn-t) var(--bn-night); background: var(--bn-night); }
.bn-btn-final { gap: calc(var(--bn-t) * 4); background: #ffe7a0; box-shadow: inset 0 var(--bn-t) #fffbe0, inset 0 calc(var(--bn-t) * -2) #d9973a, 0 0 0 var(--bn-t) var(--bn-night), 0 0 calc(var(--bn-t) * 6) #ffd684; animation: bn-glow 1.6s steps(4) infinite alternate; }
@keyframes bn-glow { from { filter: brightness(1); } to { filter: brightness(1.18); } }
.bn-secret { gap: calc(var(--bn-t) * 4); }
.bn-secret-locked { display: flex; align-items: center; gap: calc(var(--bn-t) * 4); }
.bn-secret-name { flex: 1; min-width: 0; }
.bn-toast {
  position: absolute;
  z-index: 9;
  bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: calc(var(--bn-t) * 5);
  width: min(calc(100% - 24px), calc(var(--bn-t) * 175));
  padding: calc(var(--bn-t) * 4) calc(var(--bn-t) * 7) calc(var(--bn-t) * 4) calc(var(--bn-t) * 4);
  background: rgba(6, 4, 14, 0.95);
  box-shadow: ${edge("var(--bn-t)", "var(--bn-gold)")}, 0 calc(var(--bn-t) * 3) rgba(6, 4, 14, 0.6);
  border-radius: calc(var(--bn-t) * 12);
  pointer-events: none;
  --bn-t: 2px;
  animation: bn-toast 4.2s steps(12) both;
}
.bn-console { width: min(100%, calc(var(--bn-t) * 190)); background: #030806; box-shadow: ${edge("var(--bn-t)", "#2f9a5c")}, 0 0 calc(var(--bn-t) * 8) rgba(80, 255, 150, 0.15) inset; }
.bn-console-log {
  width: 100%;
  min-height: calc(var(--bn-t) * 70);
  max-height: calc(var(--bn-t) * 120);
  display: flex;
  flex-direction: column;
  gap: calc(var(--bn-t) * 4);
  padding: calc(var(--bn-t) * 4);
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  background: repeating-linear-gradient(0deg, rgba(127, 240, 160, 0.04) 0 2px, transparent 2px 4px);
  box-shadow: inset 0 0 0 var(--bn-t) rgba(127, 240, 160, 0.25);
}
.bn-root .bn-console-log:focus-visible { outline-color: #7ff0a0; outline-offset: calc(var(--bn-t) * -1); }
.bn-console-cursor { display: block; width: calc(var(--bn-t) * 5); height: calc(var(--bn-t) * 7); background: #7ff0a0; }
.bn-console-form { display: flex; align-items: center; gap: calc(var(--bn-t) * 3); width: 100%; margin: 0; }
.bn-console-input { flex: 1; min-width: 0; width: auto; text-align: left; color: #b9ffd0; background: #06140c; letter-spacing: 0.12em; }
.bn-console-input { text-overflow: ellipsis; }
.bn-console-input::placeholder { color: #5fae7e; letter-spacing: 0.02em; }
.bn-console-form .bn-btn { min-width: 0; padding-left: calc(var(--bn-t) * 4); padding-right: calc(var(--bn-t) * 4); }
.bn-progress { display: flex; flex-wrap: wrap; justify-content: center; gap: calc(var(--bn-t) * 2) calc(var(--bn-t) * 3); width: 100%; padding-top: calc(var(--bn-t) * 4); border-top: var(--bn-t) dashed rgba(255, 214, 132, 0.25); }
.bn-progress > p { width: 100%; }
.bn-toast-text { flex: 1; display: flex; flex-direction: column; gap: calc(var(--bn-t) * 3); min-width: 0; }
@keyframes bn-toast { 0% { opacity: 0; transform: translate(-50%, 12px); } 8% { opacity: 1; transform: translate(-50%, 0); } 88% { opacity: 1; } 100% { opacity: 0; } }
.bn-games { width: min(100%, calc(var(--bn-t) * 230)); }
.bn-games-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(calc(var(--bn-t) * 62), 1fr)); gap: calc(var(--bn-t) * 2) calc(var(--bn-t) * 3); width: 100%; }
.bn-games-list .bn-btn { min-width: 0; width: calc(100% - var(--bn-t) * 2); padding-left: calc(var(--bn-t) * 3); padding-right: calc(var(--bn-t) * 3); }
.bn-games-list > p { grid-column: 1 / -1; }
.bn-secrets { display: flex; flex-direction: column; gap: calc(var(--bn-t) * 3); width: 100%; margin: 0; padding: 0; list-style: none; }
.bn-secret { width: calc(100% - var(--bn-t) * 2); min-width: 0; justify-content: flex-start; padding-left: calc(var(--bn-t) * 4); }
.bn-secret-locked { padding: calc(var(--bn-t) * 3) calc(var(--bn-t) * 4); opacity: 0.75; }
@media (min-width: 700px) and (min-height: 800px) {
  .bn-scores-wrap { --bn-t: 3px; }
}

@media (prefers-reduced-motion: reduce) {
  .bn-blink, .bn-letter, .bn-panel-late, .bn-btn-final, .bn-toast { animation: none; }
  .bn-banner { animation-timing-function: steps(1); }
}
`;
