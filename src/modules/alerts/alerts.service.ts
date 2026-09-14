import { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from '../../config/supabase';
import { CashAnalysis, GeneratedAlert } from '../../shared/types';
import { runCashEngine } from '../analysis/cash-engine';
import { generateAlerts } from './alert-engine';
import { logger } from '../../config/logger';

const DEDUPE_WINDOW_HOURS = 24;

/**
 * Persiste las alertas nuevas evitando repetir la misma (dedupe_key) dentro de
 * las últimas 24h. Devuelve solo las alertas realmente insertadas.
 */
export async function persistNewAlerts(
  db: SupabaseClient,
  companyId: string,
  generated: GeneratedAlert[],
): Promise<Array<GeneratedAlert & { id: string }>> {
  if (generated.length === 0) return [];

  const since = new Date(
    Date.now() - DEDUPE_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: recent } = await db
    .from('alerts')
    .select('dedupe_key')
    .eq('company_id', companyId)
    .gte('created_at', since);
  const recentKeys = new Set((recent ?? []).map((r) => r.dedupe_key));

  const toInsert = generated.filter((g) => !recentKeys.has(g.dedupeKey));
  if (toInsert.length === 0) return [];

  const rows = toInsert.map((g) => ({
    company_id: g.companyId,
    severity: g.severity,
    category: g.category,
    title: g.title,
    message: g.message,
    suggested_action: g.suggestedAction,
    channel_sent: g.channelSent,
    status: 'sent' as const,
    dedupe_key: g.dedupeKey,
  }));

  const { data, error } = await db.from('alerts').insert(rows).select('id');
  if (error) {
    logger.error({ error }, 'Error al persistir alertas');
    return [];
  }
  return toInsert.map((g, idx) => ({ ...g, id: data![idx].id }));
}

export interface AlertRun {
  analysis: CashAnalysis;
  newAlerts: Array<GeneratedAlert & { id: string }>;
}

/**
 * Corre el CashEngine, genera alertas y persiste las nuevas. Es el punto de
 * entrada que usan los cron jobs y los webhooks tras registrar un movimiento.
 */
export async function processCompanyAlerts(
  companyId: string,
  db: SupabaseClient = adminClient,
): Promise<AlertRun> {
  const analysis = await runCashEngine(companyId, db);
  const generated = generateAlerts(analysis);
  const newAlerts = await persistNewAlerts(db, companyId, generated);
  return { analysis, newAlerts };
}
