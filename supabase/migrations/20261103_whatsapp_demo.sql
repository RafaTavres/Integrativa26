-- ============================================================================
-- Estokar — demo do WhatsApp: dados completos e sincronização
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Migra a venda antiga do n8n_me_group para a tabela canônica
-- ----------------------------------------------------------------------------
do $$
declare
  demo uuid := '1590b256-f558-4f64-9dac-525677f11c56';
begin
  if not exists (select 1 from public.businesses where id = demo) then
    return;
  end if;

  insert into public.n8n_whatsapp_transactions (
    business_id, product_name, quantity, amount_cents, unit_price_cents,
    supplier_name, source, raw_input, created_at
  )
  select
    demo,
    coalesce(nullif(btrim(g.product_name), ''), 'Venda'),
    coalesce(g.quantity, 1),
    greatest(0, round(coalesce(g.product_price, 0) * 100)::integer),
    greatest(0, round(coalesce(g.product_price, 0) * 100)::integer),
    null,
    'whatsapp_import',
    g.raw_input,
    g.created_at
  from public.n8n_me_group g
  where g.sale = true
    and coalesce(g.product_price, 0) > 0
    and not exists (
      select 1
        from public.n8n_whatsapp_transactions t
       where t.business_id = demo
         and lower(btrim(t.product_name)) = lower(btrim(g.product_name))
         and abs(extract(epoch from (t.created_at - g.created_at))) < 300
    );
end $$;

-- ----------------------------------------------------------------------------
-- 2. Dados de exemplo para a demo ficar completa (só uma vez)
-- ----------------------------------------------------------------------------
do $$
declare
  demo uuid := '1590b256-f558-4f64-9dac-525677f11c56';
begin
  if not exists (select 1 from public.businesses where id = demo) then
    return;
  end if;

  if not exists (
    select 1 from public.n8n_whatsapp_purchases
     where business_id = demo and source = 'demo'
  ) then
    insert into public.n8n_whatsapp_purchases (
      business_id, product_name, quantity, total_cents, unit_cost_cents,
      supplier_name, source, raw_input, created_at
    ) values
      (demo, 'Calça jeans masculina', 10, 30000, 3000, 'Thiago',
       'demo', 'Mensagem de exemplo do grupo da loja.', now() - interval '3 days'),
      (demo, 'kit com 3 meias', 30, 18000, 600, 'Norian Henrique',
       'demo', 'Mensagem de exemplo do grupo da loja.', now() - interval '3 days');
  end if;

  if not exists (
    select 1 from public.n8n_whatsapp_transactions
     where business_id = demo and source = 'demo'
  ) then
    insert into public.n8n_whatsapp_transactions (
      business_id, product_name, quantity, amount_cents, unit_price_cents,
      supplier_name, source, raw_input, created_at
    ) values
      (demo, 'Camiseta', 2, 24000, 12000, null,
       'demo', 'Mensagem de exemplo do grupo da loja.', now() - interval '2 days'),
      (demo, 'Calça jeans masculina', 1, 12000, 12000, null,
       'demo', 'Mensagem de exemplo do grupo da loja.', now() - interval '1 day'),
      (demo, 'kit com 3 meias', 3, 10800, 3600, null,
       'demo', 'Mensagem de exemplo do grupo da loja.', now() - interval '3 hours');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Reconstrói os dados regulares da demo a partir das mensagens do n8n
