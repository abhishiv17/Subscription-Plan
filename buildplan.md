# Build Plan — Subscription Management System

Next.js 15 (App Router, server actions) + Supabase (Postgres, Auth, RLS) + Tailwind v4.
App code lives in `web/`; the database is defined in `web/supabase/migrations/0001_init.sql`.

## Roles

| Role | Area | Can do |
|------|------|--------|
| admin | `/dashboard` and the rest of the back office | Everything, including taxes, discounts, users and catalogue writes |
| staff | `/dashboard` and the rest of the back office | Customers, quotations, subscriptions, invoices, payments, billing runs |
| customer | `/portal` | Read their own subscriptions and invoices; pause, resume or close; renew; pay |

## Where things stand

**Done**
- [x] Schema: enums, catalogue, subscriptions, invoices, payments, indexes
- [x] RLS policies for every table, and role helpers (`is_admin`, `is_staff`, `my_customer_id`)
- [x] Lifecycle triggers: subscription transitions, invoice transitions, payment checks and payment sync
- [x] Billing engine: `_bill_subscription` and `_run_billing`, with catch-up, product and subscription discounts, tax, and auto-close
- [x] RPCs: `run_billing`, `bill_subscription_now`, `renew_subscription`, `portal_set_subscription_status`, `portal_pay_invoice`, `dashboard_summary`
- [x] Views: `subscription_overview`, `invoice_overview`
- [x] Supabase clients (browser, server, admin) and session middleware
- [x] Auth pages: login, signup, forgot and reset password, and the `/auth/callback` route
- [x] App shell, nav, UI kit, flash messages, formatters, password validation
- [x] Role-gated layouts for `(app)` and `portal`
- [x] Dashboard with KPIs, revenue by month, overdue invoices and a "Run billing" action

**To do:** see the phases below. Each phase should end with something you can click through.

> **Code vs. verified (2026-10-31):** pages for most of Phases 1–6 already exist in `web/src/app` (taxes, products, plans, discounts, customers, users, templates, subscriptions, invoices, payments, portal). They are left unticked until each has been clicked through end to end. Not yet in the code: `/portal/subscriptions/[id]`, the portal profile page, `/invoices/[id]/print` as its own route, and the `pg_cron` migration.

---

## Phase 0 — Environment
- [x] Create the Supabase project (`csvucvhfuwdagjhlqktw`) and apply `0001_init.sql`; also applied `0002_lock_down_functions.sql` (revokes RPC access from `anon`, hides trigger functions)
- [x] Add `web/.env.example` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Set the Auth redirect URLs (`/auth/callback`, `/reset-password`) for localhost and production
- [x] Bootstrap the first admin: owner account signed up and promoted to `admin`, and its auto-created customer row removed (2026-10-31)
- [x] Shared test admin `demo.admin@example.com`, created with the service-role key and email pre-confirmed. **Delete it or rotate its password before production.**
- [x] `supabase/seed.sql`: taxes, 5 products with variants, plans, 2 templates, 2 discounts, 2,000 customers, 3,000 subscriptions, ~7,000 invoices (loaded and checked in the database)
- [x] Replace the create-next-app `README.md` with real setup steps

## Phase 1 — Catalogue (admin)
Pattern for each module: list page → new/edit form → server action → `revalidatePath` → flash.
- [ ] `/taxes`: list, create, edit, toggle active
- [ ] `/products`: list (filter by type and active), form with tax picker, inline **variants** editor (attribute, value, extra price)
- [ ] `/plans`: list and form (price, billing period, min quantity, dates, and the closable, pausable, renewable and auto-close flags)
- [ ] `/discounts`: list and form (fixed or percent, subscription or product scope, product picker for product scope, limits, dates); show `used_count`
- [ ] Staff see the catalogue read-only (RLS already enforces this; hide the edit buttons too)

