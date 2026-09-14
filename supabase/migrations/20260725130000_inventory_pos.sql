-- ════════════════════════════════════════════════════════════════════
-- PosBank · Módulos Inventario + Facturación POS + Storage + Realtime
-- (reemplaza al SQL de realtime suelto: este lo incluye todo)
-- ════════════════════════════════════════════════════════════════════

-- ─── Inventario ──────────────────────────────────────────────────────
do $$ begin
  create type product_category as enum ('raw','wip','finished');
exception when duplicate_object then null; end $$;

create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  sku         text,
  category    product_category not null default 'finished',
  photo_url   text,
  unit        text not null default 'unidad',   -- unidad, kg, litro…
  cost        numeric(16,2) not null default 0, -- costo unitario
  price       numeric(16,2) not null default 0, -- precio de venta (terminados)
  tax_rate    numeric(5,2)  not null default 19,-- % IVA configurable
  stock       numeric(16,3) not null default 0, -- cantidad disponible
  min_stock   numeric(16,3) not null default 0, -- umbral de alerta (futuro)
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists products_company_cat_idx on public.products(company_id, category) where is_active;
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- Kardex: historial de movimientos de stock.
create table if not exists public.stock_movements (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  type        text not null,          -- in | out | adjust | production | sale
  quantity    numeric(16,3) not null, -- +entra / -sale
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists stock_mov_company_idx on public.stock_movements(company_id, created_at desc);
create index if not exists stock_mov_product_idx on public.stock_movements(product_id, created_at desc);

-- ─── Facturación POS ─────────────────────────────────────────────────
create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  number           text,                     -- consecutivo (F-0001)
  customer_name    text,
  subtotal         numeric(16,2) not null default 0,
  tax              numeric(16,2) not null default 0,
  total            numeric(16,2) not null default 0,
  status           text not null default 'issued', -- issued | void
  cash_movement_id uuid references public.cash_movements(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists invoices_company_idx on public.invoices(company_id, created_at desc);

create table if not exists public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  description text not null,
  quantity    numeric(16,3) not null,
  unit_price  numeric(16,2) not null,
  tax_rate    numeric(5,2) not null default 0,
  line_total  numeric(16,2) not null,  -- (unit_price * quantity) sin IVA
  created_at  timestamptz not null default now()
);
create index if not exists invoice_items_invoice_idx on public.invoice_items(invoice_id);

-- ─── RLS multi-tenant (mismo patrón que el resto) ────────────────────
do $$
declare
  t text;
  tables text[] := array['products','stock_movements','invoices','invoice_items'];
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

-- ─── Storage: bucket de fotos de producto ────────────────────────────
insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', true)
on conflict (id) do nothing;

drop policy if exists "pb product photos read" on storage.objects;
create policy "pb product photos read" on storage.objects
  for select using (bucket_id = 'product-photos');

drop policy if exists "pb product photos insert" on storage.objects;
create policy "pb product photos insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-photos');

drop policy if exists "pb product photos update" on storage.objects;
create policy "pb product photos update" on storage.objects
  for update to authenticated using (bucket_id = 'product-photos');

-- ─── Realtime: todas las tablas del dashboard + inventario/POS ───────
do $$
declare
  t text;
  tables text[] := array[
    'cash_movements','alerts','receivables','payables',
    'products','stock_movements','invoices'
  ];
begin
  foreach t in array tables loop
    -- add table si aún no está en la publicación
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception when duplicate_object then null;
    end;
    execute format('alter table public.%I replica identity full;', t);
  end loop;
end $$;
