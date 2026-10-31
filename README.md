# Brightloop Subscriptions

One system to run plans, subscriptions and recurring billing for Brightloop Software, from setting up products to collecting payments and reporting revenue.

**Stack:** Next.js 15 (App Router, Server Actions) · Supabase Postgres + Auth · Tailwind CSS 4

## Run it

```bash
cp .env.example .env.local   # fill in the Supabase URL, publishable key and service-role key
npm install
npm run dev                  # http://localhost:3000
```

The database schema lives in `supabase/migrations/`. Demo data (2,000 customers, 3,000 subscriptions, about 7,000 invoices) is in `supabase/seed.sql`.

## How each part of the brief is handled

| Scene | Where | How |
|---|---|---|
| Sign up and roles | `/signup`, `/login`, `/forgot-password`, `/users` | A unique email per account, enforced in the database. The password rule (more than 8 characters, upper, lower, special) is checked on both client and server. Reset links go by email. Roles are `admin`, `staff` and `customer`, enforced with Postgres **row-level security**. Only the admin can create staff. |
| Launching a plan | `/products`, `/plans` | Products have a type, a sales price and a cost price, plus variants with an extra price (e.g. Brand: Odoo **+560**). Plans have a price, a billing period (daily, weekly, monthly or yearly), a minimum quantity and availability dates. Each plan sets its own rules for auto-close, closing early, pausing and renewing. |
| Quote to subscription | `/templates`, `/subscriptions` | Quotation templates prefill the plan, lines and payment terms, and set the quote's validity in days. Subscriptions are numbered `SUB-00001`. The lifecycle **Draft → Quotation → Confirmed → Active → Closed** is enforced by a database trigger, which also checks plan minimums, availability and quote expiry. |
| Billing day | Dashboard → **Run billing**, or *Create invoice now* on a subscription | `_run_billing()` invoices every due period, catching up any it missed, in one transaction. A **unique index on (subscription, period)** makes double billing impossible. Taxes and discounts are calculated automatically. Invoices go **Draft → Confirmed → Paid** and can be confirmed, cancelled, sent or printed. |
| Discounts | `/discounts` (staff read-only, admin edits) | Fixed or percentage, with a minimum purchase or quantity, start and end dates and a usage limit. They apply to specific products or to a whole subscription, appear on the next invoice automatically, and stop once expired or used up. |
| Payments | Invoice page, `/payments` | Each payment records its method, amount, date and a note. Partial payments are allowed. A trigger keeps `amount_paid` in sync and marks the invoice Paid. Outstanding and overdue filters are available. |
| Finance lead | `/dashboard` | Active subscriptions, MRR, revenue collected, amount invoiced, outstanding and overdue, with date filters and a 12-month revenue chart. Totals come from SQL aggregates (`dashboard_summary`). Lists are paginated and indexed, so pages respond well under 2 s with thousands of rows. |
| Customer portal | `/portal` | Customers see only their own subscriptions and invoices (RLS). They can pause, resume, renew or cancel where the plan allows, and pay invoices. |

## Demo walkthrough

1. **Sign up** as a new customer and show the password rules and the duplicate-email error.
2. As **admin**: create a product with a Brand: Odoo +560 variant, then a plan, a tax and a discount. Add a staff user.
3. As **staff**: create a subscription from the *Enterprise CRM bundle* template, then step it through **Send quotation → Confirm → Activate**, then **Create invoice now**. Taxes and the 10% volume discount are already on the invoice.
4. Click **Create invoice now** again. The schedule moves forward and the same period is never billed twice.
5. **Record a payment** (partial, then the rest) and watch the invoice turn Paid.
6. Show the **dashboard**: revenue, outstanding, overdue, then the overdue invoices list.
7. Show the **portal**: the customer pauses a subscription and pays an invoice.

## Phase 1 database update

Before using the discount forms, apply `supabase/migrations/0003_catalog_discount.sql`
in the Supabase SQL editor, or run `supabase db push` against your linked project.
This adds the admin-only `save_catalog_discount` RPC so a discount and its product
selections save in one transaction. Existing discounts and usage counts are preserved.
No reseed is needed.

## People and team invitations

