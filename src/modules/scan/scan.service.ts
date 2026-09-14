import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { ApiError } from '../../shared/http';

/**
 * Lectura de facturas por foto.
 *
 * El empresario toma una foto de la factura que le llega al negocio (la luz, el
 * proveedor, el arriendo) y Claude extrae los datos estructurados para
 * pre-llenar el formulario. NO crea el registro: devuelve los campos para que
 * el usuario los confirme — un dato mal leído no debe entrar solo a la caja.
 */

/** Cliente perezoso: si no hay llave, el resto de la app sigue funcionando. */
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new ApiError(
      503,
      'La lectura de facturas no está configurada (falta ANTHROPIC_API_KEY)',
      'scan_unavailable',
    );
  }
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

export type ScanKind = 'payable' | 'receivable';

export interface ScannedInvoice {
  documentType: 'invoice' | 'receipt' | 'utility_bill' | 'other';
  counterpartyName: string | null; // proveedor (por pagar) o cliente (por cobrar)
  counterpartyTaxId: string | null; // NIT / cédula
  invoiceNumber: string | null;
  issueDate: string | null; // YYYY-MM-DD
  dueDate: string | null; // YYYY-MM-DD
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  category:
    | 'utilities' | 'suppliers' | 'rent' | 'taxes' | 'payroll' | 'sales' | 'other'
    | null;
  description: string | null;
  earlyPaymentDiscountPct: number | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string | null; // qué no pudo leer, o advertencias
}

/** Campo que puede venir vacío si no está en la imagen. */
const nullable = (schema: Record<string, unknown>) => ({
  anyOf: [schema, { type: 'null' }],
});

const INVOICE_SCHEMA = {
  type: 'object',
  properties: {
    documentType: { type: 'string', enum: ['invoice', 'receipt', 'utility_bill', 'other'] },
    counterpartyName: nullable({ type: 'string' }),
    counterpartyTaxId: nullable({ type: 'string' }),
    invoiceNumber: nullable({ type: 'string' }),
    issueDate: nullable({ type: 'string', format: 'date' }),
    dueDate: nullable({ type: 'string', format: 'date' }),
    currency: nullable({ type: 'string' }),
    subtotal: nullable({ type: 'number' }),
    tax: nullable({ type: 'number' }),
    total: nullable({ type: 'number' }),
    category: nullable({
      type: 'string',
      enum: ['utilities', 'suppliers', 'rent', 'taxes', 'payroll', 'sales', 'other'],
    }),
    description: nullable({ type: 'string' }),
    earlyPaymentDiscountPct: nullable({ type: 'number' }),
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    notes: nullable({ type: 'string' }),
  },
  required: [
    'documentType', 'counterpartyName', 'counterpartyTaxId', 'invoiceNumber',
    'issueDate', 'dueDate', 'currency', 'subtotal', 'tax', 'total',
    'category', 'description', 'earlyPaymentDiscountPct', 'confidence', 'notes',
  ],
  additionalProperties: false,
} as const;

const SYSTEM = `Eres el lector de facturas de PosBank, para pymes colombianas.

Extraes los datos de una foto de factura para pre-llenar un formulario. Reglas:

- Montos: devuelve números sin separadores ni símbolo. En Colombia el punto suele
  ser separador de miles y la coma decimal: "1.234.567,89" son 1234567.89.
  Si un monto no tiene decimales, no los inventes.
- Fechas en formato YYYY-MM-DD. Si el año viene en dos dígitos, asume 20XX.
  Si una fecha no aparece, déjala en null — no la calcules ni la supongas.
- "total" es el valor final a pagar (después de impuestos). Si la factura muestra
  subtotal e IVA por separado, devuelve los tres.
- category: utilities para servicios públicos (luz, agua, gas, internet, teléfono),
  rent para arriendos, taxes para impuestos, payroll para nómina,
  suppliers para mercancía o insumos, sales cuando es una venta tuya, other si no encaja.
- counterpartyName es quien emite la factura (el proveedor o la empresa de servicios).
- Si un campo no está visible o no lo puedes leer con seguridad, devuélvelo null.
  Es mejor un campo vacío que un dato inventado — el usuario lo va a confirmar.
- confidence: "high" si la imagen es legible y leíste los montos claramente;
  "medium" si tuviste que interpretar; "low" si la foto está borrosa, cortada o
  no parece una factura.
- notes: en español, una frase breve con lo que no pudiste leer o cualquier
  advertencia útil. null si todo salió bien.`;

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type ScanMediaType = (typeof MEDIA_TYPES)[number];

