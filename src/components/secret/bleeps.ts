/**
 * Sonidos del juego escondido: pitidos como los de las consolas de antes.
 * No usa archivos de audio; el navegador fabrica cada nota al momento.
 * Si el navegador no deja sonar, el juego sigue igual, en silencio.
 */

/** Una nota: frecuencia (Hz), duración (s) y cuánto esperar antes de tocarla (s). */
type Note = readonly [frequency: number, duration: number, delay?: number];

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

export type Bleeps = ReturnType<typeof createBleeps>;

/** Pasa un número de nota (69 = la de 440 Hz) a su frecuencia. */
const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);

/**
 * "Canción de las dos lunas": una melodía suave y original de ocho compases en
 * do mayor (do, la menor, fa, sol · do, mi menor, fa, sol), que vuelve a empezar
 * sola. Cada nota es [número de nota, cuántas corcheas dura]; 0 es silencio.
 */
const LEAD: readonly (readonly [number, number])[] = [
  [76, 2], [79, 2], [81, 1], [79, 1], [76, 2],
  [72, 2], [74, 1], [76, 1], [69, 4],
  [77, 2], [76, 1], [74, 1], [72, 2], [69, 2],
  [74, 2], [76, 1], [74, 1], [71, 2], [67, 2],
  [76, 2], [79, 2], [84, 3], [83, 1],
  [83, 2], [79, 2], [76, 4],
  [81, 2], [79, 1], [77, 1], [76, 2], [74, 2],
  [74, 2], [76, 1], [74, 1], [72, 4],
];
/** Los acordes, uno por compás: tónica, tercera y quinta. */
const CHORDS: readonly (readonly [number, number, number])[] = [
  [48, 52, 55],
  [45, 48, 52],
  [41, 45, 48],
  [43, 47, 50],
  [48, 52, 55],
  [40, 43, 47],
  [41, 45, 48],
  [43, 47, 50],
];
/** Duración de una corchea, en segundos (unas 76 negras por minuto). */
const EIGHTH = 0.395;
const LOOP_EIGHTHS = CHORDS.length * 8;

type Tone = { at: number; note: number; length: number; wave: OscillatorType; volume: number };

/** Todas las notas de una vuelta de la melodía, en orden: la voz, el bajo y un arpegio muy suave. */
const SONG: readonly Tone[] = (() => {
  const tones: Tone[] = [];
  let at = 0;
  for (const [note, length] of LEAD) {
    if (note) tones.push({ at, note, length, wave: "square", volume: 0.016 });
    at += length;
  }
  CHORDS.forEach(([root, third, fifth], bar) => {
    const start = bar * 8;
    tones.push({ at: start, note: root - 12, length: 4, wave: "triangle", volume: 0.06 });
    tones.push({ at: start + 4, note: fifth - 12, length: 4, wave: "triangle", volume: 0.05 });
    [root, third, fifth, third, root + 12, fifth, third, fifth].forEach((note, step) =>
      tones.push({ at: start + step, note: note + 12, length: 1, wave: "triangle", volume: 0.022 }),
    );
  });
  return tones.sort((a, b) => a.at - b.at);
})();

