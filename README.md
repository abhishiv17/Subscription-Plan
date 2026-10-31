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
| Discounts | `/discounts` (admin only) | Fixed or percentage, with a minimum purchase or quantity, start and end dates and a usage limit. They apply to specific products or to a whole subscription, appear on the next invoice automatically, and stop once expired or used up. |
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
