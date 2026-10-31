-- A variant must belong to the selected product, even for direct API writes.
create or replace function public.guard_template_variant()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.variant_id is not null and not exists (
    select 1 from public.product_variants where id = new.variant_id and product_id = new.product_id
  ) then raise exception 'The selected variant does not belong to this product'; end if;
  return new;
end $$;
create trigger template_line_variant_guard
  before insert or update of product_id, variant_id on public.quotation_template_lines
  for each row execute function public.guard_template_variant();
revoke all on function public.guard_template_variant() from public, anon, authenticated;

-- Snapshot the template and write its draft and lines in one transaction.
create or replace function public.create_subscription_from_template(
  p_template_id uuid, p_customer_id uuid, p_start_date date default current_date,
  p_expiry_date date default null, p_discount_id uuid default null,
  p_notes text default null, p_plan_id uuid default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_template public.quotation_templates;
  v_lines jsonb;
  v_snapshot jsonb;
  v_plan_id uuid;
  v_subscription_id uuid;
begin
  if not public.is_staff() then raise exception 'Only staff can create subscriptions' using errcode = '42501'; end if;
  -- One statement reads the header and lines from the same database snapshot.
  select jsonb_build_object('template', to_jsonb(t), 'lines',
    (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
    from public.quotation_template_lines l where l.template_id = t.id))
    into v_snapshot from public.quotation_templates t where t.id = p_template_id;
  if not found then raise exception 'Quotation template not found'; end if;
  v_template := jsonb_populate_record(null::public.quotation_templates, v_snapshot -> 'template');
  v_lines := v_snapshot -> 'lines';
  v_plan_id := coalesce(p_plan_id, v_template.plan_id);
  if v_plan_id is null then raise exception 'Choose a plan or assign one to the template'; end if;
  if not exists(select 1 from public.plans where id = v_plan_id and active) then
    raise exception 'The selected plan is inactive or unavailable';
  end if;
  if jsonb_array_length(v_lines) = 0 then raise exception 'Add at least one template line before creating a subscription'; end if;
  if exists (
    select 1 from jsonb_populate_recordset(null::public.quotation_template_lines, v_lines) l
    left join public.products p on p.id = l.product_id
    left join public.product_variants v on v.id = l.variant_id and v.product_id = l.product_id
    where p.id is null or not p.active or (l.variant_id is not null and v.id is null)
  ) then raise exception 'A template product is inactive, unavailable, or has an invalid variant'; end if;
  insert into public.subscriptions(customer_id, plan_id, template_id, discount_id, start_date,
    expiry_date, payment_terms_days, notes, status)
    values(p_customer_id, v_plan_id, p_template_id, p_discount_id, coalesce(p_start_date, current_date),
      p_expiry_date, v_template.payment_terms_days, coalesce(p_notes, v_template.notes), 'draft')
    returning id into v_subscription_id;
  insert into public.subscription_lines(subscription_id, product_id, variant_id, quantity, unit_price, tax_id)
    select v_subscription_id, l.product_id, l.variant_id, l.quantity,
      coalesce(l.unit_price, p.sales_price + coalesce(v.extra_price, 0)), coalesce(l.tax_id, p.tax_id)
    from jsonb_populate_recordset(null::public.quotation_template_lines, v_lines) l
    join public.products p on p.id = l.product_id
    left join public.product_variants v on v.id = l.variant_id and v.product_id = l.product_id;
  return v_subscription_id;
end $$;
revoke all on function public.create_subscription_from_template(uuid, uuid, date, date, uuid, text, uuid) from public, anon;
grant execute on function public.create_subscription_from_template(uuid, uuid, date, date, uuid, text, uuid) to authenticated;
