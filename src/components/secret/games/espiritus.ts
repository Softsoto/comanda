/**
 * "Lluvia de Espíritus": Natha lanza estrellas a los espíritus que bajan en
 * formación. Cada oleada dibuja una letra de NATHALIA. Las reglas están en lib/stars.ts.
 */

import { GROUND, HEIGHT, createStars, foeAt, letterOf, roundOf, stepStars, type StarsState } from "../../../lib/stars";
import { paintSprite, rect } from "../art";
import { UI } from "../texts";
import { WORLD_COUNT } from "../worlds";
import {
  DROP,
  DROP_COLORS,
  GOLD,
  INK,
  NAME,
  NINJA,
  NINJA_COLORS,
  SPIRIT,
  SPIRIT_COLORS,
  STAR,
  STAR_COLORS,
  WIDTH,
  center,
  drawFrame,
  drawName,
  drawTop,
  lookOf,
} from "./kit";
import { defineGame } from "./types";

const worldOf = (wave: number) => wave % WORLD_COUNT;

export default defineGame<StarsState>({
  help: "Flechas para moverse y barra espaciadora para lanzar estrellas. Cada oleada dibuja una letra de su nombre.",
  create: (seed) => createStars(seed),
  pad: () => [
    [
      { key: "left", glyph: "←", label: "Izquierda" },
      { key: "right", glyph: "→", label: "Derecha" },
    ],
    [{ key: "fire", glyph: "★", label: "Lanzar una estrella", main: true }],
  ],
  step(game, dt, input, out) {
    const { held } = input;
    // Con el dedo sobre el tablero, Natha va hacia donde está el dedo y lanza sola.
    const touch = input.touches[0];
    let move = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
    if (touch && Math.abs(touch.x - game.player) > 2) move = Math.sign(touch.x - game.player);
    const fire = held.has("fire") || held.has("up") || !!touch;
    for (const event of stepStars(game, dt, move, fire)) {
      if (event === "throw") out.sound("rotate");
      else if (event === "pop") out.sound("move");
      else if (event === "letter") {
        out.sound("clear2");
        out.say(`${UI.level} ${game.wave + 1}. ${letterOf(game.wave)}.`);
      } else if (event === "name") out.secret();
      else if (event === "hit") {
        out.sound("lock");
        out.say(`${UI.lives}: ${game.lives}`);
      }
    }
  },
  draw(c, game, time, still) {
    const world = worldOf(game.wave);
    const look = lookOf(world);
    drawFrame(c, world);
    drawTop(c, game.score, game.lives);
    drawName(c, 17, game.wave % NAME.length, 1, true, time);
    rect(c, 1, GROUND, WIDTH - 2, HEIGHT - GROUND - 1, look.ground);
    rect(c, 1, GROUND, WIDTH - 2, 1, look.grass);
    center(c, `${UI.level} ${game.wave + 1}`, GROUND + 7, roundOf(game.wave) > 0 ? GOLD : INK);

    const frame = still ? 0 : Math.floor(time * 3) % 2;
    for (const foe of game.foes) {
      if (!foe.alive) continue;
      const [x, y] = foeAt(game, foe);
      paintSprite(c, SPIRIT[frame], SPIRIT_COLORS[(foe.row + foe.column) % 3], Math.round(x) - 4, Math.round(y) - 4);
    }
    const spin = still ? 0 : Math.floor(time * 12) % 2;
    for (const shot of game.shots) paintSprite(c, STAR[spin], STAR_COLORS, Math.round(shot.x) - 2, Math.round(shot.y) - 2);
    for (const drop of game.drops) paintSprite(c, DROP, DROP_COLORS, Math.round(drop.x) - 1, Math.round(drop.y) - 2);
    if (game.wait <= 0 || Math.floor(time * 8) % 2 === 0 || still) paintSprite(c, NINJA[0], NINJA_COLORS, Math.round(game.player) - 4, GROUND - 8);
    if (game.wait > 0 && !game.over) center(c, letterOf(game.wave), 96, GOLD, 4);
  },
  status: (game) => ({
    score: game.score,
    lives: game.lives,
    level: game.wave + 1,
    letters: game.wave % NAME.length,
    world: worldOf(game.wave),
    over: game.over,
  }),
});
