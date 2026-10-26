/**
 * Todos los textos del juego escondido, juntos para que sea fácil cambiarlos.
 *
 * Escríbelos normal, con mayúsculas y minúsculas: en pantalla salen en
 * mayúsculas porque las letras de píxeles no tienen minúsculas. Sirven las
 * tildes, la ñ, los números y los signos más comunes (. , : ; ! ¡ ? ¿ @ - — ' "
 * y paréntesis). Un signo que no exista sale como "?".
 */

/** El nombre del juego: en la portada sale en dos renglones, por las dos lunas de sus paisajes. */
export const GAME_TITLE = ["Dos", "Lunas"] as const;

/** A quién está dedicado: su usuario, tal cual, sin enlace. */
export const HANDLE = "@nathabermudez03";

/** Dedicatoria corta de la portada. */
export const TRIBUTE = "Un homenaje a";
export const DEDICATION = "Una de las mejores personas que conocí en 2026";

/** El mensaje completo. Cada texto de la lista es un párrafo. */
export const LETTER_TITLE = `Para ${HANDLE}`;
export const LETTER = [
  "Natha: de todo lo que me dejó el 2026, conocerte está entre lo mejor.",
  "Eres una de las mejores personas que conocí este año, y quería dejarlo escrito en algún lugar, aunque fuera escondido.",
  "Por eso aquí hay ninjas y espíritus: sé que te gustan.",
  "Gracias por ser como eres. Que la vida te devuelva todo lo bueno que das.",
] as const;
export const SIGNATURE = "— Sebas";

/**
 * Los mensajes secretos: secretos dentro del secreto. Cada uno se gana de una
 * manera distinta (`hint` es la pista que se ve mientras está sin descubrir).
 * Los descubiertos se pueden volver a leer desde la portada.
 */
export const SECRETS = [
  {
    id: "dentro",
    title: "El secreto dentro del secreto",
    hint: "Toca 5 veces el nombre grande de la portada",
    text: [
      "Si estás leyendo esto, encontraste el secreto dentro del secreto.",
      "Natha: lo escondí más adentro porque lo que más vale no siempre está a la vista.",
      "Gracias por tu amistad. Ojalá cada vez que juegues aquí te acuerdes de que alguien te aprecia mucho.",
      "Nunca dejes de ser tú.",
    ],
  },
  {
    id: "firma",
    title: "Tu firma",
    hint: "Guarda un puntaje con su nombre",
    text: ["Firmaste con tu nombre, y aquí queda.", "Este juego es tuyo desde el primer bloque hasta el último espíritu."],
  },
  {
    id: "teclado",
    title: "Escrito en la portada",
    hint: "En la portada, escribe su nombre con el teclado",
    text: ["Escribiste tu nombre y la portada te reconoció.", "Hay nombres que vale la pena escribir en grande."],
  },
  {
    id: "torre",
    title: "La torre más alta",
    hint: "Completa 25 líneas en Torre de Luna",
    text: ["Veinticinco líneas, una sobre otra.", "Eres más constante de lo que crees: lo que construyes con paciencia llega lejos."],
  },
  {
    id: "laberinto",
    title: "La salida del laberinto",
    hint: "Junta {nombre} en Laberinto Lunar",
    text: ["Juntaste tu nombre letra por letra, con los espíritus detrás.", "Que nunca te falte luz para encontrar tu camino."],
  },
  {
    id: "espiritus",
    title: "Ocho oleadas",
    hint: "Junta {nombre} en Lluvia de Espíritus",
    text: ["Ocho oleadas, ocho letras: tu nombre completo.", "Que todo lo que te propongas lo termines igual: con estrellas."],
  },
  {
    id: "duelo",
    title: "Le ganaste a la luna",
    hint: "Gana un duelo contra la máquina en Duelo de Lunas",
    text: ["Siete puntos y la luna se rindió.", "Que así le ganes a cualquier día difícil."],
  },
  {
    id: "tejados",
    title: "Por los tejados",
    hint: "Junta {nombre} en Carrera por los Tejados",
    text: ["Corriste por los tejados de toda la aldea sin parar.", "Que llegues tan lejos como quieras llegar."],
  },
  {
    id: "muro",
    title: "El muro de tu nombre",
    hint: "Rompe las ocho letras en Muro de Faroles",
    text: ["Rompiste el muro letra por letra.", "Ningún muro es más fuerte que tus ganas."],
  },
  {
    id: "dragon",
    title: "El dragón sabe tu nombre",
    hint: "Junta {nombre} en Dragón de Papel",
    text: ["El dragón de papel se comió las ocho letras y ya sabe cómo te llamas.", "Que la buena suerte te acompañe a donde vayas."],
  },
  {
    id: "parejas",
    title: "Buena memoria",
    hint: "Completa las tres rondas de Parejas de Espíritus",
    text: ["Encontraste todas las parejas.", "Ojalá también recuerdes siempre lo valiosa que eres."],
  },
  {
    id: "fichas",
    title: "El templo despejado",
    hint: "Despeja un tablero entero en Fichas del Templo",
    text: ["Paciencia y buen ojo: no quedó ni una ficha.", "Que tu mente siempre encuentre esa misma calma."],
  },
  {
    id: "carreras",
    title: "La ruta completa",
    hint: "Junta {nombre} en Ruta de los Faroles",
    text: ["Recorriste la ruta y recogiste cada letra en el camino.", "Que todos tus caminos tengan faroles encendidos."],
  },
  {
    id: "pinball",
    title: "Todas las luces",
    hint: "Enciende {nombre} en Pinball de las Lunas",
    text: ["Encendiste todas las luces de la mesa.", "Así brillas tú: sin que nadie tenga que pedírtelo."],
  },
  {
    id: "esferas",
    title: "La cadena rota",
    hint: "Completa el nivel 10 de Cadena de Lunas",
    text: ["Diez caminos y ninguna esfera llegó al final.", "Que nada te detenga cuando decidas avanzar."],
  },
  {
    id: "mascotas",
    title: "Patitas felices",
    hint: "Deja muy felices a un gatito y a un perrito en Casa de Patitas",
    text: ["Cuidaste a tus patitas con cariño hasta verlas felices.", "Tienes un corazón enorme: que nunca se te acabe."],
  },
] as const;
export type SecretId = (typeof SECRETS)[number]["id"];
export const SECRET_UNLOCKED = "¡Encontraste un mensaje secreto!";

