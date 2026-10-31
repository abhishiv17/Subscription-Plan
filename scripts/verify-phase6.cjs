/* eslint-disable @typescript-eslint/no-require-imports */
// Phase 6 (customer portal) live checks. Run against a production server on port 3001
// (or TEST_BASE_URL) with DEMO_TEST_PASSWORD in the environment or .env.local.
// Creates a temporary customer account and isolated fixtures, and removes them in `finally`.
const { randomUUID } = require('node:crypto');
const { assert, service, session, findForm, check, flashOf, fixtures, activeSubscription, signIn } = require('./lib/live.cjs');

const fx = fixtures();
const suffix = randomUUID().slice(0, 8);

(async () => {
  assert.ok(process.env.DEMO_TEST_PASSWORD, 'Set DEMO_TEST_PASSWORD (environment or .env.local)');
  const admin = await signIn('demo.admin@example.com', process.env.DEMO_TEST_PASSWORD);
  const name = 'Portal smoke ' + suffix;
  const plan = await fx.create('plans', { name, price: 100, billing_period: 'monthly', pausable: true, closable: true, renewable: true });
  const locked = await fx.create('plans', { name: name + ' locked', price: 100, billing_period: 'monthly', pausable: false, closable: false, renewable: false });
  const tax = await fx.create('taxes', { name, rate: 18 });
  const product = await fx.create('products', { name, sales_price: 100, tax_id: tax.id });
  const discount = await fx.create('discounts', { name: name + ' loyalty', code: 'SECRET-' + suffix, scope: 'subscription', discount_type: 'percent', value: 10 });

  const email = `phase6-${suffix}@example.com`, password = 'Portal-' + randomUUID() + '!aA';
  const me = await fx.user(email, password, name + ' customer');
  const other = await fx.create('customers', { name: name + ' other', email: `phase6-other-${suffix}@example.com` });
  const customer = await signIn(email, password);

  const mine = await activeSubscription(fx, { customerId: me.customer.id, planId: plan.id, productId: product.id, taxId: tax.id, discountId: discount.id, description: 'Portal line ' + suffix, expiryDate: '2026-12-31' });
  const lockedSub = await activeSubscription(fx, { customerId: me.customer.id, planId: locked.id, productId: product.id, taxId: tax.id, expiryDate: '2027-12-31' });
  const foreign = await activeSubscription(fx, { customerId: other.id, planId: plan.id, productId: product.id, taxId: tax.id });
  const draftSub = await fx.create('subscriptions', { customer_id: me.customer.id, plan_id: plan.id });
  const invoiceId = check(await admin.db.rpc('bill_subscription_now', { p_subscription_id: mine.id }));
  const foreignInvoiceId = check(await admin.db.rpc('bill_subscription_now', { p_subscription_id: foreign.id }));
  const draftInvoice = await fx.create('invoices', { customer_id: me.customer.id, status: 'draft', total: 10, subtotal: 10 });
  const invoice = await fx.row('invoices', invoiceId);
  assert.equal(invoice.status, 'confirmed');

  // Portal home: own non-draft subscriptions only, outstanding summary.
  let page = await customer.get('/portal');
  assert.equal(page.status, 200);
  assert.ok(page.html.includes(mine.number)); assert.ok(page.html.includes(lockedSub.number));
  assert.ok(!page.html.includes(draftSub.number), 'Draft subscriptions are hidden'); assert.ok(!page.html.includes(foreign.number));
  assert.ok(page.html.includes('/portal/subscriptions/' + mine.id)); assert.ok(page.html.includes('Amount to pay'));
  console.log('PASS portal lists only own non-draft subscriptions with an amount-to-pay summary');

  // Subscription detail: lines, invoices, history; foreign, draft and malformed ids 404.
  const detail = '/portal/subscriptions/' + mine.id;
  page = await customer.get(detail);
  assert.equal(page.status, 200);
  for (const text of ['Portal line ' + suffix, invoice.number, 'History', 'Activated', 'Per month']) assert.ok(page.html.includes(text), text);
  for (const id of [foreign.id, draftSub.id, 'not-a-uuid']) assert.equal((await customer.get('/portal/subscriptions/' + id)).status, 404, id);
  console.log('PASS subscription detail with lines, invoices and history; foreign/draft/malformed ids are 404');

  // Self-service: pause, resume, renew, cancel follow plan flags; forged requests fail.
  let url = await customer.post(detail, findForm(page, 'Pause'));
  assert.equal(flashOf(url).path, detail); assert.ok(flashOf(url).ok);
  assert.equal((await fx.row('subscriptions', mine.id)).status, 'paused');
  page = await customer.get(detail);
  assert.ok(page.html.includes('Paused')); assert.ok(page.html.includes('You'), 'Own actions are attributed to "You"');
  url = await customer.post(detail, findForm(page, 'Resume')); assert.ok(flashOf(url).ok);
  assert.equal((await fx.row('subscriptions', mine.id)).status, 'active');
  page = await customer.get(detail);
  url = await customer.post(detail, findForm(page, 'Renew')); assert.ok(flashOf(url).ok);
  assert.equal((await fx.row('subscriptions', mine.id)).expiry_date, '2027-01-31');
  page = await customer.get(detail); assert.ok(page.html.includes('End date set to'));
  const pauseForm = findForm(page, 'Pause'), cancelForm = findForm(page, 'Cancel subscription');
  const lockedPath = '/portal/subscriptions/' + lockedSub.id;
  const lockedPage = await customer.get(lockedPath);
  for (const label of ['Pause', 'Renew', 'Cancel subscription']) assert.ok(!findForm(lockedPage, label), 'Locked plan hides ' + label);
  for (const form of [pauseForm, cancelForm]) {
    url = await customer.post(lockedPath, form.replaceAll(mine.id, lockedSub.id));
    assert.ok(flashOf(url).err, 'Plan flags are enforced by the database');
  }
  assert.equal((await fx.row('subscriptions', lockedSub.id)).status, 'active');
  url = await customer.post(detail, pauseForm.replaceAll(mine.id, foreign.id));
  assert.ok(flashOf(url).err); assert.equal((await fx.row('subscriptions', foreign.id)).status, 'active');
  url = await customer.post(detail, pauseForm.replaceAll(detail, 'https://evil.example/x'));
  assert.equal(flashOf(url).path, '/portal', 'Foreign return paths fall back to /portal: ' + url);
  check(await service.from('subscriptions').update({ status: 'active' }).eq('id', mine.id));
  console.log('PASS pause/resume/renew, history attribution, plan flags and ownership enforced, safe return paths');

  // Invoices: list filters and pagination, drafts hidden, discount names without codes, pay now.
  page = await customer.get('/portal/invoices');
  assert.ok(page.html.includes(invoice.number)); assert.ok(!page.html.includes(draftInvoice.number));
  assert.ok(!page.html.includes((await fx.row('invoices', foreignInvoiceId)).number));
  assert.ok((await customer.get('/portal/invoices?filter=outstanding')).html.includes(invoice.number));
  assert.ok((await customer.get('/portal/invoices?filter=overdue')).html.includes(invoice.number));
  assert.ok(!(await customer.get('/portal/invoices?filter=paid')).html.includes(invoice.number));
  assert.equal((await customer.get('/portal/invoices?filter=bogus&page=abc')).status, 200);
  const invPath = '/portal/invoices/' + invoiceId;
  page = await customer.get(invPath);
  assert.ok(page.html.includes(name + ' loyalty')); assert.ok(!page.html.includes('SECRET-' + suffix), 'Discount codes stay private');
  for (const id of [draftInvoice.id, foreignInvoiceId, 'not-a-uuid']) {
    assert.equal((await customer.get('/portal/invoices/' + id)).status, 404, 'portal ' + id);
    assert.equal((await customer.get('/invoices/' + id + '/print')).status, 404, 'print ' + id);
  }
  const print = await customer.get('/invoices/' + invoiceId + '/print');
  assert.equal(print.status, 200); assert.ok(print.html.includes(invoice.number)); assert.ok(print.html.includes('/portal/invoices/' + invoiceId));
  assert.ok((await customer.get('/invoices/' + invoiceId)).location?.endsWith('/portal'), 'Staff invoice page redirects customers');
  assert.equal((await customer.db.rpc('invoice_discount_details', { p_invoice_id: foreignInvoiceId })).data.length, 0);
  assert.equal((await session().get('/invoices/' + invoiceId + '/print')).status, 307, 'Signed-out users go to login');
  const payForm = findForm(page, 'Pay ' + page.html.match(/>Pay (₹[^<]+)</)?.[1]);
  assert.ok(flashOf(await customer.post(invPath, payForm, { method: 'cash' })).err, 'Portal accepts card, UPI or bank transfer');
  assert.ok((await customer.db.rpc('portal_pay_invoice', { p_invoice_id: foreignInvoiceId })).error, 'Cannot pay a foreign invoice');
  assert.ok((await customer.db.from('payments').insert({ invoice_id: invoiceId, method: 'card', amount: 1 })).error, 'No direct payment inserts');
  url = await customer.post(invPath, payForm, { method: 'upi' }); assert.ok(flashOf(url).ok, url);
  const paid = await fx.row('invoices', invoiceId);
  assert.equal(paid.status, 'paid'); assert.equal(Number(paid.amount_paid), Number(paid.total));
  page = await customer.get(invPath); assert.ok(page.html.includes('fully paid'));
  assert.ok((await customer.get('/portal/invoices?filter=paid')).html.includes(invoice.number));
  console.log('PASS portal invoices: filters, draft/foreign isolation, private discount codes, printing and paying');

  // Profile: edit own details through the RPC; email and other rows are protected.
  page = await customer.get('/portal/profile');
  assert.equal(page.status, 200); assert.ok(page.html.includes(email));
  const profileForm = findForm(page, 'Save profile');
  const values = { name: name + ' renamed', phone: '+91 98765 43210', company: 'Acme ' + suffix, address: '1 Test Road\nBengaluru' };
  for (const [bad, why] of [[{ ...values, name: ' ' }, 'blank name'], [{ ...values, phone: 'call me' }, 'bad phone'], [{ ...values, address: 'x'.repeat(501) }, 'long address']])
    assert.ok(flashOf(await customer.post('/portal/profile', profileForm, bad)).err, why);
  url = await customer.post('/portal/profile', profileForm, values); assert.ok(flashOf(url).ok);
  const saved = await fx.row('customers', me.customer.id);
  assert.equal(saved.name, values.name); assert.equal(saved.phone, values.phone); assert.equal(saved.company, values.company); assert.equal(saved.address, values.address);
  assert.equal(saved.email, email);
  assert.equal(check(await service.from('profiles').select('full_name').eq('id', me.id).single()).full_name, values.name);
  const direct = await customer.db.from('customers').update({ email: 'hijack-' + suffix + '@example.com' }).eq('id', me.customer.id).select('id');
  assert.ok(direct.error || direct.data.length === 0, 'Customers cannot update their row directly');
  assert.equal((await fx.row('customers', me.customer.id)).email, email);
  assert.ok((await customer.get('/portal')).html.includes(values.name), 'Shell shows the new name');
  console.log('PASS profile editing with validation; billing email and direct writes protected');

  // History table is read-only and scoped.
  assert.equal((await customer.db.from('subscription_events').select('id').eq('subscription_id', foreign.id)).data.length, 0);
  assert.ok((await customer.db.from('subscription_events').insert({ subscription_id: mine.id, event: 'status' })).error);
  assert.ok((await admin.get('/subscriptions/' + mine.id)).html.includes(values.name), 'Staff history names the customer');
  console.log('PASS subscription history is read-only, scoped to the owner, and visible to staff');
  console.log('Phase 6 integration checks passed.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => fx.cleanup());
