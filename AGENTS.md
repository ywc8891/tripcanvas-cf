# AGENTS.md — TripCanvas Project

---

## Project Overview

Travel blog CMS + Frontend on Cloudflare Workers.

- **CMS**: Payload CMS (single installation) on Cloudflare Workers
- **Frontend**: Astro on Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2

### Content Architecture

The existing WordPress site runs **separate subdomains on different hosting**, each with its own admin users:

| WP Subdomain | Market | Languages (locales) |
|---|---|---|
| `tripcanvas.co` | EN | English |
| `malaysia.tripcanvas.co` | MY | Malay, Chinese (zh) |
| `indonesia.tripcanvas.co` | ID | Indonesian |
| `thailand.tripcanvas.co` | TH | Thai, Chinese (zh) |

**New CMS model**: One Payload CMS installation replaces all four. Content is:
- **Isolated by market** (country/subdomain) via the `market` field on posts
- **Multi-locale** per market via Payload's localization (en/my/id/th/zh)
- **Access-controlled** — each market's admin only sees/edits their market's content

---

## Infrastructure

| Resource | Name/ID | URL |
|----------|---------|-----|
| CMS Worker | tripcanvas-cms | https://tripcanvas-cms.academyt.workers.dev |
| Frontend EN | tripcanvas | https://tripcanvas.academyt.workers.dev |
| Frontend MY | tripcanvas-my | https://tripcanvas-my.academyt.workers.dev |
| Frontend ID | tripcanvas-id | https://tripcanvas-id.academyt.workers.dev |
| Frontend TH | tripcanvas-th | https://tripcanvas-th.academyt.workers.dev |
| D1 Database | tripcanvas-db | 93ea8644-31d9-4f02-b436-398a4a965671 |
| R2 Bucket | tripcanvas-media | - |

---

## Package Versions (Production-Matched)

| Package | Version |
|---------|--------|
| payload | 3.77.0 |
| @opennextjs/cloudflare | 1.11.0 |
| next | 15.4.11 |
| @payloadcms/db-d1-sqlite | 3.77.0 |
| @payloadcms/storage-r2 | 3.77.0 |
| @payloadcms/richtext-lexical | 3.77.0 |
| wrangler | 4.61.1 |

---

## Project Structure

```
tripcanvas-cf/
├── apps/
│   ├── cms/                    # Payload CMS (single installation)
│   │   ├── src/
│   │   │   ├── payload.config.ts
│   │   │   ├── access.ts       # Market-scoped access helpers
│   │   │   ├── collections/
│   │   │   │   ├── Users.ts    # role + allowedMarkets
│   │   │   │   ├── Posts.ts    # market field + access control
│   │   │   │   ├── Categories.ts
│   │   │   │   ├── Tags.ts
│   │   │   │   └── Media.ts
│   │   │   └── migrations/
│   │   ├── wrangler.toml
│   │   └── package.json
│   └── frontend/               # Astro Frontend (4 workers)
│       ├── src/
│       │   ├── lib/
│       │   │   ├── payload.ts  # CMS API client
│       │   │   └── locale.ts   # Subdomain/locale routing
│       │   ├── layouts/
│       │   │   └── Layout.astro
│       │   ├── pages/
│       │   │   ├── index.astro
│       │   │   ├── blog/
│       │   │   │   ├── index.astro
│       │   │   │   └── [slug].astro
│       │   │   ├── [location]/
│       │   │   │   ├── index.astro    # Category index
│       │   │   │   └── [slug].astro   # Canonical post
│       │   │   └── [...slug].astro    # Legacy catch-all
│       │   ├── middleware.ts
│       │   └── styles/
│       │       └── global.css
│       ├── wrangler.jsonc           # EN worker
│       ├── wrangler-my.jsonc        # MY worker
│       ├── wrangler-id.jsonc        # ID worker
│       ├── wrangler-th.jsonc        # TH worker
│       └── astro.config.mjs
├── scripts/
│   └── migration/              # WP → Payload migration scripts
├── pnpm-workspace.yaml
└── package.json
```

---

## CMS Data Model

### Markets & Locales

**Market** = country/subdomain. Content is always scoped to one market.
**Locale** = language. A post in one market can have content in multiple locales.

```
Payload localization config: ['en', 'my', 'id', 'th', 'zh']

Market EN → locales: en
Market MY → locales: my, zh
Market ID → locales: id
Market TH → locales: th, zh
```

### Access Control (implemented)

- **Users** have `role` (admin/editor) and `allowedMarkets` (multi-select: en/my/id/th)
- **Posts** have `market` field + access control via `access.ts`:
  - `baseListFilter`: editors see only their market's posts in admin UI
  - `create`: admin OR user's allowedMarkets includes the post's market
  - `update`: admin OR market filter query constraint
  - `delete`: admin only
  - `read`: public (for frontend API)
- **access.ts** exports: `isAdmin()`, `canAccessMarket()`, `marketFilter()`
- Posts auto-set market from user's `allowedMarkets[0]` if not specified

