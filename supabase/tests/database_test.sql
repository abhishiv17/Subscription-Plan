-- Database tests: lifecycle transitions, billing maths, discounts, double billing, payment
-- overflow and RLS isolation between customers.
--
-- Everything runs inside one DO block that always ends by raising an exception, so all test
-- data is rolled back whatever the runner does. Success is the exact message
-- 'ALL DATABASE TESTS PASSED'; anything else (a message starting with 'FAIL') is a failure.
-- Run with:  node scripts/test-database.cjs   (needs SUPABASE_DB_URL)
-- or paste into the Supabase SQL editor.
do $tests$
declare
  -- Fixed ids keep the test readable; they only ever exist inside this rolled-back block.
  u_a constant uuid := 'a0000000-0000-4000-8000-00000000000a';
  u_b constant uuid := 'a0000000-0000-4000-8000-00000000000b';
  u_s constant uuid := 'a0000000-0000-4000-8000-00000000000c';
  c_a uuid; c_b uuid;
  t18 uuid; p_main uuid; p_side uuid; pl_open uuid; pl_locked uuid;
  d_sub uuid; d_fixed uuid; d_pct_small uuid; d_pct_big uuid;
  s_a uuid; s_lock uuid; s_b uuid; l_lock uuid;
  i1 uuid; i2 uuid; i_b uuid; i_draft uuid;
  inv public.invoices;
  n integer; v numeric; msg text;
