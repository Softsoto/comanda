/**
 * Miniaturas de los juegos para la lista de juegos: un recorte cuadrado de cómo
 * se ve cada uno al poco de empezar. Se dibujan una sola vez (y otra vez si
 * cambian los dibujos propios, el nombre o los paisajes).
 */

import { createGame, hardDrop, move, type GameState } from "../../lib/blocks";
import { GAME_NAME } from "../../lib/game-name";
import type { GameId } from "../../lib/scores";
import { SHOWN_WORLDS } from "../../lib/world-list";
import { FIELD_HEIGHT, FIELD_WIDTH, drawField, makeCanvas, type Ctx } from "./art";
import { MINI_GAMES } from "./games";
import { CUSTOM, HEIGHT, WIDTH } from "./games/kit";
import { noInput, quietOut } from "./games/types";

/** Lado del recorte, en píxeles del juego, y desde qué altura se toma. */
const CROP = 112;
const CROP_TOP = 26;

const cache = new Map<string, HTMLCanvasElement>();

/** Una partida de bloques con algunas piezas ya puestas, para que la miniatura no salga vacía. */
function sampleBlocks(): GameState {
  let game = createGame(11);
  const moves = [-4, 3, -1, 2, 0, -3, 4, 1, -2];
  for (const dx of moves) {
    for (let step = 0; step < Math.abs(dx); step++) game = move(game, Math.sign(dx));
    game = hardDrop(game);
  }
  return game;
}

function render(id: GameId): HTMLCanvasElement {
  const full = makeCanvas(WIDTH, HEIGHT);
  const c = full.getContext("2d") as Ctx;
  if (id === "bloques") {
    const board = makeCanvas(FIELD_WIDTH, FIELD_HEIGHT);
    drawField(board.getContext("2d") as Ctx, sampleBlocks(), { world: 0, clearing: 0, stoneRows: 0 });
    c.drawImage(board, Math.round((WIDTH - FIELD_WIDTH) / 2), 0);
  } else {
    const def = MINI_GAMES[id];
    const scale = def.resolution ?? 1;
    let state: unknown;
    if (def.preview) state = def.preview(7);
    else {
      state = def.create(7, "1");
      // Un par de segundos de partida sin tocar nada: ya se ve el juego y no el aviso del principio.
      for (let step = 0; step < 75; step++) def.step(state, 1 / 30, noInput(), quietOut());
    }
    if (scale === 1) def.draw(c, state, 2.5, true);
    else {
      // Los juegos con más detalle se dibujan a su medida y se achican al tamaño del tablero.
      const big = makeCanvas(WIDTH * scale, HEIGHT * scale);
      def.draw(big.getContext("2d") as Ctx, state, 2.5, true);
      c.imageSmoothingEnabled = true;
      c.drawImage(big, 0, 0, WIDTH, HEIGHT);
    }
  }
  const thumb = makeCanvas(CROP, CROP);
  const tc = thumb.getContext("2d") as Ctx;
  tc.imageSmoothingEnabled = false;
  tc.drawImage(full, (WIDTH - CROP) / 2, id === "bloques" ? HEIGHT - CROP - 8 : CROP_TOP, CROP, CROP, 0, 0, CROP, CROP);
  return thumb;
}

/** Pinta la miniatura de un juego en un lienzo de la página. */
export function paintThumb(target: HTMLCanvasElement, id: GameId) {
  const key = `${id}:${CUSTOM.version}:${GAME_NAME}:${SHOWN_WORLDS.join(",")}`;
  let thumb = cache.get(key);
  if (!thumb) {
    try {
      thumb = render(id);
    } catch {
      return;
    }
    cache.set(key, thumb);
  }
  target.width = CROP;
  target.height = CROP;
  const c = target.getContext("2d");
  if (!c) return;
  c.clearRect(0, 0, CROP, CROP);
  c.drawImage(thumb, 0, 0);
}
