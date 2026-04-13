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
- [ ] Phase 2 — Payload CMS schema design
- [ ] Phase 3 — Cloudflare infrastructure setup
- [ ] Phase 4 — Data migration scripts
- [ ] Phase 5 — Frontend build (Astro)
- [ ] Phase 6 — DNS cutover

**Active phase: Phase 2 — Payload CMS schema + CF setup**

## How to Start Each Session

1. Read this file fully
2. Read the current `AGENTS.md` for active phase tasks
3. Check git log for what was last completed: `git log --oneline -10`
4. Continue from the last incomplete task in AGENTS.md
5. Commit after each completed task with a descriptive message
