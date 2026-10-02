-- ════════════════════════════════════════════════════════════════════
-- PosBank · Módulo Comercial: Pricing, Unit Economics & Propuestas
-- Multi-tenant con Row Level Security.
-- ════════════════════════════════════════════════════════════════════

-- 1. commercial_proposals (cotizaciones formales y escalas de precios por volumen)
create table if not exists public.commercial_proposals (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  title             text not null,
  client_name       text not null,
  product_id        uuid references public.products(id) on delete set null,
  base_cost         numeric(16,2) not null check (base_cost >= 0),
  target_margin_pct numeric(5,2) not null default 35.00 check (target_margin_pct >= 0 and target_margin_pct < 100),
  tiers             jsonb not null default '[]'::jsonb, -- [{ minQty, maxQty, unitPrice, unitCost, marginPct, profitPerUnit }]
  notes             text,
  status            text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists commercial_prop_company_idx
  on public.commercial_proposals(company_id, created_at desc);

create trigger commercial_prop_set_updated_at before update on public.commercial_proposals
  for each row execute function public.set_updated_at();

alter table public.commercial_proposals enable row level security;
drop policy if exists tenant_isolation on public.commercial_proposals;
create policy tenant_isolation on public.commercial_proposals
  for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- 2. commercial_unit_economics (historial de CAC, LTV y retención por período)
create table if not exists public.commercial_unit_economics (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  period_month         int not null check (period_month between 1 and 12),
  period_year          int not null check (period_year between 2000 and 2100),
  marketing_spend      numeric(16,2) not null default 0,
  sales_spend          numeric(16,2) not null default 0,
  new_customers        int not null default 0,
  retention_spend      numeric(16,2) not null default 0,
  active_customers     int not null default 0,
  avg_ticket           numeric(16,2) not null default 0,
  purchase_freq_annual numeric(8,2) not null default 1,
  avg_lifespan_years   numeric(5,2) not null default 1,
  gross_margin_pct     numeric(5,2) not null default 30,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (company_id, period_year, period_month)
);

create index if not exists commercial_ue_company_idx
  on public.commercial_unit_economics(company_id, period_year, period_month);

create trigger commercial_ue_set_updated_at before update on public.commercial_unit_economics
  for each row execute function public.set_updated_at();

alter table public.commercial_unit_economics enable row level security;
drop policy if exists tenant_isolation on public.commercial_unit_economics;
create policy tenant_isolation on public.commercial_unit_economics
  for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
