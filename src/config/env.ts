import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Esquema de variables de entorno. Falla rápido (fail-fast) al arrancar si
 * falta algo crítico, así evitamos errores oscuros en runtime.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_BASE_PATH: z.string().default('/api/v1'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),

  WHATSAPP_PROVIDER: z.enum(['meta', 'twilio']).default('meta'),
  WHATSAPP_VERIFY_TOKEN: z.string().default('posbank-verify-token'),
  WHATSAPP_APP_SECRET: z.string().optional(), // Necesario para verificar la firma del Webhook
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  
  CORS_ORIGINS: z.string().optional(), // Dominios permitidos separados por coma
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),

  ALEXA_SKILL_ID: z.string().optional(),
  MAKE_WEBHOOK_SECRET: z.string().optional(),

  // Correos con acceso al panel de administrador de la plataforma (Ingizer).
  // Separados por coma. Solo estos usuarios pueden ver a TODOS los clientes.
  PLATFORM_ADMIN_EMAILS: z.string().default(''),

  // Claude (Anthropic) — lectura de facturas por foto. Sin esta llave, el
  // endpoint de escaneo responde 503 en vez de romper el arranque.
  ANTHROPIC_API_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    '❌ Variables de entorno inválidas:\n',
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
