# Legacy WordPress Image URL Redirects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 301-redirect every legacy `/wp-content/uploads/...` request to `media.tripcanvas.co/{market}/...`, and switch in-app image rendering onto the same domain.

**Architecture:** A pure helper `wpUploadToMediaUrl(host, pathname)` in `apps/frontend/src/lib/locale.ts` maps the legacy WordPress upload path to the market-prefixed R2 custom-domain URL (deriving market from host via the existing `marketFromHost`, stripping WordPress `-WxH` thumbnail suffixes). The Astro SSR middleware calls it early and returns a 301. The two existing `R2_PUBLIC_URL` constants are replaced by a single shared `MEDIA_BASE_URL`.

**Tech Stack:** Astro 5 (SSR, `@astrojs/cloudflare`), TypeScript, Vitest (added by this plan), Node `fetch` verification script.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `apps/frontend/src/lib/locale.ts` | Host/locale/URL helpers | Add `MEDIA_BASE_URL` + `wpUploadToMediaUrl()` |
| `apps/frontend/src/lib/locale.test.ts` | Unit tests for the new helper | Create |
| `apps/frontend/vitest.config.ts` | Test runner config | Create |
| `apps/frontend/package.json` | Add Vitest dep + `test` script | Modify |
| `apps/frontend/src/middleware.ts` | Edge request handling | Add early `/wp-content/uploads/` 301 branch |
| `apps/frontend/src/lib/lexical.ts` | Lexical → HTML, r2:// resolution | Use shared `MEDIA_BASE_URL` |
| `apps/frontend/src/lib/payload.ts` | CMS fetch + `firstImageUrl` | Use shared `MEDIA_BASE_URL` |
| `scripts/migration/verify-image-redirects.js` | Live redirect QA | Create |
| `scripts/migration/package.json` | Add `migrate:verify:images` script | Modify |

**Reference facts (verified against the codebase):**
- `marketFromHost(host: string): MarketLocale` returns `'en' | 'my' | 'id' | 'th'`, expects an already-normalized host (lowercase, no port). It maps `tripcanvas.co`/`www.tripcanvas.co`→`en`, `malaysia.tripcanvas.co`→`my`, `indonesia.tripcanvas.co`→`id`, `thailand.tripcanvas.co`→`th`, unknown→`en`.
- `middleware.ts` computes `const host = normalizeHost(...)` and `const url = new URL(...)` near the top, then later has a comment block beginning `// For path-locale URLs`. The new branch is inserted immediately before that comment block.
- Both `lexical.ts` and `payload.ts` currently declare `const R2_PUBLIC_URL = 'https://pub-2faca0649c2047a1859536a3114d3f95.r2.dev';`.

---

### Task 1: Add Vitest test infrastructure

**Files:**
- Create: `apps/frontend/vitest.config.ts`
- Modify: `apps/frontend/package.json`

- [ ] **Step 1: Create the Vitest config**

Create `apps/frontend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Add the test script and dev dependency**

In `apps/frontend/package.json`, add `"test": "vitest run"` to the `scripts` block (after the existing `"preview"` line) and add Vitest to `devDependencies`:

```json
    "preview": "astro preview",
    "test": "vitest run",
```

```json
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.6",
    "tailwindcss": "^4.0.6",
    "vitest": "^3.0.0",
    "wrangler": "^4.82.2"
  }
```

- [ ] **Step 3: Install**

Run: `cd /home/weeichoong/project/tripcanvas-cf && pnpm --filter tripcanvas-frontend install`
Expected: Vitest is added; lockfile updates without errors.

- [ ] **Step 4: Verify the runner starts (no tests yet)**

Run: `cd /home/weeichoong/project/tripcanvas-cf/apps/frontend && pnpm test`
Expected: Vitest runs and reports "No test files found" (exit non-zero is fine here) — confirms the runner is wired.

- [ ] **Step 5: Commit**

```bash
cd /home/weeichoong/project/tripcanvas-cf
git add apps/frontend/vitest.config.ts apps/frontend/package.json pnpm-lock.yaml
git commit -m "chore: add vitest to frontend for unit tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Implement `wpUploadToMediaUrl` (TDD)

