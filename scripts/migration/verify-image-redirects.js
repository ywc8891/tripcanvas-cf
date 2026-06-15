#!/usr/bin/env node

// Verifies legacy /wp-content/uploads/... URLs 301 to media.tripcanvas.co and
// that the target object resolves (200, image/*). Hits the deployed frontend
// worker with an x-tc-host header to simulate each market subdomain.

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://tripcanvas.academyt.workers.dev';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// path = legacy upload path; expectedKey = path after media.tripcanvas.co/{market}/
const CASES = [
  { host: 'tripcanvas.co', market: 'en', path: '/wp-content/uploads/2019/07/0-3-1.jpg', expectedKey: '2019/07/0-3-1.jpg' },
  { host: 'malaysia.tripcanvas.co', market: 'my', path: '/wp-content/uploads/2019/07/0-3-1.jpg', expectedKey: '2019/07/0-3-1.jpg' },
  { host: 'indonesia.tripcanvas.co', market: 'id', path: '/wp-content/uploads/2019/07/0-3-1.jpg', expectedKey: '2019/07/0-3-1.jpg' },
  { host: 'thailand.tripcanvas.co', market: 'th', path: '/wp-content/uploads/2019/07/0-3-1.jpg', expectedKey: '2019/07/0-3-1.jpg' },
  // Thumbnail suffix must be stripped to the original key.
  { host: 'malaysia.tripcanvas.co', market: 'my', path: '/wp-content/uploads/2019/07/0-3-1-300x200.jpg', expectedKey: '2019/07/0-3-1.jpg' },
];

async function checkRedirect(c) {
  const expectedLocation = `https://media.tripcanvas.co/${c.market}/${c.expectedKey}`;
  const res = await fetch(`${FRONTEND_URL}${c.path}`, {
    method: 'GET',
    headers: { 'x-tc-host': c.host },
    redirect: 'manual',
  });
  const location = res.headers.get('location') || '';
  const redirectOk = res.status === 301 && location === expectedLocation;

  let targetOk = false;
  let targetInfo = 'not checked';
  if (location) {
    const t = await fetch(location, {
      method: 'GET',
      headers: { 'User-Agent': BROWSER_UA, Accept: 'image/avif,image/webp,*/*' },
    });
    const ct = t.headers.get('content-type') || '';
    targetOk = t.status === 200 && ct.startsWith('image/');
    targetInfo = `${t.status} ${ct}`;
  }

  return { ok: redirectOk && targetOk, status: res.status, location, expectedLocation, targetInfo };
}

async function main() {
  console.log('Image redirect QA');
  console.log(`  frontend: ${FRONTEND_URL}`);

  let passed = 0;
  const failures = [];

  for (const c of CASES) {
    const r = await checkRedirect(c);
    if (r.ok) {
      passed += 1;
      console.log(`  PASS ${c.host}${c.path} -> ${r.location} (${r.targetInfo})`);
    } else {
      const msg = `${c.host}${c.path} -> got ${r.status} ${r.location || '(no location)'} ` +
        `(expected 301 ${r.expectedLocation}); target ${r.targetInfo}`;
      failures.push(msg);
      console.log(`  FAIL ${msg}`);
    }
  }

  console.log(`\nSummary: ${passed}/${CASES.length} checks passed`);
  if (failures.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
