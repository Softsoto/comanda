/**
 * Aviso de tratamiento de datos que ve el cliente antes de enviar un pedido.
 *
 * El texto de abajo es una PLANTILLA general, pensada para un negocio pequeño
 * que solo pide nombre, teléfono y dirección. No reemplaza la revisión de un
 * abogado: cada país tiene sus propias reglas. El dueño del servicio puede
 * cambiarlo por el suyo en la administración (Ajustes).
 *
 * Formato: párrafos separados por una línea en blanco; una línea que empieza
 * con "#" es un título; dentro de un párrafo, cada salto de línea se respeta.
 * Se pueden usar estas palabras entre llaves, que se reemplazan solas en cada
 * menú:
 *   {negocio}   nombre del negocio
 *   {contacto}  cómo escribirle al negocio (su WhatsApp, si lo tiene)
 *   {servicio}  nombre de la plataforma
 */
export const DEFAULT_PRIVACY_TEXT = `# Quién responde por tus datos
{negocio} es el responsable de los datos que escribes al hacer un pedido. {contacto}

# Qué datos se recogen
Tu nombre, tu teléfono, la dirección de entrega o el número de mesa, la forma de pago que eliges y las notas que escribas en el pedido. No se piden datos de tarjetas ni documentos de identidad.

# Para qué se usan
Para preparar y entregar tu pedido, para comunicarse contigo sobre ese pedido y para llevar las cuentas del negocio (ventas, inventario y reportes). No se venden ni se entregan a otros para hacerte publicidad.

# Dónde se guardan
Los pedidos se guardan en {servicio}, la plataforma que {negocio} usa para recibirlos y que actúa por encargo del negocio. Además, el mensaje de tu pedido se envía por WhatsApp, que tiene sus propias condiciones.

# Cuánto tiempo se conservan
El tiempo necesario para atender tu pedido y para las cuentas y obligaciones del negocio. Puedes pedir que se borren antes.

# Tus derechos
Puedes conocer, actualizar y corregir tus datos, pedir que se borren y retirar tu autorización en cualquier momento. Si crees que tu solicitud no se atendió, puedes acudir a la autoridad de protección de datos de tu país (en Colombia, la Superintendencia de Industria y Comercio).

# Cómo ejercerlos
Escríbele a {negocio} indicando tu nombre y el teléfono con el que hiciste el pedido. {contacto}

# Tu autorización
Al enviar tu pedido autorizas a {negocio} a usar estos datos para lo que se explica aquí.`;

export const PRIVACY_TEXT_MAX = 12_000;

/** Un título o un párrafo. El párrafo puede traer varias líneas, separadas por "\n". */
export type PrivacyBlock = { kind: "title" | "text"; text: string };

/** Convierte el texto del aviso en títulos y párrafos, con los datos del negocio ya puestos. */
export function renderPrivacy(
  template: string,
  values: { business: string; contact: string; service: string },
): PrivacyBlock[] {
  const text = (template.trim() || DEFAULT_PRIVACY_TEXT)
    .replace(/\r\n?/g, "\n")
    .replaceAll("{negocio}", values.business)
    .replaceAll("{contacto}", values.contact)
    .replaceAll("{servicio}", values.service);

  const blocks: PrivacyBlock[] = [];
  for (const chunk of text.split(/\n{2,}/)) {
    let paragraph: string[] = [];
    const flush = () => {
      // Cada línea se conserva: una lista escrita con guiones se ve como se escribió.
      const lines = paragraph.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
      if (lines.length > 0) blocks.push({ kind: "text", text: lines.join("\n") });
      paragraph = [];
    };
    for (const line of chunk.split("\n")) {
      if (line.trimStart().startsWith("#")) {
        flush();
        const title = line.replace(/^\s*#+\s*/, "").trim();
        if (title) blocks.push({ kind: "title", text: title });
      } else {
        paragraph.push(line);
      }
    }
    flush();
  }
  return blocks;
}
