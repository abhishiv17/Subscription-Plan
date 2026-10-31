-- Demo data for Brightloop: catalogue, plans, templates, discounts, 2,000 customers, 3,000 subscriptions.
-- Invoices are produced by the real billing engine (_run_billing), not inserted by hand.
-- h(x) = abs(hashtext(x)) % 100 gives a stable pseudo-random 0..99 per row.
do $$
declare
  t18 uuid; t5 uuid;
  p_crm uuid; p_acc uuid; p_hr uuid; p_sto uuid; p_sup uuid;
  v_std uuid; v_odoo uuid;
  pl_m uuid; pl_y uuid; pl_w uuid; pl_d uuid;
  tpl uuid;
  d_vol uuid; d_sto uuid;
begin
  insert into public.taxes (name, rate) values ('GST 18%', 18) returning id into t18;
  insert into public.taxes (name, rate) values ('GST 5%', 5) returning id into t5;
  insert into public.taxes (name, rate) values ('Exempt', 0);

  insert into public.products (name, product_type, sales_price, cost_price, tax_id, notes)
  values ('Brightloop CRM', 'software', 1200, 300, t18, 'Sales pipeline and contacts, priced per seat') returning id into p_crm;
  insert into public.products (name, product_type, sales_price, cost_price, tax_id, notes)
  values ('Brightloop Accounting', 'software', 1800, 450, t18, 'Ledgers, GST returns and bank sync') returning id into p_acc;
  insert into public.products (name, product_type, sales_price, cost_price, tax_id, notes)
  values ('Brightloop HR Suite', 'software', 1500, 400, t18, 'Payroll, leave and attendance') returning id into p_hr;
  insert into public.products (name, product_type, sales_price, cost_price, tax_id, notes)
  values ('Extra Storage 100 GB', 'addon', 300, 50, t18, 'Add-on, switch on or off any month') returning id into p_sto;
  insert into public.products (name, product_type, sales_price, cost_price, tax_id, notes)
  values ('Priority Support', 'service', 500, 150, t5, '4-hour response SLA') returning id into p_sup;

  insert into public.product_variants (product_id, attribute, value, extra_price)
  values (p_crm, 'Brand', 'Standard', 0) returning id into v_std;
  insert into public.product_variants (product_id, attribute, value, extra_price)
  values (p_crm, 'Brand', 'Odoo', 560) returning id into v_odoo;

  insert into public.plans (name, price, billing_period, min_quantity, start_date, end_date, auto_close, closable, pausable, renewable, notes)
  values ('Monthly Standard', 1200, 'monthly', 1, current_date - 400, null, false, true, true, true, 'Flexible month-to-month plan')
  returning id into pl_m;
  insert into public.plans (name, price, billing_period, min_quantity, start_date, end_date, auto_close, closable, pausable, renewable, notes)
  values ('Annual Contract', 12000, 'yearly', 5, current_date - 400, null, false, false, false, true, 'Yearly contract: no early close or pause')
  returning id into pl_y;
  insert into public.plans (name, price, billing_period, min_quantity, start_date, end_date, auto_close, closable, pausable, renewable, notes)
  values ('Weekly Starter', 300, 'weekly', 1, current_date - 400, current_date + 30, true, true, false, false, 'Short-term plan that closes on its own when it ends')
  returning id into pl_w;
  insert into public.plans (name, price, billing_period, min_quantity, start_date, end_date, auto_close, closable, pausable, renewable, notes)
  values ('Daily Pay-as-you-go', 50, 'daily', 1, null, null, false, true, true, true, 'Billed every day')
  returning id into pl_d;

  insert into public.quotation_templates (name, plan_id, validity_days, payment_terms_days, notes)
  values ('Enterprise CRM bundle', pl_y, 15, 30, '10 Odoo-brand CRM seats with storage and priority support')
  returning id into tpl;
  insert into public.quotation_template_lines (template_id, product_id, variant_id, quantity, unit_price, tax_id) values
    (tpl, p_crm, v_odoo, 10, 17600, t18),
    (tpl, p_sto, null, 5, 3000, t18),
    (tpl, p_sup, null, 1, 5000, t5);
  insert into public.quotation_templates (name, plan_id, validity_days, payment_terms_days, notes)
  values ('Small business starter', pl_m, 30, 15, 'CRM + Accounting for small shops')
  returning id into tpl;
  insert into public.quotation_template_lines (template_id, product_id, variant_id, quantity, unit_price, tax_id) values
    (tpl, p_crm, v_std, 2, 1200, t18),
    (tpl, p_acc, null, 1, 1800, t18);

  insert into public.discounts (name, code, discount_type, value, scope, min_quantity, start_date, end_date, usage_limit)
  values ('Volume 10% (10+ seats)', 'VOLUME10', 'percent', 10, 'subscription', 10, current_date - 400, current_date + 365, 5000)
  returning id into d_vol;
  insert into public.discounts (name, code, discount_type, value, scope, min_purchase, start_date, end_date, usage_limit)
  values ('Storage launch offer: 100 off', 'STORAGE100', 'fixed', 100, 'product', 300, current_date - 60, current_date + 30, 2000)
  returning id into d_sto;
  insert into public.discount_products (discount_id, product_id) values (d_sto, p_sto);

  insert into public.customers (name, email, company, phone)
  select (array['Aarav','Diya','Kabir','Meera','Rohan','Saanvi','Vihaan','Ananya','Ishaan','Kiara'])[1 + g % 10] || ' '
           || (array['Sharma','Patel','Reddy','Iyer','Khan','Gupta','Nair','Joshi','Das','Mehta','Rao'])[1 + g % 11],
         'customer' || g || '@example.com',
         (array['Acme','Globex','Initech','Umbrella','Stark','Wayne','Hooli','Sterling','Nimbus'])[1 + g % 9] || ' '
           || (array['Traders','Retail','Labs','Systems','Foods','Logistics','Studio'])[1 + g % 7],
         '+91 9' || lpad(((g * 7919) % 1000000000)::text, 9, '0')
    from generate_series(1, 2000) g;

  create temp table _c on commit drop as
    select id, row_number() over (order by email) as rn from public.customers;

  -- 3,000 subscriptions; ~90% live (inserted active and billed below), the rest in the sales pipeline
  insert into public.subscriptions
    (customer_id, plan_id, status, start_date, expiry_date, quotation_valid_until, payment_terms_days, next_invoice_date, discount_id)
  select c.id, x.plan_id, x.status, x.sd,
         case when x.plan_id = pl_y then x.sd + 364 when x.plan_id = pl_w then x.sd + 55 else x.sd + 365 end,
         case when x.status = 'quotation' then current_date + 15 end,
         case when x.plan_id = pl_y then 30 else 15 end,
         case when x.status = 'active' then x.sd end,
         case when x.plan_id = pl_y and x.g % 3 = 0 then d_vol end
    from (
      select g,
             case when hp < 72 then pl_m when hp < 92 then pl_y when hp < 98 then pl_w else pl_d end as plan_id,
             case when hs < 90 then 'active' when hs < 95 then 'draft' when hs < 98 then 'quotation' else 'confirmed' end::public.subscription_status as status,
             case
               when hs >= 90 then current_date + hd % 20
               when hp < 72 then current_date - (hd * 150 / 100)
               when hp < 92 then current_date - (hd * 330 / 100)
               when hp < 98 then current_date - (hd * 45 / 100)
               else current_date - (hd * 8 / 100)
             end as sd
        from (select g,
                     abs(hashtext(g || 'plan')) % 100 as hp,
                     abs(hashtext(g || 'status')) % 100 as hs,
                     abs(hashtext(g || 'date')) % 100 as hd
                from generate_series(1, 3000) g) r
    ) x
    join _c c on c.rn = 1 + (x.g * 37) % 2000;

  -- Main product line, priced for the plan's period (yearly = 10 months, weekly = 1/4, daily = 1/25)
  insert into public.subscription_lines (subscription_id, product_id, variant_id, quantity, unit_price, tax_id)
  select s.id, pr.id, m.vid,
         case when pl.billing_period = 'yearly' then 5 + abs(hashtext(s.number || 'q')) % 20 else 1 + abs(hashtext(s.number || 'q')) % 8 end,
         round((pr.sales_price + coalesce(v.extra_price, 0)) * case pl.billing_period
                 when 'yearly' then 10 when 'weekly' then 0.25 when 'daily' then 0.04 else 1 end, 2),
         pr.tax_id
    from public.subscriptions s
    join public.plans pl on pl.id = s.plan_id
    cross join lateral (
      select (array[p_crm, p_acc, p_hr])[1 + abs(hashtext(s.number || 'prod')) % 3] as pid
    ) m0
    cross join lateral (
      select case when m0.pid = p_crm then case when abs(hashtext(s.number || 'var')) % 100 < 40 then v_odoo else v_std end end as vid
    ) m
    join public.products pr on pr.id = m0.pid
    left join public.product_variants v on v.id = m.vid;

  -- Storage add-on on ~half, priority support on ~a quarter
  insert into public.subscription_lines (subscription_id, product_id, quantity, unit_price, tax_id)
  select s.id, p_sto, 1 + abs(hashtext(s.number || 'sq')) % 3,
         round(300 * case pl.billing_period when 'yearly' then 10 when 'weekly' then 0.25 when 'daily' then 0.04 else 1 end, 2), t18
    from public.subscriptions s join public.plans pl on pl.id = s.plan_id
   where abs(hashtext(s.number || 'sto')) % 100 < 50;
  insert into public.subscription_lines (subscription_id, product_id, quantity, unit_price, tax_id)
  select s.id, p_sup, 1,
         round(500 * case pl.billing_period when 'yearly' then 10 when 'weekly' then 0.25 when 'daily' then 0.04 else 1 end, 2), t5
    from public.subscriptions s join public.plans pl on pl.id = s.plan_id
   where abs(hashtext(s.number || 'sup')) % 100 < 25;

  -- Billing day: generate every due invoice with the real engine
  perform public._run_billing(current_date);

  -- Older invoices are confirmed; the last 3 days stay draft for the billing-day demo
  update public.invoices set status = 'confirmed' where status = 'draft' and invoice_date < current_date - 2;

  -- Most invoices get paid, across methods and dates; the rest are outstanding / overdue
  insert into public.payments (invoice_id, method, amount, payment_date, note)
  select i.id,
         (array['bank_transfer', 'card', 'upi', 'cash', 'cheque'])[1 + abs(hashtext(i.number || 'm')) % 5]::public.payment_method,
         case when abs(hashtext(i.number || 'part')) % 100 < 5 then round(i.total / 2, 2) else i.total end,
         least(current_date, i.invoice_date + abs(hashtext(i.number || 'pd')) % 20),
         'Bank reference ' || upper(substr(md5(i.number), 1, 8))
    from public.invoices i
   where i.status = 'confirmed' and i.total > 0
     and abs(hashtext(i.number || 'pay')) % 100 < case when i.due_date < current_date then 90 else 35 end;

  -- Some monthly customers have paused or closed since
  update public.subscriptions set status = 'paused'
   where plan_id = pl_m and status = 'active' and abs(hashtext(number || 'life')) % 100 < 4;
  update public.subscriptions set status = 'closed'
   where plan_id = pl_m and status = 'active' and abs(hashtext(number || 'life')) % 100 between 4 and 7;
end $$;
