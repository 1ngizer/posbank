import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { MovementCategory } from '../../shared/types';
import { ParsedIntent } from './parser';

/**
 * Respaldo con Claude para mensajes que el parser por regex (parser.ts) no
 * reconoce. El regex es rápido y gratis y cubre la mayoría de los mensajes
 * reales; esto solo se llama cuando ya falló, para entender lenguaje libre,
 * typos y jerga colombiana ("tmb", "xq", "vendi como 300 lucas") que un regex
 * no puede cubrir sin volverse ilegible.
 */

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null; // sin llave, simplemente no hay respaldo — no rompe el chat.
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

const INTENT_SCHEMA = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: [
        'register_movement',
        'query_cash',
        'query_receivables',
        'query_payables',
        'query_runway',
        'help',
        'unknown',
      ],
    },
    type: { anyOf: [{ type: 'string', enum: ['income', 'expense'] }, { type: 'null' }] },
    amount: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    category: {
      anyOf: [
        {
          type: 'string',
          enum: ['sales', 'payroll', 'suppliers', 'taxes', 'rent', 'utilities', 'other'],
        },
        { type: 'null' },
      ],
    },
  },
  required: ['kind', 'type', 'amount', 'category'],
  additionalProperties: false,
} as const;

const SYSTEM = `Eres el intérprete de mensajes de WhatsApp de PosBank, para dueños de
pymes colombianas. Ya se intentó reconocer el mensaje con reglas simples y
falló; ahora tienes que interpretarlo en lenguaje libre, con typos, jerga
("lucas" = mil pesos, "palos" = millones) y abreviaturas de chat.

Clasifica el mensaje en uno de estos "kind":
- register_movement: el usuario dice que vendió, cobró, pagó o gastó dinero.
  Devuelve también type (income si vendió/cobró, expense si pagó/gastó),
  amount (número en pesos colombianos, sin símbolos) y category.
- query_cash: pregunta cómo está su caja o efectivo.
- query_receivables: pregunta cuánto le deben o por su cartera.
- query_payables: pregunta cuánto debe él.
- query_runway: pregunta cuánto le dura la plata o su runway.
- help: pide ayuda o no sabe qué puede hacer.
- unknown: no encaja en nada de lo anterior, o no tiene suficiente información
  (por ejemplo dice que vendió pero no dice cuánto).

Si kind no es register_movement, deja type/amount/category en null.
Nunca inventes un monto que no esté en el mensaje.`;

/** Traduce la respuesta de Claude (ya validada contra el schema) a ParsedIntent. */
export function mapClaudeResponseToIntent(raw: unknown, originalText: string): ParsedIntent {
  const r = raw as {
    kind: ParsedIntent['kind'];
    type?: 'income' | 'expense' | null;
    amount?: number | null;
    category?: string | null;
  };

  if (r.kind === 'register_movement' && r.type && r.amount && r.amount > 0) {
    return {
      kind: 'register_movement',
      type: r.type,
      amount: Math.round(r.amount),
      category: (r.category as MovementCategory | null) ?? (r.type === 'income' ? 'sales' : 'other'),
      description: originalText.trim().slice(0, 200),
    };
  }
  if (
    r.kind === 'query_cash' ||
    r.kind === 'query_receivables' ||
    r.kind === 'query_payables' ||
    r.kind === 'query_runway' ||
    r.kind === 'help'
  ) {
    return { kind: r.kind };
  }
  return { kind: 'unknown' };
}

/**
 * Intenta interpretar un mensaje que el parser por regex no reconoció.
 * Devuelve 'unknown' (nunca lanza) si no hay llave configurada, la llamada
 * falla, o Claude tampoco logra interpretarlo — el chat sigue funcionando
 * igual que antes de tener este respaldo.
 */
export async function interpretWithClaude(text: string): Promise<ParsedIntent> {
  const anthropic = getClient();
  if (!anthropic) return { kind: 'unknown' };

  try {
    const message = await anthropic.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 500,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: INTENT_SCHEMA },
      },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: text }],
    } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);

    if (message.stop_reason === 'refusal') return { kind: 'unknown' };

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return { kind: 'unknown' };

    const parsed = JSON.parse(textBlock.text);
    return mapClaudeResponseToIntent(parsed, text);
  } catch (err) {
    logger.error({ err }, 'Fallo el respaldo de Claude interpretando mensaje de WhatsApp');
    return { kind: 'unknown' };
  }
}