**Files:**
- Test: `apps/frontend/src/lib/locale.test.ts`
- Modify: `apps/frontend/src/lib/locale.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/lib/locale.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { wpUploadToMediaUrl, MEDIA_BASE_URL } from './locale';

describe('MEDIA_BASE_URL', () => {
  it('is the media custom domain', () => {
    expect(MEDIA_BASE_URL).toBe('https://media.tripcanvas.co');
  });
});

describe('wpUploadToMediaUrl', () => {
  it('maps each market host to its R2 key prefix', () => {
    expect(wpUploadToMediaUrl('indonesia.tripcanvas.co', '/wp-content/uploads/2019/03/foo.jpg'))
      .toBe('https://media.tripcanvas.co/id/2019/03/foo.jpg');
    expect(wpUploadToMediaUrl('malaysia.tripcanvas.co', '/wp-content/uploads/2019/07/bar.png'))
      .toBe('https://media.tripcanvas.co/my/2019/07/bar.png');
    expect(wpUploadToMediaUrl('thailand.tripcanvas.co', '/wp-content/uploads/2020/01/baz.gif'))
      .toBe('https://media.tripcanvas.co/th/2020/01/baz.gif');
    expect(wpUploadToMediaUrl('tripcanvas.co', '/wp-content/uploads/2018/12/qux.jpg'))
      .toBe('https://media.tripcanvas.co/en/2018/12/qux.jpg');
  });

  it('falls back to en for unknown hosts', () => {
    expect(wpUploadToMediaUrl('example.com', '/wp-content/uploads/2019/03/foo.jpg'))
      .toBe('https://media.tripcanvas.co/en/2019/03/foo.jpg');
  });

  it('strips the WordPress -WxH thumbnail suffix', () => {
    expect(wpUploadToMediaUrl('indonesia.tripcanvas.co', '/wp-content/uploads/2019/03/foo-300x200.jpg'))
      .toBe('https://media.tripcanvas.co/id/2019/03/foo.jpg');
    expect(wpUploadToMediaUrl('indonesia.tripcanvas.co', '/wp-content/uploads/2019/03/foo-768x512.png'))
      .toBe('https://media.tripcanvas.co/id/2019/03/foo.png');
  });

  it('preserves -scaled and other non-size hyphenated names', () => {
    expect(wpUploadToMediaUrl('indonesia.tripcanvas.co', '/wp-content/uploads/2019/03/foo-scaled.jpg'))
      .toBe('https://media.tripcanvas.co/id/2019/03/foo-scaled.jpg');
    expect(wpUploadToMediaUrl('indonesia.tripcanvas.co', '/wp-content/uploads/2019/03/my-cool-photo.jpg'))
      .toBe('https://media.tripcanvas.co/id/2019/03/my-cool-photo.jpg');
  });

  it('preserves multisite sites/N sub-paths', () => {
    expect(wpUploadToMediaUrl('thailand.tripcanvas.co', '/wp-content/uploads/sites/2/2019/03/foo-300x200.jpg'))
      .toBe('https://media.tripcanvas.co/th/sites/2/2019/03/foo.jpg');
  });

  it('returns null for non-upload paths', () => {
    expect(wpUploadToMediaUrl('tripcanvas.co', '/wp-content/themes/x/style.css')).toBeNull();
    expect(wpUploadToMediaUrl('tripcanvas.co', '/blog/some-post')).toBeNull();
    expect(wpUploadToMediaUrl('tripcanvas.co', '/')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/weeichoong/project/tripcanvas-cf/apps/frontend && pnpm test`
Expected: FAIL — `wpUploadToMediaUrl` / `MEDIA_BASE_URL` are not exported from `./locale`.

- [ ] **Step 3: Implement the helper**

In `apps/frontend/src/lib/locale.ts`, add the following immediately after the `marketFromHost` function (the function that ends with `return HOST_MARKET_MAP[host] || 'en';`):

