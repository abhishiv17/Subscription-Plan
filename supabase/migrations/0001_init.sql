-- Brightloop Subscription Management System — core schema
-- Roles: admin (everything), staff (day-to-day ops), customer (portal: own data only)

-- ───────────────────────── enums ─────────────────────────
create type public.user_role as enum ('admin', 'staff', 'customer');
create type public.product_type as enum ('service', 'software', 'addon', 'goods');
create type public.billing_period as enum ('daily', 'weekly', 'monthly', 'yearly');
create type public.subscription_status as enum ('draft', 'quotation', 'confirmed', 'active', 'paused', 'closed');
create type public.invoice_status as enum ('draft', 'confirmed', 'paid', 'cancelled');
create type public.discount_type as enum ('fixed', 'percent');
create type public.discount_scope as enum ('subscription', 'product');
create type public.payment_method as enum ('cash', 'bank_transfer', 'card', 'upi', 'cheque', 'other');

-- ───────────────────────── users & customers ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (email = lower(email)),
  full_name text,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now()
);

-- A customer (billing contact). May or may not have a portal login (user_id).
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles (id) on delete set null,
  name text not null,
  email text not null unique check (email = lower(email)),
  phone text,
  company text,
  address text,
  created_at timestamptz not null default now()
);

-- ───────────────────────── role helpers ─────────────────────────
create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('admin', 'staff') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.my_customer_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.customers where user_id = auth.uid()
$$;

-- New sign-ups become customers. Staff/admin roles are only ever granted server-side.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := coalesce((new.raw_app_meta_data ->> 'role')::public.user_role, 'customer');
  v_name text := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, lower(new.email), v_name, v_role);

  if v_role = 'customer' then
    insert into public.customers (user_id, name, email, company)
    values (new.id, v_name, lower(new.email), new.raw_user_meta_data ->> 'company')
    on conflict (email) do update set user_id = excluded.user_id;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── catalogue ─────────────────────────
create table public.taxes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate numeric(5, 2) not null check (rate between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  product_type public.product_type not null default 'software',
  sales_price numeric(12, 2) not null default 0 check (sales_price >= 0),
  cost_price numeric(12, 2) not null default 0 check (cost_price >= 0),
  tax_id uuid references public.taxes (id) on delete set null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- e.g. attribute 'Brand', value 'Odoo', extra_price 560
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  attribute text not null,
  value text not null,
  extra_price numeric(12, 2) not null default 0,
  unique (product_id, attribute, value)
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(12, 2) not null default 0 check (price >= 0),
  billing_period public.billing_period not null default 'monthly',
  min_quantity integer not null default 1 check (min_quantity >= 1),
  start_date date,
  end_date date,
  auto_close boolean not null default false,
  closable boolean not null default true,
  pausable boolean not null default true,
  renewable boolean not null default true,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (start_date is null or end_date is null or end_date >= start_date)
);

create or replace function public.period_interval(p public.billing_period) returns interval
language sql immutable set search_path = '' as $$
  select case p
    when 'daily' then interval '1 day'
    when 'weekly' then interval '7 days'
    when 'monthly' then interval '1 month'
    else interval '1 year'
  end
$$;

create table public.quotation_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan_id uuid references public.plans (id) on delete set null,
  validity_days integer not null default 30 check (validity_days > 0),
  payment_terms_days integer not null default 15 check (payment_terms_days >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table public.quotation_template_lines (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.quotation_templates (id) on delete cascade,
  product_id uuid not null references public.products (id),
  variant_id uuid references public.product_variants (id) on delete set null,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) check (unit_price >= 0),
  tax_id uuid references public.taxes (id) on delete set null
);

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  discount_type public.discount_type not null,
  value numeric(12, 2) not null check (value > 0),
  scope public.discount_scope not null default 'subscription',
  min_purchase numeric(12, 2) not null default 0 check (min_purchase >= 0),
  min_quantity numeric(12, 2) not null default 0 check (min_quantity >= 0),
  start_date date,
  end_date date,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  used_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (discount_type <> 'percent' or value <= 100),
  check (start_date is null or end_date is null or end_date >= start_date)
);