---

## Completed Work

### ✅ Phase 1: WordPress Export
- All 4 markets exported: `site-en-v2.json`, `site-my-v2.json`, `site-id-v2.json`, `site-th-v2.json`
- ZH content exported: `site-zh-v2.json` (MY: 63, TH: 76 posts)
- Taxonomies exported: `taxonomies.json` (124 categories, 21 tags)

### ✅ Phase 2: Payload CMS Setup
- Monorepo (pnpm), D1 database, R2 bucket, Payload installed
- Collections: Users, Posts, Categories, Tags, Media
- Localization: en/my/id/th/zh
- Versions/drafts enabled on Posts
- Worker deployed, admin UI working

### ✅ Phase 3: Data Migration (core)
- **Posts**: 842 migrated with localized title/content/excerpt
- **Market backfill**: all 842 posts have `market` field set
- **Taxonomies**: 124 categories, 21 tags
- **Media**: 36,372 URLs discovered; 16,962 uploaded to R2; 19,346 skipped; 4 source 404s
- **URL rewrite**: 39,255 media URLs rewritten in post content
- **ZH locale**: 102/139 posts patched (MY: 63/63, TH: 39/76 — 37 TH slugs not found)

### ✅ Phase 4: Astro Frontend
- 4 staging workers (EN/MY/ID/TH) deployed
- Subdomain-based market routing via `HOST_LOCALE_MAP`
- `/zh/` path-prefix routing for Chinese content
- Canonical URL: `/[category]/[slug]`
- Legacy redirects: `/blog/[slug]` → canonical, `?p=<wpId>` → canonical
- Market isolation: post.market checked against host locale

### ✅ Phase 5: Frontend Polish
- Layout shell, responsive styles, card/hero designs
- Locale-safe title/excerpt fallbacks

### ✅ Phase 6: CMS Access Control (foundation)
- `role` + `allowedMarkets` on Users
- `market` field on Posts with access hooks
- `baseListFilter` for admin UI market scoping
- `access.ts` helper functions

---

## Outstanding / TODO

### ✅ Data Migration (all resolved)

| Issue | Status | Details |
|---|---|---|
| **backfill-post-locales (id/my)** | ✅ Resolved | Not a bug. 842 unique slugs; each locale's content already written during initial migration. "Missing" posts are from other markets with no translations — expected. |
| **fix-image-nodes.js** | ✅ Handled | Runtime hooks in `Posts.ts` convert `r2://` → HTTPS and `placeholder-image` → `upload` on every read/write. Raw DB cleanup optional. |
| **fix-placeholder-images.js** | ✅ Handled | Same runtime hooks cover this. |
| **ZH media migration** | ✅ Done | Already run. 5,925 files downloaded (MY: 1,893, TH: 4,032). 6,794 ZH-specific URLs mapped in media-url-map.json. |
| **fix-locale-slots.js** | ✅ Done | 841 posts patched (TH: 277, ID: 438, MY: 126). Market locale content copied to `en` default locale slot. No Chinese misplacement found. |
| **37 TH ZH posts** | ⬜ Content gap | Slugs not found in CMS during ZH migration. Accepted gap. |

### ✅ CMS Access Control (complete)

| Task | Status | Details |
|---|---|---|
| **`saveToJWT: true`** | ✅ Done | Added to `role` and `allowedMarkets` in Users.ts. |
| **Read access isolation** | ✅ Done | Editors see only their market's posts via API; public (frontend) sees all. CMS deployed (v45cd39d4). |
| **Categories/Tags** | ✅ Decided | Kept global — no market field. Only 5/117 categories shared across markets. Post-level access control provides sufficient content isolation. |
| **Media** | ✅ Decided | Kept global. Referenced by market-scoped posts; no separate isolation needed. |
| **Per-market admin users** | ✅ Created | 4 editor accounts: admin-en/my/id/th@tripcanvas.com. Market isolation verified (TH:277, MY:126, ID:438, EN:1). |

### 🟢 P0 — Resolved

| Issue | Status | Details |
|---|---|---|
| **Uncommitted files** | ✅ Committed | 42 files (access.ts, i18n.ts, wrangler configs, migration scripts, etc.) |
| **CMS build failure** | ✅ Fixed | `payload.config.ts` wraps `getCloudflareContext` in try-catch; pages use `force-dynamic`. Build via `npx opennextjs-cloudflare build` |
| **Migration artifacts** | ✅ Cleaned | Removed 419 SQL batch files, `.tmp-zh-media/`, migration export JSONs |
| **Broken `.env`** | ✅ Fixed | `PAYLOAD_LOG_LEVEL` was concatenated to `PAYLOAD_SECRET` on same line |

### 🟢 Future Enhancements

| Feature | Priority | Notes |
|---|---|---|
| Custom domains | Medium | Not configured yet |
| CI/CD pipeline | Medium | Manual deploy via wrangler |
| SEO meta fields | Low | `seo` group exists on Posts but not fully used |
| Authors collection | Low | Not created yet, `author` relationship points to Users |
| Frontend design | Low | Baseline polish done, needs real design |

