import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * Cliente Supabase del navegador. Maneja la sesión (login, refresh de token) y
 * las suscripciones Realtime. La anon key es pública y respeta RLS: cada empresa
 * solo ve sus datos.
 */
export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Necesario para OAuth (Google): al volver del redirect, la sesión llega
    // en la URL y supabase-js debe leerla.
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