create table public.discount_products (
  discount_id uuid not null references public.discounts (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (discount_id, product_id)
);

-- ───────────────────────── subscriptions ─────────────────────────
create sequence public.subscription_number_seq;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  number text not null unique
    default 'SUB-' || lpad(nextval('public.subscription_number_seq')::text, 5, '0'),
  customer_id uuid not null references public.customers (id) on delete restrict,
  plan_id uuid not null references public.plans (id),
  template_id uuid references public.quotation_templates (id) on delete set null,
  discount_id uuid references public.discounts (id) on delete set null,
  status public.subscription_status not null default 'draft',
  start_date date not null default current_date,
  expiry_date date,
  quotation_valid_until date,
  payment_terms_days integer not null default 15 check (payment_terms_days >= 0),
  next_invoice_date date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expiry_date is null or expiry_date >= start_date)
);

create table public.subscription_lines (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  product_id uuid not null references public.products (id),
  variant_id uuid references public.product_variants (id) on delete set null,
  description text,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  tax_id uuid references public.taxes (id) on delete set null,
  amount numeric(14, 2) generated always as (round(quantity * unit_price, 2)) stored
);

-- Lifecycle: draft → quotation → confirmed → active ⇄ paused → closed
create or replace function public.check_subscription_transition() returns trigger
language plpgsql set search_path = '' as $$
declare
  p public.plans;
  v_qty numeric;
  v_validity integer;
begin
  new.updated_at := now();
  if new.status = old.status then return new; end if;

  if not (old.status::text || '>' || new.status::text = any (array[
    'draft>quotation', 'quotation>draft', 'quotation>confirmed', 'draft>confirmed',
    'confirmed>active', 'active>paused', 'paused>active',
    'active>closed', 'paused>closed', 'draft>closed', 'quotation>closed', 'confirmed>closed'
  ])) then
    raise exception 'Subscription % cannot move from % to %', old.number, old.status, new.status;
  end if;

  select * into p from public.plans where id = new.plan_id;

  if new.status = 'quotation' and new.quotation_valid_until is null then
    select validity_days into v_validity from public.quotation_templates where id = new.template_id;
    new.quotation_valid_until := current_date + coalesce(v_validity, 30);
  end if;

  if new.status = 'confirmed' then
    if old.status = 'quotation' and new.quotation_valid_until < current_date then
      raise exception 'Quotation % expired on %', old.number, new.quotation_valid_until;
    end if;
    select coalesce(sum(quantity), 0) into v_qty from public.subscription_lines where subscription_id = new.id;
    if v_qty = 0 then
      raise exception 'Add at least one product line before confirming';
    end if;
    if v_qty < p.min_quantity then
      raise exception 'Plan "%" needs a minimum quantity of %', p.name, p.min_quantity;
    end if;
    if (p.start_date is not null and new.start_date < p.start_date)
       or (p.end_date is not null and new.start_date > p.end_date) then
      raise exception 'Plan "%" is not available on %', p.name, new.start_date;
    end if;
  end if;

  if new.status = 'active' and new.next_invoice_date is null then
    new.next_invoice_date := new.start_date;
  end if;

  if new.status = 'paused' and not p.pausable then
    raise exception 'Plan "%" does not allow pausing', p.name;
  end if;

  -- Closing before the end date is an early close; only allowed if the plan permits it.
  if new.status = 'closed' and old.status in ('active', 'paused') and not p.closable
     and (coalesce(new.expiry_date, p.end_date) is null or coalesce(new.expiry_date, p.end_date) >= current_date) then
    raise exception 'Plan "%" does not allow closing early', p.name;
  end if;

  return new;
end $$;

create trigger subscriptions_transition
  before update on public.subscriptions
  for each row execute function public.check_subscription_transition();

