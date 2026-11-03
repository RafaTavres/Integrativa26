-- ============================================================================
-- Estokar — hardening de demo, offline e RLS
-- Aplicar depois do schema base. É idempotente.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Seed único por negócio
-- ----------------------------------------------------------------------------
alter table public.businesses
  add column if not exists demo_seeded boolean not null default false;

-- Negócios que já têm itens foram semeados pela versão antiga.
update public.businesses b
   set demo_seeded = true
 where b.demo_seeded = false
   and exists (
     select 1 from public.products p where p.business_id = b.id
   );

-- ----------------------------------------------------------------------------
-- 2. Escrita só para owner/manager (staff/viewer fica somente leitura)
-- ----------------------------------------------------------------------------
create or replace function public.can_write_business(target_business_id uuid)
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
       and m.role in ('owner', 'manager')
  );
$$;

revoke all on function public.can_write_business(uuid) from public;
grant execute on function public.can_write_business(uuid) to authenticated;

-- products
drop policy if exists "products_insert_members" on public.products;
create policy "products_insert_members"
  on public.products for insert to authenticated
  with check (public.can_write_business(business_id));

drop policy if exists "products_update_members" on public.products;
create policy "products_update_members"
  on public.products for update to authenticated
  using (public.can_write_business(business_id))
  with check (public.can_write_business(business_id));

drop policy if exists "products_delete_members" on public.products;
create policy "products_delete_members"
  on public.products for delete to authenticated
  using (public.can_write_business(business_id));

-- suppliers
drop policy if exists "suppliers_insert_members" on public.suppliers;
create policy "suppliers_insert_members"
  on public.suppliers for insert to authenticated
  with check (public.can_write_business(business_id));

drop policy if exists "suppliers_update_members" on public.suppliers;
create policy "suppliers_update_members"
  on public.suppliers for update to authenticated
  using (public.can_write_business(business_id))
  with check (public.can_write_business(business_id));

drop policy if exists "suppliers_delete_members" on public.suppliers;
create policy "suppliers_delete_members"
  on public.suppliers for delete to authenticated
  using (public.can_write_business(business_id));

-- transactions
drop policy if exists "transactions_insert_members" on public.transactions;
create policy "transactions_insert_members"
  on public.transactions for insert to authenticated
  with check (public.can_write_business(business_id));

drop policy if exists "transactions_update_members" on public.transactions;
create policy "transactions_update_members"
  on public.transactions for update to authenticated
  using (public.can_write_business(business_id))
  with check (public.can_write_business(business_id));

-- inventory_logs
drop policy if exists "inventory_logs_insert_members" on public.inventory_logs;
create policy "inventory_logs_insert_members"
  on public.inventory_logs for insert to authenticated
  with check (public.can_write_business(business_id));

drop policy if exists "inventory_logs_update_members" on public.inventory_logs;
create policy "inventory_logs_update_members"
  on public.inventory_logs for update to authenticated
  using (public.can_write_business(business_id))
  with check (public.can_write_business(business_id));

-- bills
drop policy if exists "bills_insert_members" on public.bills;
create policy "bills_insert_members"
  on public.bills for insert to authenticated
  with check (public.can_write_business(business_id));

drop policy if exists "bills_update_members" on public.bills;
create policy "bills_update_members"
  on public.bills for update to authenticated
  using (public.can_write_business(business_id))
  with check (public.can_write_business(business_id));

drop policy if exists "bills_delete_members" on public.bills;
create policy "bills_delete_members"
  on public.bills for delete to authenticated
  using (
    public.can_write_business(business_id)
    and status = 'open'
  );

-- purchases
drop policy if exists "purchases_insert_members" on public.purchases;
create policy "purchases_insert_members"
  on public.purchases for insert to authenticated
  with check (public.can_write_business(business_id));

drop policy if exists "purchases_update_members" on public.purchases;
create policy "purchases_update_members"
  on public.purchases for update to authenticated
  using (public.can_write_business(business_id))
  with check (public.can_write_business(business_id));

drop policy if exists "purchases_delete_members" on public.purchases;
create policy "purchases_delete_members"
  on public.purchases for delete to authenticated
  using (public.can_write_business(business_id));

-- ingestion_events
drop policy if exists "ingestion_events_insert_members" on public.ingestion_events;
create policy "ingestion_events_insert_members"
  on public.ingestion_events for insert to authenticated
  with check (public.can_write_business(business_id));

drop policy if exists "ingestion_events_update_members" on public.ingestion_events;
create policy "ingestion_events_update_members"
  on public.ingestion_events for update to authenticated
  using (public.can_write_business(business_id))
  with check (public.can_write_business(business_id));

drop policy if exists "ingestion_events_delete_members" on public.ingestion_events;
create policy "ingestion_events_delete_members"
  on public.ingestion_events for delete to authenticated
  using (public.can_write_business(business_id));

