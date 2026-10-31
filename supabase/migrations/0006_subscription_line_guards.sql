-- Serialize edits with lifecycle changes; confirmed and later lines are immutable.
create or replace function public.guard_subscription_line()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_subscription_id uuid; v_status public.subscription_status;
begin
  if TG_OP = 'UPDATE' and new.subscription_id <> old.subscription_id then
    raise exception 'A line cannot be moved to another subscription';
  end if;
  v_subscription_id := case when TG_OP = 'DELETE' then old.subscription_id else new.subscription_id end;
  select status into v_status from public.subscriptions where id = v_subscription_id for update;
  if not found then
    -- The parent has already been removed during an authorized cascading delete.
    if TG_OP = 'DELETE' then return old; end if;
    raise exception 'Subscription not found';
  end if;
  if v_status not in ('draft', 'quotation') then
    raise exception 'Lines can only be changed while a subscription is draft or quotation';
  end if;
  if TG_OP <> 'DELETE' and new.variant_id is not null and not exists (
    select 1 from public.product_variants where id = new.variant_id and product_id = new.product_id
  ) then raise exception 'The selected variant does not belong to this product'; end if;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger subscription_line_guard
  before insert or update or delete on public.subscription_lines
  for each row execute function public.guard_subscription_line();
revoke all on function public.guard_subscription_line() from public, anon, authenticated;

-- Manual billing follows the same expiry boundary as the scheduled billing loop.
create or replace function public.bill_subscription_now(p_subscription_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.subscriptions;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  select * into s from public.subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'Subscription not found'; end if;
  if s.status <> 'active' then raise exception 'Only active subscriptions can be billed'; end if;
  if s.expiry_date is not null and coalesce(s.next_invoice_date, s.start_date) > s.expiry_date then
    raise exception 'Renew this subscription before billing beyond its expiry date';
  end if;
  return public._bill_subscription(p_subscription_id);
end $$;
revoke all on function public.bill_subscription_now(uuid) from public, anon;
grant execute on function public.bill_subscription_now(uuid) to authenticated;
