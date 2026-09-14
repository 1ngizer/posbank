import { MovementCategory, MovementType } from '../../shared/types';

/**
 * NLP ligero (regex + heurística) para interpretar mensajes de WhatsApp en
 * español coloquial colombiano. Lógica pura → testeable.
 *
 * Ejemplos:
 *   "Vendi 500 mil en efectivo"   → registrar ingreso 500.000 (sales)
 *   "Pague 120 mil de luz"        → registrar egreso 120.000 (utilities)
 *   "Como esta mi caja?"          → consulta de caja
 *   "Cuanto me deben?"            → consulta de cartera
 *   "Cual es mi runway?"          → consulta de runway
 */

export type ParsedIntent =
  | {
      kind: 'register_movement';
      type: MovementType;
      amount: number;
      category: MovementCategory;
      description: string;
    }
  | { kind: 'query_cash' }
  | { kind: 'query_receivables' }
  | { kind: 'query_payables' }
  | { kind: 'query_runway' }
  | { kind: 'help' }
  | { kind: 'unknown' };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, ''); // quita tildes
}

/**
 * Interpreta montos en español: "500 mil", "1.2 millones", "medio millon",
 * "un millon", "300000", "$450.000".
 */
export function parseSpanishAmount(raw: string): number | null {
  const text = normalize(raw);

  // "medio millon"
  if (/\bmedio\s+mill?on/.test(text)) return 500_000;

  // number + unidad. IMPORTANTE: "mil"/"miles" van ANTES que "m" para que la
  // "m" de millón no capture la "m" de "mil".
  const m = text.match(
    /(\d+(?:[.,]\d+)?)\s*(millones|millon|mill|mm|miles|mil|k|m)?\b/,
  );
  if (m) {
    let value = parseFloat(m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    const unit = m[2];
    if (unit === 'mil' || unit === 'miles') value *= 1_000;
    else if (/^(millones|millon|mill|mm|m)$/.test(unit ?? '')) value *= 1_000_000;
    else if (unit === 'k') value *= 1_000;
    if (!Number.isNaN(value) && value > 0) return Math.round(value);
  }

  // "un millon" / "una"
  if (/\bun(a)?\s+mill?on/.test(text)) return 1_000_000;

  return null;
}

const INCOME_WORDS = /\b(vend[ií]|ingres[oe]|cobr[eé]|recib[ií]|entr[oó]|venta)\b/;
const EXPENSE_WORDS = /\b(pagu?[eé]|gast[eé]|compr[eé]|sal[ií]|egreso|pago)\b/;

const CATEGORY_RULES: Array<[RegExp, MovementCategory]> = [
  [/\b(luz|energia|agua|servicios?|internet|telefono)\b/, 'utilities'],
  [/\b(arriendo|renta|alquiler|local)\b/, 'rent'],
  [/\b(nomina|sueldo|salario|empleado|pago de nomina)\b/, 'payroll'],
  [/\b(proveedor|mercancia|insumo|materia prima|compra)\b/, 'suppliers'],
  [/\b(impuesto|iva|dian|retencion|tributo)\b/, 'taxes'],
  [/\b(venta|vend|cliente)\b/, 'sales'],
];

function detectCategory(text: string, type: MovementType): MovementCategory {
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(text)) return cat;
  }
  return type === 'income' ? 'sales' : 'other';
}

export function parseMessage(raw: string): ParsedIntent {
  const text = normalize(raw);

  // Consultas
  if (/\b(runway|cuanto\s+(me\s+)?(dura|aguanta|queda))\b/.test(text)) {
    return { kind: 'query_runway' };
  }
  if (/\b(me\s+deben|cartera|por\s+cobrar|cuentas?\s+por\s+cobrar)\b/.test(text)) {
    return { kind: 'query_receivables' };
  }
  if (/\b(debo|por\s+pagar|cuentas?\s+por\s+pagar|le\s+debo)\b/.test(text)) {
    return { kind: 'query_payables' };
  }
  if (/\b(mi\s+caja|como\s+(esta|va)\s+(mi\s+)?(caja|efectivo|plata)|saldo|posicion)\b/.test(text)) {
    return { kind: 'query_cash' };
  }
  if (/\b(ayuda|help|que\s+puedo\s+hacer|comandos)\b/.test(text)) {
    return { kind: 'help' };
  }

  // Registro de movimiento
  const amount = parseSpanishAmount(text);
  if (amount) {
    const isIncome = INCOME_WORDS.test(text);
    const isExpense = EXPENSE_WORDS.test(text);
    if (isIncome || isExpense) {
      const type: MovementType = isExpense && !isIncome ? 'expense' : 'income';
      return {
        kind: 'register_movement',
        type,
        amount,
        category: detectCategory(text, type),
        description: raw.trim().slice(0, 200),
      };
    }
  }

  return { kind: 'unknown' };
}
