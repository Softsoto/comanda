/**
 * "Laberinto Lunar": Natha recoge luces mientras la siguen tres espíritus. Con
 * una flor de cerezo los espíritus se asustan y se les puede atrapar. Las letras
 * de NATHALIA aparecen de una en una. Las reglas están en lib/maze.ts.
 */

import { MAZE, MAZE_COLS, MAZE_ROWS, createMaze, positionOf, stepMaze, type Dir, type MazeState } from "../../../lib/maze";
import { paintSprite, rect, type Ctx } from "../art";
import { UI } from "../texts";
import { WORLD_COUNT, worldName } from "../worlds";
import {
  DIM,
  FLOWER,
  FLOWER_COLORS,
  GOLD,
  NAME,
  NINJA,
  NINJA_COLORS,
  SCARED_COLORS,
  SPIRIT,
  SPIRIT_COLORS,
  WIDTH,
  center,
  drawFrame,
  drawName,
  drawTop,
  lookOf,
  widthOf,
  write,
} from "./kit";
import { defineGame } from "./types";

const TILE = 8;
const LEFT = (WIDTH - MAZE_COLS * TILE) / 2;
const TOP = 30;

type State = { game: MazeState; wanted: Dir | null };
const worldOf = (level: number) => (level - 1) % WORLD_COUNT;

export default defineGame<State>({
  help: "Flechas o deslizar el dedo para moverse. Recoge las luces y junta las letras de su nombre.",
  create: (seed) => ({ game: createMaze(seed), wanted: null }),
  pad: () => [
    [
      { key: "left", glyph: "←", label: "Izquierda" },
      { key: "right", glyph: "→", label: "Derecha" },
    ],
    [
      { key: "down", glyph: "↓", label: "Abajo" },
      { key: "up", glyph: "↑", label: "Arriba" },
    ],
  ],
  step(state, dt, input, out) {
    // La última dirección pedida se queda puesta hasta que se pueda tomar (como en los juegos de antes).
    for (const key of input.pressed) if (key === "left" || key === "right" || key === "up" || key === "down") state.wanted = key;
    for (const swipe of input.swipes) state.wanted = swipe;
    const game = state.game;
    for (const event of stepMaze(game, dt, state.wanted)) {
      if (event === "dot") out.sound("move");
      else if (event === "flower") out.sound("level");
      else if (event === "catch") out.sound("clear2");
      else if (event === "letter") out.sound("clear");
      else if (event === "name") out.secret();
      else if (event === "hit") {
        out.sound("lock");
        state.wanted = null;
        out.say(`${UI.lives}: ${game.lives}`);
      } else if (event === "level") {
        out.sound("level");
        state.wanted = null;
        out.say(`${UI.level} ${game.level}. ${worldName(worldOf(game.level))}.`);
      }
    }
  },
  draw(c, { game }, time, still) {
    const world = worldOf(game.level);
    const look = lookOf(world);
    drawFrame(c, world);
    drawTop(c, game.score, game.lives);
    center(c, `${UI.level} ${game.level}`, 17, DIM);

    for (let y = 0; y < MAZE_ROWS; y++) {
      for (let x = 0; x < MAZE_COLS; x++) {
        const left = LEFT + x * TILE;
        const top = TOP + y * TILE;
        if (MAZE[y][x] === "#") {
          rect(c, left, top, TILE, TILE, look.wall);
          // El borde claro solo donde el muro da a un pasillo: así se lee como una pared con volumen.
          if (MAZE[y - 1]?.[x] !== "#") rect(c, left, top, TILE, 1, look.edge);
          if (MAZE[y][x - 1] !== "#") rect(c, left, top, 1, TILE, look.edge);
          continue;
        }
        const item = game.items[y][x];
        if (item === ".") rect(c, left + 3, top + 3, 2, 2, look.light);
        else if (item === "o" && (still || Math.floor(time * 4) % 4 !== 0)) paintSprite(c, FLOWER, FLOWER_COLORS, left + 1, top + 1);
      }
    }

    if (game.letter && (game.letter.time > 2.5 || Math.floor(time * 8) % 2 === 0)) {
      const char = NAME[game.letters % NAME.length];
      write(c, char, LEFT + game.letter.x * TILE + Math.floor((TILE - widthOf(char)) / 2), TOP + game.letter.y * TILE, GOLD);
    }

    const frame = still ? 0 : Math.floor(time * 6) % 2;
    const scaredOut = game.scared > 0 && (game.scared > 1.5 || Math.floor(time * 8) % 2 === 0);
    for (const spirit of game.spirits) {
      if (spirit.away > 0) continue;
      const [x, y] = positionOf(spirit);
      paintSprite(c, SPIRIT[frame], scaredOut ? SCARED_COLORS : SPIRIT_COLORS[spirit.home], Math.round(LEFT + x * TILE), Math.round(TOP + y * TILE));
    }
    const [px, py] = positionOf(game.player);
    const moving = game.player.dir !== null && game.wait <= 0;
    if (game.wait <= 0 || Math.floor(time * 8) % 2 === 0 || still) {
      paintSprite(c, NINJA[moving ? frame : 0], NINJA_COLORS, Math.round(LEFT + px * TILE), Math.round(TOP + py * TILE), game.player.dir === "right");
    }
    drawName(c, 182, game.letters % NAME.length, 2, false, time);
  },
  status: ({ game }) => ({
    score: game.score,
    lives: game.lives,
    level: game.level,
    letters: game.letters % NAME.length,
    world: worldOf(game.level),
    over: game.over,
  }),
});
