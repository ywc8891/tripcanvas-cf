# Legacy WordPress Image URL Redirects → media.tripcanvas.co

**Date**: 2026-06-15
**Status**: Approved

---

## Problem

After the WordPress → Astro/Cloudflare cutover, the old domains
(`tripcanvas.co`, `malaysia.`, `indonesia.`, `thailand.`) now point at the Astro
SSR worker. Old WordPress image URLs in the shape

```
https://{subdomain}.tripcanvas.co/wp-content/uploads/{year}/{month}/{filename}
```

are still actively requested by Google Images, social-card scrapers, external
sites hotlinking, and cached pages — and now return **404** because WordPress is
gone.

**Confirmed live (2026-06-15):**

| Check | Result |
|---|---|
| `malaysia.tripcanvas.co/wp-content/uploads/2019/07/0-3-1.jpg` | `404` (the problem) |
| `media.tripcanvas.co/my/2019/07/0-3-1.jpg` (browser UA) | `200 image/jpeg` (custom domain live) |
| Same key via raw `pub-...r2.dev` | `200` (market-prefixed keys confirmed) |

## Solution

Redirect (`301`) every `/wp-content/uploads/` request to the already-live R2
custom domain `media.tripcanvas.co`, using a **pure deterministic transform** —
no lookup table:

```
https://indonesia.tripcanvas.co/wp-content/uploads/2019/03/foo-300x200.jpg
        │ host → market: id          │ path after /uploads/ │ strip -WxH suffix
        ▼                            ▼                      ▼
301 → https://media.tripcanvas.co/id/2019/03/foo.jpg
```

This works because the R2 reorg already stored every object under the
market-prefixed key `{market}/{year}/{month}/{filename}`, and `media.tripcanvas.co`
is a custom domain bound to the `tripcanvas-media` bucket, so
`media.tripcanvas.co/{market}/{path}` serves the object directly.

In the same effort, switch the **in-app** image rendering off the raw
`pub-...r2.dev` URL onto `media.tripcanvas.co` for a single consistent domain.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Redirect target | `media.tripcanvas.co` (R2 custom domain) | Clean, branded, hides bucket, avoids r2.dev rate limits. Already set up. |
| Path prefix | Market code (`id`/`my`/`th`/`en`) | Matches existing R2 keys exactly — zero re-keying. |
| Host → market | `marketFromHost()` (existing helper) | `indonesia→id`, `malaysia→my`, `thailand→th`, bare/other→`en`. |
| Thumbnails | Always strip `-WxH` suffix → original | Guarantees no broken image even for sizes not uploaded to R2. |
| Sub-paths (`sites/N/...`) | Preserved verbatim | Multisite uploads keep their relative path; key already includes it. |
| Status code | `301` permanent | Browser/CDN-cacheable; repeat hits skip the worker. |
| Location | Astro `middleware.ts` | Version-controlled, testable, beside existing legacy redirects. |
| In-app rendering | Switch to `media.tripcanvas.co` | One domain everywhere; keys identical so it's a base-URL swap. |

## Architecture

### Prerequisite (already done — verified live)
`media.tripcanvas.co` is bound as a custom domain to the `tripcanvas-media` R2
bucket. No action required.

### Component 1 — Pure transform helper
Add to `apps/frontend/src/lib/locale.ts` (beside `marketFromHost`):

```ts
export const MEDIA_BASE_URL = 'https://media.tripcanvas.co';

// Returns the media.tripcanvas.co URL for a legacy WP upload path,
// or null if the path is not a /wp-content/uploads/ path.
export function wpUploadToMediaUrl(host: string, pathname: string): string | null {
  const m = pathname.match(/^\/wp-content\/uploads\/(.+)$/);
  if (!m) return null;
  const rest = m[1].replace(/-\d+x\d+(?=\.\w+$)/, ''); // strip WP size suffix
  const market = marketFromHost(host);
  return `${MEDIA_BASE_URL}/${market}/${rest}`;
}
```

Notes:
- `rest` is captured verbatim, so multisite `sites/N/...` sub-paths pass through.
- Only the `-WxH` immediately before the extension is stripped; `-scaled` and the
  rest of the filename are left intact.
- Pure function → unit-testable with no worker runtime.

