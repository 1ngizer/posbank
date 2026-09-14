import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * PosBank usa DOS clientes de Supabase:
 *
 *  1. adminClient (service_role) — bypasea Row Level Security. Uso EXCLUSIVO
 *     del backend: cron jobs, webhooks de WhatsApp/Alexa (que no traen JWT de
 *     usuario), y tareas administrativas. Nunca exponer esta key al cliente.
 *
 *  2. userClient(jwt) — cliente por-request que usa el JWT del usuario, de modo
 *     que TODAS las queries respetan RLS: cada empresa solo ve sus datos.
 *     Es la ruta por defecto para endpoints autenticados.
 */

export const adminClient: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);

/** Crea un cliente Supabase que actúa en nombre del usuario (respeta RLS). */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Cliente anónimo sin sesión persistida. Se usa solo para operaciones de auth
 * (signInWithPassword) donde necesitamos obtener tokens sin estado compartido.
 */
export const authClient: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
