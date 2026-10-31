-- Phase 7: overdue invoice reminders. The /api/cron/overdue-reminders route (run daily by
-- Vercel Cron) emails customers about overdue invoices and records each reminder here,
-- so nobody is reminded more than once a week or more than three times per invoice.
alter table public.invoices
  add column reminder_count integer not null default 0 check (reminder_count >= 0),
  add column last_reminder_at timestamptz;

-- Finds the next batch quickly among thousands of invoices.
create index invoices_overdue_reminders on public.invoices (due_date)
  where status = 'confirmed';

-- invoice_overview selects i.*; recreate it so the new columns are included (they land
-- before the joined columns, which "create or replace" does not allow).
drop view public.invoice_overview;
create view public.invoice_overview with (security_invoker = true) as
select i.*,
       c.name as customer_name, c.email as customer_email,
       s.number as subscription_number,
       i.total - i.amount_paid as amount_due,
       (i.status = 'confirmed' and i.due_date < current_date) as is_overdue
  from public.invoices i
  join public.customers c on c.id = i.customer_id
  left join public.subscriptions s on s.id = i.subscription_id;

-- Signed-out visitors never need this view; signed-in users only read it.
revoke all on public.invoice_overview from anon, authenticated;
grant select on public.invoice_overview to authenticated;
