-- ════════════════════════════════════════════════════════════════════
-- PosBank · Migración inicial (Fase 1 + estructura Fase 2-3)
-- Multi-tenant con Row Level Security. Moneda por defecto COP.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto; -- gen_random_uuid()

-- Permite crear current_company_id() (que referencia public.users) ANTES de que
-- exista la tabla: difiere la validación del cuerpo de las funciones SQL.
set check_function_bodies = off;

-- ─── Helpers ─────────────────────────────────────────────────────────

-- Devuelve el company_id del usuario autenticado. SECURITY DEFINER para que
-- las políticas RLS puedan consultar users sin recursión de políticas.
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.users where id = auth.uid();
$$;

-- Trigger genérico para mantener updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── ENUM types ──────────────────────────────────────────────────────
do $$ begin
  create type movement_type as enum ('income','expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type movement_category as enum
    ('sales','payroll','suppliers','taxes','rent','utilities','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type source_channel as enum
    ('app','whatsapp','alexa','api','bank_import');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('owner','manager','accountant','cashier');
exception when duplicate_object then null; end $$;

do $$ begin
  create type receivable_status as enum ('pending','overdue','partial','paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payable_status as enum ('pending','overdue','paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type commitment_frequency as enum
    ('weekly','biweekly','monthly','quarterly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type alert_severity as enum ('critical','warning','info','opportunity');
exception when duplicate_object then null; end $$;

do $$ begin
  create type alert_category as enum
    ('cash_position','sales','costs','collection','payment','runway','budget');
exception when duplicate_object then null; end $$;

do $$ begin
  create type alert_channel as enum ('whatsapp','alexa','app','email');
exception when duplicate_object then null; end $$;

do $$ begin
  create type alert_status as enum ('sent','read','acted_on','dismissed');
exception when duplicate_object then null; end $$;

-- ════════════════════════════════════════════════════════════════════
-- 1. companies
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  nit         text,
  industry    text,
  size        int,                       -- número de empleados
  owner_id    uuid references auth.users(id) on delete set null,
  settings    jsonb not null default '{
    "minimum_cash_reserve": 0,
    "alert_preferences": {"whatsapp": true, "alexa": true, "app": true, "email": false}
  }'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger companies_set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- 2. users  (id = auth.users.id)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.users (
  id                       uuid primary key references auth.users(id) on delete cascade,
  company_id               uuid not null references public.companies(id) on delete cascade,
  email                    text not null,
  name                     text,
  role                     user_role not null default 'owner',
  phone_whatsapp           text,
  alexa_user_id            text,
  notification_preferences jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now()
);
create index if not exists users_company_idx on public.users(company_id);
create index if not exists users_phone_idx on public.users(phone_whatsapp);
create index if not exists users_alexa_idx on public.users(alexa_user_id);

-- ════════════════════════════════════════════════════════════════════
-- 3. cash_movements  (core)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.cash_movements (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  user_id          uuid references public.users(id) on delete set null,
  type             movement_type not null,
  amount           numeric(16,2) not null check (amount >= 0),
  currency         char(3) not null default 'COP',
  category         movement_category not null default 'other',
  description      text,
  reference_number text,
  source_channel   source_channel not null default 'app',
  date             date not null default current_date,
  created_at       timestamptz not null default now()
);
create index if not exists movements_company_date_idx
  on public.cash_movements(company_id, date desc);
create index if not exists movements_company_type_idx
  on public.cash_movements(company_id, type);
create index if not exists movements_company_category_idx
  on public.cash_movements(company_id, category);

-- ════════════════════════════════════════════════════════════════════
-- 4. bank_accounts
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.bank_accounts (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  bank_name             text not null,
  account_number_last4  char(4),
  current_balance       numeric(16,2) not null default 0,
  last_synced_at        timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists bank_accounts_company_idx on public.bank_accounts(company_id);

-- ════════════════════════════════════════════════════════════════════
-- 5. budgets
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.budgets (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  month          int not null check (month between 1 and 12),
  year           int not null check (year between 2000 and 2100),
  revenue_budget numeric(16,2) not null default 0,
  cost_budget    numeric(16,2) not null default 0,
  expense_budget numeric(16,2) not null default 0,
  sales_target   numeric(16,2) not null default 0,
  created_at     timestamptz not null default now(),
  unique (company_id, year, month)
);
create index if not exists budgets_company_period_idx
  on public.budgets(company_id, year, month);

-- ════════════════════════════════════════════════════════════════════
-- 6. receivables  (cuentas por cobrar)
--    days_overdue se recalcula por el job diario "verificar cartera vencida".
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.receivables (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  client_name  text not null,
  client_id    text,
  amount       numeric(16,2) not null check (amount >= 0),
  due_date     date not null,
  issued_date  date not null default current_date,
  status       receivable_status not null default 'pending',
  days_overdue int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists receivables_company_status_idx
  on public.receivables(company_id, status);
create index if not exists receivables_company_due_idx
  on public.receivables(company_id, due_date);

-- ════════════════════════════════════════════════════════════════════
-- 7. payables  (cuentas por pagar)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.payables (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references public.companies(id) on delete cascade,
  supplier_name            text not null,
  supplier_id              text,
  amount                   numeric(16,2) not null check (amount >= 0),
  due_date                 date not null,
  status                   payable_status not null default 'pending',
  early_payment_discount_pct numeric(5,2) not null default 0,
  created_at               timestamptz not null default now()
);
create index if not exists payables_company_status_idx
  on public.payables(company_id, status);
create index if not exists payables_company_due_idx
  on public.payables(company_id, due_date);

-- ════════════════════════════════════════════════════════════════════
-- 8. collection_policies  (política de cobro)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.collection_policies (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references public.companies(id) on delete cascade,
  max_days               int not null default 30,
  grace_period_days      int not null default 0,
  auto_reminder_enabled  boolean not null default false,
  reminder_frequency_days int not null default 7,
  escalation_rules       jsonb not null default '[]'::jsonb,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now()
);
create index if not exists collection_policies_company_idx
  on public.collection_policies(company_id) where is_active;

-- ════════════════════════════════════════════════════════════════════
-- 9. payment_policies  (política de pago)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.payment_policies (
  id                           uuid primary key default gen_random_uuid(),
  company_id                   uuid not null references public.companies(id) on delete cascade,
  standard_payment_days        int not null default 30,
  early_payment_threshold_days int not null default 10,
  early_payment_discount_min_pct numeric(5,2) not null default 0,
  is_active                    boolean not null default true,
  created_at                   timestamptz not null default now()
);
create index if not exists payment_policies_company_idx
  on public.payment_policies(company_id) where is_active;

-- ════════════════════════════════════════════════════════════════════
-- 10. fixed_commitments  (compromisos fijos recurrentes)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.fixed_commitments (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null,
  amount        numeric(16,2) not null check (amount >= 0),
  frequency     commitment_frequency not null default 'monthly',
  next_due_date date not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists commitments_company_due_idx
  on public.fixed_commitments(company_id, next_due_date) where is_active;

-- ════════════════════════════════════════════════════════════════════
-- 11. alerts  (historial)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.alerts (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  user_id          uuid references public.users(id) on delete set null,
  severity         alert_severity not null,
  category         alert_category not null,
  title            text not null,
  message          text not null,
  suggested_action text,
  channel_sent     alert_channel,
  status           alert_status not null default 'sent',
  -- clave de deduplicación: evita repetir la misma alerta dentro de 24h
  dedupe_key       text,
  created_at       timestamptz not null default now(),
  read_at          timestamptz,
  acted_at         timestamptz
);
create index if not exists alerts_company_created_idx
  on public.alerts(company_id, created_at desc);
create index if not exists alerts_dedupe_idx
  on public.alerts(company_id, dedupe_key, created_at desc);

-- ════════════════════════════════════════════════════════════════════
-- 12. cash_position_snapshots  (foto diaria)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.cash_position_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  date                 date not null default current_date,
  total_cash_available numeric(16,2) not null default 0,
  bank_balance         numeric(16,2) not null default 0,
  physical_cash        numeric(16,2) not null default 0,
  total_receivables    numeric(16,2) not null default 0,
  total_payables       numeric(16,2) not null default 0,
  net_position         numeric(16,2) not null default 0,
  runway_days          int not null default 0,
  created_at           timestamptz not null default now(),
  unique (company_id, date)
);
create index if not exists snapshots_company_date_idx
  on public.cash_position_snapshots(company_id, date desc);

-- ════════════════════════════════════════════════════════════════════
-- 13. cash_predictions  (Fase 2 — solo estructura)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.cash_predictions (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  prediction_date   date not null,
  predicted_balance numeric(16,2) not null default 0,
  confidence_score  numeric(5,4),
  model_version     text,
  created_at        timestamptz not null default now()
);
create index if not exists predictions_company_date_idx
  on public.cash_predictions(company_id, prediction_date);

-- ════════════════════════════════════════════════════════════════════
-- 14. investment_opportunities  (Fase 3 — solo estructura)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.investment_opportunities (
  id                   uuid primary key default gen_random_uuid(),
  investor_company_id  uuid references public.companies(id) on delete set null,
  recipient_company_id uuid references public.companies(id) on delete set null,
  amount               numeric(16,2) not null check (amount >= 0),
  interest_rate        numeric(6,3),
  term_days            int,
  risk_score           numeric(5,2),
  status               text not null default 'proposed',
  created_at           timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════
-- Row Level Security · aislamiento por empresa (multi-tenant)
-- ════════════════════════════════════════════════════════════════════

-- Tablas con columna company_id directa → política estándar.
do $$
declare
  t text;
  tables text[] := array[
    'users','cash_movements','bank_accounts','budgets','receivables',
    'payables','collection_policies','payment_policies','fixed_commitments',
    'alerts','cash_position_snapshots','cash_predictions'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists tenant_isolation on public.%I;', t);
    execute format($f$
      create policy tenant_isolation on public.%I
        for all
        using (company_id = public.current_company_id())
        with check (company_id = public.current_company_id());
    $f$, t);
  end loop;
end $$;

-- companies: el usuario solo ve/edita SU empresa (id = current_company_id()).
alter table public.companies enable row level security;
drop policy if exists tenant_isolation on public.companies;
create policy tenant_isolation on public.companies
  for all
  using (id = public.current_company_id())
  with check (id = public.current_company_id());

-- investment_opportunities (Fase 3): la empresa participa como inversora o receptora.
alter table public.investment_opportunities enable row level security;
drop policy if exists tenant_isolation on public.investment_opportunities;
create policy tenant_isolation on public.investment_opportunities
  for all
  using (
    investor_company_id = public.current_company_id()
    or recipient_company_id = public.current_company_id()
  )
  with check (
    investor_company_id = public.current_company_id()
    or recipient_company_id = public.current_company_id()
  );
