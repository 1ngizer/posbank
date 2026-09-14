import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_BASE as string;

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Devuelve el access_token de la sesión actual (o null). */
async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

interface Options {
  method?: string;
  body?: unknown;
  auth?: boolean; // por defecto true
}

/**
 * Llama al posbank-api. Añade Authorization: Bearer <jwt> salvo auth:false.
 * Devuelve `data` desempaquetado (el backend responde { ok, data }).
 */
export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== false) {
    const t = await token();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* respuesta sin cuerpo */
  }

  if (!res.ok || (json && json.ok === false)) {
    const msg = json?.error?.message ?? `Error ${res.status}`;
    throw new ApiError(res.status, msg, json?.error?.code);
  }
  return (json?.data ?? json) as T;
}