begin
  -- ───────── fixtures (as the table owner) ─────────
  insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data)
  values (u_a, 'dbtest-a@example.test', 'authenticated', 'authenticated', '{}', '{"full_name":"DB Test A"}'),
         (u_b, 'dbtest-b@example.test', 'authenticated', 'authenticated', '{}', '{"full_name":"DB Test B"}'),
         (u_s, 'dbtest-s@example.test', 'authenticated', 'authenticated', '{"role":"staff"}', '{"full_name":"DB Test Staff"}');
  select id into c_a from public.customers where user_id = u_a;
  select id into c_b from public.customers where user_id = u_b;
  if c_a is null or c_b is null then raise exception 'FAIL setup: signup trigger did not create customers'; end if;
  if (select role from public.profiles where id = u_s) <> 'staff' then raise exception 'FAIL setup: staff role'; end if;
  if exists (select 1 from public.customers where user_id = u_s) then raise exception 'FAIL setup: staff got a customer row'; end if;

  insert into public.taxes (name, rate) values ('dbtest 18', 18) returning id into t18;
  insert into public.products (name, sales_price, tax_id) values ('dbtest main', 100, t18) returning id into p_main;
  insert into public.products (name, sales_price) values ('dbtest side', 50) returning id into p_side;
  insert into public.plans (name, price, billing_period) values ('dbtest open', 0, 'monthly') returning id into pl_open;
  insert into public.plans (name, price, billing_period, min_quantity, pausable, closable)
  values ('dbtest locked', 0, 'monthly', 2, false, false) returning id into pl_locked;
  insert into public.discounts (name, discount_type, value, scope, usage_limit)
  values ('dbtest sub 10%', 'percent', 10, 'subscription', 1) returning id into d_sub;
  insert into public.discounts (name, discount_type, value, scope) values ('dbtest fixed 20', 'fixed', 20, 'product') returning id into d_fixed;
  insert into public.discounts (name, discount_type, value, scope) values ('dbtest 5%', 'percent', 5, 'product') returning id into d_pct_small;
  insert into public.discounts (name, discount_type, value, scope, min_quantity)
  values ('dbtest 50% bulk', 'percent', 50, 'product', 5) returning id into d_pct_big;
  insert into public.discount_products values (d_fixed, p_main), (d_pct_small, p_main), (d_pct_big, p_main);

  -- ───────── 1. lifecycle transitions ─────────
  insert into public.subscriptions (customer_id, plan_id, start_date) values (c_a, pl_locked, '2026-01-01') returning id into s_lock;
  begin
    update public.subscriptions set status = 'active' where id = s_lock;
    raise exception 'FAIL transitions: draft -> active allowed';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    update public.subscriptions set status = 'confirmed' where id = s_lock;
    raise exception 'FAIL transitions: confirmed without lines';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  insert into public.subscription_lines (subscription_id, product_id, quantity, unit_price) values (s_lock, p_side, 1, 50) returning id into l_lock;
  begin
    update public.subscriptions set status = 'confirmed' where id = s_lock;
    raise exception 'FAIL transitions: plan minimum quantity ignored';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  update public.subscription_lines set quantity = 2 where id = l_lock;
  update public.subscriptions set status = 'quotation' where id = s_lock;
  if (select quotation_valid_until from public.subscriptions where id = s_lock) <> current_date + 30 then
    raise exception 'FAIL transitions: quotation validity not set to 30 days';
  end if;
  update public.subscriptions set quotation_valid_until = current_date - 1 where id = s_lock;
  begin
    update public.subscriptions set status = 'confirmed' where id = s_lock;
    raise exception 'FAIL transitions: expired quotation confirmed';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  update public.subscriptions set status = 'draft', quotation_valid_until = null where id = s_lock;
  update public.subscriptions set status = 'confirmed' where id = s_lock;
  update public.subscriptions set status = 'active' where id = s_lock;
  if (select next_invoice_date from public.subscriptions where id = s_lock) <> '2026-01-01' then
    raise exception 'FAIL transitions: activation did not schedule the first invoice';
  end if;
  begin
    update public.subscription_lines set quantity = 3 where id = l_lock;
    raise exception 'FAIL transitions: active lines editable';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    update public.subscriptions set status = 'paused' where id = s_lock;
    raise exception 'FAIL transitions: non-pausable plan paused';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    update public.subscriptions set status = 'closed' where id = s_lock;
    raise exception 'FAIL transitions: non-closable plan closed early';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  update public.subscriptions set expiry_date = current_date - 1 where id = s_lock;
  update public.subscriptions set status = 'closed' where id = s_lock; -- past its end date: allowed
  begin
    update public.subscriptions set status = 'active' where id = s_lock;
    raise exception 'FAIL transitions: closed subscription reopened';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  select count(*) into n from public.subscription_events where subscription_id = s_lock;
  -- created + quotation + draft + confirmed + active + expiry + closed (+ quotation validity edits don't log)
  if n <> 7 then raise exception 'FAIL history: expected 7 events, got %', n; end if;

  -- ───────── 2. billing maths and discounts ─────────
  insert into public.subscriptions (customer_id, plan_id, discount_id, start_date, payment_terms_days)
  values (c_a, pl_open, d_sub, '2026-01-01', 10) returning id into s_a;
  insert into public.subscription_lines (subscription_id, product_id, quantity, unit_price, tax_id) values (s_a, p_main, 2, 100, t18);
  insert into public.subscription_lines (subscription_id, product_id, quantity, unit_price) values (s_a, p_side, 1, 50);
  update public.subscriptions set status = 'confirmed' where id = s_a;
  update public.subscriptions set status = 'active' where id = s_a;
  i1 := public._issue_subscription_invoice(s_a);
  select * into inv from public.invoices where id = i1;
  -- main: 200 − best product discount 20 (the 50% bulk needs qty 5; 5% = 10 is smaller) = 180
  -- side: 50. Subscription 10% of 230 = 23, spread 18.00 / 5.00. Tax 18% of 162 = 29.16.
  if (inv.status, inv.subtotal, inv.discount_total, inv.tax_total, inv.total) is distinct from
     ('confirmed'::public.invoice_status, 250.00, 43.00, 29.16, 236.16) then
    raise exception 'FAIL billing: got % subtotal % discount % tax % total %', inv.status, inv.subtotal, inv.discount_total, inv.tax_total, inv.total;
  end if;
  if (inv.period_start, inv.period_end, inv.due_date) is distinct from ('2026-01-01'::date, '2026-01-31'::date, '2026-01-11'::date) then
    raise exception 'FAIL billing: period/due dates %/%/%', inv.period_start, inv.period_end, inv.due_date;
  end if;
  if (select array_agg(amount order by amount) from public.invoice_discounts where invoice_id = i1) <> array[20.00, 23.00]::numeric[] then
    raise exception 'FAIL billing: invoice_discounts rows';
  end if;
  if (select used_count from public.discounts where id = d_sub) <> 1 or (select used_count from public.discounts where id = d_fixed) <> 1
     or (select used_count from public.discounts where id = d_pct_small) <> 0 then
    raise exception 'FAIL billing: discount usage counts';
  end if;

  -- ───────── 3. double billing ─────────
  update public.subscriptions set next_invoice_date = '2026-01-01' where id = s_a;
  if public._bill_subscription(s_a) is not null then raise exception 'FAIL double billing: period billed twice'; end if;
  select count(*) into n from public.invoices where subscription_id = s_a;
  if n <> 1 then raise exception 'FAIL double billing: % invoices', n; end if;
  if (select next_invoice_date from public.subscriptions where id = s_a) <> '2026-02-01' then
    raise exception 'FAIL double billing: schedule not advanced past the billed period';
  end if;
  begin
    insert into public.invoices (subscription_id, customer_id, period_start) values (s_a, c_a, '2026-01-01');
    raise exception 'FAIL double billing: unique period index missing';
  exception when unique_violation then null; end;

  -- usage limit: the 10% subscription discount (limit 1) is used up; the product discount isn't
  i2 := public._issue_subscription_invoice(s_a);
  select * into inv from public.invoices where id = i2;
  if (inv.period_start, inv.discount_total, inv.tax_total, inv.total) is distinct from ('2026-02-01'::date, 20.00, 32.40, 262.40) then
    raise exception 'FAIL usage limit: period % discount % tax % total %', inv.period_start, inv.discount_total, inv.tax_total, inv.total;
  end if;
  update public.invoices set status = 'cancelled' where id = i2;
  if (select used_count from public.discounts where id = d_fixed) <> 1 then raise exception 'FAIL cancel: discount use not released'; end if;

  -- catch-up billing: _run_billing bills every missed period up to the given date
  update public.subscriptions set next_invoice_date = '2026-03-01' where id = s_a;
  perform public._run_billing('2026-05-15');
  select count(*) into n from public.invoices where subscription_id = s_a and status <> 'cancelled';
  if n <> 4 then raise exception 'FAIL catch-up: expected 4 live invoices (Jan, Mar, Apr, May), got %', n; end if;

  -- ───────── 4. payments ─────────
  begin
    insert into public.payments (invoice_id, method, amount) values (i1, 'cash', 236.17);
    raise exception 'FAIL payments: overpayment accepted';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  insert into public.payments (invoice_id, method, amount) values (i1, 'cash', 100);
  select * into inv from public.invoices where id = i1;
  if inv.status <> 'confirmed' or inv.amount_paid <> 100 then raise exception 'FAIL payments: partial payment'; end if;
  begin
    update public.invoices set status = 'cancelled' where id = i1;
    raise exception 'FAIL payments: invoice with payments cancelled';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  insert into public.payments (invoice_id, method, amount) values (i1, 'upi', 136.16);
  if (select status from public.invoices where id = i1) <> 'paid' then raise exception 'FAIL payments: full payment not marked paid'; end if;
  begin
    insert into public.payments (invoice_id, method, amount) values (i1, 'cash', 0.01);
    raise exception 'FAIL payments: payment on a paid invoice';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  delete from public.payments where invoice_id = i1 and method = 'upi';
  select * into inv from public.invoices where id = i1;
  if inv.status <> 'confirmed' or inv.amount_paid <> 100 then raise exception 'FAIL payments: removing a payment did not reopen the invoice'; end if;
  insert into public.invoices (customer_id, total, subtotal) values (c_a, 10, 10) returning id into i_draft;
  begin
    insert into public.payments (invoice_id, method, amount) values (i_draft, 'cash', 1);
    raise exception 'FAIL payments: payment on a draft';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;

  -- customer B's records
  insert into public.subscriptions (customer_id, plan_id, start_date) values (c_b, pl_open, '2026-01-01') returning id into s_b;
  insert into public.subscription_lines (subscription_id, product_id, quantity, unit_price) values (s_b, p_side, 1, 50);
  update public.subscriptions set status = 'confirmed' where id = s_b;
  update public.subscriptions set status = 'active' where id = s_b;
  i_b := public._issue_subscription_invoice(s_b);
  insert into public.payments (invoice_id, method, amount) values (i_b, 'card', 10);

  -- ───────── 5. RLS: customer A ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if public.my_customer_id() <> c_a then raise exception 'FAIL rls: my_customer_id'; end if;
  if exists (select 1 from public.subscriptions where customer_id <> c_a) then raise exception 'FAIL rls: A sees other subscriptions'; end if;
  if (select count(*) from public.subscriptions where id in (s_a, s_lock)) <> 2 then raise exception 'FAIL rls: A cannot see own subscriptions'; end if;
  if exists (select 1 from public.invoices where id = i_b) or exists (select 1 from public.invoice_overview where id = i_b) then raise exception 'FAIL rls: A sees B invoice'; end if;
  if exists (select 1 from public.invoice_lines where invoice_id = i_b) then raise exception 'FAIL rls: A sees B invoice lines'; end if;
  if exists (select 1 from public.payments where invoice_id = i_b) then raise exception 'FAIL rls: A sees B payments'; end if;
  if exists (select 1 from public.subscription_lines where subscription_id = s_b) then raise exception 'FAIL rls: A sees B lines'; end if;
  if exists (select 1 from public.subscription_events where subscription_id = s_b) then raise exception 'FAIL rls: A sees B history'; end if;
  if (select count(*) from public.customers) <> 1 then raise exception 'FAIL rls: A sees other customers'; end if;
  if exists (select 1 from public.discounts) then raise exception 'FAIL rls: customers can read discounts (codes)'; end if;
  if exists (select 1 from public.invoice_discount_details(i_b)) then raise exception 'FAIL rls: A reads B discount details'; end if;
  if (select count(*) from public.invoice_discount_details(i1)) <> 2 then raise exception 'FAIL rls: A cannot read own discount details'; end if;
  update public.customers set email = 'hijack@example.test' where id = c_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL rls: customer updated own row directly'; end if;
  update public.profiles set role = 'admin' where id = u_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL rls: customer escalated role'; end if;
  update public.subscriptions set status = 'paused' where id = s_b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL rls: A changed B subscription'; end if;
  begin
    perform public.portal_set_subscription_status(s_b, 'paused');
    raise exception 'FAIL rls: portal status change on B subscription';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    perform public.portal_pay_invoice(i_b, 'card');
    raise exception 'FAIL rls: A paid B invoice';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    perform public.renew_subscription(s_b);
    raise exception 'FAIL rls: A renewed B subscription';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    insert into public.payments (invoice_id, method, amount) values (i1, 'cash', 1);
    raise exception 'FAIL rls: customer inserted a payment';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    perform public.run_billing();
    raise exception 'FAIL rls: customer ran billing';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  -- own self-service works
  perform public.portal_update_profile('DB Test A renamed', '+91 98765 43210', 'Acme', null);
  perform public.portal_pay_invoice(i1, 'card');

  -- ───────── 6. RLS: customer B and staff ─────────
  perform set_config('role', 'postgres', true);
  if (select status from public.invoices where id = i1) <> 'paid' then raise exception 'FAIL portal: own payment not recorded'; end if;
  if (select name from public.customers where id = c_a) <> 'DB Test A renamed' then raise exception 'FAIL portal: profile not saved'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if exists (select 1 from public.invoices where customer_id = c_a) then raise exception 'FAIL rls: B sees A invoices'; end if;
  if (select count(*) from public.invoices where id = i_b) <> 1 then raise exception 'FAIL rls: B cannot see own invoice'; end if;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_s, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if (select count(*) from public.invoices where id in (i1, i_b)) <> 2 then raise exception 'FAIL rls: staff cannot see all invoices'; end if;
  begin
    insert into public.taxes (name, rate) values ('dbtest staff tax', 5);
    raise exception 'FAIL rls: staff wrote the catalogue';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    update public.invoices set total = 1 where id = i_b;
    raise exception 'FAIL integrity: staff edited invoice totals';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  update public.payments set amount = 1 where invoice_id = i_b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL integrity: staff edited a payment'; end if;
  delete from public.payments where invoice_id = i_b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL integrity: staff deleted a payment (admin only)'; end if;
  update public.subscriptions set status = 'paused' where id = s_b;
  if not exists (select 1 from public.subscription_events where subscription_id = s_b and to_status = 'paused' and actor = u_s) then
    raise exception 'FAIL history: staff change not attributed';
  end if;
  begin
    perform public.run_billing(current_date + 1);
    raise exception 'FAIL billing: future billing run allowed';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;

  raise exception 'ALL DATABASE TESTS PASSED';
end
$tests$;
