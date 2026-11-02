-- ============================================================================
-- Estokar — schema base para Supabase / Postgres
-- ============================================================================
-- Como usar:
--   1. Crie um projeto no Supabase.
--   2. Abra o SQL Editor e cole este arquivo inteiro.
--   3. Rode uma vez. O script foi escrito para ser reexecutável (idempotente).
--
-- Princípios:
--   • Valores monetários em centavos (integer), nunca float.
--   • Quantidades em numeric(12,3) para suportar venda por peso no futuro.
--   • Todo lançamento guarda source_type e status de processamento.
--   • RLS em todas as tabelas: cada usuário só enxerga os negócios dos quais
--     participa.
--   • Operações que mexem em caixa + estoque juntas têm RPC transacional.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensões
-- ----------------------------------------------------------------------------
-- gen_random_uuid() já vem no Postgres 13+ (usado pelo Supabase).
-- Nenhuma extensão extra é obrigatória.

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.source_type as enum (
    'manual',
    'audio_transcription',
    'image_recognition',
    'whatsapp_import',
    'email_import',
    'qr_code',
    'spreadsheet_import'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.processing_status as enum ('processed', 'pending_review');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.transaction_kind as enum (
    'sale',
    'expense',
    'withdrawal'
  );
exception when duplicate_object then null;
end $$;

-- Bancos criados antes dos novos conectores/retiradas recebem os valores.
-- ADD VALUE é idempotente e não pode ser usado na mesma transação em versões
-- antigas do Postgres; por isso fica fora do bloco DO.
alter type public.source_type add value if not exists 'email_import';
alter type public.source_type add value if not exists 'qr_code';
alter type public.source_type add value if not exists 'spreadsheet_import';
alter type public.transaction_kind add value if not exists 'withdrawal';

do $$ begin
  create type public.payment_method as enum ('pix', 'cash', 'card', 'other');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.inventory_direction as enum ('in', 'out', 'adjustment');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.bill_status as enum ('open', 'paid', 'canceled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.business_role as enum ('owner', 'manager', 'staff');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.ingestion_status as enum (
    'received',
    'processing',
    'processed',
    'pending_review',
    'failed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.business_segment as enum (
    'confeitaria',
    'barbearia',
    'roupas'
  );
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- Negócios e membros
-- ----------------------------------------------------------------------------
create table if not exists public.businesses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  owner_name  text not null check (char_length(btrim(owner_name)) between 1 and 120),
  city        text,
  segment     public.business_segment not null default 'confeitaria',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Bancos criados antes do seletor de ramo recebem a coluna com o padrão.
alter table public.businesses
  add column if not exists segment public.business_segment
  not null default 'confeitaria';

create table if not exists public.memberships (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.business_role not null default 'staff',
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index if not exists memberships_user_idx
  on public.memberships (user_id);

-- ----------------------------------------------------------------------------
-- Fornecedores
-- ----------------------------------------------------------------------------
create table if not exists public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  phone       text,
  email       text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists suppliers_business_idx
  on public.suppliers (business_id, name);

create unique index if not exists suppliers_business_name_unique
  on public.suppliers (business_id, lower(btrim(name)));

-- ----------------------------------------------------------------------------
-- Produtos
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  unit        text not null default 'un',
  unit_plural text not null default 'un',
  stock       numeric(12,3) not null default 0 check (stock >= 0),
  min_stock   numeric(12,3) not null default 0 check (min_stock >= 0),
  cost_cents  integer not null default 0 check (cost_cents >= 0),
  price_cents integer not null default 0 check (price_cents >= 0),
  -- Serviços (corte, barba, consultoria) não movimentam estoque.
  track_stock boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.products
  add column if not exists track_stock boolean not null default true;

alter table public.products
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

create index if not exists products_supplier_idx
  on public.products (supplier_id)
  where supplier_id is not null;

create index if not exists products_business_idx
  on public.products (business_id, name);

-- Evita dois produtos com o mesmo nome no mesmo negócio (case-insensitive).
create unique index if not exists products_business_name_unique
  on public.products (business_id, lower(btrim(name)));

-- ----------------------------------------------------------------------------
-- Lançamentos financeiros
-- ----------------------------------------------------------------------------
create table if not exists public.transactions (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  kind           public.transaction_kind not null,
  description    text not null check (char_length(btrim(description)) between 1 and 200),
  amount_cents   integer not null check (amount_cents > 0),
  quantity       numeric(12,3) check (quantity is null or quantity > 0),
  product_id     uuid references public.products(id) on delete set null,
  payment_method public.payment_method,
  source_type    public.source_type not null default 'manual',
  status         public.processing_status not null default 'processed',
  raw_input      text,
  ai_confidence  numeric(4,3) check (
    ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1)
  ),
  occurred_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz,
  constraint transactions_reviewed_after_created
    check (reviewed_at is null or reviewed_at >= created_at)
);

create index if not exists transactions_business_occurred_idx
  on public.transactions (business_id, occurred_at desc);

create index if not exists transactions_pending_idx
  on public.transactions (business_id, occurred_at desc)
  where status = 'pending_review';

create index if not exists transactions_product_idx
  on public.transactions (product_id)
  where product_id is not null;

-- Fornecedor do lançamento (compras e contas pagas). Retiradas não têm.
alter table public.transactions
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

create index if not exists transactions_supplier_idx
  on public.transactions (supplier_id)
  where supplier_id is not null;

-- ----------------------------------------------------------------------------
-- Movimentações de estoque
-- ----------------------------------------------------------------------------
-- Cada venda gera um log direction = 'out'. Cada compra/entrada gera 'in'.
-- Ajustes manuais usam 'adjustment' e não têm transação financeira.
create table if not exists public.inventory_logs (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  direction       public.inventory_direction not null,
  quantity        numeric(12,3) not null check (quantity > 0),
  unit_cost_cents integer check (unit_cost_cents is null or unit_cost_cents >= 0),
  transaction_id  uuid references public.transactions(id) on delete set null,
  source_type     public.source_type not null default 'manual',
  status          public.processing_status not null default 'processed',
  occurred_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index if not exists inventory_logs_business_occurred_idx
  on public.inventory_logs (business_id, occurred_at desc);

create index if not exists inventory_logs_product_idx
  on public.inventory_logs (product_id, occurred_at desc);

create index if not exists inventory_logs_transaction_idx
  on public.inventory_logs (transaction_id)
  where transaction_id is not null;

-- ----------------------------------------------------------------------------
-- Contas a pagar
-- ----------------------------------------------------------------------------
-- Boleto, carnê, compra a prazo ou aluguel. Quando é paga, gera uma despesa
-- em transactions e guarda o vínculo para permitir estorno.
create table if not exists public.bills (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  supplier_id    uuid references public.suppliers(id) on delete set null,
  description    text not null check (char_length(btrim(description)) between 1 and 200),
  amount_cents   integer not null check (amount_cents > 0),
  due_date       date not null,
  status         public.bill_status not null default 'open',
  paid_at        timestamptz,
  payment_method public.payment_method,
  transaction_id uuid references public.transactions(id) on delete set null,
  source_type    public.source_type not null default 'manual',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint bills_paid_consistency check (
    (status = 'paid' and paid_at is not null)
    or (status <> 'paid')
  )
);

create index if not exists bills_business_due_idx
  on public.bills (business_id, due_date);

create index if not exists bills_open_idx
  on public.bills (business_id, due_date)
  where status = 'open';

create index if not exists bills_supplier_idx
  on public.bills (supplier_id)
  where supplier_id is not null;

-- ----------------------------------------------------------------------------
-- Compras (histórico de preço por fornecedor)
-- ----------------------------------------------------------------------------
-- Cada compra guarda o custo unitário praticado. É daqui que saem a comparação
-- de preços e a atualização do custo médio do produto.
create table if not exists public.purchases (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  supplier_id       uuid references public.suppliers(id) on delete set null,
  product_id        uuid references public.products(id) on delete set null,
  product_name      text not null check (char_length(btrim(product_name)) between 1 and 120),
  quantity          numeric(12,3) not null check (quantity > 0),
  unit_cost_cents   integer not null check (unit_cost_cents >= 0),
  total_cents       integer not null check (total_cents >= 0),
  bill_id           uuid references public.bills(id) on delete set null,
  transaction_id    uuid references public.transactions(id) on delete set null,
  inventory_log_id  uuid references public.inventory_logs(id) on delete set null,
  source_type       public.source_type not null default 'manual',
  occurred_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists purchases_business_occurred_idx
  on public.purchases (business_id, occurred_at desc);

create index if not exists purchases_supplier_idx
  on public.purchases (supplier_id, occurred_at desc)
  where supplier_id is not null;

create index if not exists purchases_product_idx
  on public.purchases (product_id, occurred_at desc)
  where product_id is not null;

-- ----------------------------------------------------------------------------
-- Ingestão de dados não estruturados (áudio, foto, WhatsApp)
-- ----------------------------------------------------------------------------
-- Guarda o evento original e o resultado da IA. O lançamento financeiro só é
-- criado depois; se a confiança for baixa, ele nasce com status pending_review.
create table if not exists public.ingestion_events (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  created_by        uuid references auth.users(id) on delete set null,
  source_type       public.source_type not null,
  status            public.ingestion_status not null default 'received',
  raw_input         text,
  media_path        text,
  extracted_payload jsonb,
  ai_confidence     numeric(4,3) check (
    ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1)
  ),
  transaction_id    uuid references public.transactions(id) on delete set null,
  error_message     text,
  created_at        timestamptz not null default now(),
  processed_at      timestamptz
);

create index if not exists ingestion_events_business_created_idx
  on public.ingestion_events (business_id, created_at desc);

create index if not exists ingestion_events_pending_idx
  on public.ingestion_events (business_id, created_at desc)
  where status in ('received', 'processing', 'pending_review');

-- Campos usados pelos conectores futuros (WhatsApp, e-mail/XML, QR Code).
alter table public.ingestion_events
  add column if not exists external_id text;
alter table public.ingestion_events
  add column if not exists external_channel text;
alter table public.ingestion_events
  add column if not exists payload jsonb;
alter table public.ingestion_events
  add column if not exists linked_supplier_id uuid references public.suppliers(id) on delete set null;
alter table public.ingestion_events
  add column if not exists linked_bill_id uuid references public.bills(id) on delete set null;
alter table public.ingestion_events
  add column if not exists review_reason text;

create unique index if not exists ingestion_events_external_unique
  on public.ingestion_events (business_id, external_channel, external_id)
  where external_id is not null;

-- ----------------------------------------------------------------------------
-- updated_at automático
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

drop trigger if exists bills_set_updated_at on public.bills;
create trigger bills_set_updated_at
  before update on public.bills
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Helpers de autorização (security definer evita recursão de RLS)
-- ----------------------------------------------------------------------------
create or replace function public.is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.business_id = target_business_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_business_owner(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.business_id = target_business_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

revoke all on function public.is_business_member(uuid) from public;
revoke all on function public.is_business_owner(uuid) from public;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.is_business_owner(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.businesses       enable row level security;
alter table public.memberships      enable row level security;
alter table public.products         enable row level security;
alter table public.suppliers        enable row level security;
alter table public.transactions     enable row level security;
alter table public.inventory_logs   enable row level security;
alter table public.bills            enable row level security;
alter table public.purchases        enable row level security;
alter table public.ingestion_events enable row level security;

-- businesses
drop policy if exists "businesses_select_members" on public.businesses;
create policy "businesses_select_members"
  on public.businesses for select
  to authenticated
  using (public.is_business_member(id));

drop policy if exists "businesses_update_owners" on public.businesses;
create policy "businesses_update_owners"
  on public.businesses for update
  to authenticated
  using (public.is_business_owner(id))
  with check (public.is_business_owner(id));

drop policy if exists "businesses_delete_owners" on public.businesses;
create policy "businesses_delete_owners"
  on public.businesses for delete
  to authenticated
  using (public.is_business_owner(id));

-- memberships
drop policy if exists "memberships_select_members" on public.memberships;
create policy "memberships_select_members"
  on public.memberships for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "memberships_insert_owners" on public.memberships;
create policy "memberships_insert_owners"
  on public.memberships for insert
  to authenticated
  with check (public.is_business_owner(business_id));

drop policy if exists "memberships_update_owners" on public.memberships;
create policy "memberships_update_owners"
  on public.memberships for update
  to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

drop policy if exists "memberships_delete_owners" on public.memberships;
create policy "memberships_delete_owners"
  on public.memberships for delete
  to authenticated
  using (public.is_business_owner(business_id));

-- products
drop policy if exists "products_select_members" on public.products;
create policy "products_select_members"
  on public.products for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "products_insert_members" on public.products;
create policy "products_insert_members"
  on public.products for insert
  to authenticated
  with check (public.is_business_member(business_id));

drop policy if exists "products_update_members" on public.products;
create policy "products_update_members"
  on public.products for update
  to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists "products_delete_members" on public.products;
create policy "products_delete_members"
  on public.products for delete
  to authenticated
  using (public.is_business_member(business_id));

-- suppliers
drop policy if exists "suppliers_select_members" on public.suppliers;
create policy "suppliers_select_members"
  on public.suppliers for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "suppliers_insert_members" on public.suppliers;
create policy "suppliers_insert_members"
  on public.suppliers for insert
  to authenticated
  with check (public.is_business_member(business_id));

drop policy if exists "suppliers_update_members" on public.suppliers;
create policy "suppliers_update_members"
  on public.suppliers for update
  to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists "suppliers_delete_members" on public.suppliers;
create policy "suppliers_delete_members"
  on public.suppliers for delete
  to authenticated
  using (public.is_business_member(business_id));

-- transactions
drop policy if exists "transactions_select_members" on public.transactions;
create policy "transactions_select_members"
  on public.transactions for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "transactions_insert_members" on public.transactions;
create policy "transactions_insert_members"
  on public.transactions for insert
  to authenticated
  with check (public.is_business_member(business_id));

drop policy if exists "transactions_update_members" on public.transactions;
create policy "transactions_update_members"
  on public.transactions for update
  to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

-- Sem policy de DELETE em transactions: exclusão direta não repõe estoque.
-- Use a RPC delete_transaction() para manter caixa e inventário coerentes.

-- inventory_logs
drop policy if exists "inventory_logs_select_members" on public.inventory_logs;
create policy "inventory_logs_select_members"
  on public.inventory_logs for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "inventory_logs_insert_members" on public.inventory_logs;
create policy "inventory_logs_insert_members"
  on public.inventory_logs for insert
  to authenticated
  with check (public.is_business_member(business_id));

drop policy if exists "inventory_logs_update_members" on public.inventory_logs;
create policy "inventory_logs_update_members"
  on public.inventory_logs for update
  to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

-- Sem policy de DELETE em inventory_logs: mexer no log direto dessincroniza
-- o estoque. A RPC delete_transaction() cuida do estorno.

-- bills
drop policy if exists "bills_select_members" on public.bills;
create policy "bills_select_members"
  on public.bills for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "bills_insert_members" on public.bills;
create policy "bills_insert_members"
  on public.bills for insert
  to authenticated
  with check (public.is_business_member(business_id));

drop policy if exists "bills_update_members" on public.bills;
create policy "bills_update_members"
  on public.bills for update
  to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists "bills_delete_members" on public.bills;
create policy "bills_delete_members"
  on public.bills for delete
  to authenticated
  using (
    public.is_business_member(business_id)
    and status = 'open'
  );

-- purchases
drop policy if exists "purchases_select_members" on public.purchases;
create policy "purchases_select_members"
  on public.purchases for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "purchases_insert_members" on public.purchases;
create policy "purchases_insert_members"
  on public.purchases for insert
  to authenticated
  with check (public.is_business_member(business_id));

drop policy if exists "purchases_update_members" on public.purchases;
create policy "purchases_update_members"
  on public.purchases for update
  to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists "purchases_delete_members" on public.purchases;
create policy "purchases_delete_members"
  on public.purchases for delete
  to authenticated
  using (public.is_business_member(business_id));

-- ingestion_events
drop policy if exists "ingestion_events_select_members" on public.ingestion_events;
create policy "ingestion_events_select_members"
  on public.ingestion_events for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "ingestion_events_insert_members" on public.ingestion_events;
create policy "ingestion_events_insert_members"
  on public.ingestion_events for insert
  to authenticated
  with check (public.is_business_member(business_id));

drop policy if exists "ingestion_events_update_members" on public.ingestion_events;
create policy "ingestion_events_update_members"
  on public.ingestion_events for update
  to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists "ingestion_events_delete_members" on public.ingestion_events;
create policy "ingestion_events_delete_members"
  on public.ingestion_events for delete
  to authenticated
  using (public.is_business_member(business_id));

-- ----------------------------------------------------------------------------
-- RPC: cria negócio + membership owner em uma transação
-- ----------------------------------------------------------------------------
-- A assinatura antiga (sem ramo) é removida para não criar ambiguidade com os
-- valores padrão da nova assinatura.
drop function if exists public.create_business(text, text, text);

create or replace function public.create_business(
  p_name text,
  p_owner_name text,
  p_city text default null,
  p_segment public.business_segment default 'confeitaria'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    raise exception 'É preciso estar autenticado.'
      using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Informe o nome do negócio.';
  end if;

  insert into public.businesses (id, name, owner_name, city, segment)
  values (
    v_business_id,
    btrim(p_name),
    btrim(coalesce(p_owner_name, '')),
    nullif(btrim(coalesce(p_city, '')), ''),
    coalesce(p_segment, 'confeitaria')
  );

  insert into public.memberships (business_id, user_id, role)
  values (v_business_id, auth.uid(), 'owner');

  return v_business_id;
end;
$$;

revoke all on function public.create_business(
  text, text, text, public.business_segment
) from public;
grant execute on function public.create_business(
  text, text, text, public.business_segment
) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC: venda manual atômica (caixa + estoque)
-- ----------------------------------------------------------------------------
create or replace function public.register_sale(
  p_business_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_amount_cents integer,
  p_payment_method public.payment_method default 'cash',
  p_source_type public.source_type default 'manual',
  p_raw_input text default null,
  p_ai_confidence numeric default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_transaction_id uuid := gen_random_uuid();
begin
  if not public.is_business_member(p_business_id) then
    raise exception 'Sem acesso a este negócio.'
      using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade inválida.';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Valor inválido.';
  end if;

  -- Trava a linha do produto para evitar venda concorrente acima do estoque.
  select *
    into v_product
    from public.products
   where id = p_product_id
     and business_id = p_business_id
     for update;

  if not found then
    raise exception 'Produto não encontrado.';
  end if;

  -- Serviços têm track_stock = false: vendem sem baixa nem log de estoque.
  if v_product.track_stock then
    if v_product.stock < p_quantity then
      raise exception 'Estoque insuficiente.';
    end if;

    update public.products
       set stock = stock - p_quantity
     where id = p_product_id;
  end if;

  insert into public.transactions (
    id, business_id, kind, description, amount_cents, quantity,
    product_id, payment_method, source_type, status, raw_input,
    ai_confidence, occurred_at
  ) values (
    v_transaction_id, p_business_id, 'sale', v_product.name, p_amount_cents,
    p_quantity, p_product_id, p_payment_method, p_source_type, 'processed',
    p_raw_input, p_ai_confidence, now()
  );

  if v_product.track_stock then
    insert into public.inventory_logs (
      business_id, product_id, direction, quantity, transaction_id,
      source_type, status, occurred_at
    ) values (
      p_business_id, p_product_id, 'out', p_quantity, v_transaction_id,
      p_source_type, 'processed', now()
    );
  end if;

  return v_transaction_id;
end;
$$;

revoke all on function public.register_sale(
  uuid, uuid, numeric, integer, public.payment_method, public.source_type, text, numeric
) from public;
grant execute on function public.register_sale(
  uuid, uuid, numeric, integer, public.payment_method, public.source_type, text, numeric
) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC: compra com fornecedor (estoque + preço + caixa ou conta a pagar)
-- ----------------------------------------------------------------------------
-- Uma única transação faz: entrada no estoque, custo médio, histórico de
-- preço, log e a saída financeira (paga agora) ou a conta a pagar.
create or replace function public.register_purchase(
  p_business_id uuid,
  p_supplier_id uuid default null,
  p_product_id uuid default null,
  p_product_name text default null,
  p_quantity numeric default 1,
  p_unit_cost_cents integer default 0,
  p_paid_now boolean default true,
  p_due_date date default null,
  p_payment_method public.payment_method default 'other',
  p_source_type public.source_type default 'manual',
  p_raw_input text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_product_id uuid;
  v_product_name text;
  v_total integer;
  v_new_stock numeric;
  v_purchase_id uuid := gen_random_uuid();
  v_transaction_id uuid;
  v_bill_id uuid;
  v_log_id uuid;
  v_suggested_price integer;
begin
  if not public.is_business_member(p_business_id) then
    raise exception 'Sem acesso a este negócio.'
      using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade inválida.';
  end if;

  if p_unit_cost_cents is null or p_unit_cost_cents < 0 then
    raise exception 'Custo inválido.';
  end if;

  v_total := round(p_quantity * p_unit_cost_cents)::integer;
  if v_total <= 0 then
    raise exception 'Informe quanto custou a compra.';
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers
     where id = p_supplier_id
       and business_id = p_business_id
  ) then
    raise exception 'Fornecedor não encontrado.';
  end if;

  if p_product_id is not null then
    select *
      into v_product
      from public.products
     where id = p_product_id
       and business_id = p_business_id
       for update;

    if not found then
      raise exception 'Item não encontrado.';
    end if;

    v_product_id := v_product.id;
    v_product_name := v_product.name;
    v_new_stock := v_product.stock + p_quantity;

    update public.products
       set stock = v_new_stock,
           cost_cents = round(
             (v_product.stock * v_product.cost_cents + v_total) / v_new_stock
           )::integer,
           supplier_id = coalesce(p_supplier_id, supplier_id)
     where id = v_product_id;
  else
    v_product_name := btrim(coalesce(p_product_name, ''));
    if char_length(v_product_name) = 0 then
      raise exception 'Diga o nome do item comprado.';
    end if;

    select *
      into v_product
      from public.products
     where business_id = p_business_id
       and lower(btrim(name)) = lower(v_product_name)
       and track_stock
     for update;

    if found then
      v_product_id := v_product.id;
      v_new_stock := v_product.stock + p_quantity;

      update public.products
         set stock = v_new_stock,
             cost_cents = round(
               (v_product.stock * v_product.cost_cents + v_total) / v_new_stock
             )::integer,
             supplier_id = coalesce(p_supplier_id, supplier_id)
       where id = v_product_id;
    else
      v_suggested_price := case
        when p_unit_cost_cents > 0
          then greatest(100, (ceil((p_unit_cost_cents * 1.8) / 100.0) * 100)::integer)
        else 0
      end;

      insert into public.products (
        business_id, name, unit, unit_plural, stock, min_stock,
        cost_cents, price_cents, track_stock, supplier_id
      ) values (
        p_business_id, v_product_name, 'un', 'un', p_quantity, 2,
        p_unit_cost_cents, v_suggested_price, true, p_supplier_id
      )
      returning id into v_product_id;
    end if;
  end if;

  insert into public.inventory_logs (
    business_id, product_id, direction, quantity, unit_cost_cents,
    transaction_id, source_type, status, occurred_at
  ) values (
    p_business_id, v_product_id, 'in', p_quantity, p_unit_cost_cents,
    null, p_source_type, 'processed', now()
  )
  returning id into v_log_id;

  if p_paid_now then
    insert into public.transactions (
      business_id, kind, description, amount_cents, supplier_id,
      payment_method, source_type, status, raw_input, occurred_at
    ) values (
      p_business_id, 'expense', 'Compra: ' || v_product_name, v_total,
      p_supplier_id, p_payment_method, p_source_type, 'processed',
      p_raw_input, now()
    )
    returning id into v_transaction_id;

    update public.inventory_logs
       set transaction_id = v_transaction_id
     where id = v_log_id;
  else
    insert into public.bills (
      business_id, supplier_id, description, amount_cents, due_date,
      status, payment_method, source_type
    ) values (
      p_business_id, p_supplier_id, 'Compra: ' || v_product_name, v_total,
      coalesce(p_due_date, current_date + 14), 'open', p_payment_method,
      p_source_type
    )
    returning id into v_bill_id;
  end if;

  insert into public.purchases (
    id, business_id, supplier_id, product_id, product_name, quantity,
    unit_cost_cents, total_cents, bill_id, transaction_id,
    inventory_log_id, source_type, occurred_at
  ) values (
    v_purchase_id, p_business_id, p_supplier_id, v_product_id,
    v_product_name, p_quantity, p_unit_cost_cents, v_total, v_bill_id,
    v_transaction_id, v_log_id, p_source_type, now()
  );

  return jsonb_build_object(
    'product_id', v_product_id,
    'purchase_id', v_purchase_id,
    'bill_id', v_bill_id,
    'transaction_id', v_transaction_id,
    'total_cents', v_total
  );
end;
$$;

revoke all on function public.register_purchase(
  uuid, uuid, uuid, text, numeric, integer, boolean, date,
  public.payment_method, public.source_type, text
) from public;
grant execute on function public.register_purchase(
  uuid, uuid, uuid, text, numeric, integer, boolean, date,
  public.payment_method, public.source_type, text
) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC: paga uma conta e lança a despesa no caixa
-- ----------------------------------------------------------------------------
create or replace function public.pay_bill(
  p_bill_id uuid,
  p_payment_method public.payment_method default 'pix',
  p_paid_at timestamptz default now()
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bill public.bills%rowtype;
  v_transaction_id uuid := gen_random_uuid();
begin
  select *
    into v_bill
    from public.bills
   where id = p_bill_id
     for update;

  if not found then
    raise exception 'Conta não encontrada.';
  end if;

  if not public.is_business_member(v_bill.business_id) then
    raise exception 'Sem acesso a este negócio.'
      using errcode = '42501';
  end if;

  if v_bill.status <> 'open' then
    raise exception 'Esta conta não está em aberto.';
  end if;

  insert into public.transactions (
    id, business_id, kind, description, amount_cents, supplier_id,
    payment_method, source_type, status, occurred_at
  ) values (
    v_transaction_id, v_bill.business_id, 'expense',
    'Conta: ' || v_bill.description, v_bill.amount_cents,
    v_bill.supplier_id, p_payment_method, v_bill.source_type,
    'processed', coalesce(p_paid_at, now())
  );

  update public.bills
     set status = 'paid',
         paid_at = coalesce(p_paid_at, now()),
         payment_method = p_payment_method,
         transaction_id = v_transaction_id
   where id = p_bill_id;

  return v_transaction_id;
end;
$$;

revoke all on function public.pay_bill(
  uuid, public.payment_method, timestamptz
) from public;
grant execute on function public.pay_bill(
  uuid, public.payment_method, timestamptz
) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC: confirma um lançamento pendente da IA
-- ----------------------------------------------------------------------------
-- Atualiza o rascunho, baixa o estoque (quando o item controla quantidade) e
-- cria o log em uma única transação. O source_type original (áudio, foto,
-- WhatsApp) é preservado.
create or replace function public.confirm_pending_sale(
  p_transaction_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_amount_cents integer,
  p_payment_method public.payment_method
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_product public.products%rowtype;
begin
  select *
    into v_transaction
    from public.transactions
   where id = p_transaction_id
     for update;

  if not found then
    raise exception 'Rascunho não encontrado.';
  end if;

  if v_transaction.status <> 'pending_review' then
    raise exception 'Este lançamento já foi confirmado.';
  end if;

  if v_transaction.kind <> 'sale' then
    raise exception 'Só vendas pendentes podem ser confirmadas por aqui.';
  end if;

  if not public.is_business_member(v_transaction.business_id) then
    raise exception 'Sem acesso a este negócio.'
      using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade inválida.';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Valor inválido.';
  end if;

  select *
    into v_product
    from public.products
   where id = p_product_id
     and business_id = v_transaction.business_id
     for update;

  if not found then
    raise exception 'Produto não encontrado.';
  end if;

  if v_product.track_stock then
    if v_product.stock < p_quantity then
      raise exception 'Estoque insuficiente.';
    end if;

    update public.products
       set stock = stock - p_quantity
     where id = p_product_id;
  end if;

  update public.transactions
     set description = v_product.name,
         product_id = p_product_id,
         quantity = p_quantity,
         amount_cents = p_amount_cents,
         payment_method = p_payment_method,
         status = 'processed',
         reviewed_at = now()
   where id = p_transaction_id;

  if v_product.track_stock then
    insert into public.inventory_logs (
      business_id, product_id, direction, quantity, transaction_id,
      source_type, status, occurred_at
    ) values (
      v_transaction.business_id, p_product_id, 'out', p_quantity,
      p_transaction_id, v_transaction.source_type, 'processed', now()
    );
  end if;

  return p_transaction_id;
end;
$$;

revoke all on function public.confirm_pending_sale(
  uuid, uuid, numeric, integer, public.payment_method
) from public;
grant execute on function public.confirm_pending_sale(
  uuid, uuid, numeric, integer, public.payment_method
) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC: exclui lançamento e desfaz o efeito no estoque
-- ----------------------------------------------------------------------------
create or replace function public.delete_transaction(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_log public.inventory_logs%rowtype;
begin
  select *
    into v_transaction
    from public.transactions
   where id = p_transaction_id
     for update;

  if not found then
    raise exception 'Lançamento não encontrado.';
  end if;

  if not public.is_business_member(v_transaction.business_id) then
    raise exception 'Sem acesso a este negócio.'
      using errcode = '42501';
  end if;

  -- Venda: devolve ao estoque. Compra de estoque: retira o que entrou.
  for v_log in
    select *
      from public.inventory_logs
     where transaction_id = p_transaction_id
  loop
    if v_log.direction = 'out' then
      update public.products
         set stock = stock + v_log.quantity
       where id = v_log.product_id;
    elsif v_log.direction = 'in' then
      update public.products
         set stock = greatest(0, stock - v_log.quantity)
       where id = v_log.product_id;
    end if;
  end loop;

  delete from public.inventory_logs
   where transaction_id = p_transaction_id;

  -- Se era o pagamento de uma conta, ela volta para o aberto.
  update public.bills
     set status = 'open',
         paid_at = null,
         payment_method = null,
         transaction_id = null
   where transaction_id = p_transaction_id
     and status = 'paid';

  delete from public.transactions
   where id = p_transaction_id;
end;
$$;

revoke all on function public.delete_transaction(uuid) from public;
grant execute on function public.delete_transaction(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- View: totais por dia (respeita RLS via security_invoker)
-- ----------------------------------------------------------------------------
create or replace view public.daily_totals
with (security_invoker = true)
as
select
  business_id,
  (occurred_at at time zone 'America/Sao_Paulo')::date as day,
  coalesce(sum(amount_cents) filter (where kind = 'sale'), 0)::bigint as in_cents,
  -- `withdrawal` também é dinheiro que saiu, mas não é despesa do negócio.
  coalesce(sum(amount_cents) filter (where kind <> 'sale'), 0)::bigint as out_cents,
  count(*)::bigint as transaction_count
from public.transactions
where status = 'processed'
group by business_id, day;

-- ----------------------------------------------------------------------------
-- Permissões
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.daily_totals to authenticated;
revoke all on all tables in schema public from anon;

-- ============================================================================
-- Fim. Próximos passos de produção:
--   • Ativar Auth (e-mail OTP ou magic link) e criar o negócio via RPC.
--   • Migrar o store local para queries tipadas no Supabase.
--   • Criar bucket privado "ingestion" para áudios/fotos e gravar media_path.
--   • Rodar o pipeline de IA em Edge Function, atualizando ingestion_events.
-- ============================================================================
