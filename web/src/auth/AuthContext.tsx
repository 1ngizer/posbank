import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

interface Profile {
  userId: string;
  companyId: string;
  role: string;
  email: string;
}

export interface RegisterInput {
  companyName: string;
  name: string;
  email: string;
  password: string;
  nit?: string;
  minimumCashReserve?: number;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  /** Sesión activa pero sin empresa aún (típico al entrar con Google). */
  needsOnboarding: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  completeOnboarding: (companyName: string, minimumCashReserve?: number) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Resuelve el contexto del usuario: ¿es admin de plataforma? si no, su perfil
  // de empresa. Ambos en paralelo (uno de los dos dará 403/404, es normal).
  async function resolveUser() {
    const [adminRes, profRes] = await Promise.allSettled([
      api<{ isAdmin: boolean }>('/admin/me'),
      api<Profile>('/auth/me'),
    ]);
    const admin = adminRes.status === 'fulfilled' && adminRes.value.isAdmin;
    setIsAdmin(admin);
    setProfile(profRes.status === 'fulfilled' ? profRes.value : null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await resolveUser();
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      if (s) {
        setLoading(true);
        await resolveUser();
        setLoading(false);
      } else {
        setProfile(null);
        setIsAdmin(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Sesión válida pero sin empresa ni permisos de admin → hay que crear empresa.
  const needsOnboarding = !!session && !loading && !isAdmin && !profile;

  async function login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Credenciales inválidas');
  }

  /** Redirige a Google; al volver, onAuthStateChange resuelve el usuario. */
  async function loginWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw new Error('No se pudo iniciar sesión con Google');
  }

  /** Crea la empresa del usuario recién llegado por Google. */
  async function completeOnboarding(companyName: string, minimumCashReserve?: number) {
    await api('/auth/onboarding', {
      method: 'POST',
      body: { companyName, minimumCashReserve },
    });
    await resolveUser();
  }

  async function register(input: RegisterInput) {
    // El registro (empresa + perfil) lo hace el backend con service_role.
    const res = await api<{ accessToken: string; refreshToken: string }>(
      '/auth/register',
      { method: 'POST', body: input, auth: false },
    );
    // Hidratamos la sesión de supabase-js con los tokens devueltos.
    const { error } = await supabase.auth.setSession({
      access_token: res.accessToken,
      refresh_token: res.refreshToken,
    });
    if (error) throw new Error('No se pudo iniciar sesión tras el registro');
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  return (
    <Ctx.Provider value={{
      session, profile, isAdmin, loading, needsOnboarding,
      login, loginWithGoogle, register, completeOnboarding, logout,
    }}>
      {children}
    </Ctx.Provider>
  );
}
