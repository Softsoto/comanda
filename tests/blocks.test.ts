import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLS,
  KINDS,
  LINES_PER_LEVEL,
  MESSAGE_LINES,
  ROWS,
  cellsOf,
  collides,
  createGame,
  dropDistance,
  dropInterval,
  finishClear,
  hardDrop,
  kindNumber,
  kindOf,
  levelFor,
  move,
  previewOf,
  rotate,
  softDrop,
  tick,
  worldFor,
  type GameState,
  type Piece,
  type PieceKind,
} from "../src/lib/blocks";

/** Congela el estado entero: si una función intentara cambiarlo, la prueba falla. */
function frozen<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) frozen(item);
    Object.freeze(value);
  }
  return value;
}

const filled = (state: GameState) => state.board.flat().filter((cell) => cell !== 0).length;

/** Una partida con el tablero y la pieza que se indiquen (para preparar situaciones concretas). */
function withBoard(rows: string[], piece: Piece, base = createGame(1)): GameState {
  const board = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0));
  rows.forEach((row, index) => {
    const y = ROWS - rows.length + index;
    [...row].forEach((mark, x) => {
      if (mark !== ".") board[y][x] = 7;
    });
  });
  return { ...base, board, piece };
}

test("la misma semilla da la misma partida, y otra semilla da otra", () => {
  assert.deepEqual(createGame(2026), createGame(2026));
  const sequence = (seed: number) => {
    let state = createGame(seed);
    const kinds: PieceKind[] = [];
    for (let index = 0; index < 21 && !state.over; index++) {
      kinds.push((state.piece as Piece).kind);
      state = hardDrop(state);
      state = finishClear(state);
    }
    return kinds.join("");
  };
  assert.equal(sequence(7), sequence(7));
  assert.notEqual(sequence(7), sequence(8));
});

test("las piezas salen por bolsas: cada siete aparecen las siete", () => {
  const state = createGame(12345);
  const firstFourteen = [(state.piece as Piece).kind, ...state.queue];
  // La que está cayendo más la cola cubren al menos la primera bolsa completa.
  assert.ok(state.queue.length >= 3, "siempre hay piezas a la vista");
  assert.deepEqual([...firstFourteen.slice(0, 7)].sort(), [...KINDS].sort());
  for (const kind of KINDS) {
    assert.equal(kindOf(kindNumber(kind)), kind);
    assert.equal(previewOf(kind).cells.length, 4, "todas las piezas tienen cuatro bloques");
  }
  assert.equal(kindOf(0), null);
});

test("la pieza nueva aparece arriba, centrada y dentro del tablero", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const state = createGame(seed);
    const cells = cellsOf(state.piece as Piece);
    assert.ok(cells.every(([x, y]) => x >= 0 && x < COLS && y >= 0 && y <= 1), JSON.stringify(cells));
    const xs = cells.map(([x]) => x);
    assert.ok(Math.min(...xs) >= 3 && Math.max(...xs) <= 6, "centrada");
  }
});

test("moverse: hasta la pared y no más allá", () => {
  let state = frozen(createGame(3));
  for (let step = 0; step < 20; step++) state = frozen(move(state, -1));
  assert.equal(Math.min(...cellsOf(state.piece as Piece).map(([x]) => x)), 0);
  assert.equal(move(state, -1), state, "contra la pared no cambia nada");
  for (let step = 0; step < 20; step++) state = frozen(move(state, 1));
  assert.equal(Math.max(...cellsOf(state.piece as Piece).map(([x]) => x)), COLS - 1);
});

test("girar: cuatro giros vuelven al principio, y en ambos sentidos", () => {
  for (const kind of KINDS) {
    const start = withBoard([], { kind, turn: 0, x: 3, y: 5 });
    const shapes = new Set<string>();
    let state = start;
    for (let turn = 0; turn < 4; turn++) {
      shapes.add(JSON.stringify(cellsOf(state.piece as Piece)));
      state = rotate(frozen(state));
    }
    assert.deepEqual(cellsOf(state.piece as Piece), cellsOf(start.piece as Piece), `${kind}: vuelve a su sitio`);
    assert.equal(shapes.size, kind === "O" ? 1 : 4, `${kind}: cada giro ocupa celdas distintas (salvo el cuadrado)`);
    assert.deepEqual(cellsOf(rotate(rotate(start), -1).piece as Piece), cellsOf(start.piece as Piece), `${kind}: ida y vuelta`);
  }
});