Apply `supabase/migrations/0004_people_management.sql` before using customer
balances and role changes (already applied in the demo project on 2026-10-31).
Balances include every confirmed unpaid invoice. Customer detail lists are paginated.
Role changes synchronize the profile and trusted Auth metadata atomically, preserve
billing records, and prevent administrators from changing their own role.

At `/users`, admins can search all profiles, filter by role, change another account's
role, and expand **Invite team member** to send an invitation. The recipient chooses
their own password; no temporary password is collected by the admin.

Set `NEXT_PUBLIC_SITE_URL` to the app's public origin. In Supabase Authentication URL
Configuration, allow that origin's `/accept-invite` redirect (or `/**` locally). Keep
`/auth/callback` and `/reset-password` redirects enabled for password reset. Configure
SMTP for reliable delivery beyond project team addresses. The default invitation
email works with `/accept-invite`; custom templates may also use a `token_hash`
query parameter on that route.

Checks:
- `node --test scripts/test-people.cjs`: invitation/action tests with mocked email delivery.
- With a running app on port 3001 and `DEMO_TEST_PASSWORD` set:
  `node scripts/verify-phase1.cjs` and `node scripts/verify-phase2.cjs`.
  These use isolated demo fixtures and clean them up. The suites temporarily grant
  a generated account staff access, so run only against an authorized test project.
  Phase 2 verifies real invitation tokens using `generateLink`; it sends no email.

## Phase 3 quotation templates

Apply `supabase/migrations/0005_quotation_templates.sql` (already applied in the demo
project on 2026-10-31). Staff and admins can create/edit templates, change their
plan, validity, payment terms and notes, and add/edit/remove product lines. The
line picker includes the base product and each variant. Blank price overrides
use list price plus variant extra when copied; an explicit zero remains zero.
Blank tax overrides inherit the product tax.

Use **Use for a new subscription** to preselect the template, then choose a
customer. Customer search covers the entire customer catalogue, and a customer
selected from their detail page remains available even outside the first 50 matches.
Creating the draft copies its plan (unless explicitly overridden), payment terms,
notes and lines in one database transaction. Empty templates, inactive plans or
products, mismatched variants and invalid copied prices fail without leaving a
partial draft. Later template edits do not change subscriptions already copied.

Run `node scripts/verify-phase3.cjs` with the same test environment described above.
It checks admin/staff editing, price/tax inheritance, copied draft fields, quotation
validity, customer isolation and database rollback. It creates and removes only
isolated smoke-test fixtures and uses the approved temporary staff test access.

## Phase 4 subscription workflow

Apply `supabase/migrations/0006_subscription_line_guards.sql` (already applied in
the demo project on 2026-10-31). Subscription lines can be added/edited/removed in
draft or quotation. Confirmation locks them; server actions and a database trigger
both enforce the lock, including during concurrent lifecycle changes. Product and
variant associations are validated in both layers.

The list supports status, customer and plan filters, customer search, and pagination.
Create a subscription from scratch or an optional template, with an optional active
subscription discount and start/expiry dates. The detail page provides separate
product and variant pickers, default or overridden pricing, tax and description
editing, and a live subtotal/tax/total preview. Monetary previews round each line
using scaled integer arithmetic to match Postgres. Estimates are explicitly before
eligible discounts; billing applies discounts on the invoice date.

Lifecycle controls follow state and plan flags. Database validation errors (minimum
quantity, expired quotation, unavailable plan dates, etc.) appear as flash messages.
Returning a quotation to draft clears its validity so reissuing sets a fresh date.
Bill now creates the next period invoice; it cannot bill a period starting beyond
subscription expiry. Renew extends expiry, and related invoices are paginated.

`/quotations/[id]` is a print-friendly quotation with terms, lines, tax and validity.
Staff/admins can preview drafts. Customers can open only their own issued quotations,
from a link in their portal. Drafts and other customers' quotations return 404.

Checks: `node --test scripts/test-subscriptions.cjs scripts/test-people.cjs`.
With the same authorized demo environment and running app as above, use
`node scripts/verify-phase4.cjs` to exercise creation, line guards, lifecycle,
billing/renewal, customer quotation isolation, plan flags, filters and staff access.
It uses isolated fixtures and removes its generated invoices/accounts afterward.

## Phase 5 invoices and payments

