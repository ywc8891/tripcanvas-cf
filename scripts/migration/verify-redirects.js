#!/usr/bin/env node

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://tripcanvas.academyt.workers.dev';
const CMS_API_URL = process.env.PAYLOAD_API_URL || 'https://tripcanvas-cms.academyt.workers.dev/api';
const SAMPLE_LIMIT = Number.parseInt(process.env.REDIRECT_SAMPLE_LIMIT || '3', 10);

const CASES = [
  { host: 'tripcanvas.co', locale: 'en' },
  { host: 'malaysia.tripcanvas.co', locale: 'my' },
  { host: 'indonesia.tripcanvas.co', locale: 'id' },
  { host: 'thailand.tripcanvas.co', locale: 'th' },
];

async function fetchCmsSample(locale, limit) {
  const params = new URLSearchParams({
    locale,
    depth: '0',
    limit: String(limit),
    sort: '-createdAt',
    'where[wpId][greater_than]': '0',
  });

  const res = await fetch(`${CMS_API_URL}/posts?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`CMS sample fetch failed for locale=${locale}: HTTP ${res.status}`);
  }

  const data = await res.json();
  return (data.docs || [])
    .filter((doc) => doc && doc.slug && Number.isFinite(doc.wpId))
    .map((doc) => ({ slug: doc.slug, wpId: doc.wpId }));
}

async function checkRedirect({ host, path, expectedLocation }) {
  const res = await fetch(`${FRONTEND_URL}${path}`, {
    method: 'GET',
    headers: { 'x-tc-host': host },
    redirect: 'manual',
  });

  const rawLocation = res.headers.get('location') || '';
  // Normalize to path+search only so both relative and absolute Location values compare equally
  let location = rawLocation;
  try {
    if (rawLocation.startsWith('http')) {
      const u = new URL(rawLocation);
      location = u.pathname + u.search;
    }
  } catch {}
  const ok = res.status === 301 && location === expectedLocation;

  return { ok, status: res.status, location: rawLocation };
}

async function runLocaleSuite({ host, locale }) {
  const sample = await fetchCmsSample(locale, SAMPLE_LIMIT);
  if (!sample.length) {
    return {
      host,
      locale,
      total: 0,
      passed: 0,
      failed: 0,
      failures: [`No CMS sample posts found for locale=${locale}`],
    };
  }

  let total = 0;
  let passed = 0;
  const failures = [];

  for (const post of sample) {
    const expected = `/blog/${post.slug}`;
    const tests = [
      { label: '/<slug>', path: `/${post.slug}` },
      { label: '/<category>/<slug>', path: `/legacy/${post.slug}` },
      { label: '/?p=<id>', path: `/?p=${post.wpId}` },
    ];

    for (const test of tests) {
      total += 1;
      const result = await checkRedirect({ host, path: test.path, expectedLocation: expected });
      if (result.ok) {
        passed += 1;
      } else {
        failures.push(
          `${host} ${test.label} ${test.path} -> expected 301 ${expected}, got ${result.status} ${result.location || '(no location)'}`,
        );
      }
    }
  }

  return {
    host,
    locale,
    total,
    passed,
    failed: total - passed,
    failures,
  };
}

async function main() {
  console.log(`Redirect QA`);
  console.log(`  frontend: ${FRONTEND_URL}`);
  console.log(`  cms api:  ${CMS_API_URL}`);
  console.log(`  sample per locale: ${SAMPLE_LIMIT}`);

  let grandTotal = 0;
  let grandPassed = 0;
  const allFailures = [];

  for (const c of CASES) {
    const result = await runLocaleSuite(c);
    grandTotal += result.total;
    grandPassed += result.passed;

    console.log(`\n[${result.locale}] ${result.host}`);
    console.log(`  checks: ${result.total}, passed: ${result.passed}, failed: ${result.failed}`);

    if (result.failures.length) {
      allFailures.push(...result.failures);
      for (const failure of result.failures.slice(0, 10)) {
        console.log(`  - ${failure}`);
      }
      if (result.failures.length > 10) {
        console.log(`  ... ${result.failures.length - 10} more failures`);
      }
    }
  }

  console.log(`\nSummary: ${grandPassed}/${grandTotal} checks passed`);

  if (allFailures.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
