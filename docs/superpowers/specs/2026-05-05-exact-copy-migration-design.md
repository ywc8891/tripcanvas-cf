# TripCanvas: Static HTML Exact Copy Migration — Design Spec

**Date:** 2026-05-05
**Status:** Draft
**Goal:** Fast path — scrape all 4 WP sites as static HTML, deploy to Cloudflare Pages, cut DNS. Preserve the WIP CMS/Astro migration for later resumption.

---

## Context

TripCanvas needs to migrate off WordPress hosting **quickly**. The WIP Payload CMS + Astro migration is functional but not production-ready. This plan is a stopgap: scrape rendered HTML to Cloudflare Pages (free), shut down WP, and preserve all CMS migration work untouched for future resumption.

### Drivers

- WP hosting deadline imminent — must move fast
- Static HTML is the fastest path to a live site
- CMS migration work can resume later when time allows

### Non-goals

- Content editing (no CMS in this plan)
- Dynamic features (forms, comments, search)
- SEO parity (achieved by HTML fidelity, not intentional optimization)
- Frontend polish (exact WP HTML copy)

---

## Server Topology

Two servers, 4 domains, 8 crawl seeds:

| Server | Domains | Locales | Crawl seeds |
|--------|---------|---------|-------------|
| Server A (18.136.197.26) | `tripcanvas.co` | `en` (root) | `https://tripcanvas.co/` |
| Server A | `malaysia.tripcanvas.co` | `my` (root), `zh` (`/zh/`) | `https://malaysia.tripcanvas.co/`, `.../zh/` |
| Server A | `thailand.tripcanvas.co` | `en` (root), `id` (`/id/`), `zh` (`/zh/`) | `https://thailand.tripcanvas.co/`, `.../id/`, `.../zh/` |
| Server B (AWS ELB, separate) | `indonesia.tripcanvas.co` | `en` (root), `id` (`/id/`) | `https://indonesia.tripcanvas.co/`, `.../id/` |

---

## Project Structure

```
~/project/
├── tripcanvas-cf/              # 🔒 FROZEN — zero changes
│   ├── apps/cms/               # Payload CMS (redeployable anytime)
│   ├── apps/frontend/          # Astro frontends (redeployable anytime)
│   ├── scripts/migration/      # All scripts + exports preserved
│   └── scripts/migration/export/media-url-map.json  # Source of truth for media mappings
└── tripcanvas-static/          # NEW — separate repo
    ├── sites/
    │   ├── en/                 # Scraped tripcanvas.co (1 seed)
    │   ├── my/                 # Scraped malaysia.tripcanvas.co (2 seeds)
    │   ├── id/                 # Scraped indonesia.tripcanvas.co (2 seeds)
    │   └── th/                 # Scraped thailand.tripcanvas.co (3 seeds)
    ├── scripts/
    │   ├── scrape-server-a.sh  # wget runner for Server A (EN/MY/TH)
    │   ├── scrape-id.sh        # wget runner for ID (local machine)
    │   ├── r2-audit.js         # Find media URLs not in R2
    │   ├── rewrite-urls.js     # WP URLs → R2 public URLs
    │   ├── strip-forms.js      # Remove <form> elements
    │   ├── generate-404.js     # Generate 404.html per site if missing
    │   └── deploy-config.js    # Generate _redirects + _headers per site
    ├── media-url-map.json      # Copied from tripcanvas-cf (36,368 entries)
    └── README.md
```

---

## Media URL Map

Source: `tripcanvas-cf/scripts/migration/export/media-url-map.json` — 6MB, 36,368 entries.

**Structure:**
```json
{
  "dry_run": false,
  "totals": { "discovered": 36372, "uploaded": 60, "skipped": 36308, "failed": 4 },
  "map": {
    "https://indonesia.tripcanvas.co/wp-content/uploads/...": "r2://tripcanvas-media/...",
    ...
  }
}
```

**Domain distribution:**

| Domain | Entries |
|--------|---------|
| `indonesia.tripcanvas.co` | 20,140 |
| `thailand.tripcanvas.co` | 12,666 |
| `malaysia.tripcanvas.co` | 3,554 |
| `cdn.tripcanvas.co` | 7 |
| `tripcanvas.co` (EN) | 7 |
| `xoleil.com` | 1 |

**Key findings:**
- EN has only 7 entries — media was not migrated to R2. Needs audit after scrape.
- `skipped: 36,308` means they were already in R2 (deduplication). Only 4 entries truly failed.
- R2 bucket is ~complete for ID/MY/TH markets.
- All values use `r2://tripcanvas-media/` prefix — must be stripped during URL rewrite.

