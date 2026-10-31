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

> **Code vs. verified (2026-10-31):** Phases 1–7 are implemented and verified. Phase 8 testing is done: SQL, Playwright and performance checks pass, and the CI workflow is written but hasn't run on GitHub yet. Left: finishing the Vercel deploy (see its section below; the Phase 5–8 work isn't pushed yet), the first real cron run on 2026-11-01, and the pause decision in Phase 6.

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
- [x] `/invoices`: list from `invoice_overview` with an overdue badge and filters for status, customer, date range and overdue
- [x] Detail page: lines, discounts (`invoice_discount_details`), totals, payments, and Confirm, Cancel and "Record payment" actions
- [x] Printable invoice page (`/invoices/[id]/print`, print CSS), shared by staff and customers
- [x] "Mark sent": set `sent_at`; email via Resend when `RESEND_API_KEY` is set
- [x] `/payments`: list of all payments filtered by method and date
- [x] Decision (owner, 2026-10-31): billing-generated invoices are issued as `confirmed` (`_issue_subscription_invoice`, migration 0007). Verified in the database: a billing run created a confirmed invoice
- [x] Database integrity (0007): no manual invoice inserts, amounts/parties/periods read-only for app users, invoice lines read-only, payments insert-only (admins may delete), cancelling returns discount uses. Verified in a rolled-back admin-role transaction
- [x] `run_billing` refuses future dates (0009)
- [x] Admin "remove payment" correction on the invoice page

## Phase 6 — Customer portal
- [x] `/portal`: their subscriptions with status, plan, next invoice and expiry, plus Pause, Resume, Close and Renew controls shown according to the plan flags (drafts hidden; amount-to-pay summary)
- [x] `/portal/subscriptions/[id]`: lines, invoices and history (`subscription_events`, migration 0007; also on the staff subscription page)
- [x] `/portal/invoices`: list (filters, pagination) and detail, with "Pay now" (`portal_pay_invoice`) and a printable invoice
- [x] Profile page (name, phone, company, address) through `portal_update_profile`; customers can no longer update their `customers` row directly
- [ ] **Decide:** pausing doesn't skip billing. Resuming catches up on every period missed while paused, because `next_invoice_date` isn't moved forward. Should resume skip the paused periods instead?

## Phase 7 — Automation
- [x] Schedule billing daily: `pg_cron` job `daily-billing` at 00:30 UTC (06:00 IST) → `select public._run_billing();` (migration `0008_cron.sql`). Verified in `cron.job`; there was no backlog (0 due on 2026-10-31, about 113 due the next day). Dashboard shows schedule status via `billing_schedule_status()`
- [x] pg_cron proven to execute on this project: a temporary `select 1` job succeeded at 07:26, 07:27 and 07:28 UTC on 2026-10-31, then was removed
- [ ] Confirm the first real `daily-billing` run succeeded (2026-11-01 06:00 IST): dashboard status line or `cron.job_run_details`
- [x] Expired quotations are marked: "Expired" badge and "Expired quotations" filter on `/subscriptions`, plus a dashboard follow-up link. They stay in `quotation` status so staff can return them to draft and reissue (verified in `verify-phase4.cjs`)
- [x] Overdue reminders: `/api/cron/overdue-reminders` (migration `0010_overdue_reminders.sql`: `reminder_count`, `last_reminder_at`). At most once every 7 days and 3 times per invoice; each invoice is claimed before emailing, and the claim is released if the email fails. Protected by `CRON_SECRET` (401 without it; 503 if unset). Scheduled in `vercel.json` at 03:30 UTC (09:00 IST). Verified: auth rejection and a live dry run (787 seeded overdue invoices found, nothing sent); send path covered by `scripts/test-reminders.cjs`
- [ ] Turn reminders on after deploy: set `CRON_SECRET` and `RESEND_API_KEY`, then `REMINDERS_ENABLED=true` in Vercel. **Only once the seeded demo customers are gone**, otherwise the first run emails placeholder addresses