test("girar pegado a la pared: la pieza se corre para caber", () => {
  // La pieza larga, de pie y pegada a la pared derecha.
  const upright = withBoard([], { kind: "I", turn: 1, x: COLS - 3, y: 4 });
  assert.equal(Math.max(...cellsOf(upright.piece as Piece).map(([x]) => x)), COLS - 1);
  const turned = rotate(upright);
  assert.notEqual(turned, upright, "sí gira");
  const cells = cellsOf(turned.piece as Piece);
  assert.ok(cells.every(([x]) => x >= 0 && x < COLS));
  assert.equal(new Set(cells.map(([, y]) => y)).size, 1, "queda acostada");
  // Encerrada en un pozo de una columna no puede girar.
  const well = withBoard(
    Array.from({ length: 6 }, () => "####.#####"),
    { kind: "I", turn: 1, x: 2, y: ROWS - 5 },
  );
  assert.ok(!collides(well.board, well.piece as Piece));
  assert.equal(rotate(well), well, "sin espacio no gira");
});

test("dejar caer: baja hasta el fondo, suma dos puntos por fila y trae otra pieza", () => {
  const state = frozen(createGame(5));
  const distance = dropDistance(state);
  assert.ok(distance >= ROWS - 4);
  const dropped = hardDrop(state);
  assert.equal(dropped.score, distance * 2);
  assert.equal(dropped.pieces, 1);
  assert.equal(filled(dropped), 4);
  assert.ok(dropped.board[ROWS - 1].some((cell) => cell !== 0), "llegó al fondo");
  assert.ok(dropped.piece && dropped.piece.kind === state.queue[0], "sigue la pieza anunciada");
  assert.equal(filled(state), 0, "el estado anterior no cambió");
});

test("gravedad y bajar a mano: una fila por paso; al tocar fondo queda fija", () => {
  let state = createGame(9);
  const startY = (state.piece as Piece).y;
  state = tick(frozen(state));
  assert.equal((state.piece as Piece).y, startY + 1);
  assert.equal(state.score, 0, "la gravedad no da puntos");
  state = softDrop(frozen(state));
  assert.equal((state.piece as Piece).y, startY + 2);
  assert.equal(state.score, 1, "bajar a mano da un punto por fila");
  while (state.pieces === 0) state = tick(frozen(state));
  assert.equal(filled(state), 4);
  assert.equal(state.score, 1);
});

test("completar una línea: se marca, se borra, baja lo de arriba y suma puntos", () => {
  // Fila del fondo con un hueco de cuatro; encima, al otro lado, un bloque suelto que debe bajar.
  const state = withBoard([".........#", "....######"], { kind: "I", turn: 0, x: 0, y: 2 });
  const locked = hardDrop(frozen(state));
  assert.deepEqual(locked.clearing, [ROWS - 1]);
  assert.equal(locked.piece, null, "mientras se borra no hay pieza");
  assert.equal(move(locked, 1), locked, "ni se puede mover nada");
  assert.equal(locked.lines, 0, "todavía no cuenta");

  const cleared = finishClear(frozen(locked));
  assert.equal(cleared.lines, 1);
  assert.deepEqual(cleared.clearing, []);
  assert.equal(cleared.score, locked.score + 100);
  assert.equal(filled(cleared), 1);
  assert.equal(cleared.board[ROWS - 1][COLS - 1], 7, "el bloque de arriba bajó una fila");
  assert.ok(cleared.piece, "sigue la partida");
});

