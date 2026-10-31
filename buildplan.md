# Build Plan — Subscription Management System

Next.js 15 (App Router, server actions) + Supabase (Postgres, Auth, RLS) + Tailwind v4.
App code lives in `src/`; the database migrations live in `supabase/migrations/`.

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

> **Code vs. verified (2026-10-31):** pages for most of Phases 1–6 already exist in `src/app` (taxes, products, plans, discounts, customers, users, templates, subscriptions, invoices, payments, portal). Phases 1–4 are implemented and verified below; later phases remain unticked until verified. Not yet in the code: `/portal/subscriptions/[id]`, the portal profile page, `/invoices/[id]/print` as its own route, and the `pg_cron` migration.

---

## Phase 0 — Environment
- [x] Create the Supabase project (`csvucvhfuwdagjhlqktw`) and apply `0001_init.sql`; also applied `0002_lock_down_functions.sql` (revokes RPC access from `anon`, hides trigger functions)
- [x] Add `.env.example` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Supabase → Authentication → URL Configuration: Site URL `http://localhost:3000`, and add `http://localhost:3000/**` to Redirect URLs. **This has to be done by hand in the dashboard.** The only email link that uses it is password reset (`/auth/callback?next=/reset-password`); signup auto-confirms accounts.
- [x] Harden `/auth/callback` so `next` only accepts same-site paths (prevents an open redirect)
- [ ] Optional: custom SMTP (e.g. Resend). Supabase's built-in mailer is heavily rate-limited and may only deliver to project team addresses, so testers' password-reset emails can fail without it.
- [x] Bootstrap the first admin: owner account signed up and promoted to `admin`, and its auto-created customer row removed (2026-10-31)
- [x] Shared test admin `demo.admin@example.com`, created with the service-role key and email pre-confirmed. **Delete it or rotate its password before production.**
- [x] `supabase/seed.sql`: taxes, 5 products with variants, plans, 2 templates, 2 discounts, 2,000 customers, 3,000 subscriptions, ~7,000 invoices (loaded and checked in the database)
- [x] Replace the create-next-app `README.md` with real setup steps

## Phase 1 — Catalogue (admin)
Pattern for each module: list page → new/edit form → server action → `revalidatePath` → flash.
- [x] `/taxes`: list, create, edit, toggle active
- [x] `/products`: list (filter by type and active), form with tax picker, inline **variants** editor (attribute, value, extra price)
- [x] `/plans`: list and form (price, billing period, min quantity, dates, and the closable, pausable, renewable and auto-close flags)
- [x] `/discounts`: list and form (fixed or percent, subscription or product scope, product picker for product scope, limits, dates); show `used_count`
- [x] Staff see the catalogue read-only (RLS already enforces this; hide the edit buttons too)

## Phase 2 — People
- [x] `/customers`: list with search, create and edit, and a detail page with their subscriptions, invoices and balance
- [x] `/users` (admin): list profiles and change roles through a server action that uses `lib/supabase/admin.ts`; invite staff by email with `auth.admin.inviteUserByEmail` and `app_metadata.role`

## Phase 3 — Quotation templates
- [x] `/templates`: list and form (plan, validity days, payment terms) with editable lines (product, variant, quantity, optional price override, tax)
- [x] "Create subscription from template" copies the plan, terms and lines into a new draft subscription

## Phase 4 — Subscriptions (core flow)
- [x] `/subscriptions`: list from `subscription_overview`, filtered by status, customer and plan, paginated
- [x] New subscription: pick customer, plan, optional template and optional discount, then start date
- [x] Detail page:
  - line editor (product → variant → price = sales price + variant extra, editable), with a live total
  - status bar showing draft → quotation → confirmed → active ⇄ paused → closed
  - action buttons that show only the transitions allowed from the current state; trigger errors go to a flash message
  - "Bill now" (`bill_subscription_now`) and "Renew" (`renew_subscription`)
  - related invoices