export function isSupportedMediaType(v: string): v is ScanMediaType {
  return (MEDIA_TYPES as readonly string[]).includes(v);
}

/**
 * Detecta el tipo MIME real inspeccionando los magic bytes del archivo en base64.
 * Evita inyección de ejecutables, scripts o archivos no soportados hacia la IA.
 */
export function detectMediaTypeFromMagicBytes(base64: string): ScanMediaType | null {
  try {
    const cleanBase64 = base64.replace(/\s/g, '');
    const header = Buffer.from(cleanBase64.slice(0, 64), 'base64');
    if (header.length < 4) return null;

    // JPEG: FF D8 FF
    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
      return 'image/jpeg';
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      header.length >= 8 &&
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47 &&
      header[4] === 0x0d &&
      header[5] === 0x0a &&
      header[6] === 0x1a &&
      header[7] === 0x0a
    ) {
      return 'image/png';
    }
    // GIF: 47 49 46 38
    if (
      header[0] === 0x47 &&
      header[1] === 0x49 &&
      header[2] === 0x46 &&
      header[3] === 0x38
    ) {
      return 'image/gif';
    }
    // WebP: RIFF ... WEBP
    if (
      header.length >= 12 &&
      header[0] === 0x52 &&
      header[1] === 0x49 &&
      header[2] === 0x46 &&
      header[3] === 0x46 &&
      header[8] === 0x57 &&
      header[9] === 0x45 &&
      header[10] === 0x42 &&
      header[11] === 0x50
    ) {
      return 'image/webp';
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Lee una factura desde una imagen en base64 y devuelve los campos extraídos.
 * `kind` solo orienta al modelo sobre qué se espera (cuenta por pagar vs cobrar).
 */
export async function scanInvoiceImage(
  imageBase64: string,
  mediaType: ScanMediaType,
  kind: ScanKind = 'payable',
): Promise<ScannedInvoice> {
  const anthropic = getClient();

  const contexto =
    kind === 'payable'
      ? 'Es una factura que le LLEGÓ al negocio y que debe pagar (cuenta por pagar).'
      : 'Es una factura que el negocio EMITIÓ y va a cobrar (cuenta por cobrar).';

  let message;
  try {
    message = await anthropic.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 8000,
      // La extracción es una tarea acotada: effort medio da buena calidad
      // sin gastar de más (en Opus 5 los niveles bajos rinden muy bien).
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: INVOICE_SCHEMA },
      },
      // Si los clasificadores rechazan la petición, se reintenta solo en otro modelo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: `${contexto} Extrae los datos de esta factura.` },
          ],
        },
      ],
    } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
  } catch (err) {
    logger.error({ err }, 'Fallo llamando a Claude para leer la factura');
    throw new ApiError(502, 'No se pudo procesar la imagen en este momento', 'scan_failed');
  }

  // Un rechazo llega como respuesta exitosa: hay que revisarlo antes del contenido.
  if (message.stop_reason === 'refusal') {
    throw ApiError.badRequest('No se pudo procesar esta imagen. Intenta con otra foto.');
  }

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new ApiError(502, 'Respuesta vacía al leer la factura', 'scan_failed');
  }

  try {
    return JSON.parse(textBlock.text) as ScannedInvoice;
  } catch {
    logger.error({ raw: textBlock.text.slice(0, 300) }, 'JSON inválido al leer la factura');
    throw new ApiError(502, 'No se pudieron leer los datos de la factura', 'scan_failed');
  }
}