-- ----------------------------------------------------------------------------
create or replace function public.sync_whatsapp_demo(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  demo uuid := '1590b256-f558-4f64-9dac-525677f11c56';
  r record;
  v_supplier uuid;
  v_product uuid;
  v_purchase uuid;
  v_bill uuid;
  v_log uuid;
  v_transaction uuid;
  v_name text;
  v_key text;
  v_qty numeric;
  v_qty_bought numeric;
  v_qty_sold numeric;
  v_total_bought numeric;
  v_sale_unit numeric;
  v_unit_cost integer;
  v_total integer;
  v_cost integer;
  v_price integer;
  v_stock numeric;
  v_products integer;
  v_sales integer;
  v_purchases integer;
  v_open_bills integer;
  v_offers integer;
begin
  if p_business_id <> demo then
    raise exception 'Sincronização disponível apenas para a demo do WhatsApp.'
      using errcode = '42501';
  end if;

  if auth.uid() is null or not public.is_business_member(p_business_id) then
    raise exception 'Sem acesso a esta loja.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(2147483001);

  -- Fornecedores: ofertas e compras.
  for r in
    select
      lower(btrim(s.supplier_name)) as key,
      min(btrim(s.supplier_name)) as name,
      max(s.supplier_phone) as phone
    from (
      select supplier_name, supplier_phone
        from public.n8n_providers_group
       where business_id = p_business_id
      union all
      select supplier_name, null::text
        from public.n8n_whatsapp_purchases
       where business_id = p_business_id
    ) s
    where nullif(btrim(s.supplier_name), '') is not null
    group by lower(btrim(s.supplier_name))
  loop
    v_supplier := null;
    select id into v_supplier
      from public.suppliers
     where business_id = p_business_id
       and lower(btrim(name)) = r.key;

    if found then
      update public.suppliers
         set name = r.name,
             phone = coalesce(nullif(btrim(coalesce(r.phone, '')), ''), phone)
       where id = v_supplier;
    else
      insert into public.suppliers (business_id, name, phone)
      values (
        p_business_id,
        r.name,
        nullif(btrim(coalesce(r.phone, '')), '')
      )
      returning id into v_supplier;
    end if;
  end loop;

  -- Produtos: quantidade comprada, vendida, custo médio e preço de venda.
  for r in
    select
      lower(btrim(s.product_name)) as key,
      min(btrim(s.product_name)) as name
    from (
      select product_name from public.n8n_whatsapp_purchases
       where business_id = p_business_id
      union all
      select product_name from public.n8n_whatsapp_transactions
       where business_id = p_business_id
    ) s
    where nullif(btrim(s.product_name), '') is not null
    group by lower(btrim(s.product_name))
  loop
    v_key := r.key;
    v_name := r.name;

    select coalesce(sum(quantity), 0), coalesce(sum(total_cents), 0)
      into v_qty_bought, v_total_bought
      from public.n8n_whatsapp_purchases
     where business_id = p_business_id
       and lower(btrim(product_name)) = v_key;

    select
      coalesce(sum(quantity), 0),
      max(
        case
          when quantity > 0 then amount_cents::numeric / quantity
          else amount_cents::numeric
        end
      )
      into v_qty_sold, v_sale_unit
      from public.n8n_whatsapp_transactions
     where business_id = p_business_id
       and lower(btrim(product_name)) = v_key;

    v_stock := greatest(0, v_qty_bought - v_qty_sold);
    v_cost := case
      when v_qty_bought > 0 then round(v_total_bought / v_qty_bought)::integer
      else 0
    end;
    v_price := case
      when coalesce(v_sale_unit, 0) > 0 then round(v_sale_unit)::integer
      when v_cost > 0 then ceil(v_cost * 1.8 / 100.0)::integer * 100
      else 0
    end;

    select s.id into v_supplier
      from public.suppliers s
      join public.n8n_whatsapp_purchases pp
        on lower(btrim(pp.supplier_name)) = lower(btrim(s.name))
     where pp.business_id = p_business_id
       and s.business_id = p_business_id
       and lower(btrim(pp.product_name)) = v_key
     order by pp.created_at desc
     limit 1;

    v_product := null;
    select id into v_product
      from public.products
     where business_id = p_business_id
       and lower(btrim(name)) = v_key;

    if found then
      update public.products
         set name = v_name,
             stock = v_stock,
             cost_cents = v_cost,
             price_cents = v_price,
             supplier_id = coalesce(v_supplier, supplier_id),
             track_stock = true
       where id = v_product;
    else
      insert into public.products (
        business_id, name, unit, unit_plural, stock, min_stock,
        cost_cents, price_cents, track_stock, supplier_id
      ) values (
        p_business_id, v_name, 'un', 'un', v_stock, 2,
        v_cost, v_price, true, v_supplier
      )
      returning id into v_product;
    end if;
  end loop;

  -- Limpa somente os lançamentos gerados pela sincronização anterior.
  delete from public.purchases      where business_id = p_business_id;
  delete from public.bills          where business_id = p_business_id;
  delete from public.inventory_logs where business_id = p_business_id;
  delete from public.transactions   where business_id = p_business_id;

  -- Compras: cada compra vira conta a pagar + entrada de estoque.
  for r in
    select *
      from public.n8n_whatsapp_purchases
     where business_id = p_business_id
       and quantity > 0
       and total_cents > 0
     order by created_at
  loop
    v_name := btrim(r.product_name);
    v_qty := r.quantity;
    v_unit_cost := coalesce(r.unit_cost_cents, round(r.total_cents / r.quantity)::integer);
    v_total := coalesce(r.total_cents, round(v_unit_cost * r.quantity)::integer);

    v_product := null;
    select id into v_product
      from public.products
     where business_id = p_business_id
       and lower(btrim(name)) = lower(v_name);

    v_supplier := null;
    select id into v_supplier
      from public.suppliers
     where business_id = p_business_id
       and lower(btrim(name)) = lower(btrim(coalesce(r.supplier_name, '')));

    insert into public.bills (
      business_id, supplier_id, description, amount_cents, due_date,
      status, source_type, created_at
    ) values (
      p_business_id, v_supplier, 'Compra: ' || v_name, v_total,
      current_date + 7, 'open', 'whatsapp_import', coalesce(r.created_at, now())
    )
    returning id into v_bill;

    insert into public.purchases (
      business_id, supplier_id, product_id, product_name, quantity,
      unit_cost_cents, total_cents, bill_id, source_type, occurred_at, created_at
    ) values (
      p_business_id, v_supplier, v_product, v_name, v_qty,
      v_unit_cost, v_total, v_bill, 'whatsapp_import',
      coalesce(r.created_at, now()), coalesce(r.created_at, now())
    )
    returning id into v_purchase;

    insert into public.inventory_logs (
      business_id, product_id, direction, quantity, unit_cost_cents,
      source_type, status, occurred_at
    ) values (
      p_business_id, v_product, 'in', v_qty, v_unit_cost,
      'whatsapp_import', 'processed', coalesce(r.created_at, now())
    )
    returning id into v_log;

    update public.purchases
       set inventory_log_id = v_log
     where id = v_purchase;
  end loop;

  -- Vendas: cada venda vira lançamento de caixa + saída de estoque.
  for r in
    select *
      from public.n8n_whatsapp_transactions
     where business_id = p_business_id
       and quantity > 0
       and amount_cents > 0
     order by created_at
  loop
    v_name := btrim(r.product_name);
    v_qty := r.quantity;

    v_product := null;
    select id into v_product
      from public.products
     where business_id = p_business_id
       and lower(btrim(name)) = lower(v_name);

    insert into public.transactions (
      business_id, kind, description, amount_cents, quantity, product_id,
      source_type, status, raw_input, occurred_at, created_at
    ) values (
      p_business_id, 'sale', v_name, r.amount_cents, v_qty, v_product,
      'whatsapp_import', 'processed', r.raw_input,
      coalesce(r.created_at, now()), coalesce(r.created_at, now())
    )
    returning id into v_transaction;

    if v_product is not null then
      insert into public.inventory_logs (
        business_id, product_id, direction, quantity, transaction_id,
        source_type, status, occurred_at
      ) values (
        p_business_id, v_product, 'out', v_qty, v_transaction,
        'whatsapp_import', 'processed', coalesce(r.created_at, now())
      );
    end if;
  end loop;

  update public.n8n_whatsapp_transactions
     set imported_at = now()
   where business_id = p_business_id
     and imported_at is null;
  update public.n8n_whatsapp_purchases
     set imported_at = now()
   where business_id = p_business_id
     and imported_at is null;

  select count(*) into v_products from public.products where business_id = p_business_id;
  select count(*) into v_sales from public.transactions
   where business_id = p_business_id and kind = 'sale';
  select count(*) into v_purchases from public.purchases where business_id = p_business_id;
  select count(*) into v_open_bills from public.bills
   where business_id = p_business_id and status = 'open';
  select count(*) into v_offers from public.n8n_providers_group
   where business_id = p_business_id;

  return jsonb_build_object(
    'products', v_products,
    'sales', v_sales,
    'purchases', v_purchases,
    'open_bills', v_open_bills,
    'offers', v_offers
  );
end;
$$;

revoke all on function public.sync_whatsapp_demo(uuid) from public;
grant execute on function public.sync_whatsapp_demo(uuid) to authenticated;

commit;
