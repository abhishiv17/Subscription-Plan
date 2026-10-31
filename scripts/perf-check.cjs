
/* eslint-disable @typescript-eslint/no-require-imports */
// Times the main list pages over HTTP as the admin (production server on port 3001).
// Each page is fetched once to warm up, then RUNS times; the median must stay under 2s.
const { assert, signIn } = require('./lib/live.cjs');

const RUNS = Number(process.env.PERF_RUNS) || 5;
const LIMIT_MS = 2000;
const PAGES = [
  '/dashboard',
  '/subscriptions', '/subscriptions?status=active', '/subscriptions?q=SUB-01', '/subscriptions?status=expired_quotation',
  '/invoices', '/invoices?filter=overdue', '/invoices?filter=outstanding&from=2026-01-01&to=2026-12-31', '/invoices?q=a',
  '/payments', '/payments?method=upi',
  '/customers', '/customers?q=an',
];

const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

(async () => {
  assert.ok(process.env.DEMO_TEST_PASSWORD, 'Set DEMO_TEST_PASSWORD');
  const admin = await signIn('demo.admin@example.com', process.env.DEMO_TEST_PASSWORD);
  let failed = 0;
  console.log(`page                                                     median   max   (ms, ${RUNS} runs)`);
  for (const path of PAGES) {
    const first = await admin.get(path);
    assert.equal(first.status, 200, path);
    const times = [];
    for (let i = 0; i < RUNS; i++) {
      const t = performance.now();
      const r = await admin.get(path);
      times.push(Math.round(performance.now() - t));
      assert.equal(r.status, 200, path);
    }
    const m = median(times);
    if (m >= LIMIT_MS) failed++;
    console.log(`${m >= LIMIT_MS ? 'SLOW' : 'ok  '} ${path.padEnd(52)} ${String(m).padStart(6)} ${String(Math.max(...times)).padStart(5)}`);
  }
  if (failed) { console.error(`${failed} page(s) over ${LIMIT_MS} ms`); process.exitCode = 1; }
  else console.log(`All ${PAGES.length} pages under ${LIMIT_MS} ms (median).`);
})().catch(e => { console.error(e); process.exitCode = 1; });