- [x] Lock lines once the subscription is active, and add a guard in the server action
- [x] Quotation view the customer can print, showing the valid-until date

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
- [ ] Deploy to Vercel with env vars (needed before friends can use the shared test admin). Set `NEXT_PUBLIC_SITE_URL` to the production URL, since reset links are built from it before the request origin. In Supabase, change the Site URL to production and add `https://<prod-domain>/**` (and `https://*-<team>.vercel.app/**` for preview deploys) to Redirect URLs
- [ ] Before launch: remove `demo.admin@example.com`, or downgrade it to staff

---

## Conventions
- Server components read data; mutations go through `"use server"` actions that call `requireRole(...)` first
- Let the database enforce the rules (triggers and RLS). The UI only hides what the user can't do, and reports trigger errors through `flash`
- Format money and dates only with `lib/format.ts`
- One migration per change (`0002_…sql`); never edit `0001_init.sql` after it has been applied
- Commits: `feat(scope): …`, `fix(scope): …`, `chore: …`, `docs: …`

---

## Phase 1 verification (2026-10-31)

Migration `0003_catalog_discount.sql` applied by the owner. All Phase 1 forms
verified against the local production server and live demo database using
`scripts/verify-phase1.cjs`: tax create/edit/toggle; product create/edit, type/status
filters and inactive tax preservation; variant add/edit/remove; plan create/edit,
flags and date validation; discount create/edit, scope changes, invalid percentage,
atomic rollback on an invalid product, and preserved `used_count`.

Temporary staff verification (explicitly approved by the owner) passed: every
catalogue module was readable, edit controls were hidden, a forged server action
was denied, and direct table/RPC writes were rejected by RLS/admin checks. Test
fixtures and the temporary staff account were removed afterward. The live signup
trigger defaults new accounts to customer, so tests assign the staff profile
explicitly; Phase 2 role management must not rely on Auth metadata alone.

Repeat with a running server on port 3001 and `DEMO_TEST_PASSWORD` set in your
environment: `node scripts/verify-phase1.cjs`. No credentials are stored in the script.

## Phase 2 verification (2026-10-31)

Migration `0004_people_management.sql` applied by the owner. Customers support
search, create/edit, and paginated subscription/invoice history. `customer_balance`
aggregates all confirmed unpaid invoices under the caller's RLS permissions;
a 23-invoice fixture verified that balances do not depend on the visible page.

Admins can search/filter/paginate all profiles, change another account's role,
and invite staff/admins by email. `set_account_role` is service-role-only and
atomically updates profile roles and Auth `app_metadata.role`, preserves billing
contacts, and rejects self-demotion. Invites use `inviteUserByEmail`; the acceptance
page supports default session fragments, PKCE codes, and custom token-hash links,
then opens password setup. Duplicate/invalid invitations never send email.

Checks: production build, TypeScript, and ESLint pass with no errors or warnings;
`scripts/test-people.cjs` has nine passing invitation/action tests; the live
`scripts/verify-phase2.cjs` suite passed customer mutations, full balances,
role/metadata synchronization, self-demotion protection, authorization and RLS,
real generated invitation tokens, and access to password setup. Temporary staff
permissions used the owner's explicit test approval; generated fixtures were removed.
Browser review confirmed the users screen, account controls and invitation UI.

Email delivery itself was not exercised: action tests mock the mail call and real
invitation tokens use `generateLink` without sending email. Phase 0's manual redirect
URL/SMTP configuration remains open. Allow `/accept-invite` for the app origin in
Supabase Auth URLs (the localhost `/**` rule also covers it). No additional SQL is
needed beyond the already applied 0004.

## Phase 1 and Phase 2 recheck (2026-10-31)

Pulled `main` (already current at `c24382e`), rebuilt the production app, and reran
both live integration suites in full. All catalogue and people checks passed again,
including staff write denial, discount rollback, customer balances across pages,
real invitation tokens (without email delivery), and role/metadata synchronization.
All nine focused invitation/action tests passed. Temporary fixtures were removed.
Phase 3 implementation started only after both suites passed.

