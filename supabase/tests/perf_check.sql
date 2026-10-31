-- Performance check at the Phase 8 target volume (≈5,000 subscriptions, ≈20,000 invoices).
-- Adds synthetic rows, times the queries behind each list page as the admin (RLS on), then
-- raises with the timings, so everything is rolled back. Paste into the SQL editor.
do $perf$
declare
  admin_id uuid := (select id from public.profiles where email = 'demo.admin@example.com');
  t timestamptz; out text := ''; n bigint;
  target_subs constant int := 5000; target_invoices constant int := 20000;
begin
  -- Copies of existing rows, so the data shape matches the seed.
  insert into public.subscriptions (customer_id, plan_id, status, start_date, expiry_date, next_invoice_date, payment_terms_days, created_at)
  select customer_id, plan_id, status, start_date, expiry_date, next_invoice_date, payment_terms_days, created_at - interval '1 second'
    from public.subscriptions
   order by random()
   limit greatest(0, target_subs - (select count(*) from public.subscriptions));
  insert into public.invoices (customer_id, status, invoice_date, due_date, subtotal, tax_total, total, amount_paid, created_at)
  select customer_id, case when status = 'paid' then 'confirmed' else status end, invoice_date, due_date, subtotal, tax_total, total, 0, created_at
    from public.invoices, generate_series(1, 3)
   limit greatest(0, target_invoices - (select count(*) from public.invoices));
  analyze public.subscriptions; analyze public.invoices;
  out := format('rows: %s subscriptions, %s invoices, %s payments | ',
    (select count(*) from public.subscriptions), (select count(*) from public.invoices), (select count(*) from public.payments));

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  t := clock_timestamp();
  select count(*) into n from public.invoice_overview;
  perform * from public.invoice_overview order by invoice_date desc, number desc limit 25;
  out := out || format('invoices page %s ms | ', round(extract(epoch from clock_timestamp() - t) * 1000));

  t := clock_timestamp();
  select count(*) into n from public.invoice_overview where is_overdue;
  perform * from public.invoice_overview where is_overdue order by invoice_date desc, number desc limit 25;
  out := out || format('overdue page %s ms | ', round(extract(epoch from clock_timestamp() - t) * 1000));

  t := clock_timestamp();
  select count(*) into n from public.invoice_overview where number ilike '%a%' or customer_name ilike '%a%' or subscription_number ilike '%a%';
  perform * from public.invoice_overview where number ilike '%a%' or customer_name ilike '%a%' or subscription_number ilike '%a%' order by invoice_date desc limit 25;
  out := out || format('invoice search %s ms | ', round(extract(epoch from clock_timestamp() - t) * 1000));

  t := clock_timestamp();
  select count(*) into n from public.subscription_overview;
  perform * from public.subscription_overview order by created_at desc, id limit 25;
  out := out || format('subscriptions page %s ms | ', round(extract(epoch from clock_timestamp() - t) * 1000));

  t := clock_timestamp();
  select count(*) into n from public.subscription_overview where status = 'active';
  perform * from public.subscription_overview where status = 'active' order by created_at desc, id limit 25;
  out := out || format('active subscriptions %s ms | ', round(extract(epoch from clock_timestamp() - t) * 1000));

  t := clock_timestamp();
  select count(*) into n from public.payments p join public.invoices i on i.id = p.invoice_id;
  perform * from public.payments p join public.invoices i on i.id = p.invoice_id join public.customers c on c.id = i.customer_id
   order by p.payment_date desc, p.created_at desc limit 25;
  out := out || format('payments page %s ms | ', round(extract(epoch from clock_timestamp() - t) * 1000));

  t := clock_timestamp();
  perform public.dashboard_summary();
  out := out || format('dashboard summary %s ms', round(extract(epoch from clock_timestamp() - t) * 1000));

  raise exception 'PERF %', out;
end
$perf$;