### Component 2 — Middleware hook
In `apps/frontend/src/middleware.ts`, add an **early branch** for GET/HEAD,
placed **before** the path-locale rewrite and the legacy-post redirect (so it is
not blocked by the file-extension skip in `shouldHandleLegacyRedirect`):

```ts
const mediaTarget = wpUploadToMediaUrl(host, url.pathname);
if (mediaTarget) return Response.redirect(mediaTarget, 301);
```

Only `/wp-content/uploads/` is redirected. Other `/wp-content/` paths (themes,
plugins) fall through to a normal 404 — out of scope.

### Component 3 — In-app rendering base URL
Replace the two duplicated `const R2_PUBLIC_URL = 'https://pub-...r2.dev'`
definitions in `apps/frontend/src/lib/lexical.ts` and
`apps/frontend/src/lib/payload.ts` with the shared `MEDIA_BASE_URL` imported from
`locale.ts`. The `r2://` → HTTPS conversion logic is unchanged (path-agnostic);
only the base host changes.

### Component 4 — Verification script
New `scripts/migration/verify-image-redirects.js` (mirrors
`verify-redirects.js`): for a sample of real legacy image URLs across all four
markets, assert:
1. Request returns `301`.
2. `Location` equals the expected `media.tripcanvas.co/{market}/...` URL.
3. The target returns `200` with an `image/*` content type (browser UA).

Add a `migrate:verify:images` script to `package.json` if a matching pattern
exists.

## Testing (TDD)

Unit tests on `wpUploadToMediaUrl` covering:
- Each market host → correct prefix (`indonesia→id`, `malaysia→my`,
  `thailand→th`, `tripcanvas.co→en`, unknown host → `en`).
- Size-suffix stripping: `foo-300x200.jpg` → `foo.jpg`; `foo-768x512.png` →
  `foo.png`.
- `-scaled` preserved: `foo-scaled.jpg` → `foo-scaled.jpg`.
- Multisite passthrough: `/wp-content/uploads/sites/2/2019/03/foo.jpg` →
  `.../{market}/sites/2/2019/03/foo.jpg`.
- Non-upload paths return `null` (`/wp-content/themes/x.css`, `/blog/foo`, `/`).
- Query strings ignored (transform operates on pathname only).

## Error Handling / Edge Cases

- File/size genuinely absent from R2 → `media.tripcanvas.co` returns 404
  (acceptable; "always strip" minimizes this).
- Wrong-domain requests map by host (best-effort) — rare.
- Cloudflare bot challenge on `media.*` only affects suspicious clients; real
  browser `<img>` loads pass (verified 200). Out of scope to change.

## Scope: What Changes

| Component | Change |
|---|---|
| `apps/frontend/src/lib/locale.ts` | **NEW** `MEDIA_BASE_URL` const + `wpUploadToMediaUrl()` |
| `apps/frontend/src/middleware.ts` | Early `/wp-content/uploads/` → 301 branch |
| `apps/frontend/src/lib/lexical.ts` | Use shared `MEDIA_BASE_URL` (was `pub-...r2.dev`) |
| `apps/frontend/src/lib/payload.ts` | Use shared `MEDIA_BASE_URL` (was `pub-...r2.dev`) |
| `scripts/migration/verify-image-redirects.js` | **NEW** verification script |
| unit test file for `locale.ts` helpers | **NEW** |

## Scope: What Does NOT Change

| Component | Reason |
|---|---|
| R2 bucket keys/objects | Already market-prefixed; redirect/render use them as-is |
| `media.tripcanvas.co` custom domain | Already configured and live |
| D1 `media.url`, post content | Unaffected — r2:// scheme + key unchanged |
| `/wp-content/themes`, `/wp-content/plugins` | Out of scope; allowed to 404 |
| `_routes.json` | `/*` already routes these paths to the worker |

## Rollback Strategy

- Redirect: revert the middleware branch; old URLs return to 404 (no worse than
  today).
- In-app base URL: revert `MEDIA_BASE_URL` to the `pub-...r2.dev` value; both
  domains serve identical keys, so the swap is reversible with no data change.

## Implementation Order

1. Add `MEDIA_BASE_URL` + `wpUploadToMediaUrl` to `locale.ts` (write tests first).
2. Wire the middleware redirect branch.
3. Switch `lexical.ts` and `payload.ts` to `MEDIA_BASE_URL`.
4. Add `verify-image-redirects.js`.
5. Deploy; run verification against live domains.