## Phase 3 verification (2026-10-31)

Migration `0005_quotation_templates.sql` applied by the owner. Template headers
and lines now have complete create/edit forms, validation, flash messages and
revalidation. Base products remain selectable when variants exist; quantity,
product/variant, optional price override and tax can be edited. A database trigger
rejects variants belonging to a different product. Inactive existing selections
remain visible in edit forms so they are not silently replaced.

The template action preselects it on the new-subscription form. Customer search
works across the full catalogue and preserves a customer selected from their detail
page. `create_subscription_from_template` reads a header/line snapshot and copies
plan, payment terms, notes and priced/taxed lines into a draft in one transaction.
An explicit alternate plan is supported; otherwise the template plan is used.
Empty templates and unavailable catalogue entries fail cleanly. A line constraint
failure rolls back the draft. Existing subscription prices remain unchanged when
its source template is edited.

Validation: clean production build, TypeScript and ESLint; live integration checks
in `scripts/verify-phase3.cjs` cover template/header/line mutations, zero and default
pricing, tax inheritance/overrides, preselected template/customer, customer search,
quotation validity, rollback, inactive entries, staff access and customer denial.
Phases 1–2 were rerun before Phase 3 and passed again. No invitation emails were
sent. All generated fixtures and temporary test accounts were removed.

Final Phase 3 regression: reran all three live suites against the completed production
build; all passed. Additional checks verified the exact quotation-validity interval,
cross-template line-removal isolation, missing templates and inactive plans. Browser
review confirmed the header/line editor layout and preselected subscription link.

## Phase 4 verification (2026-10-31)

Pulled `main` (already current at `f2a472a`). The owner applied
`0006_subscription_line_guards.sql`. Subscriptions now support status/customer/plan
filters with pagination, full-catalogue customer search, and distinguishable customer
options including email. Creation accepts a customer, plan, optional template and
active subscription discount, start date, expiry and payment terms.

The detail page supports product -> variant selection, automatic or overridden unit
prices, quantity/tax/description editing, and a live line-total preview. Integer-scaled
rounding matches Postgres subtotals/tax at half-cent boundaries. Estimates are shown
before eligible billing-date discounts. Line edits are scoped to the selected
subscription; inactive historical selections are preserved. Confirmation locks lines:
server guards and a row-locking database trigger reject insert/update/delete in
confirmed, active, paused and closed states, and reject reparenting/mismatched variants.

Status controls show only valid lifecycle and plan-flag transitions. Expired quotations
cannot confirm; returning to draft clears validity so reissue sets a fresh deadline.
Bill now creates an invoice and advances the schedule, while manual billing beyond
expiry is blocked. Renew extends expiry and related invoices are paginated.

`/quotations/[id]` provides a printable quotation with customer details, product lines,
terms, amounts and valid-until date. Staff/admins can preview drafts. Customers can
read/print only their own issued quotations; their portal links to those quotations.
Unissued drafts, foreign quotations and malformed IDs return 404 for authenticated
customers. Quotation estimates are explicitly before eligible invoice discounts.

The live `scripts/verify-phase4.cjs` suite passed manual creation, line defaults and
overrides, minimum quantities, line edits/removal, forged actions and direct API
line-lock attempts, quotation issuance/expiry/reissue and ownership isolation,
confirmation/activation/pause/resume/close, discount/tax invoice arithmetic, expiry
billing guard, renewal, related invoices, restricted plan flags, filters, and approved
temporary staff access. Browser interaction confirmed product, variant, quantity and
manual price changes recalculate the preview without submitting changes to seed data.
Focused tests cover rounding, editability and allowed transitions. Generated fixtures,
invoices and temporary test accounts were removed. No invitation emails were sent.

Final Phase 4 regression: clean production build, TypeScript and ESLint; all four
live integration suites passed against that build, plus all 12 focused tests.
The final run also checked excessive decimal precision and malformed quotation IDs.
Browser review confirmed the line preview interactions and quotation document layout.
No additional SQL is required beyond the already applied 0006.