```ts
// Public base for media served from the tripcanvas-media R2 bucket (custom domain).
export const MEDIA_BASE_URL = 'https://media.tripcanvas.co';

// Maps a legacy WordPress upload URL path to its media.tripcanvas.co URL.
// Returns null if the path is not under /wp-content/uploads/.
// `host` must be normalized (lowercase, no port) — same as middleware's `host`.
export function wpUploadToMediaUrl(host: string, pathname: string): string | null {
  const match = pathname.match(/^\/wp-content\/uploads\/(.+)$/);
  if (!match) return null;
  // Strip the WordPress generated size suffix (e.g. -300x200) before the extension.
  const rest = match[1].replace(/-\d+x\d+(?=\.\w+$)/, '');
  const market = marketFromHost(host);
  return `${MEDIA_BASE_URL}/${market}/${rest}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/weeichoong/project/tripcanvas-cf/apps/frontend && pnpm test`
Expected: PASS — all `wpUploadToMediaUrl` and `MEDIA_BASE_URL` tests green.

- [ ] **Step 5: Commit**

```bash
cd /home/weeichoong/project/tripcanvas-cf
git add apps/frontend/src/lib/locale.ts apps/frontend/src/lib/locale.test.ts
git commit -m "feat: add wpUploadToMediaUrl helper for legacy image redirects

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wire the middleware redirect

**Files:**
- Modify: `apps/frontend/src/middleware.ts`

- [ ] **Step 1: Import the helper**

In `apps/frontend/src/middleware.ts`, add `wpUploadToMediaUrl` to the existing import from `'./lib/locale'`. The import list becomes:

```ts
import {
  isSupportedLocale,
  isDevHost,
  normalizeHost,
  isLanguagePathLocale,
  getPostUrl,
  primaryCategory,
  marketFromHost,
  wpUploadToMediaUrl,
  type SupportedLocale,
} from './lib/locale';
```

- [ ] **Step 2: Add the redirect branch**

In `apps/frontend/src/middleware.ts`, find the comment block that begins:

```ts
  // For path-locale URLs (e.g. /id/blog/foo, /zh/blog/foo), rewrite to the
```

Insert the following block immediately **before** that comment:

```ts
  // Legacy WordPress image URLs (/wp-content/uploads/...) → media.tripcanvas.co.
  // Pure host→market + key transform (see wpUploadToMediaUrl in lib/locale.ts).
  if (context.request.method === 'GET' || context.request.method === 'HEAD') {
    const mediaTarget = wpUploadToMediaUrl(host, url.pathname);
    if (mediaTarget) return Response.redirect(mediaTarget, 301);
  }

```

- [ ] **Step 3: Type-check the build**

Run: `cd /home/weeichoong/project/tripcanvas-cf/apps/frontend && pnpm build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd /home/weeichoong/project/tripcanvas-cf
git add apps/frontend/src/middleware.ts
git commit -m "feat: redirect legacy /wp-content/uploads to media.tripcanvas.co

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Switch in-app rendering to `MEDIA_BASE_URL`

**Files:**
- Modify: `apps/frontend/src/lib/lexical.ts`
- Modify: `apps/frontend/src/lib/payload.ts`

- [ ] **Step 1: Update lexical.ts**

In `apps/frontend/src/lib/lexical.ts`, delete the line:

```ts
const R2_PUBLIC_URL = 'https://pub-2faca0649c2047a1859536a3114d3f95.r2.dev';
```

Add an import of `MEDIA_BASE_URL` from `./locale` at the top of the file (place it with the other imports; if there is no existing import from `./locale`, add a new line):

```ts
import { MEDIA_BASE_URL } from './locale';
```

Then replace the two usages of `R2_PUBLIC_URL` in the file with `MEDIA_BASE_URL` (the `return \`${R2_PUBLIC_URL}/${key}\`;` line, and the `r2ToHttps(\`r2://${m[2]}\`)` path which routes through the same function — only the constant reference name changes).

- [ ] **Step 2: Update payload.ts**

In `apps/frontend/src/lib/payload.ts`, delete the line:

```ts
const R2_PUBLIC_URL = 'https://pub-2faca0649c2047a1859536a3114d3f95.r2.dev';
```

Add the import (place with existing imports; if `./locale` is already imported, add `MEDIA_BASE_URL` to that import list instead of a new line):

```ts
import { MEDIA_BASE_URL } from './locale';
```

Replace the usage `return m ? \`${R2_PUBLIC_URL}/${m[1]}\` : null;` with:

```ts
  return m ? `${MEDIA_BASE_URL}/${m[1]}` : null;
```

- [ ] **Step 3: Confirm no stale references remain**

Run: `cd /home/weeichoong/project/tripcanvas-cf && grep -rn "R2_PUBLIC_URL\|pub-2faca" apps/frontend/src`
Expected: No matches.

- [ ] **Step 4: Type-check the build**

Run: `cd /home/weeichoong/project/tripcanvas-cf/apps/frontend && pnpm build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
cd /home/weeichoong/project/tripcanvas-cf
git add apps/frontend/src/lib/lexical.ts apps/frontend/src/lib/payload.ts
git commit -m "feat: serve in-app images from media.tripcanvas.co

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Add the live verification script

**Files:**
- Create: `scripts/migration/verify-image-redirects.js`
- Modify: `scripts/migration/package.json`

- [ ] **Step 1: Create the verification script**

Create `scripts/migration/verify-image-redirects.js`:

```js
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
```

- [ ] **Step 2: Add the package script**

In `scripts/migration/package.json`, add to the `scripts` block (matching the existing `migrate:verify:redirects` style if present):

```json
    "migrate:verify:images": "node verify-image-redirects.js"
```

- [ ] **Step 3: Commit**

```bash
cd /home/weeichoong/project/tripcanvas-cf
git add scripts/migration/verify-image-redirects.js scripts/migration/package.json
git commit -m "test: add live verification for legacy image redirects

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Deploy and verify live

**Files:** none (deploy + verification checkpoint)

- [ ] **Step 1: Deploy the frontend worker**

Run: `cd /home/weeichoong/project/tripcanvas-cf/apps/frontend && pnpm deploy`
Expected: Wrangler deploys `tripcanvas` worker successfully.

- [ ] **Step 2: Run the live verification**

Run: `cd /home/weeichoong/project/tripcanvas-cf/scripts/migration && node verify-image-redirects.js`
Expected: `Summary: 5/5 checks passed`. Each legacy URL returns `301` to the correct `media.tripcanvas.co/{market}/...` and the target returns `200 image/*`.

- [ ] **Step 3: Spot-check in-app rendering**

Run: `cd /home/weeichoong/project/tripcanvas-cf && curl -s "https://tripcanvas.academyt.workers.dev/blog" | grep -o 'media.tripcanvas.co[^"]*' | head -3`
Expected: At least one `media.tripcanvas.co/...` image URL appears in the rendered blog index (confirms Task 4 took effect). If the blog index has no images, fetch a known post page instead.

- [ ] **Step 4: Final commit (status update)**

Update the "Current Status" section of `CLAUDE.md` to note legacy image redirects are live, then:

```bash
cd /home/weeichoong/project/tripcanvas-cf
git add CLAUDE.md
git commit -m "docs: mark legacy image redirects complete

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- R2 custom-domain prerequisite → verified live in spec; no task needed (Task 6 confirms).
- Pure transform helper → Task 2.
- Middleware 301 branch → Task 3.
- In-app rendering switch to `MEDIA_BASE_URL` → Task 4.
- Verification script → Task 5; live run → Task 6.
- TDD unit tests (markets, size-suffix strip, `-scaled` preserve, multisite passthrough, null cases) → Task 2.
- Test infra (no runner existed) → Task 1.

**Placeholder scan:** No TBD/TODO; all code shown in full.

**Type consistency:** `wpUploadToMediaUrl(host: string, pathname: string): string | null` and `MEDIA_BASE_URL` are defined in Task 2 and used identically in Tasks 3–5. `marketFromHost` signature matches the codebase. The middleware uses the pre-existing `host` (normalized) and `url` variables.
