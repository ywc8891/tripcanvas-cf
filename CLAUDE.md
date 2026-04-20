# TripCanvas Migration — Project Brief

> This file is read automatically by Opencode/Claude at the start of every session.
> Never delete it. Update the CURRENT STATUS section as phases complete.

---

## Project Goal

Migrate tripcanvas.co from WordPress on AWS EC2 to the Cloudflare stack.
Target cost: ~$5/month. All content, images, and multilanguage features must be preserved.

## Current Stack (source — DO NOT modify production)

- Host: AWS EC2, Ubuntu, tripcanvas.co
- CMS: WordPress (PHP)
- DB: MySQL
- WordPress topology:
  - `tripcanvas.co` is a standalone single-site WordPress install
  - `malaysia.tripcanvas.co` is its own WordPress multisite network
  - `indonesia.tripcanvas.co` is its own WordPress multisite network
  - `thailand.tripcanvas.co` is its own WordPress multisite network
- Locale/content structure:
  - `tripcanvas.co` serves English (`en`)
  - Localized content is not a single global WPML/Polylang setup across all domains
  - Language/section variants currently exist as separate subdomains and, within some subdomains, path-based multisite subsites such as `/zh/`, `/id/`, and `/shop/`
- Subdomains: `malaysia.tripcanvas.co`, `indonesia.tripcanvas.co`, `thailand.tripcanvas.co`
- Media: WordPress uploads folder (possibly partially on S3)

## Target Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Cloudflare Pages (Astro) | Public-facing site |
| Backend/CMS | Cloudflare Worker + Payload CMS | Content API + admin UI |
| Database | Cloudflare D1 (SQLite) | Structured content |
| Media | Cloudflare R2 | Images and file assets |
| Routing | Cloudflare Worker (edge) | Subdomain → locale mapping |

## Locales

| Subdomain | Locale code | Language |
|---|---|---|
| tripcanvas.co | en | English (global) |
| malaysia.tripcanvas.co | my | Malay / Malaysian English |
| indonesia.tripcanvas.co | id | Indonesian |
| thailand.tripcanvas.co | th | Thai |

## Source WordPress Layout

- `tripcanvas.co`
  - Path: `/var/www/html/tripcanvas.co/`
  - Type: standalone WordPress site
  - Database: `wordpress_main`
- `malaysia.tripcanvas.co`
  - Path: `/var/www/html/malaysia.tripcanvas.co/public/`
  - Type: WordPress multisite network
  - Database: `malaysia`
  - Known sites: `/`, `/zh/`, `/shop/`
- `indonesia.tripcanvas.co`
  - Path: `/var/www/html/indonesia.tripcanvas.co/public/`
  - Type: WordPress multisite network
  - Database: `wordpress`
  - Known sites: `/`, `/id/`, `/flights/`, `/giveaway/`, `/business/`, `/zh/`
- `thailand.tripcanvas.co`
  - Path: `/var/www/html/thailand.tripcanvas.co/public/`
  - Type: WordPress multisite network
  - Database: `thailand`
  - Known sites: `/`, `/zh/`, `/id/`

## Monorepo Structure

```
/
├── CLAUDE.md                  ← you are here
├── AGENTS.md                  ← active phase instructions (swap per phase)
├── apps/
│   ├── frontend/              ← Astro, Cloudflare Pages
│   └── cms/                   ← Payload CMS, Cloudflare Worker
├── packages/
│   └── shared-types/          ← TypeScript types shared between apps
├── scripts/
│   └── migration/             ← one-off data migration scripts
├── .github/
│   └── workflows/             ← CI/CD
├── wrangler.toml              ← Cloudflare Workers config (root)
└── package.json               ← monorepo root (pnpm workspaces)
```

## Non-Negotiable Constraints

1. **Preserve all URLs** — existing post slugs must not change, or 301 redirects must cover them
2. **All images must migrate** — no broken image links post-cutover
3. **Writer UX** — Payload admin must be usable by non-technical writers. Rich text, media upload, locale switcher.
4. **GitHub versioning** — every change committed; no direct edits outside version control
5. **Zero downtime cutover** — build in parallel, switch DNS last
6. **TypeScript everywhere** — strict mode, shared types package

## Tech Decisions (locked — do not revisit unless noted)

- **Astro** for frontend (not Next.js) — simpler output, better Cloudflare Pages support
- **Payload CMS v3** — supports Cloudflare Workers + D1 natively via `@payloadcms/db-sqlite`
- **pnpm workspaces** — monorepo tooling
- **Wrangler** for all CF deployments
- **No Docker** — everything deploys to Cloudflare edge, no containers needed

## Environment Variables Pattern

