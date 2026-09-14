-- ═══════════════════════════════════════════════════════════════════
-- Vinculación de Alexa por código
--
-- El usuario genera un código de 6 dígitos en la app y se lo dicta al skill.
-- El skill lo canjea y guarda su alexa_user_id. Reemplaza la vinculación
-- manual por script, sin necesidad del OAuth completo de Account Linking.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.alexa_link_codes (
  code       text primary key,
  user_id    uuid not null references public.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists alexa_link_codes_user_idx on public.alexa_link_codes(user_id);
create index if not exists alexa_link_codes_expires_idx on public.alexa_link_codes(expires_at);

-- Mismo aislamiento por empresa que el resto de las tablas.
alter table public.alexa_link_codes enable row level security;
drop policy if exists tenant_isolation on public.alexa_link_codes;
create policy tenant_isolation on public.alexa_link_codes
  for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- Un dispositivo Alexa no puede pertenecer a dos usuarios a la vez. El índice
-- es parcial para que los usuarios sin Alexa (null) no choquen entre sí.
create unique index if not exists users_alexa_user_id_key
  on public.users(alexa_user_id)
  where alexa_user_id is not null;