-- ───────────────────────── invoices & payments ─────────────────────────
create sequence public.invoice_number_seq;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique
    default 'INV-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0'),
  subscription_id uuid references public.subscriptions (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  status public.invoice_status not null default 'draft',
  invoice_date date not null default current_date,
  due_date date not null default current_date,
  period_start date,
  period_end date,
  subtotal numeric(14, 2) not null default 0,
  discount_total numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  amount_paid numeric(14, 2) not null default 0,
  sent_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

-- Never bill the same subscription period twice.
create unique index invoices_one_per_period
  on public.invoices (subscription_id, period_start)
  where status <> 'cancelled' and subscription_id is not null;

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  subtotal numeric(14, 2) not null default 0,
  discount_amount numeric(14, 2) not null default 0,
  tax_rate numeric(5, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0
);

create table public.invoice_discounts (
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  discount_id uuid not null references public.discounts (id) on delete cascade,
  amount numeric(14, 2) not null default 0,
  primary key (invoice_id, discount_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  method public.payment_method not null,
  amount numeric(14, 2) not null check (amount > 0),
  payment_date date not null default current_date,
  note text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- Invoice lifecycle: draft → confirmed → paid (cancelled from draft/confirmed)
create or replace function public.check_invoice_transition() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = old.status then return new; end if;
  if not (old.status::text || '>' || new.status::text = any (array[
    'draft>confirmed', 'draft>cancelled', 'confirmed>cancelled', 'confirmed>paid', 'paid>confirmed'
  ])) then
    raise exception 'Invoice % cannot move from % to %', old.number, old.status, new.status;
  end if;
  if new.status = 'cancelled' and old.amount_paid > 0 then
    raise exception 'Invoice % has payments and cannot be cancelled', old.number;
  end if;
  if new.status = 'paid' and new.amount_paid < new.total then
    raise exception 'Invoice % is not fully paid', old.number;
  end if;
  return new;
end $$;

create trigger invoices_transition
  before update on public.invoices
  for each row execute function public.check_invoice_transition();

create or replace function public.check_payment() returns trigger
language plpgsql set search_path = '' as $$
declare
  i public.invoices;
begin
  select * into i from public.invoices where id = new.invoice_id for update;
  if i.status <> 'confirmed' then
    raise exception 'Payments can only be recorded against confirmed invoices (% is %)', i.number, i.status;
  end if;
  if new.amount > i.total - i.amount_paid then
    raise exception 'Payment of % exceeds the % still due on %', new.amount, i.total - i.amount_paid, i.number;
  end if;
  return new;
end $$;

create trigger payments_check
  before insert on public.payments
  for each row execute function public.check_payment();

create or replace function public.sync_invoice_payments() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  v_paid numeric;
begin
  select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = v_invoice;
  update public.invoices
     set amount_paid = v_paid,
         status = case
           when status in ('confirmed', 'paid') and v_paid >= total then 'paid'::public.invoice_status
           when status = 'paid' and v_paid < total then 'confirmed'::public.invoice_status
           else status end
   where id = v_invoice;
  return null;
end $$;

create trigger payments_sync
  after insert or update or delete on public.payments
  for each row execute function public.sync_invoice_payments();

-- ───────────────────────── billing engine ─────────────────────────
-- Bills the next due period of one active subscription. Returns the invoice id,
-- or null if that period was already invoiced (it then just advances the schedule).
create or replace function public._bill_subscription(p_subscription_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s public.subscriptions;
  p public.plans;
  d public.discounts;
  l record;
  v_invoice uuid;
  v_start date;
  v_end date;
  v_line_sub numeric;
  v_line_disc numeric;
  v_net numeric;
  v_qty numeric;
  v_disc numeric;
begin
  select * into s from public.subscriptions where id = p_subscription_id for update;
  if s.status <> 'active' then
    raise exception 'Subscription % is not active', s.number;
  end if;
  select * into p from public.plans where id = s.plan_id;

  v_start := coalesce(s.next_invoice_date, s.start_date);
  v_end := (v_start + public.period_interval(p.billing_period))::date - 1;

  if exists (select 1 from public.invoices
             where subscription_id = s.id and period_start = v_start and status <> 'cancelled') then
    update public.subscriptions set next_invoice_date = v_end + 1 where id = s.id;
    return null;
  end if;

  insert into public.invoices (subscription_id, customer_id, invoice_date, due_date, period_start, period_end)
  values (s.id, s.customer_id, v_start, v_start + s.payment_terms_days, v_start, v_end)
  returning id into v_invoice;

  -- Lines, with the best product-level discount applied automatically
  for l in
    select sl.*, pr.name as product_name, v.attribute, v.value as variant_value, coalesce(t.rate, 0) as rate
      from public.subscription_lines sl
      join public.products pr on pr.id = sl.product_id
      left join public.product_variants v on v.id = sl.variant_id
      left join public.taxes t on t.id = sl.tax_id
     where sl.subscription_id = s.id
  loop
    v_line_sub := round(l.quantity * l.unit_price, 2);
    v_line_disc := 0;

    select dc.* into d
      from public.discounts dc
      join public.discount_products dp on dp.discount_id = dc.id
     where dp.product_id = l.product_id
       and dc.scope = 'product' and dc.active
       and (dc.start_date is null or dc.start_date <= v_start)
       and (dc.end_date is null or dc.end_date >= v_start)
       and (dc.usage_limit is null or dc.used_count < dc.usage_limit)
       and v_line_sub >= dc.min_purchase
       and l.quantity >= dc.min_quantity
     order by case when dc.discount_type = 'percent' then v_line_sub * dc.value / 100 else dc.value end desc
     limit 1;

    if found then
      v_line_disc := least(v_line_sub, round(case when d.discount_type = 'percent'
                                                   then v_line_sub * d.value / 100 else d.value end, 2));
      insert into public.invoice_discounts (invoice_id, discount_id, amount)
      values (v_invoice, d.id, v_line_disc)
      on conflict (invoice_id, discount_id) do update set amount = public.invoice_discounts.amount + excluded.amount;
    end if;

    insert into public.invoice_lines
      (invoice_id, product_id, variant_id, description, quantity, unit_price, subtotal, discount_amount, tax_rate)
    values
      (v_invoice, l.product_id, l.variant_id,
       coalesce(l.description, l.product_name || coalesce(' (' || l.attribute || ': ' || l.variant_value || ')', '')),
       l.quantity, l.unit_price, v_line_sub, v_line_disc, l.rate);
  end loop;

  -- Subscription-level discount, spread across lines in proportion to their value
  if s.discount_id is not null then
    select coalesce(sum(subtotal - discount_amount), 0), coalesce(sum(quantity), 0)
      into v_net, v_qty
      from public.invoice_lines where invoice_id = v_invoice;

    select * into d from public.discounts dc
     where dc.id = s.discount_id and dc.scope = 'subscription' and dc.active
       and (dc.start_date is null or dc.start_date <= v_start)
       and (dc.end_date is null or dc.end_date >= v_start)
       and (dc.usage_limit is null or dc.used_count < dc.usage_limit)
       and v_net >= dc.min_purchase and v_qty >= dc.min_quantity;

    if found and v_net > 0 then
      v_disc := least(v_net, round(case when d.discount_type = 'percent' then v_net * d.value / 100 else d.value end, 2));
      update public.invoice_lines
         set discount_amount = discount_amount + round((subtotal - discount_amount) / v_net * v_disc, 2)
       where invoice_id = v_invoice;
      insert into public.invoice_discounts (invoice_id, discount_id, amount)
      values (v_invoice, d.id, v_disc)
      on conflict (invoice_id, discount_id) do update set amount = public.invoice_discounts.amount + excluded.amount;
    end if;
  end if;

  update public.invoice_lines
     set tax_amount = round((subtotal - discount_amount) * tax_rate / 100, 2),
         total = (subtotal - discount_amount) + round((subtotal - discount_amount) * tax_rate / 100, 2)
   where invoice_id = v_invoice;

  update public.invoices i
     set subtotal = x.subtotal, discount_total = x.disc, tax_total = x.tax, total = x.total
    from (select sum(subtotal) subtotal, sum(discount_amount) disc, sum(tax_amount) tax, sum(total) total
            from public.invoice_lines where invoice_id = v_invoice) x
   where i.id = v_invoice;

  update public.discounts
     set used_count = used_count + 1
   where id in (select discount_id from public.invoice_discounts where invoice_id = v_invoice);

  update public.subscriptions set next_invoice_date = v_end + 1 where id = s.id;
  return v_invoice;
end $$;

-- Bills every due period of every active subscription up to p_as_of (catching up missed periods),
-- then auto-closes subscriptions whose plan closes on its own after the end date.
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
      if public._bill_subscription(r.id) is not null then
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

revoke all on function public._bill_subscription(uuid) from public, anon, authenticated;
revoke all on function public._run_billing(date) from public, anon, authenticated;

-- ───────────────────────── RPCs for the app ─────────────────────────
create or replace function public.run_billing(p_as_of date default current_date) returns json
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  return public._run_billing(p_as_of);
end $$;

create or replace function public.bill_subscription_now(p_subscription_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  return public._bill_subscription(p_subscription_id);
end $$;

create or replace function public.renew_subscription(p_subscription_id uuid, p_periods integer default 1)
returns public.subscriptions
language plpgsql security definer set search_path = '' as $$
declare
  s public.subscriptions;
  p public.plans;
begin
  select * into s from public.subscriptions where id = p_subscription_id for update;
  if not (public.is_staff() or s.customer_id = public.my_customer_id()) then raise exception 'Not allowed'; end if;
  select * into p from public.plans where id = s.plan_id;
  if not p.renewable then raise exception 'Plan "%" cannot be renewed', p.name; end if;
  if s.status not in ('active', 'paused') then raise exception 'Only active or paused subscriptions can be renewed'; end if;

  update public.subscriptions
     set expiry_date = (coalesce(expiry_date, current_date) + public.period_interval(p.billing_period) * p_periods)::date
   where id = s.id
   returning * into s;
  return s;
end $$;

-- Customer self-service from the portal: pause, resume or close their own subscription.
create or replace function public.portal_set_subscription_status(p_subscription_id uuid, p_status public.subscription_status)
returns public.subscriptions
language plpgsql security definer set search_path = '' as $$
declare
  s public.subscriptions;
begin
  if p_status not in ('paused', 'active', 'closed') then raise exception 'Not allowed'; end if;
  update public.subscriptions set status = p_status
   where id = p_subscription_id and customer_id = public.my_customer_id()
     and status in ('active', 'paused')
   returning * into s;
  if s.id is null then raise exception 'Subscription not found'; end if;
  return s;
end $$;

-- Customer pays an invoice from the portal (demo payment, recorded like any other).
create or replace function public.portal_pay_invoice(p_invoice_id uuid, p_method public.payment_method default 'card')
returns public.payments
language plpgsql security definer set search_path = '' as $$
declare
  i public.invoices;
  pay public.payments;
begin
  select * into i from public.invoices where id = p_invoice_id and customer_id = public.my_customer_id();
  if i.id is null then raise exception 'Invoice not found'; end if;
  insert into public.payments (invoice_id, method, amount, note)
  values (i.id, p_method, i.total - i.amount_paid, 'Paid via customer portal')
  returning * into pay;
  return pay;
end $$;

create or replace function public.dashboard_summary(p_from date default null, p_to date default null) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v_from date := coalesce(p_from, date_trunc('month', current_date)::date);
  v_to date := coalesce(p_to, current_date);
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  return json_build_object(
    'from', v_from, 'to', v_to,
    'active_subscriptions', (select count(*) from public.subscriptions where status = 'active'),
    'subscriptions_by_status', (select coalesce(json_object_agg(status, n), '{}'::json)
                                  from (select status, count(*) n from public.subscriptions group by status) x),
    'mrr', (select coalesce(round(sum(case p.billing_period
                                        when 'daily' then sl.amount * 30
                                        when 'weekly' then sl.amount * 52 / 12
                                        when 'monthly' then sl.amount
                                        else sl.amount / 12 end), 2), 0)
              from public.subscriptions s
              join public.plans p on p.id = s.plan_id
              join public.subscription_lines sl on sl.subscription_id = s.id
             where s.status = 'active'),
    'revenue', (select coalesce(sum(amount), 0) from public.payments where payment_date between v_from and v_to),
    'invoiced', (select coalesce(sum(total), 0) from public.invoices
                  where status in ('confirmed', 'paid') and invoice_date between v_from and v_to),
    'outstanding', (select coalesce(sum(total - amount_paid), 0) from public.invoices where status = 'confirmed'),
    'overdue_amount', (select coalesce(sum(total - amount_paid), 0) from public.invoices
                        where status = 'confirmed' and due_date < current_date),
    'overdue_count', (select count(*) from public.invoices where status = 'confirmed' and due_date < current_date),
    'revenue_by_month', (select coalesce(json_agg(x order by x.month), '[]'::json) from (
                           select to_char(date_trunc('month', payment_date), 'YYYY-MM') as month, sum(amount) as amount
                             from public.payments
                            where payment_date >= date_trunc('month', current_date) - interval '11 months'
                            group by 1) x)
  );
end $$;

-- ───────────────────────── list views (RLS applies via security_invoker) ─────────────────────────
create view public.subscription_overview with (security_invoker = true) as
select s.*,
       c.name as customer_name, c.email as customer_email,
       p.name as plan_name, p.billing_period,
       coalesce((select sum(sl.amount) from public.subscription_lines sl where sl.subscription_id = s.id), 0) as recurring_amount
  from public.subscriptions s
  join public.customers c on c.id = s.customer_id
  join public.plans p on p.id = s.plan_id;

create view public.invoice_overview with (security_invoker = true) as
select i.*,
       c.name as customer_name, c.email as customer_email,
       s.number as subscription_number,
       i.total - i.amount_paid as amount_due,
       (i.status = 'confirmed' and i.due_date < current_date) as is_overdue
  from public.invoices i
  join public.customers c on c.id = i.customer_id
  left join public.subscriptions s on s.id = i.subscription_id;

-- ───────────────────────── indexes (keep pages < 2s at thousands of rows) ─────────────────────────
create index on public.customers (user_id);
create index on public.product_variants (product_id);
create index on public.quotation_template_lines (template_id);
create index on public.discount_products (product_id);
create index on public.subscriptions (customer_id);
create index on public.subscriptions (plan_id);
create index on public.subscriptions (status, next_invoice_date);
create index on public.subscriptions (created_at desc);
create index on public.subscription_lines (subscription_id);
create index on public.invoices (customer_id);
create index on public.invoices (subscription_id);
create index on public.invoices (status, due_date);
create index on public.invoices (invoice_date desc);
create index on public.invoice_lines (invoice_id);
create index on public.payments (invoice_id);
create index on public.payments (payment_date);

-- ───────────────────────── row level security ─────────────────────────
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.taxes enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.plans enable row level security;
alter table public.quotation_templates enable row level security;
alter table public.quotation_template_lines enable row level security;
alter table public.discounts enable row level security;
alter table public.discount_products enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_lines enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_discounts enable row level security;
alter table public.payments enable row level security;

-- profiles: see yourself; staff see everyone; only admin changes roles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));
create policy profiles_update on public.profiles for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- customers
create policy customers_select on public.customers for select to authenticated
  using ((select public.is_staff()) or user_id = (select auth.uid()));
create policy customers_insert on public.customers for insert to authenticated
  with check ((select public.is_staff()));
create policy customers_update on public.customers for update to authenticated
  using ((select public.is_staff()) or user_id = (select auth.uid()))
  with check ((select public.is_staff()) or user_id = (select auth.uid()));
create policy customers_delete on public.customers for delete to authenticated
  using ((select public.is_admin()));

-- catalogue: everyone signed in can read; only admin writes
create policy taxes_select on public.taxes for select to authenticated using (true);
create policy taxes_write on public.taxes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy products_select on public.products for select to authenticated using (true);
create policy products_write on public.products for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy variants_select on public.product_variants for select to authenticated using (true);
create policy variants_write on public.product_variants for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy plans_select on public.plans for select to authenticated using (true);
create policy plans_write on public.plans for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- quotation templates: staff
create policy templates_all on public.quotation_templates for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy template_lines_all on public.quotation_template_lines for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- discounts: staff read, admin writes
create policy discounts_select on public.discounts for select to authenticated using ((select public.is_staff()));
create policy discounts_write on public.discounts for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy discount_products_select on public.discount_products for select to authenticated using ((select public.is_staff()));
create policy discount_products_write on public.discount_products for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- subscriptions: staff manage; customers read their own
create policy subscriptions_select on public.subscriptions for select to authenticated
  using ((select public.is_staff()) or customer_id = (select public.my_customer_id()));
create policy subscriptions_insert on public.subscriptions for insert to authenticated
  with check ((select public.is_staff()));
create policy subscriptions_update on public.subscriptions for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy subscriptions_delete on public.subscriptions for delete to authenticated
  using ((select public.is_admin()) and status = 'draft');

create policy subscription_lines_select on public.subscription_lines for select to authenticated
  using ((select public.is_staff()) or exists (
    select 1 from public.subscriptions s where s.id = subscription_id and s.customer_id = (select public.my_customer_id())));
create policy subscription_lines_write on public.subscription_lines for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- invoices: staff manage; customers read their own
create policy invoices_select on public.invoices for select to authenticated
  using ((select public.is_staff()) or customer_id = (select public.my_customer_id()));
create policy invoices_insert on public.invoices for insert to authenticated
  with check ((select public.is_staff()));
create policy invoices_update on public.invoices for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy invoices_delete on public.invoices for delete to authenticated
  using ((select public.is_admin()) and status = 'draft');

create policy invoice_lines_select on public.invoice_lines for select to authenticated
  using ((select public.is_staff()) or exists (
    select 1 from public.invoices i where i.id = invoice_id and i.customer_id = (select public.my_customer_id())));
create policy invoice_lines_write on public.invoice_lines for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

create policy invoice_discounts_select on public.invoice_discounts for select to authenticated
  using ((select public.is_staff()) or exists (
    select 1 from public.invoices i where i.id = invoice_id and i.customer_id = (select public.my_customer_id())));

-- payments: staff record; customers read their own
create policy payments_select on public.payments for select to authenticated
  using ((select public.is_staff()) or exists (
    select 1 from public.invoices i where i.id = invoice_id and i.customer_id = (select public.my_customer_id())));
create policy payments_write on public.payments for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
