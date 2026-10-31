-- Save the rule and its product links together; preserve the billing-owned used_count.
create or replace function public.save_catalog_discount(p_id uuid, p_values jsonb, p_product_ids uuid[])
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_rule public.discounts;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change discounts' using errcode = '42501';
  end if;
  v_rule := jsonb_populate_record(null::public.discounts, p_values);
  if nullif(btrim(v_rule.name), '') is null then raise exception 'Discount name is required'; end if;
  if v_rule.scope = 'product' and coalesce(cardinality(p_product_ids), 0) = 0 then
    raise exception 'Pick at least one product';
  end if;
  if p_id is null then
    insert into public.discounts(name, code, discount_type, value, scope, min_purchase, min_quantity, start_date, end_date, usage_limit, active)
    values(v_rule.name, v_rule.code, v_rule.discount_type, v_rule.value, v_rule.scope, v_rule.min_purchase, v_rule.min_quantity, v_rule.start_date, v_rule.end_date, v_rule.usage_limit, v_rule.active)
    returning id into v_id;
  else
    update public.discounts set name=v_rule.name, code=v_rule.code, discount_type=v_rule.discount_type,
      value=v_rule.value, scope=v_rule.scope, min_purchase=v_rule.min_purchase, min_quantity=v_rule.min_quantity,
      start_date=v_rule.start_date, end_date=v_rule.end_date, usage_limit=v_rule.usage_limit, active=v_rule.active
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Discount not found'; end if;
  end if;
  delete from public.discount_products where discount_id=v_id;
  if v_rule.scope = 'product' then
    insert into public.discount_products(discount_id, product_id)
      select v_id, product_id from (select distinct unnest(p_product_ids) as product_id) selected;
  end if;
  return v_id;
end $$;
revoke all on function public.save_catalog_discount(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.save_catalog_discount(uuid, jsonb, uuid[]) to authenticated;
