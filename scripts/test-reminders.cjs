/* eslint-disable @typescript-eslint/no-require-imports */
// Focused tests for overdue reminders (src/lib/reminders.ts) with a fake database and mailer.
// Covers dry-run gating, the claim-before-send guard, releasing a claim when email fails,
// and HTML escaping. Run: node --test scripts/test-reminders.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}) {
  const compiled = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, require: name => { if (name in mocks) return mocks[name]; throw Error('Unexpected import ' + name); }, process, URL, URLSearchParams, Intl, Date, Math, Number, String, Promise });
  return compiled.exports;
}

const format = load('src/lib/format.ts');
const invoices = load('src/lib/invoices.ts', { 'server-only': {}, 'next/navigation': { notFound() {} }, '@/lib/supabase/server': {}, '@/lib/constants': { PAYMENT_METHODS: [] }, '@/lib/subscriptions': { UUID_RE: /x/ } });

function setup({ rows, claimable = () => true, sendResult = { sent: true }, configured = true }) {
  const sent = [], updates = [];
  const email = {
    emailConfigured: () => configured,
    portalInvoiceUrl: id => `https://app.example/portal/invoices/${id}`,
    sendEmail: async msg => { sent.push(msg); return typeof sendResult === 'function' ? sendResult(msg) : sendResult; },
  };
  const { runOverdueReminders, reminderEmail } = load('src/lib/reminders.ts', { 'server-only': {}, '@/lib/email': email, '@/lib/format': format, '@/lib/invoices': invoices });
  // Chainable fake of the few PostgREST builder calls the module uses.
  const db = {
    from() {
      const q = { filters: [], values: null };
      const chain = {
        select() { return chain; }, eq(k, v) { q.filters.push(['eq', k, v]); return chain; }, lt() { return chain; }, is(k, v) { q.filters.push(['is', k, v]); return chain; },
        or() { return chain; }, order() { return chain; },
        limit() { return Promise.resolve({ data: rows, count: rows.length, error: null }); },
        update(values) { q.values = values; updates.push(q); return chain; },
        then(resolve) { // awaited update (with or without .select())
          const id = q.filters.find(f => f[1] === 'id')?.[2];
          const isClaim = q.filters.some(f => f[1] === 'reminder_count');
          resolve({ data: !isClaim || claimable(id) ? [{ id }] : [], error: null });
        },
      };
      return chain;
    },
  };
  return { runOverdueReminders, reminderEmail, db, sent, updates };
}

// Values created inside the vm sandbox have foreign prototypes; compare plain copies.
const plain = v => JSON.parse(JSON.stringify(v));
const row = (n, extra = {}) => ({ id: 'id-' + n, number: 'INV-' + n, customer_name: 'Ann <b>', customer_email: `c${n}@example.com`, due_date: '2026-10-01', amount_due: 590, reminder_count: 0, last_reminder_at: null, ...extra });
const now = new Date('2026-10-31T04:00:00Z');

test('dry run unless REMINDERS_ENABLED=true and email is configured', async () => {
  delete process.env.REMINDERS_ENABLED;
  let s = setup({ rows: [row(1)] });
  let run = await s.runOverdueReminders(s.db, { now });
  assert.equal(run.mode, 'dry-run'); assert.match(run.reason, /REMINDERS_ENABLED/); assert.equal(s.sent.length, 0); assert.equal(s.updates.length, 0);
  assert.equal(run.preview[0].days_overdue, 30); assert.equal(run.preview[0].reminder, 1);
  process.env.REMINDERS_ENABLED = 'true';
  s = setup({ rows: [row(1)], configured: false });
  run = await s.runOverdueReminders(s.db, { now });
  assert.equal(run.mode, 'dry-run'); assert.match(run.reason, /RESEND_API_KEY/); assert.equal(s.sent.length, 0);
  s = setup({ rows: [row(1)] });
  run = await s.runOverdueReminders(s.db, { now, dryRun: true });
  assert.equal(run.mode, 'dry-run'); assert.equal(s.sent.length, 0);
});

test('sends after claiming, skips invoices another run already claimed', async () => {
  process.env.REMINDERS_ENABLED = 'true';
  const s = setup({ rows: [row(1), row(2, { reminder_count: 1, last_reminder_at: '2026-10-20T00:00:00Z' })], claimable: id => id === 'id-1' });
  const run = await s.runOverdueReminders(s.db, { now });
  assert.equal(run.mode, 'send');
  assert.deepEqual(plain(run.sent), ['INV-1']); assert.equal(s.sent.length, 1, 'INV-2 was claimed elsewhere, so no email');
  assert.deepEqual(plain(s.updates[0].values), { reminder_count: 1, last_reminder_at: now.toISOString() });
  assert.ok(s.updates[1].filters.some(f => f[0] === 'eq' && f[1] === 'last_reminder_at' && f[2] === '2026-10-20T00:00:00Z'), 'Claim matches the previous reminder time');
});

test('a failed email releases the claim for the next run', async () => {
  process.env.REMINDERS_ENABLED = 'true';
  const s = setup({ rows: [row(3, { reminder_count: 2, last_reminder_at: '2026-10-01T00:00:00Z' })], sendResult: { sent: false, error: 'Email provider responded 500.' } });
  const run = await s.runOverdueReminders(s.db, { now });
  assert.deepEqual(plain(run.sent), []); assert.deepEqual(plain(run.failed), [{ number: 'INV-3', error: 'Email provider responded 500.' }]);
  assert.deepEqual(plain(s.updates.at(-1).values), { reminder_count: 2, last_reminder_at: '2026-10-01T00:00:00Z' }, 'Claim released');
});

test('reminder email escapes customer data and links to the portal', () => {
  const { reminderEmail } = setup({ rows: [] });
  const mail = reminderEmail(row(4), now);
  assert.equal(mail.subject, 'Reminder: invoice INV-4 is overdue');
  assert.ok(mail.html.includes('Ann &lt;b&gt;')); assert.ok(!mail.html.includes('Ann <b>'));
  assert.ok(mail.html.includes('https://app.example/portal/invoices/id-4')); assert.ok(mail.html.includes('30 days ago'));
});