---

## Bug Fixes Applied (vs original plan)

### Bug 1: `r2://` prefix breaks URL rewrite
- **Fix:** `rewrite-urls.js` strips `r2://tripcanvas-media/` prefix via `toR2Url()` helper. Scripts access `data.map` (nested), not root `data`.

### Bug 2: `--convert-links` conflicts with rewrite
- **Fix:** Remove `--convert-links` from wget entirely. `rewrite-urls.js` is the single source of truth for all URL transformations.

### Bug 3: `404.html` missing
- **Fix:** Generate a minimal `404.html` in each `sites/<market>/` via `generate-404.js`.

### Bug 4: `--adjust-extension`
- **Fix:** No action. Cloudflare Pages natively serves `/contact` → `contact.html`.

### Bug 5: Wrong map path
- **Fix:** Source is `scripts/migration/export/media-url-map.json`, corrected in Phase 0 copy command.

### Bug 6: EN media almost absent from map
- **Fix:** Run `r2-audit.js` first on EN. If images missing, SCP from Server A before WP shutdown.

### Bug 7: `skipped` ≠ missing
- **Fix:** Clarified — skipped = already in R2. Only 4 truly failed. R2 is ~complete.

---

## Phase Details

### Phase 0 — Setup (~30 min)

```bash
mkdir -p ~/project/tripcanvas-static/{sites/{en,my,id,th},scripts}
cd ~/project/tripcanvas-static
git init
cp ~/project/tripcanvas-cf/scripts/migration/export/media-url-map.json .
```

Confirm SSH:
```bash
ssh tripcanvas "hostname && ls /var/www/"
```

### Phase 1 — Crawl (2–8 hrs, automated)

**Server A** (EN/MY/TH) — upload `scrape-server-a.sh` and run:

```bash
scp scripts/scrape-server-a.sh tripcanvas:~/scrape.sh
ssh tripcanvas 'bash ~/scrape.sh'
```

`scrape-server-a.sh`:
- Multi-seed: EN (1), MY (2: `/` + `/zh/`), TH (3: `/` + `/id/` + `/zh/`)
- `--mirror`, `--adjust-extension`, `--page-requisites`, `--no-parent`
- **No `--convert-links`** — removed
- Excludes: `/wp-admin`, `/wp-includes`, feed/cron/xmlrpc URLs
- `--wait=0.3 --random-wait --limit-rate=5m`

**Indonesia** (Server B, unreachable from Server A) — run locally:

```bash
bash scripts/scrape-id.sh
```

`scrape-id.sh`:
- Multi-seed: 2 (`/` + `/id/`)
- `--wait=0.5 --limit-rate=3m` (slower, over public internet)

**Sync to local:**
```bash
rsync -avz --progress tripcanvas:~/static-export/ ~/project/tripcanvas-static/sites/
```

### Phase 2a — R2 Media Audit

`r2-audit.js`:
- Scans all `.html` files for `wp-content/uploads/` URLs
- Checks against `media-url-map.json` keys
- Outputs `missing-media.txt` (URLs not in map)
- Handles `data.map` nested structure
- Priority: EN market (only 7 entries in map)

Run:
```bash
node scripts/r2-audit.js
```

Download missing EN media from Server A:
```bash
ssh tripcanvas 'while read url; do
  path=$(echo "$url" | sed "s|https://[^/]*/||")
  [ -f "/var/www/html/$path" ] && echo "/var/www/html/$path"
done < /dev/stdin' < missing-media.txt > found-local-paths.txt

rsync -avz --files-from=found-local-paths.txt tripcanvas:/ missing-media/
```

Upload to R2 and update `media-url-map.json`:
```bash
find missing-media -type f | while read f; do
  key=$(echo "$f" | sed 's|.*/missing-media/||')
  npx wrangler r2 object put "tripcanvas-media/$key" --file="$f"
  # Add entry to media-url-map.json for next phase
done
```

### Phase 2b — Rewrite Media URLs

`rewrite-urls.js`:
- Loads `media-url-map.json` → `data.map`
- Strips `r2://tripcanvas-media/` prefix via `toR2Url()`
- Sorted by URL length descending to avoid partial replacements
- Catch-all regex handles unmapped `wp-content/uploads/` URLs (both http/https, all 4 domains)
- Rewrites all `.html` files in `sites/{en,my,id,th}`

Run:
```bash
node scripts/rewrite-urls.js
```

### Phase 2c — Strip Forms

`strip-forms.js`:
- Removes `<form>...</form>` blocks
- Replaces with hidden `<div data-removed="form" hidden>` (debuggable, invisible)
- Processes all `.html` files