-- ----------------------------------------------------------------------------
-- 3. Exclusão de lançamento respeita escrita (demo/staff não pode apagar)
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

  if not public.can_write_business(v_transaction.business_id) then
    raise exception 'Sem permissão para apagar este lançamento.'
      using errcode = '42501';
  end if;

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
-- 4. Reset transacional do ramo, sem apagar business/membership
-- ----------------------------------------------------------------------------
create or replace function public.reset_business(
  p_business_id uuid,
  p_segment public.business_segment
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'É preciso estar autenticado.'
      using errcode = '42501';
  end if;

  if not public.is_business_owner(p_business_id) then
    raise exception 'Apenas o dono pode recomeçar este negócio.'
      using errcode = '42501';
  end if;

  -- Tabelas externas do n8n podem referenciar products/transactions.
  if to_regclass('public.n8n_whatsapp_transactions') is not null then
    execute 'delete from public.n8n_whatsapp_transactions where business_id = $1'
      using p_business_id;
  end if;
  if to_regclass('public.n8n_whatsapp_purchases') is not null then
    execute 'delete from public.n8n_whatsapp_purchases where business_id = $1'
      using p_business_id;
  end if;
  if to_regclass('public.n8n_providers_group') is not null then
    execute 'delete from public.n8n_providers_group where business_id = $1'
      using p_business_id;
  end if;

  delete from public.purchases        where business_id = p_business_id;
  delete from public.bills            where business_id = p_business_id;
  delete from public.inventory_logs   where business_id = p_business_id;
  delete from public.transactions     where business_id = p_business_id;
  delete from public.products         where business_id = p_business_id;
  delete from public.suppliers        where business_id = p_business_id;
  delete from public.ingestion_events where business_id = p_business_id;

  update public.businesses
     set segment = p_segment,
         demo_seeded = false,
         updated_at = now()
   where id = p_business_id;
end;
$$;

revoke all on function public.reset_business(uuid, public.business_segment)
  from public;
grant execute on function public.reset_business(uuid, public.business_segment)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Demo do WhatsApp: somente leitura
-- ----------------------------------------------------------------------------
insert into public.businesses (id, name, owner_name, city, segment, demo_seeded)
values (
  '1590b256-f558-4f64-9dac-525677f11c56',
  'Loja de roupas (WhatsApp)',
  'Josevaldo',
  'Lages',
  'roupas',
  true
)
on conflict (id) do update set demo_seeded = true;

create or replace function public.entrar_loja_whatsapp()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  loja uuid := '1590b256-f558-4f64-9dac-525677f11c56';
begin
  if auth.uid() is null then
    raise exception 'Sessão não encontrada.'
      using errcode = '42501';
  end if;

  insert into public.memberships (business_id, user_id, role)
  values (loja, auth.uid(), 'staff')
  on conflict (business_id, user_id) do nothing;

  return loja;
end;
$$;

revoke all on function public.entrar_loja_whatsapp() from public;
grant execute on function public.entrar_loja_whatsapp() to authenticated;

-- Demove managers antigos da demo para staff (owner, se existir, permanece).
update public.memberships
   set role = 'staff'
 where business_id = '1590b256-f558-4f64-9dac-525677f11c56'
   and role <> 'owner';

-- ----------------------------------------------------------------------------
-- 6. n8n: tabelas e leitura para membros
-- ----------------------------------------------------------------------------
create table if not exists public.n8n_whatsapp_transactions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  business_id uuid not null references public.businesses(id),
  product_id uuid references public.products(id),
  product_name text,
  quantity numeric,
  amount_cents integer,
  unit_price_cents integer,
  supplier_name text,
  invoice bytea,
  source text,
  raw_input text,
  imported_at timestamptz
);

create table if not exists public.n8n_whatsapp_purchases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  business_id uuid not null references public.businesses(id),
  product_id uuid references public.products(id),
  product_name text,
  quantity numeric,
  total_cents integer,
  unit_cost_cents integer,
  supplier_name text,
  source text,
  raw_input text,
  imported_at timestamptz
);

create table if not exists public.n8n_providers_group (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  business_id uuid not null references public.businesses(id),
  supplier_name text,
  supplier_phone text,
  product_name text,
  unit text,
  price_cents integer,
  is_promo boolean,
  valid_until date,
  raw_message text,
  message_id text
);

alter table public.n8n_whatsapp_transactions enable row level security;
alter table public.n8n_whatsapp_purchases enable row level security;
alter table public.n8n_providers_group enable row level security;

drop policy if exists "n8n_whatsapp_transactions_select_members"
  on public.n8n_whatsapp_transactions;
create policy "n8n_whatsapp_transactions_select_members"
  on public.n8n_whatsapp_transactions for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "n8n_whatsapp_purchases_select_members"
  on public.n8n_whatsapp_purchases;
create policy "n8n_whatsapp_purchases_select_members"
  on public.n8n_whatsapp_purchases for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "n8n_providers_group_select_members"
  on public.n8n_providers_group;
create policy "n8n_providers_group_select_members"
  on public.n8n_providers_group for select to authenticated
  using (public.is_business_member(business_id));

create index if not exists n8n_whatsapp_transactions_business_idx
  on public.n8n_whatsapp_transactions (business_id, created_at desc);
create index if not exists n8n_whatsapp_purchases_business_idx
  on public.n8n_whatsapp_purchases (business_id, created_at desc);
create index if not exists n8n_providers_group_business_idx
  on public.n8n_providers_group (business_id, created_at desc);

revoke all on public.n8n_whatsapp_transactions from anon;
revoke all on public.n8n_whatsapp_purchases from anon;
revoke all on public.n8n_providers_group from anon;
grant select on public.n8n_whatsapp_transactions to authenticated;
grant select on public.n8n_whatsapp_purchases to authenticated;
grant select on public.n8n_providers_group to authenticated;

commit;
