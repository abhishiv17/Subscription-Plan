/* eslint-disable @typescript-eslint/no-require-imports */
// Phase 5 (invoices & payments) live checks. Run against a production server on port 3001
// (or TEST_BASE_URL) with DEMO_TEST_PASSWORD in the environment or .env.local.
// Creates isolated fixtures plus one temporary account, and removes them in `finally`.
const { randomUUID } = require('node:crypto');
const { assert, service, findForm, forms, check, flashOf, fixtures, activeSubscription, signIn } = require('./lib/live.cjs');

const fx = fixtures();
const suffix = randomUUID().slice(0, 8);
const today = new Date().toISOString().slice(0, 10);

(async () => {
  assert.ok(process.env.DEMO_TEST_PASSWORD, 'Set DEMO_TEST_PASSWORD (environment or .env.local)');
  const admin = await signIn('demo.admin@example.com', process.env.DEMO_TEST_PASSWORD);
  const name = 'Invoices smoke ' + suffix;
  const plan = await fx.create('plans', { name, price: 100, billing_period: 'monthly', pausable: true, closable: true, renewable: true });
  const tax = await fx.create('taxes', { name, rate: 18 });
  const product = await fx.create('products', { name, sales_price: 100, tax_id: tax.id });
  const discount = await fx.create('discounts', { name: name + ' ten percent', scope: 'subscription', discount_type: 'percent', value: 10 });
  const customer = await fx.create('customers', { name: name + ' customer', email: `phase5-${suffix}@example.com` });
  const other = await fx.create('customers', { name: name + ' other', email: `phase5-other-${suffix}@example.com` });
  const sub = await activeSubscription(fx, { customerId: customer.id, planId: plan.id, productId: product.id, taxId: tax.id, discountId: discount.id, description: 'Phase 5 line' });

  // Bill now: billing-generated invoices are issued as confirmed.
  let page = await admin.get('/subscriptions/' + sub.id);
  let url = await admin.post('/subscriptions/' + sub.id, findForm(page, 'Bill now'));
  assert.ok(url.includes('/invoices/'), 'Bill now opens the invoice');
  const invoiceId = flashOf(url).path.split('/')[2];
  let invoice = await fx.row('invoices', invoiceId);
  assert.equal(invoice.status, 'confirmed');
  assert.equal(Number(invoice.subtotal), 100); assert.equal(Number(invoice.discount_total), 10);
  assert.equal(Number(invoice.tax_total), 16.2); assert.equal(Number(invoice.total), 106.2);
  assert.equal((await fx.row('discounts', discount.id)).used_count, 1);
  console.log('PASS bill now issues a confirmed invoice with discount and tax maths');

  // List: customer, overdue, status and date filters; malformed parameters never 500.
  const listed = await admin.get('/invoices?customer=' + customer.id);
  assert.equal(listed.status, 200); assert.ok(listed.html.includes(invoice.number)); assert.ok(listed.html.includes(customer.name));
  assert.ok(!(await admin.get('/invoices?customer=' + other.id)).html.includes(invoice.number));
  assert.ok((await admin.get(`/invoices?filter=overdue&customer=${customer.id}`)).html.includes(invoice.number), 'Due 7 days after 1 Oct, so overdue');
  assert.ok(!(await admin.get(`/invoices?filter=paid&customer=${customer.id}`)).html.includes(invoice.number));
  assert.ok((await admin.get(`/invoices?from=2026-10-01&to=2026-10-01&customer=${customer.id}`)).html.includes(invoice.number));
  assert.ok(!(await admin.get(`/invoices?from=2026-10-02&customer=${customer.id}`)).html.includes(invoice.number));
  for (const bad of ['/invoices?from=2026-13-45&to=nope&customer=bad&page=-3', '/invoices?filter=bogus', '/payments?method=bogus&from=x&to=2026-02-30', '/dashboard?from=bad&to=2026-99-99'])
    assert.equal((await admin.get(bad)).status, 200, bad);
  assert.ok((await admin.get('/customers/' + customer.id)).html.includes('/invoices?customer=' + customer.id));
  console.log('PASS invoice list filters (customer, overdue, status, dates) and malformed parameters');

  // Detail: discount breakdown, print view, mark sent.
  const path = '/invoices/' + invoiceId;
  page = await admin.get(path);
  assert.ok(page.html.includes(name + ' ten percent'), 'Discount name shown'); assert.ok(page.html.includes('not sent yet'));
  assert.ok(findForm(page, 'Cancel invoice'), 'Unpaid confirmed invoice can be cancelled');
  const print = await admin.get(path + '/print');
  assert.equal(print.status, 200); assert.ok(print.html.includes(invoice.number)); assert.ok(print.html.includes('>Print<')); assert.ok(print.html.includes('Phase 5 line'));
  assert.equal((await admin.get('/invoices/not-a-uuid')).status, 404);
  assert.equal((await admin.get('/invoices/not-a-uuid/print')).status, 404);
  url = await admin.post(path, findForm(page, 'Mark sent'));
  assert.ok(flashOf(url).ok, url); assert.ok((await fx.row('invoices', invoiceId)).sent_at);
  page = await admin.get(path); assert.ok(page.html.includes(' sent ')); assert.ok(findForm(page, 'Mark sent again'));
  console.log('PASS detail discounts, printable page and mark sent');

  // Record payment: validation, overpayment rejected by the database, partial then full payment.
  const payForm = findForm(page, 'Record payment');
  const good = { amount: 50, method: 'bank_transfer', payment_date: today, note: 'Ref 123' };
  for (const [values, why] of [
    [{ ...good, amount: 0 }, 'zero'], [{ ...good, amount: 10.005 }, 'three decimals'], [{ ...good, method: 'bitcoin' }, 'unknown method'],
    [{ ...good, payment_date: '2099-01-01' }, 'future date'], [{ ...good, payment_date: '2026-02-30' }, 'impossible date'], [{ ...good, amount: 106.21 }, 'overpayment'],
  ]) assert.ok(flashOf(await admin.post(path, payForm, values)).err, 'Rejects ' + why);
  assert.equal(Number((await fx.row('invoices', invoiceId)).amount_paid), 0);
  url = await admin.post(path, payForm, good); assert.ok(flashOf(url).ok);
  invoice = await fx.row('invoices', invoiceId); assert.equal(Number(invoice.amount_paid), 50); assert.equal(invoice.status, 'confirmed');
  page = await admin.get(path); assert.ok(!findForm(page, 'Cancel invoice'), 'Invoices with payments cannot be cancelled');
  url = await admin.post(path, findForm(page, 'Record payment'), { ...good, amount: 56.2, method: 'upi' }); assert.ok(flashOf(url).ok);
  invoice = await fx.row('invoices', invoiceId); assert.equal(invoice.status, 'paid'); assert.equal(Number(invoice.amount_paid), 106.2);
  page = await admin.get(path); assert.ok(!findForm(page, 'Record payment')); assert.ok(page.html.includes('fully paid'));
  console.log('PASS payment validation, overpayment guard, partial and full payment');

  // Admin correction: removing a payment reopens the invoice.
  const removeForm = forms(page.html).find(f => f.includes('>Remove<'));
  url = await admin.post(path, removeForm); assert.ok(flashOf(url).ok);
  invoice = await fx.row('invoices', invoiceId); assert.equal(invoice.status, 'confirmed');
  assert.equal(Number(invoice.amount_paid), 56.2, 'The first (50.00) payment was removed');
  console.log('PASS admin payment removal returns the invoice to confirmed');

  // Payments list filters.
  // The remaining payment is the 56.20 UPI one.
  assert.ok((await admin.get('/payments?method=upi&from=' + today + '&to=' + today)).html.includes(invoice.number));
  assert.ok(!(await admin.get('/payments?method=bank_transfer&from=' + today + '&to=' + today)).html.includes(invoice.number));
  assert.ok(!(await admin.get('/payments?method=upi&to=2026-01-01')).html.includes(invoice.number));
  console.log('PASS payments list method and date filters');

  // Database guards through the admin's own API session.
  assert.ok((await admin.db.from('invoices').update({ total: 1 }).eq('id', invoiceId)).error, 'Totals cannot be edited');
  assert.ok((await admin.db.from('invoices').insert({ customer_id: customer.id, total: 5, status: 'paid' })).error, 'No manual invoices');
  const updated = await admin.db.from('payments').update({ amount: 999 }).eq('invoice_id', invoiceId).select('id');
  assert.ok(!updated.error && updated.data.length === 0, 'Payments cannot be edited');
  const lineDelete = await admin.db.from('invoice_lines').delete().eq('invoice_id', invoiceId).select('id');
  assert.ok(lineDelete.error || lineDelete.data.length === 0, 'Invoice lines are immutable');
  assert.ok((await admin.db.rpc('run_billing', { p_as_of: '2099-01-01' })).error, 'Billing cannot run ahead of today');
  console.log('PASS invoice amounts, manual invoices, payment edits and lines are locked; no future billing runs');

  // Cancelling releases the discount use; drafts can be confirmed by staff.
  page = await admin.get('/subscriptions/' + sub.id);
  url = await admin.post('/subscriptions/' + sub.id, findForm(page, 'Bill now'));
  const secondId = flashOf(url).path.split('/')[2];
  assert.equal((await fx.row('discounts', discount.id)).used_count, 2);
  page = await admin.get('/invoices/' + secondId);
  url = await admin.post('/invoices/' + secondId, findForm(page, 'Cancel invoice')); assert.ok(flashOf(url).ok);
  assert.equal((await fx.row('invoices', secondId)).status, 'cancelled');
  assert.equal((await fx.row('discounts', discount.id)).used_count, 1, 'Cancelled invoice gives its discount use back');
  page = await admin.get('/invoices/' + secondId); assert.ok(!findForm(page, 'Mark sent')); assert.ok(!findForm(page, 'Cancel invoice'));
  const draft = await fx.create('invoices', { customer_id: other.id, status: 'draft', total: 10, subtotal: 10 });
  page = await admin.get('/invoices/' + draft.id); assert.ok(!findForm(page, 'Record payment'));
  assert.ok(findForm(page, 'Confirm'));
  url = await admin.post('/invoices/' + draft.id, findForm(page, 'Confirm and mark sent'));
  assert.ok(flashOf(url).ok, url);
  const sentDraft = await fx.row('invoices', draft.id);
  assert.equal(sentDraft.status, 'confirmed', 'Confirm and mark sent confirms a draft'); assert.ok(sentDraft.sent_at);
  console.log('PASS cancellation releases discounts; drafts confirm on send');

  // Staff (temporary account, approved pattern from earlier phases) can record but not remove payments.
  const email = `phase5-staff-${suffix}@example.com`, password = 'Invoices-' + randomUUID() + '!aA';
  const temp = await fx.user(email, password, name + ' staff');
  check(await service.rpc('set_account_role', { p_actor: admin.userId, p_profile: temp.id, p_role: 'staff' }));
  const staff = await signIn(email, password);
  page = await staff.get(path);
  assert.equal(page.status, 200); assert.ok(findForm(page, 'Record payment')); assert.ok(!page.html.includes('Correct a payment'));
  const forged = await staff.post(path, removeForm);
  assert.ok(forged.endsWith('/dashboard'), 'Staff cannot remove payments');
  assert.ok((await staff.db.from('payments').delete().eq('invoice_id', invoiceId).select('id')).data.length === 0);
  console.log('PASS staff can record payments but cannot remove them');
  console.log('Phase 5 integration checks passed.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => fx.cleanup());
