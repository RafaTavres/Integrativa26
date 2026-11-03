-- ============================================================================
-- Estokar — entrada de estoque transacional
-- ============================================================================

begin;

create or replace function public.register_stock_entry(
  p_business_id uuid,
  p_product_id uuid default null,
  p_name text default null,
  p_quantity numeric default 1,
  p_total_cost_cents integer default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_product_id uuid;
  v_name text;
  v_unit_cost integer;
  v_transaction_id uuid;
  v_stock numeric;
  v_new_stock numeric;
  v_cost integer;
  v_price integer;
begin
  if not public.can_write_business(p_business_id) then
    raise exception 'Sem permissão para dar entrada neste negócio.'
      using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade inválida.';
  end if;

  if p_total_cost_cents is null or p_total_cost_cents < 0 then
    raise exception 'Custo inválido.';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'Informe o nome do item.';
  end if;

  v_unit_cost := round(p_total_cost_cents / p_quantity)::integer;

  if p_product_id is not null then
    select *
      into v_product
      from public.products
     where id = p_product_id
       and business_id = p_business_id
       and track_stock
       for update;
  end if;

  if not found then
    select *
      into v_product
      from public.products
     where business_id = p_business_id
       and track_stock
       and lower(btrim(name)) = lower(v_name)
       for update;
  end if;

  if found then
    v_stock := v_product.stock;
    v_new_stock := v_stock + p_quantity;
    v_cost := case
      when v_new_stock > 0 then
        round((v_stock * v_product.cost_cents + p_total_cost_cents) / v_new_stock)::integer
      else
        v_unit_cost
    end;

    update public.products
       set name = v_name,
           stock = v_new_stock,
           cost_cents = v_cost
     where id = v_product.id;

    v_product_id := v_product.id;
  else
    v_price := case
      when v_unit_cost > 0 then
        greatest(100, ceil(v_unit_cost * 1.8 / 100.0)::integer * 100)
      else
        0
    end;

    insert into public.products (
      business_id, name, unit, unit_plural, stock, min_stock,
      cost_cents, price_cents, track_stock
    ) values (
      p_business_id, v_name, 'un', 'un', p_quantity, 2,
      v_unit_cost, v_price, true
    )
    returning id into v_product_id;
  end if;

  if p_total_cost_cents > 0 then
    insert into public.transactions (
      business_id, kind, description, amount_cents, payment_method,
      source_type, status, occurred_at
    ) values (
      p_business_id, 'expense', 'Compra: ' || v_name, p_total_cost_cents,
      'other', 'manual', 'processed', now()
    )
    returning id into v_transaction_id;
  end if;

  insert into public.inventory_logs (
    business_id, product_id, direction, quantity, unit_cost_cents,
    transaction_id, source_type, status, occurred_at
  ) values (
    p_business_id, v_product_id, 'in', p_quantity, v_unit_cost,
    v_transaction_id, 'manual', 'processed', now()
  );

  return jsonb_build_object(
    'product_id', v_product_id,
    'transaction_id', v_transaction_id
  );
end;
$$;

revoke all on function public.register_stock_entry(
  uuid, uuid, text, numeric, integer
) from public;
grant execute on function public.register_stock_entry(
  uuid, uuid, text, numeric, integer
) to authenticated;

commit;
