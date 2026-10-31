-- Phase 5 and 6: invoice issuing and integrity, discount details, the portal profile and subscription history.

-- ───────────── Billing issues confirmed invoices ─────────────
-- Customers can see and pay billing invoices immediately. Zero-value invoices need no payment.
create or replace function public._issue_subscription_invoice(p_subscription_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice uuid;
  v_total numeric;
begin
  v_invoice := public._bill_subscription(p_subscription_id);
  if v_invoice is not null then
    update public.invoices set status = 'confirmed' where id = v_invoice returning total into v_total;
    if v_total = 0 then
      update public.invoices set status = 'paid' where id = v_invoice;
    end if;
  end if;
  return v_invoice;
end $$;
revoke all on function public._issue_subscription_invoice(uuid) from public, anon, authenticated;

create or replace function public._run_billing(p_as_of date default current_date) returns json
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_next date;
  v_expiry date;
  v_created integer := 0;
  v_closed integer := 0;
begin
  for r in
    select id from public.subscriptions
     where status = 'active' and next_invoice_date <= p_as_of
       and (expiry_date is null or next_invoice_date <= expiry_date)
     order by next_invoice_date
  loop
    loop
      select next_invoice_date, expiry_date into v_next, v_expiry from public.subscriptions where id = r.id;
      exit when v_next > p_as_of or (v_expiry is not null and v_next > v_expiry);
      if public._issue_subscription_invoice(r.id) is not null then
        v_created := v_created + 1;
      end if;
    end loop;
  end loop;

  update public.subscriptions s
     set status = 'closed'
    from public.plans p
   where p.id = s.plan_id and p.auto_close
     and s.status in ('active', 'paused')
     and least(s.expiry_date, p.end_date) < p_as_of;
  get diagnostics v_closed = row_count;

  return json_build_object('invoices_created', v_created, 'subscriptions_closed', v_closed);
end $$;
revoke all on function public._run_billing(date) from public, anon, authenticated;

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
  return public._issue_subscription_invoice(p_subscription_id);
end $$;
revoke all on function public.bill_subscription_now(uuid) from public, anon;
grant execute on function public.bill_subscription_now(uuid) to authenticated;

-- ───────────── Invoice integrity ─────────────
-- Invoices, lines and amounts come only from the billing engine. App users may change the
-- status (still checked by invoices_transition), the due date, notes and the sent time.
create or replace function public.guard_invoice_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and (
       new.number, new.subscription_id, new.customer_id, new.invoice_date, new.period_start, new.period_end,
       new.subtotal, new.discount_total, new.tax_total, new.total, new.amount_paid, new.created_at
     ) is distinct from (
       old.number, old.subscription_id, old.customer_id, old.invoice_date, old.period_start, old.period_end,
       old.subtotal, old.discount_total, old.tax_total, old.total, old.amount_paid, old.created_at
     ) then
    raise exception 'Invoice amounts, dates and parties are set by billing and cannot be edited';
  end if;
  if current_user = 'authenticated' and new.sent_at is distinct from old.sent_at and new.status not in ('confirmed', 'paid') then
    raise exception 'Only confirmed or paid invoices can be marked as sent';
  end if;
  return new;
end $$;
create trigger invoices_guard
  before update on public.invoices
  for each row execute function public.guard_invoice_update();
revoke all on function public.guard_invoice_update() from public, anon, authenticated;

drop policy invoices_insert on public.invoices;
drop policy invoice_lines_write on public.invoice_lines;

-- Payments are recorded once and never edited (an edit would skip the overpayment check).
-- Admins may delete a mistaken payment; the invoice balance and status follow automatically.
drop policy payments_write on public.payments;
create policy payments_insert on public.payments for insert to authenticated
  with check ((select public.is_staff()));
create policy payments_delete on public.payments for delete to authenticated
  using ((select public.is_admin()));

-- A cancelled invoice gives back the discount uses it consumed.
create or replace function public.release_invoice_discounts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.discounts d
     set used_count = greatest(d.used_count - 1, 0)
   where d.id in (select discount_id from public.invoice_discounts where invoice_id = new.id);
  return null;
end $$;
create trigger invoices_release_discounts
  after update of status on public.invoices
  for each row when (new.status = 'cancelled' and old.status <> 'cancelled')
  execute function public.release_invoice_discounts();
revoke all on function public.release_invoice_discounts() from public, anon, authenticated;

-- Discount names for an invoice. Customers cannot read the discounts table (codes stay private),
-- so this returns only what the invoice document needs, for invoices the caller may see.
create or replace function public.invoice_discount_details(p_invoice_id uuid)
returns table (discount_id uuid, name text, discount_type public.discount_type, value numeric, scope public.discount_scope, amount numeric)
language sql stable security definer set search_path = '' as $$
  select d.id, d.name, d.discount_type, d.value, d.scope, x.amount
    from public.invoice_discounts x
    join public.discounts d on d.id = x.discount_id
   where x.invoice_id = p_invoice_id
     and exists (select 1 from public.invoices i
                  where i.id = p_invoice_id
                    and (public.is_staff() or (i.customer_id = public.my_customer_id() and i.status <> 'draft')))
   order by x.amount desc, d.name
$$;
revoke all on function public.invoice_discount_details(uuid) from public, anon;
grant execute on function public.invoice_discount_details(uuid) to authenticated;

-- ───────────── Customer self-service profile ─────────────
-- Customers previously could update their whole row (including the billing email) directly.
-- Now only staff update customers; customers go through portal_update_profile.
drop policy customers_update on public.customers;
create policy customers_update on public.customers for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

create or replace function public.portal_update_profile(p_name text, p_phone text, p_company text, p_address text)
returns public.customers
language plpgsql security definer set search_path = '' as $$
declare
  c public.customers;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_company text := nullif(btrim(coalesce(p_company, '')), '');
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
begin
  if v_name = '' then raise exception 'Enter your name'; end if;
  if length(v_name) > 120 then raise exception 'Name must be 120 characters or fewer'; end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9][0-9 ()-]{5,24}$' then
    raise exception 'Enter a valid phone number';
  end if;
  if length(v_company) > 120 then raise exception 'Company must be 120 characters or fewer'; end if;
  if length(v_address) > 500 then raise exception 'Address must be 500 characters or fewer'; end if;

  update public.customers
     set name = v_name, phone = v_phone, company = v_company, address = v_address
   where user_id = auth.uid()
   returning * into c;
  if c.id is null then raise exception 'No customer profile is linked to this account'; end if;
  update public.profiles set full_name = v_name where id = auth.uid();
  return c;