## Phase 2 — People
- [ ] `/customers`: list with search, create and edit, and a detail page with their subscriptions, invoices and balance
- [ ] `/users` (admin): list profiles and change roles through a server action that uses `lib/supabase/admin.ts`; invite staff by email with `auth.admin.inviteUserByEmail` and `app_metadata.role`

## Phase 3 — Quotation templates
- [ ] `/templates`: list and form (plan, validity days, payment terms) with editable lines (product, variant, quantity, optional price override, tax)
- [ ] "Create subscription from template" copies the plan, terms and lines into a new draft subscription

## Phase 4 — Subscriptions (core flow)
- [ ] `/subscriptions`: list from `subscription_overview`, filtered by status, customer and plan, paginated
- [ ] New subscription: pick customer, plan, optional template and optional discount, then start date
- [ ] Detail page:
  - line editor (product → variant → price = sales price + variant extra, editable), with a live total
  - status bar showing draft → quotation → confirmed → active ⇄ paused → closed
  - action buttons that show only the transitions allowed from the current state; trigger errors go to a flash message
  - "Bill now" (`bill_subscription_now`) and "Renew" (`renew_subscription`)
  - related invoices
- [ ] Lock lines once the subscription is active, and add a guard in the server action
- [ ] Quotation view the customer can print, showing the valid-until date

## Phase 5 — Invoices & payments
- [ ] `/invoices`: list from `invoice_overview` with an overdue badge and filters for status, customer, date range and overdue
- [ ] Detail page: lines, discounts (`invoice_discounts`), totals, payments, and Confirm, Cancel and "Record payment" actions
- [ ] Printable invoice page (`/invoices/[id]/print`, print CSS)
- [ ] "Mark sent": set `sent_at`; email delivery is optional (Supabase Edge Function + Resend)
- [ ] `/payments`: list of all payments filtered by method and date
- [ ] Decide whether billing-generated invoices should start as `confirmed` (they are `draft` today, and customers can't pay drafts)

## Phase 6 — Customer portal
- [ ] `/portal`: their subscriptions with status, plan, next invoice and expiry, plus Pause, Resume, Close and Renew controls shown according to the plan flags
- [ ] `/portal/subscriptions/[id]`: lines and history
- [ ] `/portal/invoices`: list and detail, with "Pay now" (`portal_pay_invoice`) and a printable invoice
- [ ] Profile page (name, phone, company) that edits their own `customers` row

## Phase 7 — Automation
- [ ] Schedule billing daily: `pg_cron` → `select public._run_billing();` (new migration `0002_cron.sql`)
- [ ] Optional: mark quotations as expired, and send overdue reminders

## Phase 8 — Quality & ship
- [ ] SQL tests (pgTAP or plain scripts) for transitions, payment overflow, double billing, discount maths and RLS isolation between customers
- [ ] Playwright smoke test: sign up → admin creates a subscription → activate → run billing → customer pays
- [ ] `npm run lint` and `npm run build` with no errors; add a CI workflow
- [ ] Performance check: seed about 5k subscriptions and 20k invoices, and keep list pages under 2s (indexes exist; paginate everything)
- [ ] Deploy to Vercel with env vars and production Auth URLs (needed before friends can use the shared test admin)
- [ ] Before launch: remove `demo.admin@example.com`, or downgrade it to staff

---

## Conventions
- Server components read data; mutations go through `"use server"` actions that call `requireRole(...)` first
- Let the database enforce the rules (triggers and RLS). The UI only hides what the user can't do, and reports trigger errors through `flash`
- Format money and dates only with `lib/format.ts`
- One migration per change (`0002_…sql`); never edit `0001_init.sql` after it has been applied
- Commits: `feat(scope): …`, `fix(scope): …`, `chore: …`, `docs: …`

---

## Log
- **2026-10-31**: Migrations 0001–0002 applied and seed loaded. Owner promoted to admin. Shared test admin `demo.admin@example.com` created (the password was given in chat and is not stored here).