Apply `supabase/migrations/0007_invoices_portal.sql` (already applied in the demo project
on 2026-10-31). Billing (the scheduled run, **Run billing** and **Bill now**) now issues
invoices as **confirmed**, so customers can see and pay them straight away; zero-value
invoices are marked paid. Drafts created before this change stay as drafts until staff
confirm them.

- `/invoices` filters by status, overdue, customer (`?customer=<id>`, linked from the
  customer page), invoice date range and free text. Malformed filters are ignored.
- The detail page shows lines, each discount applied, totals and payments, with
  Confirm, **Mark sent** (sets `sent_at`; emails via Resend when `RESEND_API_KEY` is set),
  Cancel (only while nothing is paid) and Record payment. Payments are validated
  (amount, two decimals, method, not in the future) and the database rejects overpayment.
  Admins can remove a payment recorded by mistake; the invoice reopens automatically.
- `/invoices/[id]/print` is a full-page printable invoice for staff and customers.
- `/payments` filters by method and payment date.

Database rules added in 0007: invoices are created only by billing; staff can change
status, due date, notes and `sent_at` but not amounts, parties or periods; invoice lines
are read-only; payments can be inserted (staff) or deleted (admin) but never edited;
cancelling an invoice returns its discount uses. 0009 stops `run_billing` from running
for future dates.

## Phase 6 customer portal

- `/portal` lists the customer's own subscriptions (drafts are hidden), what they owe,
  and Pause/Resume/Renew/Cancel controls according to the plan flags.
- `/portal/subscriptions/[id]` shows lines, per-period price, invoices and a history
  timeline. History comes from `subscription_events`, which a trigger fills on every
  status or end-date change from 31 Oct 2026 onwards. Staff see it on the subscription page too.
- `/portal/invoices` (filters and pagination) and `/portal/invoices/[id]` with Pay now,
  discount names (codes stay private) and a print link.
- `/portal/profile` edits name, phone, company and address through `portal_update_profile`.
  The billing email can only be changed by staff; customers can no longer update their
  `customers` row directly.

## Phase 7 automation

`supabase/migrations/0008_cron.sql` enables `pg_cron` and schedules `daily-billing`
at 00:30 UTC (06:00 IST). The dashboard shows whether the schedule exists and how its
last run went. Check runs in SQL with
`select * from cron.job_run_details order by start_time desc limit 5;`.

Checks for Phases 5 and 6: with the app running on port 3001 and `DEMO_TEST_PASSWORD`
set (environment or the git-ignored `.env.local`), run `node scripts/verify-phase5.cjs`
and `node scripts/verify-phase6.cjs`. They create isolated fixtures and temporary accounts
(one is briefly made staff) and remove everything afterwards.

## Phase 7 additions and Phase 8 testing

- **Expired quotations:** `/subscriptions?status=expired_quotation`, an "Expired" badge, and a dashboard link.
- **Overdue reminders:** `GET /api/cron/overdue-reminders` (needs `Authorization: Bearer $CRON_SECRET`;
  add `?dryRun=1` to preview). Vercel Cron calls it daily (`vercel.json`). It emails only when
  `REMINDERS_ENABLED=true` and `RESEND_API_KEY` is set, at most weekly and three times per invoice.
  Migration `0010_overdue_reminders.sql` adds the tracking columns.

| Command | What it runs |
|---|---|
| `npm run lint`, `npm run typecheck`, `npm run build` | static checks |
| `npm test` | focused unit tests (no network) |
| `npm run test:db` | `supabase/tests/database_test.sql` (transitions, billing maths, discounts, double billing, payments, RLS isolation); needs `SUPABASE_DB_URL`; always rolled back |
| `npm run test:live` | Phase 1–6 live suites against a server on port 3001 |
| `npm run test:e2e` | Playwright smoke test: sign up → bill → pay (`npx playwright install chromium` first) |
| `npm run perf` | list-page timings (median must be under 2 s) |

`supabase/tests/perf_check.sql` times the list queries at 5,000 subscriptions and 20,000 invoices
inside a rolled-back transaction (paste it into the SQL editor).
CI (`.github/workflows/ci.yml`) runs the static checks and unit tests on every push and PR,
the database tests when `SUPABASE_DB_URL` is set, and the live suites, Playwright and the perf check on manual dispatch.
