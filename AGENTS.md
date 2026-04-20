# AGENTS.md — TripCanvas Project

---

## Project Overview

Travel blog CMS + Frontend on Cloudflare Workers
- **CMS**: Payload CMS on Cloudflare Workers
- **Frontend**: Astro on Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2

---

## Infrastructure

| Resource | Name/ID | URL |
|----------|---------|-----|
| Frontend Worker | tripcanvas | https://tripcanvas.academyt.workers.dev |
| CMS Worker | tripcanvas-cms | https://tripcanvas-cms.academyt.workers.dev |
| D1 Database | tripcanvas-db | 93ea8644-31d9-4f02-b436-398a4a965671 |
| R2 Bucket | tripcanvas-media | - |

---

## Package Versions (Production-Matched)

| Package | Version |
|---------|---------|
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
│   ├── cms/                    # Payload CMS
│   │   ├── src/
│   │   │   ├── payload.config.ts
│   │   │   ├── collections/
│   │   │   │   ├── Users.ts
│   │   │   │   ├── Posts.ts
│   │   │   │   ├── Categories.ts
│   │   │   │   ├── Tags.ts
│   │   │   │   ├── Media.ts
│   │   │   │   └── Authors.ts
│   │   │   └── migrations/
│   │   ├── wrangler.toml
│   │   └── package.json
│   └── frontend/               # Astro Frontend
│       ├── src/
│       │   ├── lib/
│       │   │   └── payload.ts  # CMS API client
│       │   ├── layouts/
│       │   │   └── Layout.astro
│       │   ├── pages/
│       │   │   ├── index.astro
│       │   │   └── blog/
│       │   │       ├── index.astro
│       │   │       └── [slug].astro
│       │   ├── middleware.ts
│       │   └── styles/
│       │       └── global.css
│       ├── wrangler.jsonc
│       └── astro.config.mjs
├── packages/
├── pnpm-workspace.yaml
└── package.json
```

---

## Completed Phases

### ✅ Phase 1: WordPress Export
- Content exported from WordPress (previous session)

### ✅ Phase 2: Payload CMS Setup

#### Tasks Completed
1. ✅ Monorepo setup (pnpm workspaces)
2. ✅ Cloudflare D1 database created
3. ✅ Cloudflare R2 bucket created
4. ✅ Payload CMS installed with matching versions
5. ✅ Collection definitions created
6. ✅ Worker deployed to Cloudflare
7. ✅ PAYLOAD_SECRET set
8. ✅ Admin UI accessible and working
9. ✅ User created and login working
10. ✅ Test post created and visible via API

#### Database Tables (15 tables)
- users, users_sessions
- posts, categories, tags, media
- payload_migrations, payload_kv
- payload_locked_documents, payload_locked_documents_rels
- payload_preferences, payload_preferences_rels
- d1_migrations, _cf_KV, sqlite_sequence

### ✅ Phase 3: Astro Frontend Setup

#### Tasks Completed
1. ✅ Astro initialized with Cloudflare adapter
2. ✅ Tailwind CSS configured
3. ✅ Payload helper library created
4. ✅ CMS service binding configured
5. ✅ Homepage with post list
6. ✅ Blog index page
7. ✅ Individual post pages
8. ✅ Frontend deployed to Cloudflare

---

## Current Status

| Component | Status | URL |
|-----------|--------|-----|
| Frontend | ✅ Working | https://tripcanvas.academyt.workers.dev |
| CMS Admin | ✅ Working | https://tripcanvas-cms.academyt.workers.dev/admin |
| User Login | ✅ Working | - |
| Post Creation | ✅ Working | - |
| API Communication | ✅ Working | Service binding |

---

## Known Gaps (Future Enhancement)

| Feature | Priority | Notes |
|---------|----------|-------|
| Localization | Medium | No multilingual fields yet |
| Relationships | Medium | Posts not linked to categories/tags |
| SEO fields | Low | No meta fields |
| Draft/Publish | Low | No versioning (all posts visible) |
| Custom domains | Low | Not configured yet |

---

## Commands

### Development
```bash
# CMS dev server
cd apps/cms && pnpm dev

# Frontend dev server
cd apps/frontend && pnpm dev
```

### Build & Deploy
```bash
# Build CMS
cd apps/cms && pnpm build && npx wrangler deploy

# Build Frontend
cd apps/frontend && pnpm build && npx wrangler deploy
```

### Database
```bash
# Check tables
npx wrangler d1 execute tripcanvas-db --remote --command "SELECT name FROM sqlite_master WHERE type='table';"

# Run migrations
cd apps/cms && pnpm payload migrate
```

---

## Architecture

```
User Browser
    ↓
Cloudflare Edge
    ↓
┌─────────────────────────────────┐
│  Frontend (Astro Worker)         │
│  tripcanvas.academyt.workers.dev │
│         ↓ CMS_SERVICE binding    │
├─────────────────────────────────┤
│  CMS (Payload Worker)            │
│  tripcanvas-cms.academyt...      │
│         ↓                        │
│  ┌─────────┐  ┌─────────────┐    │
│  │   D1    │  │     R2      │    │
│  │ SQLite  │  │   Media     │    │
│  └─────────┘  └─────────────┘    │
└─────────────────────────────────┘
```

---

## Key Files

### CMS Config
- `apps/cms/src/payload.config.ts` - Payload configuration
- `apps/cms/wrangler.toml` - Worker bindings

### Frontend Config
- `apps/frontend/src/lib/payload.ts` - CMS API client
- `apps/frontend/wrangler.jsonc` - Worker + service binding

---

## Troubleshooting

### Admin UI 500 Error
- Check PAYLOAD_SECRET is set: `npx wrangler secret list --name tripcanvas-cms`
- Check database schema matches Payload config
- Verify D1 bindings in wrangler.toml

### Frontend Not Showing Posts
- Verify CMS API works: `curl https://tripcanvas-cms.academyt.workers.dev/api/posts`
- Check service binding in wrangler.jsonc
- Review middleware.ts for CMS_ENV setup

### Database Schema Issues
- Never manually write SQL - use `pnpm payload migrate:create`
- Apply remote: `npx wrangler d1 execute tripcanvas-db --remote --file schema.sql`

---

## Next Steps

1. Create content (posts, categories, tags)
2. Enhance CMS collections (localization, relationships)
3. Improve frontend design
4. Configure custom domains
5. Set up CI/CD pipeline