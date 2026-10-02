-- ════════════════════════════════════════════════════════════════════
-- PosBank · Integración Contable (Alegra, Siigo, World Office)
-- Conexiones seguras y cola de sincronización con RLS multi-tenant
-- ════════════════════════════════════════════════════════════════════

-- 1. accounting_connections
create table if not exists public.accounting_connections (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  provider              text not null check (provider in ('alegra', 'siigo', 'worldoffice')),
  -- Credenciales cifradas con AES-256-GCM. NUNCA en texto plano.
  encrypted_credentials text not null,
  status                text not null default 'connected' check (status in ('connected', 'disconnected', 'error')),
  last_sync_at          timestamptz,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (company_id, provider)
);

create index if not exists accounting_conn_company_idx
  on public.accounting_connections(company_id, provider);

create trigger accounting_conn_set_updated_at before update on public.accounting_connections
  for each row execute function public.set_updated_at();

alter table public.accounting_connections enable row level security;
drop policy if exists tenant_isolation on public.accounting_connections;
create policy tenant_isolation on public.accounting_connections
  for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- 2. accounting_sync_log (idempotencia, cola y auditoría de sincronizaciones)
create table if not exists public.accounting_sync_log (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  provider        text not null,
  entity          text not null check (entity in ('invoice', 'receivable', 'payable', 'cash_movement')),
  local_id        uuid not null,
  external_id     text,
  status          text not null default 'pending' check (status in ('pending', 'synced', 'failed')),
  error           text,
  attempts        int not null default 0,
  last_attempt_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists accounting_sync_company_entity_idx
  on public.accounting_sync_log(company_id, entity, local_id);

create index if not exists accounting_sync_retry_idx
  on public.accounting_sync_log(company_id, status, attempts);

create trigger accounting_sync_set_updated_at before update on public.accounting_sync_log
  for each row execute function public.set_updated_at();

alter table public.accounting_sync_log enable row level security;
drop policy if exists tenant_isolation on public.accounting_sync_log;
create policy tenant_isolation on public.accounting_sync_log
  for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