/**
 * Cada mensaje secreto es también un logro, con su trofeo: bronce, plata u oro
 * (los más difíciles). Cada trofeo vale puntos de logro.
 */
export type Trophy = "bronce" | "plata" | "oro";
export const TROPHY_POINTS: Record<Trophy, number> = { bronce: 10, plata: 25, oro: 50 };
export const DEFAULT_TROPHIES: Record<SecretId, Trophy> = {
  dentro: "bronce",
  firma: "bronce",
  teclado: "bronce",
  torre: "plata",
  laberinto: "plata",
  espiritus: "plata",
  duelo: "plata",
  tejados: "plata",
  muro: "oro",
  dragon: "plata",
  parejas: "plata",
  fichas: "oro",
  carreras: "plata",
  pinball: "oro",
  esferas: "oro",
  mascotas: "plata",
};

/**
 * El secreto final: una cinemática que se abre con un botón en la portada
 * cuando se consiguen todos los logros (o al escribir el nombre corto en la
 * portada, que lo abre sin esperar). Todo esto se puede cambiar en el panel.
 */
export const FINALE = {
  button: "Secreto final",
  title: "Para ti",
  scenes: [
    "Había una vez dos lunas que se buscaban en el cielo.",
    "Una recorrió aldeas, santuarios, bosques y lagos.",
    "Juntó, letra por letra, el nombre de alguien especial.",
    "Y en cada juego dejó escondido un pedacito de cariño.",
    "Hasta que, por fin, todas las luces se encendieron.",
  ],
  closing: [
    "Si llegaste hasta aquí, lo encontraste todo.",
    "Gracias por jugar, por reír y por ser como eres.",
    "Este rincón del mundo siempre será tuyo.",
  ],
} as const;
/** Los nombres con los que se abre un mensaje secreto al guardar un puntaje. */
export const SECRET_NAMES = ["NATHA", "NATHALIA"] as const;

