import { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '../../shared/http';
import {
  MovementCategory,
  MovementType,
  SourceChannel,
} from '../../shared/types';

export interface CreateMovementInput {
  companyId: string;
  userId?: string | null;
  type: MovementType;
  amount: number;
  currency?: string;
  category?: MovementCategory;
  description?: string | null;
  referenceNumber?: string | null;
  sourceChannel?: SourceChannel;
  date?: string; // YYYY-MM-DD
}

/**
 * Registra un movimiento de efectivo. Recibe el cliente Supabase para funcionar
 * tanto con RLS (endpoints con JWT) como con adminClient (WhatsApp/Alexa/cron).
 */
export async function createMovement(db: SupabaseClient, input: CreateMovementInput) {
  const { data, error } = await db
    .from('cash_movements')
    .insert({
      company_id: input.companyId,
      user_id: input.userId ?? null,
      type: input.type,
      amount: input.amount,
      currency: input.currency ?? 'COP',
      category: input.category ?? 'other',
      description: input.description ?? null,
      reference_number: input.referenceNumber ?? null,
      source_channel: input.sourceChannel ?? 'app',
      date: input.date ?? new Date().toISOString().slice(0, 10),
    })
    .select('*')
    .single();
  if (error) throw ApiError.badRequest(error.message);
  return data;
}

export interface ListMovementsFilter {
  companyId: string;
  from?: string;
  to?: string;
  type?: MovementType;
  category?: MovementCategory;
  limit?: number;
  offset?: number;
}

export async function listMovements(db: SupabaseClient, f: ListMovementsFilter) {
  let q = db
    .from('cash_movements')
    .select('*', { count: 'exact' })
    .eq('company_id', f.companyId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (f.from) q = q.gte('date', f.from);
  if (f.to) q = q.lte('date', f.to);
  if (f.type) q = q.eq('type', f.type);
  if (f.category) q = q.eq('category', f.category);

  const limit = Math.min(f.limit ?? 50, 200);
  const offset = f.offset ?? 0;
  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) throw ApiError.badRequest(error.message);
  return { items: data ?? [], total: count ?? 0, limit, offset };
}