## Phase 8 — Quality & ship
- [x] SQL tests: `supabase/tests/database_test.sql`, one PL/pgSQL block that always rolls back. It checks:
  - lifecycle transitions and plan flags
  - history events
  - billing maths: best product discount, subscription discount spread, tax rounding
  - discount usage limits, and that cancelling releases them
  - double billing: the schedule advances, and the unique period index holds
  - catch-up billing
  - payment overflow, partial and full payments, and removing a payment
  - RLS isolation between two customers, plus staff limits (catalogue writes, invoice totals, payment edits and deletes)
  - portal functions, and future billing runs
  All passed on the live project, and nothing persisted. Runner: `npm run test:db` (needs `SUPABASE_DB_URL`)
- [x] Playwright smoke test (`e2e/smoke.spec.ts`, `npm run test:e2e`): sign up in the UI → admin creates the subscription, adds a line, confirms, activates and bills it → customer pays ₹590.00 in the portal → staff see Paid. Passes; it uses **Bill now** instead of the global Run billing so it never bills other subscriptions. Fixtures are cleaned up
- [x] `npm run lint`, `npm run typecheck` and `npm run build` with no errors; `npm test` runs 16 focused tests
- [ ] CI workflow `.github/workflows/ci.yml`: lint, types, build and focused tests on push and PRs; database tests when the `SUPABASE_DB_URL` secret exists; live suites, Playwright and the perf check on manual dispatch. **Not yet run on GitHub** (Phase 5–8 work isn't pushed). Repository secrets needed: `SUPABASE_DB_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DEMO_TEST_PASSWORD`
- [x] Performance check:
  - HTTP medians for 13 list pages, all under 2 s, with the slowest (`/subscriptions`) at about 1.05 s. This is the local production server against the Tokyo database (`npm run perf`).
  - At the target volume (5,000 subscriptions and 20,000 invoices, in a rolled-back transaction, `supabase/tests/perf_check.sql`), every list query takes 56 ms or less as the admin with RLS.
- [ ] Deploy to Vercel with env vars (needed before friends can use the shared test admin). Set `NEXT_PUBLIC_SITE_URL` to the production URL, since reset links are built from it before the request origin. In Supabase, change the Site URL to production and add `https://<prod-domain>/**` (and `https://*-<team>.vercel.app/**` for preview deploys) to Redirect URLs
- [ ] Before launch: remove `demo.admin@example.com`, or downgrade it to staff
- [ ] Finding (low): RLS still lets a customer read their own *draft* subscriptions and invoices through the API, although the UI hides them. Consider adding `status <> 'draft'` to the customer branch of those select policies

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

## Phases 5–7 implementation (2026-10-31)

Migrations `0007_invoices_portal.sql`, `0008_cron.sql` and `0009_run_billing_no_future.sql`
were applied to the live project via the Supabase connection, with the owner's approval.
Owner decision: billing invoices are issued as confirmed. Code added:
- Invoice list: customer filter and validated dates.
- Invoice detail: discount breakdown, Mark sent, admin payment removal and validated payments.
- Shared printable page at `/invoices/[id]/print`.
- Payments list: validated filters.
- Portal: home summary, subscription detail with history, invoice filters and pagination, profile page.
- Staff subscription history.
- Dashboard: billing schedule status.

Verified so far: TypeScript, ESLint and the production build are clean; all 12 focused tests pass.
A rolled-back admin-role SQL transaction confirmed:
- A billing run issues a confirmed invoice.
- Edits to invoice totals, manual invoice inserts, invoice-line deletes and payment edits are blocked.
- Admins can delete payments.
- Status changes are logged with their actor.

The `daily-billing` cron job exists and is active. The Supabase security advisor flags only the
intended definer RPCs, each of which checks the caller itself.

## Phase 5 and 6 verification (2026-10-31)

`DEMO_TEST_PASSWORD` is now in the git-ignored `.env.local`. Against a fresh production build
on port 3001:
- `scripts/verify-phase5.cjs` passed:
  - Bill now issues a confirmed invoice (100 − 10% + 18% tax = 106.20).
  - Invoice filters work, and malformed parameters return 200.
  - The detail page shows discount names; the print page and Mark sent work.
  - Payment validation and the database overpayment guard hold; partial then full payment works; admin payment removal works.
  - Payments list filters work.
  - Database locks hold, and future billing runs are rejected.
  - Cancelling returns discount uses; Confirm and mark sent works on drafts.
  - Staff can record payments but can't remove them.
- `scripts/verify-phase6.cjs` passed:
  - The portal lists only the customer's own non-draft subscriptions.
  - Subscription detail shows lines, invoices and history; foreign, draft and malformed ids return 404.
  - Pause, resume and renew work, with "You" attribution.
  - Plan flags and ownership are enforced, even for forged requests; return paths stay in the portal.
  - Invoice filters work; drafts and foreign invoices are isolated; discount codes stay private; printing and paying work.
  - Profile validation works; the billing email is protected, and customers can no longer write their row directly.
  - History is read-only and scoped to the owner.

One bug found and fixed: form posts send textarea line breaks as CRLF, so addresses are now
stored with plain newlines, in both the portal profile and the staff customer form.

Regression: the Phase 1–4 suites all pass again against the same build, after 0007's RLS
and billing changes. Focused tests (12) pass; TypeScript, ESLint and the build are clean.
All fixtures and temporary accounts were removed (checked: no smoke-test rows or accounts
remain, invoices are back to 6,990, and there are still 2 admin accounts). No email was sent.


## Vercel deploy (2026-10-31)

- The Vercel project `subscription-plan` (team `abhisheks-projects-3ba4a970`) is linked to GitHub
  `abhishiv17/Subscription-Plan`, so every push to `main` deploys to production.
  Framework is Next.js, Node is 22.x, and functions now run in `hnd1`, close to Supabase in ap-northeast-1.
- The first production deploy `dpl_8pk7kH1bxTABmp61pH9HMhkTnQv1` is commit `5d928b3` (Phase 4). The Phase 5 work isn't pushed yet.
  It's live at https://subscription-plan-rho.vercel.app: `/` and `/login` both return 200.
- These env vars are set: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key) on all environments,
  and `NEXT_PUBLIC_SITE_URL=https://subscription-plan-rho.vercel.app` on production.