export function createBleeps() {
  let context: AudioContext | null = null;
  let enabled = true;
  /** El volumen general de cada melodía que está sonando (para callarlas al apagar el sonido). */
  const songs = new Set<GainNode>();

  function engine(): AudioContext | null {
    if (!context) {
      const Engine = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
      if (!Engine) return null;
      context = new Engine();
    }
    if (context.state === "suspended") void context.resume();
    return context;
  }

  function play(notes: readonly Note[], volume = 0.05, wave: OscillatorType = "square") {
    if (!enabled) return;
    try {
      if (!context) {
        const Engine = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
        if (!Engine) return;
        context = new Engine();
      }
      if (context.state === "suspended") void context.resume();
      const now = context.currentTime;
      for (const [frequency, duration, delay = 0] of notes) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, now + delay);
        gain.gain.setValueAtTime(volume, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + delay);
        oscillator.stop(now + delay + duration + 0.02);
      }
    } catch {
      // Sin sonido.
    }
  }

  return {
    setEnabled(value: boolean) {
      enabled = value;
      for (const gain of songs) {
        try {
          gain.gain.cancelScheduledValues(gain.context.currentTime);
          gain.gain.setValueAtTime(value ? 1 : 0, gain.context.currentTime);
        } catch {
          // Sin sonido.
        }
      }
    },
    /**
     * Toca la "Canción de las dos lunas" en bucle hasta que se llame a lo que
     * devuelve. Con el sonido apagado sigue el compás en silencio, y vuelve a
     * oírse si se enciende.
     */
    melody(): () => void {
      let audio: AudioContext | null = null;
      let master: GainNode | null = null;
      try {
        audio = engine();
        if (audio) {
          master = audio.createGain();
          master.gain.value = enabled ? 1 : 0;
          master.connect(audio.destination);
          songs.add(master);
        }
      } catch {
        audio = null;
      }
      if (!audio || !master) return () => {};
      const out = master;
      const ctx = audio;
      let index = 0;
      let loopStart = ctx.currentTime + 0.15;
      const schedule = () => {
        try {
          const until = ctx.currentTime + 0.7;
          // Si el navegador se durmió un rato, se retoma desde ahora y no se amontonan las notas atrasadas.
          if (loopStart + SONG[index].at * EIGHTH < ctx.currentTime - 0.5) {
            loopStart = ctx.currentTime + 0.1 - SONG[index].at * EIGHTH;
          }
          while (loopStart + SONG[index].at * EIGHTH < until) {
            const tone = SONG[index];
            const start = loopStart + tone.at * EIGHTH;
            if (enabled && start >= ctx.currentTime - 0.02) {
              const length = tone.length * EIGHTH * 0.92;
              const oscillator = ctx.createOscillator();
              const gain = ctx.createGain();
              oscillator.type = tone.wave;
              oscillator.frequency.setValueAtTime(hz(tone.note), start);
              gain.gain.setValueAtTime(0.0001, start);
              gain.gain.linearRampToValueAtTime(tone.volume, start + 0.025);
              gain.gain.exponentialRampToValueAtTime(tone.volume * 0.45, start + Math.min(length, 0.3));
              gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
              oscillator.connect(gain);
              gain.connect(out);
              oscillator.start(start);
              oscillator.stop(start + length + 0.03);
            }
            index += 1;
            if (index >= SONG.length) {
              index = 0;
              loopStart += LOOP_EIGHTHS * EIGHTH;
            }
          }
        } catch {
          // Sin sonido.
        }
      };
      schedule();
      const timer = window.setInterval(schedule, 120);
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        window.clearInterval(timer);
        songs.delete(out);
        try {
          out.gain.cancelScheduledValues(ctx.currentTime);
          out.gain.setValueAtTime(out.gain.value, ctx.currentTime);
          out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
          window.setTimeout(() => out.disconnect(), 400);
        } catch {
          // Sin sonido.
        }
      };
    },
    move: () => play([[196, 0.035]], 0.03),
    rotate: () => play([[294, 0.045]], 0.035),
    drop: () =>
      play(
        [
          [147, 0.06],
          [98, 0.09, 0.03],
        ],
        0.07,
        "triangle",
      ),
    lock: () => play([[110, 0.06]], 0.05, "triangle"),
    /** Una escalera de notas, más larga cuantas más líneas se borren de una vez. */
    clear: (lines: number) =>
      play(
        [523, 659, 784, 1047, 1319].slice(0, lines + 1).map((frequency, index): Note => [frequency, 0.09, index * 0.06]),
        0.05,
      ),
    level: () =>
      play(
        [
          [392, 0.09],
          [523, 0.09, 0.09],
          [784, 0.16, 0.18],
        ],
        0.05,
      ),
    letter: () =>
      play(
        [
          [523, 0.12],
          [659, 0.12, 0.12],
          [784, 0.12, 0.24],
          [1047, 0.12, 0.36],
          [784, 0.12, 0.48],
          [1047, 0.34, 0.6],
        ],
        0.05,
      ),
    start: () =>
      play(
        [
          [330, 0.07],
          [494, 0.11, 0.07],
        ],
        0.045,
      ),
    over: () =>
      play(
        [
          [392, 0.14],
          [330, 0.14, 0.14],
          [262, 0.14, 0.28],
          [196, 0.34, 0.42],
        ],
        0.05,
        "triangle",
      ),
    /** Apaga el motor de sonido al cerrar el juego. */
    close() {
      void context?.close().catch(() => {});
      context = null;
    },
  };
}