end $$;
revoke all on function public.portal_update_profile(text, text, text, text) from public, anon;
grant execute on function public.portal_update_profile(text, text, text, text) to authenticated;

-- ───────────── Subscription history ─────────────
create table public.subscription_events (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  event text not null check (event in ('created', 'status', 'expiry')),
  from_status public.subscription_status,
  to_status public.subscription_status,
  expiry_date date,
  actor uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.subscription_events (subscription_id, created_at);
alter table public.subscription_events enable row level security;
-- Written only by the trigger below; staff and the owning customer can read.
create policy subscription_events_select on public.subscription_events for select to authenticated
  using ((select public.is_staff()) or exists (
    select 1 from public.subscriptions s where s.id = subscription_id and s.customer_id = (select public.my_customer_id())));

create or replace function public.log_subscription_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.subscription_events (subscription_id, event, to_status, expiry_date, actor)
    values (new.id, 'created', new.status, new.expiry_date, auth.uid());
    return null;
  end if;
  if new.status is distinct from old.status then
    insert into public.subscription_events (subscription_id, event, from_status, to_status, expiry_date, actor)
    values (new.id, 'status', old.status, new.status, new.expiry_date, auth.uid());
  end if;
  if new.expiry_date is distinct from old.expiry_date then
    insert into public.subscription_events (subscription_id, event, from_status, to_status, expiry_date, actor)
    values (new.id, 'expiry', old.status, new.status, new.expiry_date, auth.uid());
  end if;
  return null;
end $$;
create trigger subscriptions_log_events
  after insert or update of status, expiry_date on public.subscriptions
  for each row execute function public.log_subscription_event();
revoke all on function public.log_subscription_event() from public, anon, authenticated;
