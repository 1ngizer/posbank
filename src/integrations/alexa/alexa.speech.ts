/**
 * Formato de respuesta del Alexa Skills Kit y lectura de slots.
 * Vive aparte para que el despachador y las acciones lo compartan sin
 * importarse en círculo.
 */

/** Lo que Alexa vuelve a decir si el usuario se queda callado. */
const REPROMPT =
  'Puedes preguntar por tu caja, tu runway, cuánto debes, cuánto te deben, el inventario, las ventas de hoy, o pedirme el informe.';

/** Respuesta mínima del Alexa Skills Kit. */
export function alexaSpeak(text: string, endSession = true) {
  const response: Record<string, unknown> = {
    outputSpeech: { type: 'PlainText', text },
    shouldEndSession: endSession,
  };
  // Sin reprompt, Alexa cierra el micrófono aunque la sesión siga abierta.
  if (!endSession) {
    response.reprompt = { outputSpeech: { type: 'PlainText', text: REPROMPT } };
  }
  return { version: '1.0', response };
}

/**
 * Responde y deja la sesión abierta para encadenar preguntas sin volver a
 * invocar el skill.
 */
export function alexaAsk(text: string) {
  return alexaSpeak(`${text} ¿Algo más?`, false);
}

/**
 * Alexa corta la conexión si no respondemos en 8s (se ve en logs como
 * "request aborted" con responseTime cercano a 11000ms). Sin este límite, una
 * lentitud puntual de Supabase deja al usuario sin ninguna respuesta —
 * "La Skill solicitada no respondió correctamente" — en vez de un mensaje
 * claro. 6s deja margen para el tramo de red entre Amazon y Railway.
 */
const LIMITE_ALEXA_MS = 6000;
const TIMEOUT_ALEXA = 'ALEXA_TIMEOUT';

export async function conLimiteAlexa<T>(promesa: Promise<T>): Promise<T> {
  let temporizador!: ReturnType<typeof setTimeout>;
  const limite = new Promise<never>((_, reject) => {
    temporizador = setTimeout(() => reject(new Error(TIMEOUT_ALEXA)), LIMITE_ALEXA_MS);
  });
  try {
    return await Promise.race([promesa, limite]);
  } finally {
    clearTimeout(temporizador);
  }
}

export function esTimeoutAlexa(err: unknown): boolean {
  return err instanceof Error && err.message === TIMEOUT_ALEXA;
}

/**
 * Le devuelve el turno a Alexa para que recolecte los slots que faltan y pida
 * la confirmación, según el diálogo definido en el modelo de interacción.
 */
export function alexaDelegate() {
  return {
    version: '1.0',
    response: {
      directives: [{ type: 'Dialog.Delegate' }],
      shouldEndSession: false,
    },
  };
}

type Slots = Record<string, { value?: string } | undefined> | undefined;

/** Valor de texto de un slot, o undefined si viene vacío. */
export function slotValue(slots: Slots, name: string): string | undefined {
  const v = slots?.[name]?.value;
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Valor numérico de un slot (AMAZON.NUMBER), o null si no es un número útil. */
export function slotNumber(slots: Slots, name: string): number | null {
  const raw = slotValue(slots, name);
  if (!raw) return null;
  const n = Number(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * Los estados del motor de caja son identificadores en inglés. Al hablarlos hay
 * que decirlos en español y concordando con el sustantivo que acompañan:
 * "tu caja está ajustada", "tu runway está sólido". Las etiquetas de WhatsApp no
 * sirven aquí porque llevan paréntesis, que no se leen bien en voz alta.
 */
const CAJA_HABLADA: Record<string, string> = {
  surplus: 'holgada',
  sufficient: 'suficiente',
  tight: 'ajustada',
  deficit: 'en déficit',
};

const RUNWAY_HABLADO: Record<string, string> = {
  solid: 'sólido',
  stable: 'estable',
  alert: 'en alerta',
  emergency: 'en emergencia',
};

export function cajaHablada(estado: string): string {
  return CAJA_HABLADA[estado] ?? estado;
}

export function runwayHablado(estado: string): string {
  return RUNWAY_HABLADO[estado] ?? estado;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** "2026-08-15" → "15 de agosto", para que Alexa no deletree la fecha. */
export function spokenDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1] ?? ''}`.trim();
}

/** AMAZON.DATE puede devolver "2026-W33" o "2026-08"; solo sirve la completa. */
export function isFullDate(v: string | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
