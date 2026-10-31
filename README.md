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