---

## Commands

### Development
```bash
# CMS dev server
cd apps/cms && pnpm dev

# Frontend dev server
cd apps/frontend && pnpm dev
```

### Build & Deploy — CMS
For schema changes, the FULL pipeline is required:
```bash
cd apps/cms && npx opennextjs-cloudflare build  # next build + bundle → .open-next/worker.js
cd apps/cms && npx wrangler deploy
```
`opennextjs-cloudflare build` handles both `next build` and the worker bundle step.
Do NOT run `pnpm build` standalone — it fails during page data collection (SQLITE_BUSY
from parallel workerd instances). The `payload.config.ts` wraps `getCloudflareContext`
in a try-catch with mock fallback for build-time, and both CMS pages use
`force-dynamic` to skip static generation.

### Build & Deploy — Frontend
```bash
cd apps/frontend && pnpm build && npx wrangler deploy                       # EN
cd apps/frontend && npx wrangler deploy --config wrangler-my.jsonc          # MY
cd apps/frontend && npx wrangler deploy --config wrangler-id.jsonc          # ID
cd apps/frontend && npx wrangler deploy --config wrangler-th.jsonc          # TH
```
All 4 workers share the same `dist/` build.

### Database
```bash
npx wrangler d1 execute tripcanvas-db --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
cd apps/cms && pnpm payload migrate
```

### Migration Scripts (scripts/migration/)
```bash
pnpm migrate:taxonomies          # Taxonomies
pnpm migrate:posts               # Posts (all markets)
pnpm migrate:media                # Media to R2
pnpm migrate:backfill:posts:dry   # Backfill id/my locales (dry-run)
pnpm migrate:backfill:posts:live  # Backfill id/my locales (live)
pnpm migrate:zh:dry               # ZH locale (dry-run)
pnpm migrate:zh:live              # ZH locale (live)
pnpm migrate:zh:media             # ZH media to R2
pnpm migrate:verify               # Verify migration
pnpm migrate:verify:redirects     # Verify redirect rules
```

---

## Architecture

```
User Browser
    ↓
Cloudflare Edge (subdomain routing)
    ↓
┌──────────────────────────────────────────────┐
│  Frontend Workers (4x Astro)                  │
│  EN: tripcanvas.academyt.workers.dev          │
│  MY: tripcanvas-my.academyt.workers.dev       │
│  ID: tripcanvas-id.academyt.workers.dev       │
│  TH: tripcanvas-th.academyt.workers.dev       │
│         ↓ CMS_SERVICE binding                 │
├──────────────────────────────────────────────┤
│  CMS (Payload Worker — single instance)       │
│  tripcanvas-cms.academyt.workers.dev          │
│  Market isolation via access control          │
│         ↓                                     │
│  ┌─────────┐  ┌─────────────┐                 │
│  │   D1    │  │     R2      │                 │
│  │ SQLite  │  │   Media     │                 │
│  └─────────┘  └─────────────┘                 │
└──────────────────────────────────────────────┘
```

---

## Key Files

### CMS
- `apps/cms/src/payload.config.ts` — Payload config, localization, plugins
- `apps/cms/src/access.ts` — `isAdmin`, `canAccessMarket`, `marketFilter`
- `apps/cms/src/collections/Users.ts` — role + allowedMarkets
- `apps/cms/src/collections/Posts.ts` — market field + access control
- `apps/cms/wrangler.toml` — Worker bindings

### Frontend
- `apps/frontend/src/lib/locale.ts` — HOST_LOCALE_MAP, buildLocaleUrl, getPostUrl
- `apps/frontend/src/lib/payload.ts` — CMS API client
- `apps/frontend/src/middleware.ts` — Locale resolution, legacy redirects
- `apps/frontend/wrangler.jsonc` — EN worker config (+ wrangler-my/id/th.jsonc)

---

## URL Structure

- Canonical post: `/[category-slug]/[post-slug]`
- Category index: `/[category-slug]`
- Blog index: `/blog`
- Chinese prefix: `/zh/[category-slug]/[post-slug]`
- Legacy `/blog/[slug]` → 301 to canonical
- Legacy `?p=<wpId>` → 301 to canonical
- Legacy `/<anything>/[slug]` → 301 to canonical

---

## Troubleshooting

### Admin UI 500 Error
- Check PAYLOAD_SECRET: `npx wrangler secret list --name tripcanvas-cms`
- Verify D1 bindings in wrangler.toml

### Frontend Not Showing Posts
- Verify CMS API: `curl https://tripcanvas-cms.academyt.workers.dev/api/posts`
- Check service binding in wrangler.jsonc
- Review middleware.ts for locale resolution

### Database Schema Issues
- Use `pnpm payload migrate:create` for schema changes
- Apply remote: `npx wrangler d1 execute tripcanvas-db --remote --file schema.sql`