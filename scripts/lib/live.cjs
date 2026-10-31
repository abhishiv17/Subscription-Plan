/* eslint-disable @typescript-eslint/no-require-imports */
// Shared helpers for the live integration suites (Phase 5 onwards). They drive the real
// server with real sessions; nothing here stores credentials.
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
process.loadEnvFile('.env.local');

const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const decode = s => (s || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** A cookie-backed Supabase session plus fetch helpers that submit server-action forms. */
function session() {
  const jar = new Map();
  const db = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: cs => cs.forEach(c => jar.set(c.name, c.value)) },
  });
  const headers = () => ({ cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), origin: base });
  return {
    db,
    async get(path) {
      const r = await fetch(base + path, { headers: headers(), redirect: 'manual' });
      return { status: r.status, html: await r.text(), location: r.headers.get('location') };
    },
    /** Posts a server-action form (its hidden inputs plus `values`) and returns the redirect location. */
    async post(path, form, values = {}) {
      assert.ok(form, `Missing form on ${path}`);
      const body = new FormData();
      for (const tag of form.match(/<input\b[^>]*>/g) || []) {
        if (!tag.includes('type="hidden"')) continue;
        const name = decode(tag.match(/name="([^"]*)"/)?.[1]);
        if (name) body.append(name, decode(tag.match(/value="([^"]*)"/)?.[1]));
      }
      for (const [k, v] of Object.entries(values)) for (const entry of Array.isArray(v) ? v : [v]) if (entry !== null) body.append(k, String(entry));
      const r = await fetch(base + path, { method: 'POST', headers: headers(), body, redirect: 'manual' });
      const location = r.headers.get('location');
      assert.ok([303, 307].includes(r.status), `POST ${path}: ${r.status} ${(await r.text()).slice(0, 160)}`);
      return location;
    },
  };
}

const forms = html => html.match(/<form\b[^>]*>[\s\S]*?<\/form>/g) || [];
const findForm = (page, label) => forms(page.html).find(f => f.includes('>' + label + '<'));
const check = result => { if (result.error) throw Error(result.error.message); return result.data; };
const flashOf = url => { const u = new URL(url, base); return { ok: u.searchParams.get('ok'), err: u.searchParams.get('err'), path: u.pathname }; };

/** Tracks rows created by a suite and removes them (children first) in `cleanup`. */
function fixtures() {
  const made = { invoices: [], subscriptions: [], product_variants: [], products: [], plans: [], taxes: [], discounts: [], customers: [], users: [] };
  return {
    made,
    async create(table, values) { const r = check(await service.from(table).insert(values).select('*').single()); made[table].push(r.id); return r; },
    async row(table, id) { return check(await service.from(table).select('*').eq('id', id).single()); },
    async user(email, password, fullName) {
      const u = check(await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } }));
      made.users.push(u.user.id);
      const customer = check(await service.from('customers').select('*').eq('user_id', u.user.id).single());
      made.customers.push(customer.id);
      return { id: u.user.id, customer };
    },
    async cleanup() {
      let failed = false;
      const run = async (label, p) => { const r = await p; if (r.error) { console.error('Cleanup failed:', label, r.error.message); failed = true; } };
      if (made.subscriptions.length) await run('subscription invoices', service.from('invoices').delete().in('subscription_id', made.subscriptions));
      if (made.customers.length) await run('customer invoices', service.from('invoices').delete().in('customer_id', made.customers));
      if (made.invoices.length) await run('invoices', service.from('invoices').delete().in('id', made.invoices));
      for (const table of ['subscriptions', 'product_variants', 'products', 'plans', 'taxes', 'discounts', 'customers'])
        if (made[table].length) await run(table, service.from(table).delete().in('id', made[table]));
      for (const id of made.users) await run('auth user', service.auth.admin.deleteUser(id));
      if (failed) process.exitCode = 1;
    },
  };
}

/** Creates an active subscription through the real lifecycle (draft → confirmed → active). */
async function activeSubscription(fx, { customerId, planId, productId, taxId, discountId = null, startDate = '2026-10-01', price = 100, quantity = 1, expiryDate = null, description = null }) {
  const sub = await fx.create('subscriptions', { customer_id: customerId, plan_id: planId, discount_id: discountId, start_date: startDate, expiry_date: expiryDate, payment_terms_days: 7 });
  check(await service.from('subscription_lines').insert({ subscription_id: sub.id, product_id: productId, quantity, unit_price: price, tax_id: taxId, description }));
  check(await service.from('subscriptions').update({ status: 'confirmed' }).eq('id', sub.id));
  check(await service.from('subscriptions').update({ status: 'active' }).eq('id', sub.id));
  return fx.row('subscriptions', sub.id);
}

async function signIn(email, password) {
  const s = session();
  const login = check(await s.db.auth.signInWithPassword({ email, password }));
  return Object.assign(s, { userId: login.user.id });
}

module.exports = { assert, base, service, session, forms, findForm, check, flashOf, fixtures, activeSubscription, signIn };