- Still to do: add `SUPABASE_SERVICE_ROLE_KEY` (sensitive) in Vercel, then set the Supabase Auth Site URL and Redirect URLs
  to the production domain and redeploy. After that, tick the Phase 8 deploy item.

## Phase 7 and Phase 8 testing (2026-10-31)

Migration `0010_overdue_reminders.sql` was applied via the Supabase connection with the owner's approval.
It added reminder columns and a partial index. It also recreated `invoice_overview`, now readable only by
signed-in users; it previously granted anon full privileges, though RLS showed anon nothing.
The Phase 4 code that is live on Vercel still works with the new schema: the extra view columns
and the stricter policies don't affect it.

Phase 7:
- pg_cron is proven to execute.
- Expired-quotation badge, filter and dashboard link.
- Overdue reminders route, off by default. A dry run found 787 seeded overdue invoices, so sending also
  requires `REMINDERS_ENABLED=true`.
- `vercel.json` cron: it returns 503 until `CRON_SECRET` is set, so pushing it is safe.
- `.env.example` documents every variable.

Phase 8:
- **Database tests:** all passed on the live project and rolled back.
- **Playwright:** the smoke test passes.
- **Focused tests:** 16 pass (adds `test-reminders.cjs` with a fake database and mailer).
- **Regression:** all six live suites pass again against the final build, after 0010 recreated the invoice view. Phase 4 now also checks the expired-quotation filter, badge and dashboard link.
- **Performance:** checked as recorded above.
- **CI:** workflow added with npm scripts `typecheck`, `test`, `test:db`, `test:live`, `test:e2e` and `perf`.

Final database check: no test users, customers or plans remain. There are 6,990 invoices, 3,000 subscriptions,
2 admins and only the `daily-billing` cron job. No email was sent.

