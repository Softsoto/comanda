"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SyntheticEvent,
} from "react";
import {
  LINES_PER_LEVEL,
  MESSAGE_LINES,
  ROWS,
  createGame,
  dropDistance,
  dropInterval,
  finishClear,
  hardDrop,
  move,
  rotate,
  softDrop,
  tick,
  worldFor,
  type GameState,
  type PieceKind,
} from "../../lib/blocks";
import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  FLOWER,
  FLOWER_COLORS,
  TROPHY,
  TROPHY_COLORS,
  GHOST,
  GHOST_COLORS,
  NINJA,
  NINJA_COLORS,
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  drawField,
  drawPreview,
  makeCanvas,
  type Ctx,
} from "./art";
import { GAMES, NAME_LENGTH, cleanName, type GameId, type ScoreRow } from "../../lib/scores";
import { createBleeps, type Bleeps } from "./bleeps";
import { arrange, letterSteps, sameLayout, titleSteps, type Layout } from "./layout";
import { MINI_GAMES } from "./games";
import type { PadButton, Status } from "./games/types";
import { MiniGame, type MiniHandle } from "./MiniGame";
import { PixelSprite, PixelText } from "./PixelText";
import { loadScores, rememberName, rememberedName, saveScore } from "./scores";
import { STYLES } from "./styles";
import { GAME_NAMES, SECRETS, SECRET_UNLOCKED, TROPHY_POINTS, UI, type SecretId } from "./texts";
import { paintThumb } from "./thumbs";
import Finale from "./Finale";
import { hintFor } from "../../lib/game-theme";
import { currentTheme } from "./theme";
import { createScene, worldName, type Scene } from "./worlds";
import { shownWorld } from "../../lib/world-list";

/**
 * "Dos Lunas": los juegos escondidos de la app, un homenaje.
 *
 * Es una pantalla completa en pixel art. La portada es un menú con tres juegos:
 * "Torre de Luna" (bloques que caen; sus reglas están en lib/blocks.ts y, al
 * completar 10 líneas, aparece el mensaje), "Laberinto Lunar" y "Lluvia de
 * Espíritus" (los dos en MiniGame.tsx). Todos se juegan en dos mundos que se
 * alternan (la aldea y el santuario) y guardan sus puntajes en una tabla
 * compartida. Los dibujos están en art.ts y worlds.ts, y los textos en texts.ts.
 */

type Phase = "titulo" | "juegos" | "secretos" | "final" | "consola" | "jugando" | "pausa" | "mensaje" | "fin" | "puntajes";
type BoardView = { game: GameId; from: Phase; entry: number | null; rows: ScoreRow[] | null; shared: boolean; mine: ScoreRow | null };
type Action = "left" | "right" | "soft" | "hard" | "rotate" | "back";

/** Cuánto dura el destello de las filas que se borran. */
const CLEAR_MS = 280;
/** Cuánto espera una pieza apoyada antes de quedar fija, y cuántas veces un movimiento reinicia esa espera. */
const LOCK_MS = 420;
const LOCK_NUDGES = 12;
/** Al dejar apretado un botón: espera antes de repetir, y cada cuánto repite. */
const HOLD_MS = 170;
const REPEAT_MS = 45;
/** Al terminar, cada cuánto se vuelve piedra una fila. */
const STONE_MS = 34;
/** Cuánto tarda el cambio de un mundo a otro, y cada cuánto cambia solo en la portada. */
const WIPE_MS = 720;
const TITLE_TURN_MS = 9000;
const BANNER_MS = 2000;

const RECORD_KEY = "bloques-natha:record";
const SOUND_KEY = "bloques-natha:sonido";
const SECRETS_KEY = "dos-lunas:secretos";
/** Si el secreto final ya se abrió (con todos los logros o escribiendo el nombre corto). */
const FINALE_KEY = "dos-lunas:final";
/** Los códigos que ya se usaron en la consola (para volver a leer sus anuncios). */
const CODES_KEY = "dos-lunas:codigos";
/** Qué guarda "Mi progreso": todo lo que el juego recuerda en este navegador. */
const PROGRESS_PREFIXES = ["dos-lunas:", "bloques-natha:"];
type Announcement = { code: string; title: string; text: string[] };
type ConsoleLine = { id: number; text: string; tone: "normal" | "ok" | "error" | "info" | "echo" };

function usedCodes(): Announcement[] {
  try {
    const list = JSON.parse(readStored(CODES_KEY) ?? "[]") as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter(
      (item): item is Announcement =>
        !!item && typeof item.code === "string" && typeof item.title === "string" && Array.isArray(item.text) && item.text.every((line: unknown) => typeof line === "string"),
    );
  } catch {
    return [];
  }
}
/** Cuánto se ve el aviso de logro desbloqueado. */
const TOAST_MS = 4200;
/** Versión anterior: un solo mensaje secreto, guardado como "si". */
const OLD_SECRET_KEY = "dos-lunas:secreto";
/** Toques seguidos en el nombre de la portada que abren el mensaje secreto, y el tiempo máximo entre uno y otro. */
const SECRET_TAPS = 5;
const SECRET_TAP_MS = 600;
/** Líneas de Torre de Luna que abren su mensaje secreto. */
const TOWER_SECRET_LINES = 25;

/** Los mensajes secretos ya descubiertos en este dispositivo. */
function foundSecrets(): SecretId[] {
  const known = new Set<string>(SECRETS.map((secret) => secret.id));
  try {
    const list = JSON.parse(readStored(SECRETS_KEY) ?? "[]") as unknown;
    const found = Array.isArray(list) ? list.filter((id): id is SecretId => typeof id === "string" && known.has(id)) : [];
    if (readStored(OLD_SECRET_KEY) === "si" && !found.includes("dentro")) found.unshift("dentro");
    return found;
  } catch {
    return [];
  }
}
const SCORE_CAP = 999_999;

const NIGHT = "#06040e";
/** Franjas del nombre en la portada, de arriba abajo. */
const LOGO_BANDS = ["#fffbe6", "#fff1b8", "#ffdc7c", "#ffbd4f", "#ff9547", "#f4683f", "#d9463c"];

const KEYS: Record<string, Action> = {
  ArrowLeft: "left",
  a: "left",
  ArrowRight: "right",
  d: "right",
  ArrowDown: "soft",
  s: "soft",
  ArrowUp: "rotate",
  w: "rotate",
  x: "rotate",
  z: "back",
  " ": "hard",
};

/** Cómo se le dice a cada pieza a quien usa lector de pantalla. */
const KIND_NAMES: Record<PieceKind, string> = {
  I: "pieza larga",
  O: "pieza cuadrada",
  T: "pieza en T",
  S: "pieza en S",
  Z: "pieza en Z",
  J: "pieza en J",
  L: "pieza en L",
};

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sin permiso para guardar: el juego sigue igual, solo no recuerda el dato.
  }
}

const prefers = (query: string) => typeof window !== "undefined" && window.matchMedia(query).matches;

/**
 * Prueba una lista de tamaños, de mayor a menor, y se queda con el primero con
 * el que `box` no necesita barra de desplazamiento. Empieza de nuevo cuando cambia `reset`.
 */
function useFit<Size>(sizes: readonly Size[], box: RefObject<HTMLElement | null>, active: boolean, reset: string): Size {
  const [tried, setTried] = useState({ reset, index: 0 });
  const index = tried.reset === reset ? Math.min(tried.index, sizes.length - 1) : 0;
  useLayoutEffect(() => {
    const element = box.current;
    if (!active || !element || index >= sizes.length - 1) return;
    if (element.scrollHeight > element.clientHeight + 1) setTried({ reset, index: index + 1 });
  });
  return sizes[index];
}

/** Mide la ventana y decide cómo acomodar todo. */
const measure = (touch: boolean) => arrange(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1, touch);