test("puntos por varias líneas, niveles, velocidad y cambio de mundo", () => {
  // Cuatro líneas de una vez con la pieza larga de pie.
  const four = withBoard(
    Array.from({ length: 4 }, () => "#########."),
    { kind: "I", turn: 1, x: COLS - 3, y: 2 },
  );
  const cleared = finishClear(hardDrop(four));
  assert.equal(cleared.lines, 4);
  assert.equal(cleared.score - hardDrop(four).score, 750, "cuatro líneas en el nivel 1");
  assert.equal(filled(cleared), 0);

  // En un nivel más alto los puntos se multiplican.
  const levelThree = { ...four, level: 3, lines: 10 };
  assert.equal(finishClear(hardDrop(levelThree)).score - hardDrop(levelThree).score, 750 * 3);

  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(LINES_PER_LEVEL - 1), 1);
  assert.equal(levelFor(LINES_PER_LEVEL), 2);
  assert.equal(levelFor(10_000), 15, "el nivel tiene tope");
  assert.ok(dropInterval(1) > dropInterval(2) && dropInterval(14) > dropInterval(15), "cada nivel cae más rápido");
  assert.ok(dropInterval(99) >= 80, "nunca tan rápido que no se pueda jugar");

  assert.equal(MESSAGE_LINES, 10);
  assert.deepEqual([0, 4, 5, 9, 10, 14, 15, 20, 25, 30, 75, 80].map(worldFor), [0, 0, 1, 1, 2, 2, 3, 4, 5, 0, 3, 4], "el mundo cambia con cada nivel");
});

test("la partida termina cuando ya no caben más piezas, y después nada se mueve", () => {
  let state = createGame(11);
  let guard = 0;
  while (!state.over && guard++ < 200) state = finishClear(hardDrop(state));
  assert.ok(state.over, "apilando sin mover se llega arriba");
  assert.equal(state.piece, null);
  assert.ok(state.pieces >= 8);
  for (const action of [hardDrop, softDrop, tick, finishClear, rotate, (value: GameState) => move(value, 1)]) {
    assert.equal(action(state), state);
  }
});

test("partidas largas con un jugador automático: las cuentas siempre cuadran", () => {
  // Un jugador sencillo: prueba cada giro y cada columna, y se queda con la jugada que deja
  // el tablero más bajo, más parejo y con menos huecos.
  function bestMove(state: GameState): GameState {
    let best: { cost: number; result: GameState } | null = null;
    let turned = state;
    for (let turn = 0; turn < 4; turn++) {
      for (let target = 0; target < COLS + 2; target++) {
        let placed = turned;
        for (let step = 0; step < COLS; step++) placed = move(placed, -1);
        for (let step = 0; step < target; step++) placed = move(placed, 1);
        const result = hardDrop(placed);
        const after = finishClear(result);
        const heights: number[] = [];
        let holes = 0;
        for (let x = 0; x < COLS; x++) {
          let top = ROWS;
          for (let y = 0; y < ROWS; y++) {
            if (after.board[y][x] !== 0) {
              top = Math.min(top, y);
            } else if (y > top) holes += 1;
          }
          heights.push(ROWS - top);
        }
        const total = heights.reduce((sum, height) => sum + height, 0);
        const bumps = heights.slice(1).reduce((sum, height, index) => sum + Math.abs(height - heights[index]), 0);
        const cost = total * 0.51 + holes * 0.36 * 10 + bumps * 0.18 - result.clearing.length * 0.76 * 10 + (after.over ? 1e6 : 0);
        if (!best || cost < best.cost) best = { cost, result };
      }
      turned = rotate(turned);
    }
    return (best as { result: GameState }).result;
  }

  for (const seed of [1, 2, 3, 2026]) {
    let state = createGame(seed);
    let moves = 0;
    while (!state.over && moves < 400) {
      state = finishClear(bestMove(state));
      moves += 1;
      // Cada pieza trae 4 bloques y cada línea borrada se lleva 10.
      assert.equal(filled(state), state.pieces * 4 - state.lines * COLS, `semilla ${seed}, jugada ${moves}`);
      assert.equal(state.level, levelFor(state.lines));
      if (state.piece) assert.ok(!collides(state.board, state.piece));
    }
    assert.ok(state.lines >= MESSAGE_LINES, `con la semilla ${seed} se llega al mensaje (${state.lines} líneas)`);
  }
});
