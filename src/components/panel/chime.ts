/**
 * Sonido de aviso, hecho con el sintetizador del navegador (no necesita
 * ningún archivo de audio). Los navegadores solo dejan sonar una página
 * después de que la persona la haya tocado al menos una vez.
 */

let context: AudioContext | null = null;

function getAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Factory =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Factory) return null;
  try {
    context ??= new Factory();
  } catch {
    return null;
  }
  return context;
}

/** Prepara el sonido. La primera vez tiene que llamarse desde un toque o una tecla. Devuelve si quedó listo. */
export async function unlockAudio(): Promise<boolean> {
  const audio = getAudio();
  if (!audio) return false;
  if (audio.state !== "running") {
    try {
      await audio.resume();
    } catch {
      return false;
    }
  }
  return audio.state === "running";
}

/** Toca el aviso: tres notas que suben. Con `times` se repite para que se oiga en una cocina. */
export function playChime(times = 1): boolean {
  const audio = getAudio();
  if (!audio || audio.state !== "running") return false;
  const note = (frequency: number, start: number, duration: number) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  };
  for (let round = 0; round < times; round++) {
    const start = audio.currentTime + round * 1.3;
    note(880, start, 0.3); // la
    note(1174.66, start + 0.17, 0.35); // re
    note(1567.98, start + 0.36, 0.6); // sol
  }
  return true;
}
