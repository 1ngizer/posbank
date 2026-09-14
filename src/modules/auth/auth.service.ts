import { adminClient, authClient } from '../../config/supabase';
import { ApiError } from '../../shared/http';
import { logger } from '../../config/logger';
import { LoginInput, RegisterInput } from './auth.schemas';

/**
 * Registro atómico-en-la-práctica: crea el usuario en Supabase Auth, su empresa
 * y su perfil (users). Si algo falla después de crear el auth user, se hace
 * limpieza (best-effort) para no dejar cuentas huérfanas.
 */
export async function registerCompanyAndOwner(input: RegisterInput) {
  // 1) Crear usuario en Supabase Auth (email confirmado para MVP).
  const { data: created, error: authErr } = await adminClient.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
  });
  if (authErr || !created?.user) {
    if (authErr?.status === 422) {
      throw ApiError.conflict('Ya existe una cuenta con ese correo');
    }
    throw ApiError.badRequest(authErr?.message ?? 'No se pudo crear el usuario');
  }
  const authUserId = created.user.id;

  try {
    // 2) Crear la empresa.
    const settings = {
      minimum_cash_reserve: input.minimumCashReserve ?? 0,
      alert_preferences: { whatsapp: true, alexa: true, app: true, email: false },
    };
    const { data: company, error: cErr } = await adminClient
      .from('companies')
      .insert({
        name: input.companyName,
        nit: input.nit ?? null,
        industry: input.industry ?? null,
        size: input.size ?? null,
        owner_id: authUserId,
        settings,
      })
      .select('id')
      .single();
    if (cErr || !company) throw new Error(cErr?.message ?? 'insert company failed');

    // 3) Crear el perfil (users) como owner.
    const { error: uErr } = await adminClient.from('users').insert({
      id: authUserId,
      company_id: company.id,
      email: input.email,
      name: input.name,
      role: 'owner',
      phone_whatsapp: input.phoneWhatsapp ?? null,
    });
    if (uErr) throw new Error(uErr.message);

    // 4) Iniciar sesión para devolver tokens.
    const session = await signIn({ email: input.email, password: input.password });
    return { companyId: company.id, ...session };
  } catch (err) {
    // Rollback best-effort del auth user.
    await adminClient.auth.admin.deleteUser(authUserId).catch((e) => {
      logger.error({ e }, 'Fallo al limpiar auth user tras registro fallido');
    });
    throw ApiError.badRequest(
      err instanceof Error ? err.message : 'No se pudo completar el registro',
    );
  }
}

/**
 * Completa el perfil de un usuario YA autenticado que aún no tiene empresa.
 * Es el caso de quien entra con Google: Supabase crea el auth user, pero no
 * sabe a qué empresa pertenece. Idempotente: si ya tiene perfil, lo devuelve.
 */
export async function completeOnboarding(input: {
  authUserId: string;
  email: string;
  companyName: string;
  name?: string;
  nit?: string;
  minimumCashReserve?: number;
}) {
  // ¿Ya tiene perfil? → no duplicar.
  const { data: existing } = await adminClient
    .from('users')
    .select('id, company_id, role, email')
    .eq('id', input.authUserId)
    .maybeSingle();
  if (existing) {
    return {
      userId: existing.id,
      companyId: existing.company_id,
      role: existing.role,
      email: existing.email,
      created: false,
    };
  }

  const { data: company, error: cErr } = await adminClient
    .from('companies')
    .insert({
      name: input.companyName,
      nit: input.nit ?? null,
      owner_id: input.authUserId,
      settings: {
        minimum_cash_reserve: input.minimumCashReserve ?? 0,
        alert_preferences: { whatsapp: true, alexa: true, app: true, email: false },
      },
    })
    .select('id')
    .single();
  if (cErr || !company) {
    throw ApiError.badRequest(cErr?.message ?? 'No se pudo crear la empresa');
  }

  const { error: uErr } = await adminClient.from('users').insert({
    id: input.authUserId,
    company_id: company.id,
    email: input.email,
    name: input.name ?? null,
    role: 'owner',
  });
  if (uErr) {
    // Limpieza: la empresa quedaría huérfana.
    await adminClient.from('companies').delete().eq('id', company.id);
    throw ApiError.badRequest(uErr.message);
  }

  return {
    userId: input.authUserId,
    companyId: company.id,
    role: 'owner',
    email: input.email,
    created: true,
  };
}

export async function signIn(input: LoginInput) {
  const { data, error } = await authClient.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error || !data.session) {
    throw ApiError.unauthorized('Credenciales inválidas');
  }
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
    user: {
      id: data.user?.id,
      email: data.user?.email,
    },
  };
}
