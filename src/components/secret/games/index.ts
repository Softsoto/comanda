/** Todos los juegos pequeños, por su identificador (el mismo de la tabla de puntajes). */

import type { GameId } from "../../../lib/scores";
import dragon from "./dragon";
import duelo from "./duelo";
import espiritus from "./espiritus";
import fichas from "./fichas";
import laberinto from "./laberinto";
import muro from "./muro";
import carreras from "./carreras";
import esferas from "./esferas";
import mascotas from "./mascotas";
import parejas from "./parejas";
import pinball from "./pinball";
import tejados from "./tejados";
import type { MiniGameDef } from "./types";

export type MiniId = Exclude<GameId, "bloques">;

export const MINI_GAMES: Record<MiniId, MiniGameDef<unknown>> = { laberinto, espiritus, duelo, tejados, muro, dragon, parejas, fichas, carreras, pinball, esferas, mascotas };