export default function BlocksGame({ onClose }: { onClose: () => void }) {
  const root = useRef<HTMLDialogElement>(null);
  const background = useRef<HTMLCanvasElement>(null);
  const field = useRef<HTMLCanvasElement>(null);
  const fieldBox = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const titleBox = useRef<HTMLElement>(null);
  const letterBox = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>("titulo");
  const [layout, setLayout] = useState<Layout>(() => measure(prefers("(pointer: coarse)")));
  const [world, setWorld] = useState(() => shownWorld(0));
  const [hud, setHud] = useState({ score: 0, lines: 0, level: 1, next: null as PieceKind | null });
  const [record, setRecord] = useState(0);
  const [newRecord, setNewRecord] = useState(false);
  const [sound, setSound] = useState(true);
  const [banner, setBanner] = useState<{ id: number; level: number; world: number } | null>(null);
  const [letter, setLetter] = useState<{ from: Phase; earned: boolean; secret: SecretId | null; custom?: Announcement }>({
    from: "titulo",
    earned: false,
    secret: null,
  });
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [consoleText, setConsoleText] = useState("");
  const [consoleBusy, setConsoleBusy] = useState(false);
  const [codes, setCodes] = useState<Announcement[]>([]);
  const consoleLog = useRef<HTMLDivElement>(null);
  const progressFile = useRef<HTMLInputElement>(null);
  const [game, setGame] = useState<GameId>("bloques");
  const [run, setRun] = useState(0);
  const [mode, setMode] = useState("1");
  const [over, setOver] = useState<{ score: number; saved: boolean; scored: boolean; result?: string }>({ score: 0, saved: false, scored: true });
  const [board, setBoard] = useState<BoardView>({ game: "bloques", from: "titulo", entry: null, rows: null, shared: true, mine: null });
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [found, setFound] = useState<SecretId[]>([]);
  const [finaleOpen, setFinaleOpen] = useState(false);
  const [toast, setToast] = useState<{ key: number; title: string; trophy: keyof typeof TROPHY_COLORS; points: number | null; label?: string } | null>(null);
  const [duelPick, setDuelPick] = useState(false);
  const mini = useRef<MiniHandle>(null);
  const [announcement, setAnnouncement] = useState("");
  const [moreBelow, setMoreBelow] = useState(false);

  // Lo que cambia muchas veces por segundo vive aquí y no en el estado de React.
  const live = useRef({
    phase: "titulo" as Phase,
    game: createGame(1),
    gravity: 0,
    rest: 0,
    nudges: 0,
    clear: 0,
    stone: 0,
    stoneRows: 0,
    held: new Map<Action, number>(),
    dirty: true,
    nextShown: undefined as PieceKind | null | undefined,
    letterFrom: "titulo" as Phase,
    boardFrom: "titulo" as Phase,
    gameId: "bloques" as GameId,
    miniWorld: 0,
    taps: 0,
    tappedAt: -1e9,
    typed: "",
    lineId: 0,
    toastTimer: 0,
    toastKey: 0,
    found: [] as SecretId[],
    letterSeen: false,
    bannerDue: false,
    bannerId: 0,
    bannerTimer: 0,
    // Desde el primer cuadro, un paisaje encendido (el administrador puede apagar el primero).
    shown: shownWorld(0),
    from: shownWorld(0),
    wipeSince: -1,
    scenes: [] as Scene[],
    /** Medida del paisaje; cada mundo se arma la primera vez que hace falta. */
    sceneSize: null as { width: number; height: number } | null,
    scratch: null as HTMLCanvasElement | null,
    opened: 0,
    still: false,
    /** Cuándo fue el último toque en un botón táctil, y cuándo se atendió por última vez la tecla Esc. */
    touched: -1e9,
    escapedAt: -1e9,
    /** Hasta cuándo se ignoran los botones de un aviso recién aparecido (ver `calm`). */
    quietUntil: 0,
  });
  const bleeps = useRef<Bleeps | null>(null);
  const sounds = () => (bleeps.current ??= createBleeps());

  /* ---------- Cambios de pantalla ---------- */

  const go = (next: Phase) => {
    live.current.phase = next;
    live.current.held.clear();
    live.current.dirty = true;
    setPhase(next);
  };

  const syncHud = () => {
    const { game } = live.current;
    const next = game.queue[0] ?? null;
    setHud((old) =>
      old.score === game.score && old.lines === game.lines && old.level === game.level && old.next === next
        ? old
        : { score: game.score, lines: game.lines, level: game.level, next },
    );
  };

  const showBanner = () => {
    const state = live.current;
    state.bannerDue = false;
    state.bannerId += 1;
    const level = state.game.level;
    const place = worldFor(state.game.lines);
    setBanner({ id: state.bannerId, level, world: place });
    setAnnouncement(`${UI.level} ${level}. ${worldName(place)}.`);
    sounds().level();
    window.clearTimeout(state.bannerTimer);
    state.bannerTimer = window.setTimeout(() => setBanner(null), BANNER_MS);
  };

  const start = (id: GameId = live.current.gameId, how = mode) => {
    const state = live.current;
    state.gameId = id;
    state.miniWorld = 0;
    setGame(id);
    setMode(how);
    setDuelPick(false);
    setOver({ score: 0, saved: false, scored: true });
    if (id !== "bloques") {
      // Los demás juegos llevan su propia partida (MiniGame): cada número nuevo empieza una.
      setRun((old) => old + 1);
      window.clearTimeout(state.bannerTimer);
      setBanner(null);
      setNewRecord(false);
      setAnnouncement("");
      sounds().start();
      go("jugando");
      return;
    }
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    state.game = createGame(seed);
    state.gravity = state.rest = state.nudges = state.clear = state.stone = state.stoneRows = 0;
    state.letterSeen = false;
    state.bannerDue = false;
    state.nextShown = undefined;
    if (root.current) root.current.dataset.seed = String(seed);
    window.clearTimeout(state.bannerTimer);
    setBanner(null);
    setNewRecord(false);
    setAnnouncement("");
    syncHud();
    sounds().start();
    go("jugando");
  };

  const pause = () => {
    if (live.current.phase !== "jugando") return;
    setAnnouncement(UI.paused);
    go("pausa");
  };

  const resume = () => {
    if (live.current.phase !== "pausa") return;
    setAnnouncement("");
    go("jugando");
  };

  /**
   * El mensaje y el aviso de fin de partida aparecen de golpe, quizá justo cuando
   * el jugador iba a soltar otra pieza. Para que esa tecla o ese toque no los
   * cierre sin querer, sus botones no responden durante un momento.
   */
  const hush = (time: number) => {
    live.current.quietUntil = performance.now() + time;
  };
  const calm = () => performance.now() >= live.current.quietUntil;

  const openLetter = (from: Phase, earned = false, secret: SecretId | null = null, custom?: Announcement) => {
    live.current.letterFrom = from;
    setLetter({ from, earned, secret, custom });
    if (earned) {
      hush(1200);
      sounds().letter();
      setAnnouncement(custom ? UI.codeUnlocked : secret ? SECRET_UNLOCKED : currentTheme().unlocked);
    }
    go("mensaje");
  };

  /**
   * Un mensaje secreto descubierto: se abre y queda guardado para leerlo otra vez desde la portada.
   * Los que se ganan jugando solo interrumpen la partida la primera vez; los que se buscan a
   * propósito (`always`: toques en el nombre, firmar, escribir) se abren siempre.
   */
  const revealSecret = (from: Phase, id: SecretId, always = false) => {
    const state = live.current;
    const fresh = !state.found.includes(id);
    if (fresh) {
      state.found = [...state.found, id];
      setFound(state.found);
      store(SECRETS_KEY, JSON.stringify(state.found));
      const { title, trophy } = currentTheme().secrets[id];
      showToast(title, trophy, TROPHY_POINTS[trophy]);
      // Con el último logro se abre el secreto final.
      if (SECRETS.every((secret) => state.found.includes(secret.id))) unlockFinale(false);
    }
    if (fresh || always) openLetter(from, true, id);
  };

  /** El aviso de arriba, como en las consolas: trofeo, "Logro desbloqueado", el nombre y sus puntos. */
  const showToast = (title: string, trophy: keyof typeof TROPHY_COLORS, points: number | null, label?: string) => {
    const state = live.current;
    state.toastKey += 1;
    setToast({ key: state.toastKey, title, trophy, points, label });
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => setToast(null), TOAST_MS);
  };

  /* ---------- Consola de códigos ---------- */

  const say = (text: string, tone: ConsoleLine["tone"] = "normal") => {
    const state = live.current;
    state.lineId += 1;
    const id = state.lineId;
    setConsoleLines((lines) => [...lines, { id, text, tone }].slice(-40));
  };

  const openConsole = () => {
    if (consoleLines.length === 0) say(UI.consoleHello, "info");
    setCodes(usedCodes());
    go("consola");
  };

  /** Lo que se escribe en la consola: una orden (AYUDA, LIMPIAR…) o un código que revisa el servidor. */
  const runConsole = async (event: FormEvent) => {
    event.preventDefault();
    const typed = consoleText.trim();
    if (!typed || consoleBusy) return;
    setConsoleText("");
    const order = typed.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    say(`▶ ${typed.slice(0, 32)}`, "echo");
    if (order === "AYUDA") return UI.consoleHelp.forEach((line) => say(line, "info"));
    if (order === "LIMPIAR") return setConsoleLines([]);
    if (order === "SALIR") return go("titulo");
    if (order === "GUARDAR") {
      saveProgress();
      return say(UI.progressSaved, "ok");
    }
    if (order === "CARGAR") return progressFile.current?.click();
    if (order === "CODIGOS") {
      const list = usedCodes();
      if (list.length === 0) say(UI.consoleNone, "info");
      else list.forEach((item) => say(`${item.code}: ${item.title}`, "info"));
      return;
    }
    setConsoleBusy(true);
    say(UI.consoleChecking, "info");
    try {
      const response = await fetch("/juego/codigo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: typed }),
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });
      const body = (await response.json().catch(() => null)) as ({ ok?: boolean; reason?: string } & Partial<Announcement>) | null;
      if (body?.ok && body.code && body.title && Array.isArray(body.text)) {
        const found: Announcement = { code: body.code, title: body.title, text: body.text };
        const list = [found, ...usedCodes().filter((item) => item.code !== found.code)].slice(0, 50);
        store(CODES_KEY, JSON.stringify(list));
        setCodes(list);
        say(`${UI.consoleAccepted}: ${found.title}`, "ok");
        showToast(found.title, "oro", null, UI.codeUnlocked);
        openLetter("consola", true, null, found);
      } else if (response.status === 429 || body?.reason === "limite") say(UI.consoleLimit, "error");
      else if (body) say(UI.consoleWrong, "error");
      else say(UI.consoleOffline, "error");
    } catch {
      say(UI.consoleOffline, "error");
    } finally {
      setConsoleBusy(false);
    }
  };

  /* ---------- Mi progreso: llevarlo a otro dispositivo o guardarlo aparte ---------- */

  const saveProgress = () => {
    const data: Record<string, string> = {};
    try {
      for (let index = 0; index < window.localStorage.length; index++) {
        const key = window.localStorage.key(index);
        if (key && PROGRESS_PREFIXES.some((prefix) => key.startsWith(prefix))) data[key] = window.localStorage.getItem(key) ?? "";
      }
    } catch {
      // Sin acceso a lo guardado: el archivo sale vacío.
    }
    const blob = new Blob([JSON.stringify({ juego: "dos-lunas", version: 1, fecha: new Date().toISOString(), data }, null, 1)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "mi-progreso-dos-lunas.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    setAnnouncement(UI.progressSaved);
    showToast(UI.progressSaved, "plata", null, UI.progress);
  };

  const loadProgress = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error("grande");
      const body = JSON.parse(await file.text()) as { juego?: string; data?: Record<string, unknown> };
      if (body.juego !== "dos-lunas" || !body.data || typeof body.data !== "object") throw new Error("otro");
      for (const [key, value] of Object.entries(body.data)) {
        if (typeof value === "string" && PROGRESS_PREFIXES.some((prefix) => key.startsWith(prefix))) store(key, value);
      }
      // Se vuelve a leer todo lo guardado, como al abrir el juego.
      const state = live.current;
      state.found = foundSecrets();
      setFound(state.found);
      setFinaleOpen(readStored(FINALE_KEY) === "si" || SECRETS.every((secret) => state.found.includes(secret.id)));
      setRecord(Number(readStored(RECORD_KEY)) || 0);
      setCodes(usedCodes());
      setAnnouncement(UI.progressLoaded);
      showToast(UI.progressLoaded, "oro", null, UI.progress);
    } catch {
      setAnnouncement(UI.progressBad);
      showToast(UI.progressBad, "nada", null, UI.progress);
    }
  };

  // La consola siempre muestra lo último que se escribió.
  useEffect(() => {
    const log = consoleLog.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [consoleLines]);

  /** Aparece en la portada el botón del secreto final. */
  const unlockFinale = (announce: boolean) => {
    if (readStored(FINALE_KEY) !== "si") store(FINALE_KEY, "si");
    setFinaleOpen(true);
    if (announce) {
      showToast(UI.finaleUnlocked, "oro", null);
      setAnnouncement(UI.finaleUnlocked);
    }
  };

  /* ---------- Puntajes ---------- */

  const showBoard = (id: GameId, from: Phase, entry: number | null) => {
    live.current.boardFrom = from;
    setBoard({ game: id, from, entry, rows: null, shared: true, mine: null });
    if (entry !== null) setName(rememberedName());
    go("puntajes");
    void loadScores(id).then((loaded) => setBoard((old) => (old.game === id && old.rows === null ? { ...old, ...loaded } : old)));
  };

  const turnBoard = (step: number) => {
    const next = GAMES[(GAMES.indexOf(board.game) + step + GAMES.length) % GAMES.length];
    showBoard(next, board.from, null);
  };

  const closeBoard = () => {
    if (live.current.phase === "puntajes") go(live.current.boardFrom);
  };

  const submitScore = (event: FormEvent) => {
    event.preventDefault();
    const player = cleanName(name);
    const { game: id, entry } = board;
    if (!player || entry === null || saving) return;
    setSaving(true);
    rememberName(player);
    void saveScore(id, player, entry).then((saved) => {
      setSaving(false);
      setOver((old) => ({ ...old, saved: true }));
      setBoard((old) => ({ ...old, ...saved, entry: null, mine: { name: player, score: entry } }));
      setAnnouncement(UI.saved);
      // Quien firma con su nombre encuentra algo más.
      const { name: full, shortName } = currentTheme();
      if ((player === full || player === shortName) && live.current.phase === "puntajes") revealSecret("puntajes", "firma", true);
      else root.current?.querySelector<HTMLElement>(".bn-scores-back")?.focus({ preventScroll: true });
    });
  };

  /** Fin de la partida en uno de los juegos pequeños. */
  const finishMini = (status: Status) => {
    const def = MINI_GAMES[live.current.gameId as keyof typeof MINI_GAMES];
    const scored = !(def?.twoPlayers?.(mode) ?? false);
    const score = scored ? status.score : 0;
    setOver({ score, saved: false, scored, result: status.result });
    hush(900);
    sounds().over();
    setAnnouncement(status.result ?? `${UI.gameOver}. ${UI.score}: ${score}.`);
    go("fin");
  };

  /** Toques en el nombre grande de la portada: con cinco seguidos aparece el mensaje secreto. */
  const tapLogo = () => {
    const state = live.current;
    const now = performance.now();
    state.taps = now - state.tappedAt <= SECRET_TAP_MS ? state.taps + 1 : 1;
    state.tappedAt = now;
    if (state.taps >= SECRET_TAPS) {
      state.taps = 0;
      revealSecret("titulo", "dentro", true);
    }
  };

  const closeLetter = () => {
    const state = live.current;
    if (state.phase !== "mensaje" || !calm()) return;
    go(state.letterFrom);
    if (state.letterFrom === "jugando" && state.bannerDue) showBanner();
  };

  const finish = () => {
    const state = live.current;
    state.stone = 0;
    state.stoneRows = 0;
    const best = Number(readStored(RECORD_KEY)) || 0;
    if (state.game.score > best) {
      store(RECORD_KEY, String(state.game.score));
      setRecord(state.game.score);
      setNewRecord(true);
    }
    setOver({ score: state.game.score, saved: false, scored: true });
    hush(900);
    sounds().over();
    setAnnouncement(`${UI.gameOver}. ${UI.score}: ${state.game.score}. ${UI.lines}: ${state.game.lines}.`);
    go("fin");
  };

  /* ---------- Jugadas ---------- */

  /** Guarda el resultado de una jugada y reacciona: sonidos, líneas, nivel, mensaje, final. */
  const commit = (before: GameState, after: GameState, cause: Action | "tick" | "clear") => {
    const state = live.current;
    state.game = after;
    state.dirty = true;
    if (after.pieces > before.pieces || (after.over && !before.over)) {
      // La pieza quedó fija. Si venía bajando con el botón apretado, la siguiente no baja sola:
      // hay que soltar el botón y volver a apretarlo.
      state.gravity = 0;
      state.rest = 0;
      state.nudges = 0;
      state.held.delete("soft");
      if (after.clearing.length > 0) {
        state.clear = 0;
        sounds().clear(after.clearing.length);
      } else if (cause === "hard") sounds().drop();
      else sounds().lock();
    } else if (cause === "left" || cause === "right" || cause === "rotate" || cause === "back") {
      if (cause === "left" || cause === "right") sounds().move();
      else sounds().rotate();
      // Mover una pieza que ya está apoyada le da un poco más de tiempo antes de quedar fija.
      if (state.rest > 0 && state.nudges < LOCK_NUDGES) {
        state.rest = 0;
        state.nudges += 1;
      }
    }
    syncHud();
    if (after.over) {
      finish();
      return;
    }
    if (cause === "clear") {
      const turned = Math.floor(after.lines / LINES_PER_LEVEL) > Math.floor(before.lines / LINES_PER_LEVEL);
      if (!state.letterSeen && before.lines < MESSAGE_LINES && after.lines >= MESSAGE_LINES) {
        // Diez líneas: el mensaje es el premio. El aviso de nivel espera a que se cierre.
        state.letterSeen = true;
        state.bannerDue = turned;
        openLetter("jugando", true);
      } else if (!state.found.includes("torre") && before.lines < TOWER_SECRET_LINES && after.lines >= TOWER_SECRET_LINES) {
        state.bannerDue = turned;
        revealSecret("jugando", "torre");
      } else if (turned) showBanner();
    }
  };

  const act = (action: Action) => {
    const state = live.current;
    if (state.phase !== "jugando") return;
    const before = state.game;
    const after =
      action === "left"
        ? move(before, -1)
        : action === "right"
          ? move(before, 1)
          : action === "rotate"
            ? rotate(before, 1)
            : action === "back"
              ? rotate(before, -1)
              : action === "soft"
                ? softDrop(before)
                : hardDrop(before);
    if (after !== before) commit(before, after, action);
  };

  /** Apretar un botón o una tecla: la jugada sale una vez y, si es de mover o bajar, se repite mientras siga apretado. */
  const press = (action: Action) => {
    const { held } = live.current;
    act(action);
    if (live.current.phase !== "jugando") return;
    if (action === "left") held.delete("right");
    if (action === "right") held.delete("left");
    if (action === "left" || action === "right" || action === "soft") held.set(action, 0);
  };

  const release = (action: Action) => {
    live.current.held.delete(action);
  };

  /** Levantar el dedo de un botón táctil. */
  const lift = (action: Action) => {
    live.current.touched = performance.now();
    release(action);
  };

  /** Avanza la partida el tiempo que pasó desde el cuadro anterior. */
  const advance = (elapsed: number) => {
    const state = live.current;
    if (state.gameId !== "bloques") return;
    if (state.phase === "fin") {
      if (state.stoneRows < ROWS) {
        state.stone += elapsed;
        const rows = state.still ? ROWS : Math.min(ROWS, Math.floor(state.stone / STONE_MS));
        if (rows !== state.stoneRows) {
          state.stoneRows = rows;
          state.dirty = true;
        }
      }
      return;
    }
    if (state.phase !== "jugando") return;

    if (state.game.clearing.length > 0) {
      state.clear += elapsed;
      state.dirty = true;
      if (state.clear >= (state.still ? CLEAR_MS / 2 : CLEAR_MS)) commit(state.game, finishClear(state.game), "clear");
      return;
    }

    // Botones que siguen apretados.
    const repeats = (time: number) => (time < HOLD_MS ? 0 : 1 + Math.floor((time - HOLD_MS) / REPEAT_MS));
    for (const [action, time] of [...state.held]) {
      if (!state.held.has(action)) continue;
      state.held.set(action, time + elapsed);
      for (let count = repeats(time + elapsed) - repeats(time); count > 0; count--) act(action);
    }
    if (state.phase !== "jugando" || !state.game.piece) return;

    if (dropDistance(state.game) === 0) {
      // Apoyada: espera un momento por si el jugador quiere acomodarla.
      state.rest += elapsed;
      if (state.rest >= LOCK_MS) commit(state.game, tick(state.game), "tick");
      return;
    }
    state.rest = 0;
    state.gravity += elapsed;
    const interval = dropInterval(state.game.level);
    for (let steps = 0; state.gravity >= interval && steps < 4; steps++) {
      state.gravity -= interval;
      if (!state.game.piece || dropDistance(state.game) === 0) break;
      commit(state.game, tick(state.game), "tick");
    }
  };

  /* ---------- Dibujo ---------- */

  const paintField = () => {
    const state = live.current;
    const canvas = field.current;
    if (!canvas || !state.dirty || state.gameId !== "bloques") return;
    state.dirty = false;
    const c = canvas.getContext("2d") as Ctx | null;
    if (!c) return;
    const { game } = state;
    drawField(c, game, {
      world: state.shown,
      clearing: game.clearing.length > 0 ? Math.min(1, state.clear / CLEAR_MS) : 0,
      stoneRows: state.phase === "fin" ? state.stoneRows : 0,
    });
    const next = game.queue[0] ?? null;
    if (next !== state.nextShown && preview.current) {
      state.nextShown = next;
      const pc = preview.current.getContext("2d") as Ctx | null;
      if (pc) drawPreview(pc, next);
    }
    // Para las pruebas automáticas: el estado de la partida, a la vista en la página.
    const dialog = root.current;
    if (dialog) {
      dialog.dataset.lines = String(game.lines);
      dialog.dataset.pieces = String(game.pieces);
      dialog.dataset.score = String(game.score);
      dialog.dataset.clearing = String(game.clearing.length);
      dialog.dataset.piece = game.piece ? `${game.piece.kind}:${game.piece.x}:${game.piece.y}:${game.piece.turn}` : "";
      dialog.dataset.board = game.board
        .map((row) => row.reduce((bits, cell, column) => bits | (cell ? 1 << column : 0), 0).toString(36))
        .join(".");
    }
  };

  const paintBackground = (now: number) => {
    const state = live.current;
    const canvas = background.current;
    if (!canvas || !state.sceneSize) return;
    const c = canvas.getContext("2d") as Ctx | null;
    if (!c) return;
    // La hora del cuadro puede ser un poco anterior a la apertura: sin el tope, la portada mostraría un instante el último paisaje
    // y algunos paisajes no saben pintar tiempos negativos.
    const time = Math.max(0, now - state.opened);

    // ¿Toca cambiar de mundo? En la portada se alternan solos; en la partida, según las líneas.
    if (state.wipeSince < 0 && state.phase !== "fin") {
      const under = state.phase === "mensaje" ? state.letterFrom : state.phase;
      const base = under === "puntajes" ? state.boardFrom : under;
      const onTitle = base === "titulo" || base === "juegos" || base === "secretos" || base === "final" || base === "consola";
      // Los juegos cuentan sus paisajes 0, 1, 2…; shownWorld lo traduce al que se ve (saltando los apagados).
      const target = onTitle
        ? shownWorld(state.still ? 0 : Math.floor(time / TITLE_TURN_MS))
        : state.phase === "mensaje" || state.phase === "puntajes"
          ? state.shown
          : shownWorld(state.gameId !== "bloques" ? state.miniWorld : worldFor(state.game.lines));
      if (target !== state.shown) {
        state.from = state.shown;
        state.shown = target;
        state.wipeSince = state.still ? -1 : now;
        state.dirty = true;
        setWorld(target);
      }
    }

    const sceneOf = (index: number) => {
      const size = state.sceneSize as { width: number; height: number };
      return (state.scenes[index] ??= createScene(index, size.width, size.height));
    };
    const scene = sceneOf(state.shown);
    const progress = state.wipeSince < 0 ? 1 : (now - state.wipeSince) / WIPE_MS;
    if (progress >= 1 || !state.scratch) {
      state.wipeSince = -1;
      scene.paint(c, time, state.still);
      return;
    }
    // Persianas: el mundo nuevo entra por franjas que se van abriendo.
    sceneOf(state.from).paint(c, time);
    const sc = state.scratch.getContext("2d") as Ctx | null;
    if (!sc) return;
    scene.paint(sc, time);
    const open = Math.ceil(progress * 8);
    for (let y = 0; y < scene.height; y += 8) c.drawImage(state.scratch, 0, y, scene.width, open, 0, y, scene.width, open);
  };

  /* ---------- Vida de la pantalla ---------- */

  // Abrir como ventana modal (tapa toda la página y atrapa el teclado) y cerrar al salir.
  // Se abre antes de pintar, para que la portada pueda medirse y ajustarse desde el primer momento.
  useLayoutEffect(() => {
    const dialog = root.current;
    if (!dialog) return;
    if (typeof dialog.showModal !== "function") {
      // Navegador muy antiguo, sin ventanas modales: el juego no se abre y la página sigue como estaba.
      onClose();
      return;
    }
    const state = live.current;
    state.opened = performance.now();
    state.still = prefers("(prefers-reduced-motion: reduce)");
    if (!dialog.open) dialog.showModal();
    const page = document.documentElement;
    const overflow = page.style.overflow;
    page.style.overflow = "hidden";
    setRecord(Number(readStored(RECORD_KEY)) || 0);
    state.found = foundSecrets();
    setFound(state.found);
    setFinaleOpen(readStored(FINALE_KEY) === "si" || SECRETS.every((secret) => state.found.includes(secret.id)));
    const quiet = readStored(SOUND_KEY) === "no";
    if (quiet) {
      setSound(false);
      sounds().setEnabled(false);
    }
    return () => {
      page.style.overflow = overflow;
      window.clearTimeout(state.bannerTimer);
      bleeps.current?.close();
      bleeps.current = null;
      if (dialog.open) dialog.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El paisaje se arma a la medida de la ventana.
  useEffect(() => {
    const canvas = background.current;
    if (!canvas) return;
    const state = live.current;
    const pixel = Math.max(layout.unit, 2);
    const width = Math.ceil(layout.width / pixel);
    const height = Math.ceil(layout.height / pixel);
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width * pixel}px`;
    canvas.style.height = `${height * pixel}px`;
    state.scenes = [];
    state.sceneSize = { width, height };
    state.scratch = makeCanvas(width, height);
    state.dirty = true;
    paintBackground(performance.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.unit, layout.width, layout.height]);

  // El reloj del juego.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let painted = 0;
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      advance(Math.min(now - last, 100));
      last = now;
      // El paisaje se repinta unas 16 veces por segundo: suficiente para el pixel art y descansa la batería.
      if (now - painted >= 60) {
        painted = now;
        paintBackground(now);
      }
      paintField();
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambios de tamaño, giro del celular, y pausa sola al salir de la pestaña.
  useEffect(() => {
    let timer = 0;
    const resize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setLayout((old) => {
          const next = measure(old.touch);
          return sameLayout(old, next) ? old : next;
        });
      }, 120);
    };
    const hidden = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", hidden);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // En cada pantalla, el foco va a lo principal: el tablero al jugar, el primer botón en las demás.
  useEffect(() => {
    const target = phase === "jugando" ? fieldBox.current : root.current?.querySelector<HTMLElement>("[data-first]");
    target?.focus({ preventScroll: true });
  }, [phase]);

  /* ---------- Teclado, toques y botones ---------- */

  /**
   * La tecla Esc retrocede un paso: en plena partida pausa, en la pausa sigue,
   * con el mensaje abierto lo cierra y, al terminar la partida, vuelve a la portada.
   * Solo en la portada no hay a dónde volver: ahí cierra el juego (devuelve false).
   */
  const stepBack = (): boolean => {
    const state = live.current;
    if (state.phase === "titulo") return false;
    if (state.phase === "juegos" || state.phase === "secretos" || state.phase === "final" || state.phase === "consola") {
      setDuelPick(false);
      go("titulo");
      return true;
    }
    if (state.phase === "jugando") pause();
    else if (state.phase === "pausa") resume();
    else if (state.phase === "mensaje") closeLetter();
    else if (state.phase === "puntajes") closeBoard();
    else if (calm()) go("titulo");
    return true;
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const state = live.current;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === "Escape") {
      // Se ataja aquí, en la tecla, y no en el aviso de cierre de la ventana (onCancel): los navegadores
      // solo dejan impedir ese cierre un par de veces, y en una partida Esc se usa muchas más.
      if (stepBack()) {
        event.preventDefault();
        state.escapedAt = performance.now();
      }
      return;
    }
    // Mientras se escribe el nombre para la tabla, las letras son letras y no atajos.
    if (event.target instanceof HTMLInputElement || state.phase === "puntajes") return;
    if (state.phase === "jugando" && state.gameId !== "bloques") {
      if (key === "p") {
        event.preventDefault();
        pause();
      } else if (mini.current?.key(event.key, true)) event.preventDefault();
      return;
    }
    if (state.phase === "titulo" && key.length === 1) {
      // Escribir su nombre en la portada, con el teclado, también esconde algo.
      const typedName = currentTheme().shortName.toLowerCase();
      state.typed = (state.typed + key).slice(-typedName.length);
      if (state.typed === typedName) {
        state.typed = "";
        // Escribir el nombre corto abre el secreto final sin esperar a tener todos los logros.
        const already = readStored(FINALE_KEY) === "si";
        if (!already) unlockFinale(state.found.includes("teclado"));
        revealSecret("titulo", "teclado", true);
        return;
      }
    }
    if (state.phase === "jugando") {
      const action = KEYS[key];
      if (action) {
        event.preventDefault();
        if (!event.repeat) press(action);
      } else if (key === "p") {
        event.preventDefault();
        pause();
      }
      return;
    }
    if (key === "p" && state.phase === "pausa") {
      event.preventDefault();
      resume();
    }
  };

  const onKeyUp = (event: ReactKeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return;
    if (live.current.gameId !== "bloques") {
      mini.current?.key(event.key, false);
      return;
    }
    const action = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!action) return;
    release(action);
    if (live.current.phase === "jugando") event.preventDefault();
  };

  // El aviso de cierre de la ventana llega con el botón "atrás" del celular (y con Esc, en los navegadores
  // que no dejan atajarla antes). En plena partida pausa, y con el mensaje del premio abierto lo cierra;
  // en cualquier otro momento se deja pasar y el juego se cierra.
  const onCancel = (event: SyntheticEvent) => {
    const state = live.current;
    if (performance.now() - state.escapedAt < 300) {
      // Viene de una tecla Esc que ya hizo lo suyo: solo hay que evitar que además cierre el juego.
      event.preventDefault();
      return;
    }
    if (state.phase === "jugando") {
      event.preventDefault();
      pause();
    } else if (state.phase === "mensaje" && state.letterFrom !== "titulo") {
      event.preventDefault();
      closeLetter();
    } else if (state.phase === "juegos" || state.phase === "secretos" || state.phase === "final" || state.phase === "consola") {
      event.preventDefault();
      stepBack();
    } else if (state.phase === "puntajes" && state.boardFrom !== "titulo") {
      event.preventDefault();
      closeBoard();
    }
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    // Si alguien toca la pantalla con el dedo, aparecen los botones para jugar.
    if (event.pointerType === "touch" && !layout.touch) setLayout(measure(true));
  };

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    store(SOUND_KEY, next ? "si" : "no");
    sounds().setEnabled(next);
    if (next) sounds().rotate();
    if (live.current.phase === "jugando") fieldBox.current?.focus({ preventScroll: true });
  };

  const padKey = (action: Action, glyph: string, label: string, main = false) => (
    <button
      type="button"
      className={`bn-key${main ? " bn-key-main" : ""}`}
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        if (event.pointerType === "mouse") event.currentTarget.setPointerCapture(event.pointerId);
        live.current.touched = performance.now();
        press(action);
      }}
      onPointerUp={() => lift(action)}
      onPointerCancel={() => lift(action)}
      onLostPointerCapture={() => lift(action)}
      onClick={(event) => {
        // Después de un toque el navegador manda también un "clic": ese no cuenta, la jugada ya salió.
        // Con teclado o lector de pantalla no hay toque, solo el clic: ahí sí sale la jugada.
        const pointer = (event.nativeEvent as PointerEvent).pointerType;
        if (!pointer && performance.now() - live.current.touched > 500) act(action);
      }}
    >
      <PixelText label="">{glyph}</PixelText>
    </button>
  );

  /** Botón táctil de los juegos pequeños: vale mientras esté apretado. */
  const miniPad = ({ key, glyph, label, main }: PadButton) => (
    <button
      key={key}
      type="button"
      className={`bn-key${main ? " bn-key-main" : ""}`}
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        if (event.pointerType === "mouse") event.currentTarget.setPointerCapture(event.pointerId);
        live.current.touched = performance.now();
        mini.current?.key(key, true);
      }}
      onPointerUp={() => mini.current?.key(key, false)}
      onPointerCancel={() => mini.current?.key(key, false)}
      onLostPointerCapture={() => mini.current?.key(key, false)}
      onClick={(event) => {
        const pointer = (event.nativeEvent as PointerEvent).pointerType;
        if (pointer || performance.now() - live.current.touched <= 500) return;
        // Con teclado o lector de pantalla: un toque corto.
        mini.current?.key(key, true);
        window.setTimeout(() => mini.current?.key(key, false), 120);
      }}
    >
      <PixelText label="">{glyph}</PixelText>
    </button>
  );

  /* ---------- Pantalla ---------- */

  const playing = phase === "jugando";
  const blocks = game === "bloques";
  const miniDef = blocks ? null : MINI_GAMES[game as keyof typeof MINI_GAMES];
  const pads = miniDef?.pad(mode) ?? [];
  const under = phase === "mensaje" ? letter.from : phase;
  const base = under === "puntajes" ? board.from : under;
  const inGame = base !== "titulo" && base !== "juegos" && base !== "secretos" && base !== "final" && base !== "consola";
  const screen = `${layout.width}x${layout.height}@${layout.unit}`;

  // La portada y el mensaje se ajustan solos: del tamaño más grande al más pequeño, el primero que quepa.
  const titleSizes = useMemo(() => titleSteps(layout), [layout]);
  const title = useFit(titleSizes, titleBox, phase === "titulo", screen);
  const letterSizes = useMemo(() => letterSteps(layout.unit), [layout.unit]);
  const letterUnit = useFit(letterSizes, letterBox, phase === "mensaje", screen);

  // Si el mensaje no cabe entero (pantallas pequeñas), una flecha avisa de que sigue más abajo.
  const checkBelow = () => {
    const box = letterBox.current;
    setMoreBelow(!!box && box.scrollTop + box.clientHeight < box.scrollHeight - 2);
  };
  useLayoutEffect(checkBelow, [phase, letterUnit, layout]);

  const logo = title.logo;
  const logicalWidth = layout.width / layout.unit;
  const mascots = logicalWidth >= 31 * logo + 14 * logo + 24;
  const handleSize = title.handle === 2 && (layout.width - 32) / title.text >= 200 ? 2 : 1;
  const style = {
    "--bn-u": `${layout.unit}px`,
    "--bn-l": `${letterUnit}px`,
    "--bn-hud-top": `${layout.hudTop}px`,
  } as CSSProperties;
  const shownScore = String(Math.min(hud.score, SCORE_CAP));
  const theme = currentTheme();
  const secret = letter.custom ?? (letter.secret ? theme.secrets[letter.secret] : undefined);
  const letterTitle = secret ? secret.title : theme.letterTitle;
  const letterText: readonly string[] = secret ? secret.text : theme.letter;
  const GAME_TITLE = theme.title;
  const totalPoints = SECRETS.reduce((sum, item) => sum + TROPHY_POINTS[theme.secrets[item.id].trophy], 0);
  const earned = SECRETS.reduce((sum, item) => sum + (found.includes(item.id) ? TROPHY_POINTS[theme.secrets[item.id].trophy] : 0), 0);
  const mineAt = board.rows && board.mine ? board.rows.findIndex((row) => row.name === board.mine?.name && row.score === board.mine?.score) : -1;
  const best = String(Math.min(Math.max(record, hud.score), SCORE_CAP));

  return (
    <dialog
      ref={root}
      className="bn-root"
      aria-label={GAME_TITLE.join(" ")}
      data-phase={phase}
      data-mode={layout.mode}
      data-world={world}
      data-game={game}
      data-touch={layout.touch}
      data-brand={inGame && layout.brand}
      style={style}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onCancel={onCancel}
      onClose={(event) => {
        if (!event.currentTarget.open) onClose();
      }}
      onPointerDown={onPointerDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <style>{STYLES}</style>
      <canvas ref={background} className="bn-bg" aria-hidden="true" />

      <div className="bn-top">
        <PixelText as="h1" className="bn-brand" outline={NIGHT}>
          {GAME_TITLE.join(" ")}
        </PixelText>
        {(phase === "jugando" || phase === "pausa") && (
          <button type="button" className="bn-icon" aria-label={playing ? UI.paused : UI.resume} onClick={playing ? pause : resume}>
            <PixelText label="">{playing ? "‖" : "▶"}</PixelText>
          </button>
        )}
        <button type="button" className="bn-icon" aria-label="Sonido" aria-pressed={sound} onClick={toggleSound}>
          <PixelText label="" className={sound ? undefined : "bn-icon-off"}>
            ♫
          </PixelText>
          {!sound && (
            <PixelText label="" color="#ff8f70">
              ×
            </PixelText>
          )}
        </button>
        <button type="button" className="bn-icon" aria-label="Cerrar el juego" onClick={() => root.current?.close()}>
          <PixelText label="">×</PixelText>
        </button>
      </div>

      {phase === "titulo" && (
        <section ref={titleBox} className="bn-title" aria-label="Portada" data-tight={title.tight} style={{ "--bn-t": `${title.text}px` } as CSSProperties}>
          <div className="bn-title-box">
            <div className="bn-logo" aria-hidden="true" onPointerDown={tapLogo}>
              <PixelText unit="u" size={logo} bands={LOGO_BANDS} outline={NIGHT} shadow="#3b1a5e" align="center" label="">
                {GAME_TITLE[0]}
              </PixelText>
              <div className="bn-logo-row">
                {mascots && <PixelSprite rows={NINJA.stand} colors={NINJA_COLORS} size={Math.ceil(logo / 2)} />}
                <PixelText unit="u" size={logo} bands={LOGO_BANDS} outline={NIGHT} shadow="#3b1a5e" align="center" label="">
                  {GAME_TITLE[1]}
                </PixelText>
                {mascots && <PixelSprite rows={GHOST.open} colors={GHOST_COLORS} size={Math.ceil(logo / 2)} flip />}
              </div>
            </div>

            <div className="bn-tribute">
              <div className="bn-tribute-row">
                {/* En pantallas angostas los muñequitos no caben junto al nombre: van aquí, más pequeños. */}
                {!mascots && <PixelSprite rows={NINJA.stand} colors={NINJA_COLORS} size={2} />}
                <PixelText as="p" color="var(--bn-soft)" outline={NIGHT} align="center">
                  {theme.tribute}
                </PixelText>
                {!mascots && <PixelSprite rows={GHOST.open} colors={GHOST_COLORS} size={2} flip />}
              </div>
              <PixelText as="p" size={handleSize} color="var(--bn-gold)" outline={NIGHT} shadow={NIGHT} align="center">
                {theme.handle}
              </PixelText>
              <PixelText as="p" outline={NIGHT} align="center">
                {theme.dedication}
              </PixelText>
            </div>

            <div className="bn-menu">
              <button type="button" className="bn-btn" data-first onClick={() => go("juegos")}>
                <PixelText>{UI.playButton}</PixelText>
              </button>
              <button type="button" className="bn-btn bn-btn-quiet" onClick={() => showBoard("bloques", "titulo", null)}>
                <PixelText>{UI.scores}</PixelText>
              </button>
              <button type="button" className="bn-btn bn-btn-quiet" onClick={openConsole}>
                <PixelText>{UI.console}</PixelText>
              </button>
              {found.length > 0 && (
                <button type="button" className="bn-btn bn-btn-quiet" onClick={() => go("secretos")}>
                  <PixelText>{`${UI.achievements} ${found.length}/${SECRETS.length}`}</PixelText>
                </button>
              )}
              {finaleOpen && (
                <button type="button" className="bn-btn bn-btn-final" onClick={() => go("final")}>
                  <PixelSprite rows={TROPHY} colors={TROPHY_COLORS.oro} size={1} unit="t" />
                  <PixelText>{theme.finale.button}</PixelText>
                </button>
              )}
            </div>

            {title.notes > 0 && (
              <div className="bn-notes">
                {record > 0 && (
                  <PixelText as="p" outline={NIGHT} align="center">
                    {`${UI.record} ${Math.min(record, SCORE_CAP)}`}
                  </PixelText>
                )}
                {title.notes > 1 && !layout.touch && (
                  <PixelText as="p" color="var(--bn-soft)" outline={NIGHT} align="center">
                    {UI.keys.join(" · ")}
                  </PixelText>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="bn-play" hidden={!inGame} aria-label="Partida">
        <div className="bn-hud" hidden={!blocks}>
          <div className="bn-next">
            <PixelText unit="u" tall color="var(--bn-soft)" label={`${UI.next}: ${hud.next ? KIND_NAMES[hud.next] : ""}`}>
              {UI.next}
            </PixelText>
            <canvas ref={preview} className="bn-preview" width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} aria-hidden="true" />
          </div>
          <dl className="bn-stats">
            <div className="bn-stat">
              <dt>
                <PixelText unit="u" tall color="var(--bn-soft)">
                  {UI.score}
                </PixelText>
              </dt>
              <dd>
                <PixelText unit="u">{shownScore}</PixelText>
              </dd>
            </div>
            <div className="bn-stat">
              <dt>
                <PixelText unit="u" tall color="var(--bn-soft)">
                  {UI.lines}
                </PixelText>
              </dt>
              <dd>
                <PixelText unit="u" label={hud.lines < MESSAGE_LINES ? `${hud.lines} de ${MESSAGE_LINES}` : String(hud.lines)}>
                  {hud.lines < MESSAGE_LINES ? `${hud.lines}/${MESSAGE_LINES}` : String(hud.lines)}
                </PixelText>
              </dd>
            </div>
            <div className="bn-stat">
              <dt>
                <PixelText unit="u" tall color="var(--bn-soft)">
                  {UI.level}
                </PixelText>
              </dt>
              <dd>
                <PixelText unit="u">{String(hud.level)}</PixelText>
              </dd>
            </div>
            <div className="bn-stat bn-stat-record">
              <dt>
                <PixelText unit="u" tall color="var(--bn-soft)">
                  {UI.record}
                </PixelText>
              </dt>
              <dd>
                <PixelText unit="u">{best}</PixelText>
              </dd>
            </div>
          </dl>
        </div>

        <div className="bn-field">
          <div
            ref={fieldBox}
            className="bn-board"
            tabIndex={-1}
            role="application"
            aria-label={
              blocks
                ? "Tablero. Flechas para mover y girar, barra espaciadora para soltar, P para pausar."
                : `${GAME_NAMES[game]}. ${miniDef?.help ?? ""} P para pausar.`
            }
          >
            <canvas ref={field} width={FIELD_WIDTH} height={FIELD_HEIGHT} aria-hidden="true" hidden={!blocks} />
            {!blocks && inGame && (
              <MiniGame
                key={run}
                ref={mini}
                game={game as keyof typeof MINI_GAMES}
                mode={mode}
                running={playing}
                still={live.current.still}
                sounds={sounds}
                onWorld={(next) => {
                  live.current.miniWorld = next;
                }}
                onSecret={() => {
                  const id = live.current.gameId as SecretId;
                  if (live.current.phase === "jugando") revealSecret("jugando", id);
                }}
                onOver={finishMini}
                onStatus={setAnnouncement}
              />
            )}
          </div>

          {banner && playing && (
            <div key={banner.id} className="bn-banner" aria-hidden="true">
              <PixelText color="var(--bn-gold)" label="">{`${UI.level} ${banner.level}`}</PixelText>
              <PixelText label="">{worldName(banner.world)}</PixelText>
            </div>
          )}

          {phase === "pausa" && (
            <div className="bn-panel">
              <PixelText as="h2" size={2} color="var(--bn-gold)" align="center">
                {UI.paused}
              </PixelText>
              <button type="button" className="bn-btn" data-first onClick={resume}>
                <PixelText align="center">{UI.resume}</PixelText>
              </button>
              <button type="button" className="bn-btn bn-btn-quiet" onClick={() => go("titulo")}>
                <PixelText align="center">{UI.exit}</PixelText>
              </button>
            </div>
          )}

          {phase === "fin" && (
            <div className="bn-panel bn-panel-late">
              <PixelText as="h2" color="var(--bn-gold)" align="center">
                {over.result ?? UI.gameOver}
              </PixelText>
              {newRecord && (
                <PixelText as="p" color="#7ff0c9" align="center">
                  {UI.newRecord}
                </PixelText>
              )}
              <dl className="bn-totals" hidden={!over.scored}>
                <div>
                  <dt>
                    <PixelText color="var(--bn-soft)" tall>
                      {UI.score}
                    </PixelText>
                  </dt>
                  <dd>
                    <PixelText>{String(Math.min(over.score, SCORE_CAP))}</PixelText>
                  </dd>
                </div>
                {blocks && (
                  <div>
                    <dt>
                      <PixelText color="var(--bn-soft)" tall>
                        {UI.lines}
                      </PixelText>
                    </dt>
                    <dd>
                      <PixelText>{String(hud.lines)}</PixelText>
                    </dd>
                  </div>
                )}
              </dl>
              {over.scored && over.score > 0 && !over.saved ? (
                <button type="button" className="bn-btn" data-first onClick={() => calm() && showBoard(game, "fin", over.score)}>
                  <PixelText align="center">{UI.saveScore}</PixelText>
                </button>
              ) : over.scored ? (
                <button type="button" className="bn-btn bn-btn-quiet" onClick={() => calm() && showBoard(game, "fin", null)}>
                  <PixelText align="center">{UI.scores}</PixelText>
                </button>
              ) : null}
              <button
                type="button"
                className={over.scored && over.score > 0 && !over.saved ? "bn-btn bn-btn-quiet" : "bn-btn"}
                data-first={!(over.scored && over.score > 0 && !over.saved) || undefined}
                onClick={() => calm() && start()}
              >
                <PixelText align="center">{UI.again}</PixelText>
              </button>
              <button type="button" className="bn-btn bn-btn-quiet" onClick={() => calm() && go("titulo")}>
                <PixelText align="center">{UI.exit}</PixelText>
              </button>
            </div>
          )}
        </div>
      </section>

      {layout.touch && playing && !blocks && pads.some((group) => group.length > 0) && (
        <div className="bn-pad">
          {pads.map((group, index) => (
            <div key={index} className="bn-pad-group">
              {group.map(miniPad)}
            </div>
          ))}
        </div>
      )}

      {layout.touch && playing && blocks && (
        <div className="bn-pad">
          <div className="bn-pad-group">
            {padKey("left", "←", "Mover a la izquierda")}
            {padKey("soft", "↓", "Bajar")}
            {padKey("right", "→", "Mover a la derecha")}
          </div>
          <div className="bn-pad-group">
            {padKey("hard", "⤓", "Soltar hasta el fondo")}
            {padKey("rotate", "↻", "Girar", true)}
          </div>
        </div>
      )}

      {phase === "mensaje" && (
        <section className="bn-letter-wrap" aria-label="Mensaje">
          {letter.earned && (
            <PixelText as="p" color="var(--bn-gold)" outline={NIGHT} align="center" label="">
              {letter.custom ? UI.codeUnlocked : letter.secret ? SECRET_UNLOCKED : theme.unlocked}
            </PixelText>
          )}
          <div className="bn-letter">
            <div
              ref={letterBox}
              className="bn-letter-body"
              tabIndex={0}
              role="group"
              aria-label={letterTitle}
              data-first={letter.earned || undefined}
              onScroll={checkBelow}
            >
              <div className="bn-letter-head">
                <PixelText as="h2" unit="l" color="#b5281f" align="center">
                  {letterTitle}
                </PixelText>
                <PixelSprite rows={FLOWER} colors={FLOWER_COLORS} unit="l" size={2} />
              </div>
              {letterText.map((paragraph) => (
                <PixelText key={paragraph} as="p" unit="l" tall>
                  {paragraph}
                </PixelText>
              ))}
              <div className="bn-letter-foot">
                <span className="bn-letter-friends">
                  <PixelSprite rows={NINJA.stand} colors={NINJA_COLORS} unit="l" size={2} />
                  <PixelSprite rows={GHOST.open} colors={GHOST_COLORS} unit="l" size={2} flip />
                </span>
                <PixelText as="p" unit="l" tall color="#8a3b1e" align="end">
                  {theme.signature}
                </PixelText>
              </div>
            </div>
            {moreBelow && (
              <span className="bn-letter-more bn-blink" aria-hidden="true">
                <PixelText unit="l" size={2} label="">
                  ↓
                </PixelText>
              </span>
            )}
          </div>
          <button type="button" className="bn-btn" data-first={!letter.earned || undefined} onClick={closeLetter}>
            <PixelText>{letter.from === "jugando" ? UI.keepPlaying : UI.back}</PixelText>
          </button>
        </section>
      )}

      {phase === "juegos" && (
        <section className="bn-scores-wrap" aria-label={UI.games}>
          <div className="bn-scores bn-games">
            <PixelText as="h2" size={2} color="var(--bn-gold)" align="center">
              {UI.games}
            </PixelText>
            {duelPick ? (
              <div className="bn-games-list" role="group" aria-label={GAME_NAMES.duelo}>
                <PixelText as="p" align="center">
                  {GAME_NAMES.duelo}
                </PixelText>
                <PixelText as="p" color="var(--bn-soft)" align="center">
                  {UI.duelHow}
                </PixelText>
                <button type="button" className="bn-btn" data-first onClick={() => start("duelo", "1")}>
                  <PixelText align="center">{UI.onePlayer}</PixelText>
                </button>
                <button type="button" className="bn-btn bn-btn-quiet" onClick={() => start("duelo", "2")}>
                  <PixelText align="center">{UI.twoPlayers}</PixelText>
                </button>
              </div>
            ) : (
              <div className="bn-games-list">
                {GAMES.map((id, index) => (
                  <button
                    key={id}
                    type="button"
                    className="bn-btn"
                    data-first={index === 0 || undefined}
                    onClick={() => (id === "duelo" ? setDuelPick(true) : start(id, "1"))}
                  >
                    <canvas
                      className="bn-thumb"
                      aria-hidden="true"
                      ref={(element) => {
                        if (element && !element.dataset.done) {
                          element.dataset.done = "1";
                          paintThumb(element, id);
                        }
                      }}
                    />
                    <PixelText align="center">{GAME_NAMES[id]}</PixelText>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="bn-btn bn-btn-quiet bn-scores-back" onClick={() => (duelPick ? setDuelPick(false) : go("titulo"))}>
            <PixelText>{UI.back}</PixelText>
          </button>
        </section>
      )}

      {phase === "secretos" && (
        <section className="bn-scores-wrap" aria-label={UI.achievements}>
          <div className="bn-scores">
            <PixelText as="h2" size={2} color="var(--bn-gold)" align="center">
              {UI.achievements}
            </PixelText>
            <PixelText as="p" color="var(--bn-soft)" align="center">{`${found.length}/${SECRETS.length} ${UI.found} · ${earned}/${totalPoints} ${UI.points}`}</PixelText>
            <ul className="bn-secrets">
              {SECRETS.map((item) => {
                const { title: name, trophy } = theme.secrets[item.id];
                const points = TROPHY_POINTS[trophy];
                return found.includes(item.id) ? (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="bn-btn bn-btn-quiet bn-secret"
                      data-first={item.id === found[0] || undefined}
                      aria-label={`${name}. Trofeo de ${trophy}, ${points} ${UI.points}.`}
                      onClick={() => openLetter("secretos", false, item.id)}
                    >
                      <PixelSprite rows={TROPHY} colors={TROPHY_COLORS[trophy]} size={2} unit="t" />
                      <PixelText color="var(--bn-gold)" label="" className="bn-secret-name">
                        {name}
                      </PixelText>
                      <PixelText color="var(--bn-soft)" label="">{`${points}`}</PixelText>
                    </button>
                  </li>
                ) : (
                  <li key={item.id} className="bn-secret-locked">
                    <PixelSprite rows={TROPHY} colors={TROPHY_COLORS.nada} size={2} unit="t" />
                    <PixelText color="var(--bn-soft)" className="bn-secret-name" label={`${UI.locked}. ${hintFor(item.hint, theme)}. Trofeo de ${trophy}.`}>
                      {`? ${hintFor(item.hint, theme)}`}
                    </PixelText>
                    <PixelText color="var(--bn-soft)" label="">{`${points}`}</PixelText>
                  </li>
                );
              })}
            </ul>
            <div className="bn-progress" role="group" aria-label={UI.progress}>
              <PixelText as="p" color="var(--bn-soft)" align="center">
                {UI.progress}
              </PixelText>
              <button type="button" className="bn-btn bn-btn-quiet" onClick={saveProgress}>
                <PixelText align="center">{UI.saveProgress}</PixelText>
              </button>
              <button type="button" className="bn-btn bn-btn-quiet" onClick={() => progressFile.current?.click()}>
                <PixelText align="center">{UI.loadProgress}</PixelText>
              </button>
            </div>
          </div>
          <button type="button" className="bn-btn bn-scores-back" onClick={() => go("titulo")}>
            <PixelText>{UI.back}</PixelText>
          </button>
        </section>
      )}

      {/* El archivo de "Cargar mi progreso" (lo usan la consola y la pantalla de logros). */}
      <input
        ref={progressFile}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          void loadProgress(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {phase === "consola" && (
        <section className="bn-scores-wrap" aria-label={UI.console}>
          <div className="bn-scores bn-console">
            <PixelText as="h2" size={2} color="#7ff0a0" align="center">
              {UI.console}
            </PixelText>
            <div ref={consoleLog} className="bn-console-log" role="log" aria-live="polite" aria-label={UI.console} tabIndex={0}>
              {consoleLines.map((line) => (
                <PixelText
                  key={line.id}
                  as="p"
                  color={line.tone === "ok" ? "var(--bn-gold)" : line.tone === "error" ? "#ff8f8f" : line.tone === "echo" ? "#ffffff" : line.tone === "info" ? "#9fe0b8" : "#7ff0a0"}
                >
                  {line.text}
                </PixelText>
              ))}
              <span className="bn-console-cursor bn-blink" aria-hidden="true" />
            </div>
            <form className="bn-console-form" onSubmit={runConsole}>
              <PixelText color="#7ff0a0" label="">
                ▶
              </PixelText>
              <input
                className="bn-input bn-console-input"
                data-first
                value={consoleText}
                onChange={(event) => setConsoleText(event.target.value.slice(0, 40))}
                aria-label={UI.consoleInput}
                placeholder={UI.consoleInput}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="send"
              />
              <button type="submit" className="bn-btn" disabled={consoleBusy || !consoleText.trim()}>
                <PixelText>{UI.send}</PixelText>
              </button>
            </form>
            {codes.length > 0 && (
              <ul className="bn-secrets" aria-label="Códigos usados">
                {codes.map((item) => (
                  <li key={item.code}>
                    <button type="button" className="bn-btn bn-btn-quiet bn-secret" onClick={() => openLetter("consola", false, null, item)}>
                      <PixelSprite rows={TROPHY} colors={TROPHY_COLORS.oro} size={2} unit="t" />
                      <PixelText color="var(--bn-gold)" className="bn-secret-name">
                        {item.title}
                      </PixelText>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" className="bn-btn bn-btn-quiet bn-scores-back" onClick={() => go("titulo")}>
            <PixelText>{UI.back}</PixelText>
          </button>
        </section>
      )}

      {phase === "final" && <Finale still={live.current.still} unit={layout.unit} onClose={() => go("titulo")} />}

      {toast && (
        <div key={toast.key} className="bn-toast" aria-hidden="true">
          <PixelSprite rows={TROPHY} colors={TROPHY_COLORS[toast.trophy]} size={2} unit="t" />
          <span className="bn-toast-text">
            <PixelText color="var(--bn-soft)" label="">
              {toast.label ?? (toast.points === null ? theme.finale.button : UI.achievementUnlocked)}
            </PixelText>
            <PixelText color="var(--bn-gold)" label="">
              {toast.points === null ? toast.title : `${toast.title} · ${toast.points}`}
            </PixelText>
          </span>
        </div>
      )}

      {phase === "puntajes" && (
        <section className="bn-scores-wrap" aria-label={UI.scores}>
          <div className="bn-scores">
            <PixelText as="h2" size={2} color="var(--bn-gold)" align="center">
              {UI.scores}
            </PixelText>
            <div className="bn-scores-game">
              {board.entry === null && (
                <button type="button" className="bn-icon" aria-label="Juego anterior" onClick={() => turnBoard(-1)}>
                  <PixelText label="">←</PixelText>
                </button>
              )}
              <PixelText as="p" align="center" className="bn-scores-name">
                {GAME_NAMES[board.game]}
              </PixelText>
              {board.entry === null && (
                <button type="button" className="bn-icon" aria-label="Juego siguiente" onClick={() => turnBoard(1)}>
                  <PixelText label="">→</PixelText>
                </button>
              )}
            </div>

            {board.entry !== null && (
              <form className="bn-entry" onSubmit={submitScore}>
                <PixelText as="p" color="var(--bn-gold)" align="center">{`${UI.yourScore}: ${board.entry}`}</PixelText>
                <label className="bn-entry-row">
                  <PixelText>{UI.yourName}</PixelText>
                  <input
                    className="bn-input"
                    data-first
                    value={name}
                    onChange={(event) => setName(event.target.value.toUpperCase().slice(0, NAME_LENGTH))}
                    maxLength={NAME_LENGTH}
                    autoComplete="off"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="done"
                  />
                </label>
                <button type="submit" className="bn-btn" disabled={saving || !cleanName(name)}>
                  <PixelText>{UI.save}</PixelText>
                </button>
              </form>
            )}

            {board.rows === null ? (
              <PixelText as="p" color="var(--bn-soft)" align="center" className="bn-blink">
                {UI.loading}
              </PixelText>
            ) : board.rows.length === 0 ? (
              <PixelText as="p" color="var(--bn-soft)" align="center">
                {UI.noScores}
              </PixelText>
            ) : (
              <ol className="bn-rows">
                {board.rows.map((row, index) => (
                  <li key={index} className="bn-row" data-mine={index === mineAt || undefined}>
                    <PixelText className="bn-row-rank" label={`${index + 1}.`}>{`${index + 1}`}</PixelText>
                    <PixelText className="bn-row-name">{row.name}</PixelText>
                    <PixelText>{String(row.score)}</PixelText>
                  </li>
                ))}
              </ol>
            )}
            {board.rows !== null && !board.shared && (
              <PixelText as="p" color="var(--bn-soft)" align="center">
                {UI.localScores}
              </PixelText>
            )}
          </div>
          <button type="button" className="bn-btn bn-scores-back" data-first={board.entry === null || undefined} onClick={closeBoard}>
            <PixelText>{UI.back}</PixelText>
          </button>
        </section>
      )}

      <p className="bn-sr" role="status" aria-live="polite">
        {announcement}
      </p>
    </dialog>
  );
}