All secrets live in `.env` (gitignored) and Cloudflare Workers secrets (via `wrangler secret put`).
Never hardcode credentials. Use `process.env.VARIABLE_NAME` pattern throughout.

Required vars (documented, not valued here):
- `PAYLOAD_SECRET` — Payload CMS JWT secret
- `DATABASE_URL` — D1 binding name
- `R2_BUCKET` — R2 bucket binding name
- `R2_PUBLIC_URL` — Public R2 URL for media

## Current Status

- [x] Phase 1 — Export (WordPress content + media)
  - Posts exported (actual counts): EN 1, MY 132, ID 461, TH 277 (total 871)
  - Taxonomies: 124 categories, 21 tags (shape: `{ slug, names: { locale: name } }`)
  - Media inventory: 60,581 entries (⚠️ `url`, `mime_type`, `width`, `height` all null)
  - Media downloaded: 560,150 files (~37 GB) under `scripts/migration/media-download/{locale}/{year}/{month}/`
  - Site settings + url-map saved
- [x] Phase 2 — Payload CMS schema + deploy
  - ✅ Payload CMS installed with official Cloudflare template
  - ✅ D1 database (`tripcanvas-db`), R2 bucket (`tripcanvas-media`)
  - ✅ CMS Worker deployed: `https://tripcanvas-cms.academyt.workers.dev`
  - ✅ Admin UI working, user creation + login verified
  - Collections: Users, Categories, Tags, Media, Posts (localized: en/my/id/th)
- [x] Phase 3 — Astro frontend (per `AGENTS.md`)
  - ✅ Astro + Tailwind, homepage, blog index, `[slug]` post page
  - ✅ Deployed: `https://tripcanvas.academyt.workers.dev`
  - ✅ CMS service binding (`CMS_SERVICE`) wired through middleware
- [x] Phase 4 — Data migration (WordPress → Payload)
  - ✅ CMS schema drift fixed; fresh migration applied; `/api/posts` restored
  - ✅ Live taxonomy migration completed: 124 categories, 21 tags
  - ✅ Live post migration completed: 842 unique slugs migrated from 871 source posts
  - ✅ Live media migration completed: 36,372 discovered URLs → 16,962 uploaded, 19,346 skipped
  - ✅ Residual media failures reduced to 4 unrecoverable source 404 URLs
  - ✅ Post content media URL rewrite completed: 39,255 URL swaps applied via `migrate-posts.js`
  - ✅ Verification passed: CMS totals posts=842, categories=124, tags=21
  - Spec: `AGENTS-phase3.md` (title says "Phase 3" but it's the data-migration playbook; CLAUDE.md numbering treats it as Phase 4)
- [ ] Phase 5 — Frontend polish + visual replication of tripcanvas.co (includes locale-by-domain routing)
  - ✅ Domain-based locale routing deployed and validated (`tripcanvas=en`, `malaysia=my`, `indonesia=id`, `thailand=th`)
  - ✅ Header override routing validated (`x-tc-locale`)
  - ✅ Locale routing architecture fixed: subdomain-only (no path prefixes for primary locales)
    - Locale switcher generates full subdomain URLs via `buildLocaleUrl()` in `locale.ts`
    - All internal links use clean paths (`/blog/slug`), no locale prefix in URL
    - Secondary locale path support (e.g. `/zh/`) deferred until content migrated
  - ✅ Legacy WordPress path redirects live:
    - `/<slug>` → `/blog/<slug>` (301)
    - `/<category>/<slug>` → `/blog/<slug>` (301)
    - `/?p=<wpId>` → `/blog/<slug>` (301)
  - ✅ Added redirect QA automation: `scripts/migration/verify-redirects.js`
  - ✅ Redirect QA passed live: `36/36` checks (`pnpm migrate:verify:redirects`)
  - ⏳ Remaining: visual parity/polish pass against legacy tripcanvas.co pages
- [ ] Phase 6 — DNS cutover

**Active phase: Phase 5 — Frontend polish + locale/domain behavior**

> Note on numbering mismatch: the `AGENTS-phaseN.md` files were authored before the frontend work was pulled forward. `AGENTS-phase3.md` = data migration, `AGENTS-phase4.md` = Astro frontend (already done).

### Cloudflare Resources
- **D1 Database**: `tripcanvas-db` (ID: `93ea8644-31d9-4f02-b436-398a4a965671`)
- **R2 Bucket**: `tripcanvas-media`
- **CMS Worker**: `https://tripcanvas-cms.academyt.workers.dev`

## How to Start Each Session

1. Read this file fully
2. Read the current `AGENTS.md` for active phase tasks
3. Check git log for what was last completed: `git log --oneline -10`
4. Continue from the last incomplete task in AGENTS.md
5. Commit after each completed task with a descriptive message