Run:
```bash
node scripts/strip-forms.js
```

### Phase 2d — Generate 404.html

`generate-404.js`:
- Checks each `sites/<market>/404.html` exists
- If missing, writes minimal 404 page

### Phase 2e — Deploy Config

Each `sites/<market>/` gets:

**`_redirects`:**
```
/wp-admin              /404.html    404
/wp-admin/*            /404.html    404
/wp-login.php          /404.html    404
/xmlrpc.php            /404.html    404
/feed/                 /            302
/comments/feed/        /            302
```

**`_headers`:**
```
/*.html
  Cache-Control: public, max-age=3600
```

### Phase 3 — Deploy to Cloudflare Pages

```bash
cd ~/project/tripcanvas-static
npm init -y && npm install -D wrangler

npx wrangler pages project create tripcanvas-en-static
npx wrangler pages deploy sites/en/ --project-name tripcanvas-en-static

npx wrangler pages project create tripcanvas-my-static
npx wrangler pages deploy sites/my/ --project-name tripcanvas-my-static

npx wrangler pages project create tripcanvas-id-static
npx wrangler pages deploy sites/id/ --project-name tripcanvas-id-static

npx wrangler pages project create tripcanvas-th-static
npx wrangler pages deploy sites/th/ --project-name tripcanvas-th-static
```

### Phase 4 — R2 Public Domain

Cloudflare Dashboard → R2 → `tripcanvas-media` → Custom Domain → Add `media.tripcanvas.co`.

Must complete **before** DNS cutover so `media.tripcanvas.co` is live when DNS switches.

### Phase 5 — DNS Cutover

Cloudflare DNS:

| Record | Old | New | Type |
|--------|-----|-----|------|
| `tripcanvas.co` | `18.136.197.26` | `tripcanvas-en-static.pages.dev` | CNAME (delete A record) |
| `www.tripcanvas.co` | CNAME to root | unchanged | CNAME |
| `malaysia` | `18.136.197.26` | `tripcanvas-my-static.pages.dev` | CNAME |
| `indonesia` | ELB CNAME | `tripcanvas-id-static.pages.dev` | CNAME |
| `thailand` | `18.136.197.26` | `tripcanvas-th-static.pages.dev` | CNAME |

Then in Pages Dashboard, add custom domains to each project (CF auto-provisions SSL).

### Phase 6 — WP Shutdown

After DNS verified:
- Cancel WP hosting (both servers)
- Workers remain deployed, dormant ($5/mo Workers Paid plan kept)
- D1 + R2 data preserved for future CMS migration

---

## Preservation Guarantee

| Resource | Status | Resumption path |
|----------|--------|-----------------|
| `apps/cms/` code | 🔒 Frozen | `npx wrangler deploy` from code |
| `apps/frontend/` code | 🔒 Frozen | `npx wrangler deploy --config <market>.jsonc` |
| D1 (`tripcanvas-db`) | ✅ Kept | 842 migrated posts intact |
| R2 (`tripcanvas-media`) | ✅ Kept + reused | Static sites use same bucket |
| Migration scripts | ✅ Preserved | All in `scripts/migration/` |
| Worker secrets | ⚠️ Documented in AGENTS.md | Re-set via `wrangler secret put` if redeploying |
| DNS | 🔀 Cut to Pages | Workers accessible via `*.academyt.workers.dev` |
| WP servers | 🔴 Shut down | Content fully scraped + media in R2 |

---

## Verification Checklist

| # | Check | Method |
|---|-------|--------|
| 1 | All 4 Pages sites load on `*.pages.dev` | Manual browse |
| 2 | Images load from `media.tripcanvas.co` | Check Network tab |
| 3 | No `wp-content/uploads` URLs remain | Grep `sites/*/` for `wp-content/uploads` |
| 4 | No `<form>` elements remain | Grep `sites/*/` for `<form` |
| 5 | `/wp-admin` returns 404 | curl each domain `/wp-admin` |
| 6 | Language switcher works | Click between locales on MY/TH/ID |
| 7 | EN site images load (audit gap) | Spot-check EN post pages |
| 8 | Legacy URLs redirected correctly | Test sample URLs from existing redirect map |
| 9 | Production domains serve static content | curl tripcanvas.co after DNS |

---

## Cost

| Product | Cost |
|---------|------|
| Cloudflare Pages (4 projects) | $0 |
| R2 storage + egress via CF CDN | $0–$0.15/mo |
| Workers Paid plan (dormant, 0 traffic) | $5/mo |
| D1 (dormant) | $0 |
| **Total** | **~$5/mo** |