/** Los juegos, en el orden en que salen en la pantalla de juegos. */
export const GAME_NAMES = {
  bloques: "Torre de Luna",
  laberinto: "Laberinto Lunar",
  espiritus: "Lluvia de Espíritus",
  duelo: "Duelo de Lunas",
  tejados: "Carrera por los Tejados",
  muro: "Muro de Faroles",
  dragon: "Dragón de Papel",
  parejas: "Parejas de Espíritus",
  fichas: "Fichas del Templo",
  carreras: "Ruta de los Faroles",
  pinball: "Pinball de las Lunas",
  esferas: "Cadena de Lunas",
  mascotas: "Casa de Patitas",
} as const;

/** Lo que aparece encima del mensaje cuando se gana jugando. */
export const UNLOCKED = "¡Lo lograste! Este mensaje es para ti";

/** Textos de los botones, del marcador y de los avisos. */
export const UI = {
  resume: "Seguir",
  keepPlaying: "Seguir jugando",
  again: "Otra vez",
  back: "Volver",
  exit: "Salir",
  paused: "Pausa",
  gameOver: "Fin de la partida",
  newRecord: "¡Nuevo récord!",
  next: "Sigue",
  score: "Puntos",
  lines: "Líneas",
  level: "Nivel",
  record: "Récord",
  goal: "En Torre de Luna, completa 10 líneas y descubre el mensaje",
  keys: ["← → mover", "↑ girar", "↓ bajar", "Espacio soltar", "P pausa"],
  scores: "Puntajes",
  saveScore: "Guardar puntaje",
  save: "Guardar",
  yourScore: "Tu puntaje",
  yourName: "Tu nombre",
  noScores: "Todavía no hay puntajes. ¡Estrena la tabla!",
  loading: "Cargando",
  localScores: "Sin conexión: esta tabla es solo de este dispositivo",
  saved: "¡Puntaje guardado!",
  secret: "Mensajes secretos",
  games: "Juegos",
  playButton: "Jugar",
  onePlayer: "Contra la máquina",
  twoPlayers: "Dos jugadores",
  duelHow: "¿Cómo quieres jugar?",
  locked: "Sin descubrir",
  found: "descubiertos",
  achievements: "Logros",
  achievementUnlocked: "Logro desbloqueado",
  points: "puntos",
  finaleUnlocked: "¡Secreto final desbloqueado!",
  skip: "Saltar",
  console: "Consola",
  consoleHello: "Consola de Dos Lunas. Escribe un código y pulsa Enter. Escribe AYUDA para ver qué más puedes hacer.",
  consoleHelp: [
    "AYUDA: esta lista",
    "CODIGOS: los que ya usaste",
    "GUARDAR: descarga tu progreso (logros, récords, mascotas)",
    "CARGAR: trae tu progreso desde un archivo",
    "LIMPIAR: borra la pantalla",
    "SALIR: vuelve a la portada",
  ],
  consoleChecking: "Revisando…",
  consoleAccepted: "Código aceptado",
  consoleWrong: "Ese código no existe o ya no está activo.",
  consoleLimit: "Demasiados intentos. Espera un rato y vuelve a probar.",
  consoleOffline: "Sin conexión: no se puede revisar el código ahora.",
  consoleNone: "Todavía no has usado ningún código.",
  consoleInput: "Escribe un código",
  send: "Enviar",
  codeUnlocked: "Código desbloqueado",
  progress: "Mi progreso",
  saveProgress: "Guardar mi progreso",
  loadProgress: "Cargar mi progreso",
  progressSaved: "Listo: se descargó el archivo con tu progreso.",
  progressLoaded: "Listo: tu progreso quedó cargado.",
  progressBad: "Ese archivo no es un progreso de Dos Lunas.",
  lives: "Vidas",
  mazeGoal: "Recoge las luces y junta las letras de su nombre",
  starsGoal: "Cada oleada dibuja una letra de su nombre",
} as const;

/** Todo lo que se dibuja con las letras de píxeles (las pruebas revisan que no falte ningún signo). */
export const ALL_TEXTS: readonly string[] = [
  ...GAME_TITLE,
  HANDLE,
  TRIBUTE,
  DEDICATION,
  LETTER_TITLE,
  ...LETTER,
  SIGNATURE,
  UNLOCKED,
  ...SECRETS.flatMap((secret) => [secret.title, secret.hint.replaceAll("{nombre}", "NATHALIA"), ...secret.text]),
  SECRET_UNLOCKED,
  FINALE.button,
  FINALE.title,
  ...FINALE.scenes,
  ...FINALE.closing,
  ...Object.values(GAME_NAMES),
  ...Object.values(UI).flat(),
];
