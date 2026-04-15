# AGENTS.md — Phase 2: Payload CMS Schema + Cloudflare Setup

---

## Phase 2 Goal

Stand up the Cloudflare infrastructure and design the Payload CMS schema.
By end of phase: Payload admin UI is accessible at the deployed URL,
collections are defined, and a test post can be created with multilanguage fields.

---

## Progress Summary

### Completed

1. ✅ Migrated from manual setup to official Payload Cloudflare template
2. ✅ Installed dependencies (Next.js 15.4.11, Payload 3.82.1, esbuild 0.28.0)
3. ✅ D1 database configured with tables: users, posts, categories, tags, media
4. ✅ R2 bucket configured for media storage
5. ✅ CMS Worker deployed to Cloudflare: `https://tripcanvas-cms.academyt.workers.dev`
6. ✅ PAYLOAD_SECRET set via `wrangler secret put`

### Blocked

⚠️ **Admin UI initialization error** - "There was an error initializing Payload"
- Admin UI loads but shows error during hydration
- User creation blocked
- Likely related to database schema for localized fields and versions

---

## Task 1 — Initialize monorepo tooling ✅

Completed in previous session:
- Created pnpm workspace configuration
- apps/cms: Payload CMS with Next.js + OpenNext
- apps/frontend: Astro (empty, for Phase 3)

---

## Task 2 — Cloudflare Resources ✅

Resources created:
- **D1 Database**: `tripcanvas-db` (ID: `93ea8644-31d9-4f02-b436-398a4a965671`)
- **R2 Bucket**: `tripcanvas-media`

wrangler.toml configured in apps/cms/:
```toml
name = 'tripcanvas-cms'
account_id = '055213e96101363c1867d04f82e08d8b'

[[d1_databases]]
binding = 'D1'
database_id = '93ea8644-31d9-4f02-b436-398a4a965671'

[[r2_buckets]]
binding = 'R2'
bucket_name = 'tripcanvas-media'
```

---

## Task 3 — Payload CMS Installation ✅

Installed packages:
```bash
pnpm add next@15.4.11 payload @payloadcms/db-d1-sqlite @payloadcms/richtext-lexical
pnpm add @payloadcms/storage-r2 @opennextjs/cloudflare
pnpm add -D wrangler esbuild@latest
```

### Key Dependencies
- **Next.js**: 15.4.11 (15.5.15+ required for OpenNext, but 15.4.11 is Payload's minimum)
- **@opennextjs/cloudflare**: 1.19.1
- **esbuild**: 0.28.0 (upgraded from 0.25.4 to fix bundler panic)
- **wrangler**: 4.82.2

### Build Fix Applied
The esbuild 0.25.4 bundled with OpenNext had a bug with monorepo path resolution.
Upgraded to esbuild 0.28.0 to fix "panic: Unexpected expression of type <nil>" errors.

---

## Task 4 — Payload Collections ✅

Created collection definitions in `apps/cms/src/collections/`:

- **Posts.ts** - with localized title, slug, content, excerpt, featuredImage, categories, tags, author, publishedAt, seo, wpId, drafts
- **Categories.ts** - with localized name, slug, parent, wpId
- **Tags.ts** - with localized name, slug, wpId
- **Media.ts** - with alt, caption, width, height, wpId (upload to R2)
- **Users.ts** - with auth: true

### Localization Configuration
```typescript
localization: {
  locales: [
    { label: 'English (Global)', code: 'en' },
    { label: 'Malaysia', code: 'my' },
    { label: 'Indonesia', code: 'id' },
    { label: 'Thailand', code: 'th' },
  ],
  defaultLocale: 'en',
  fallback: true,
}
```

---

## Task 5 — Deploy Worker ✅

Successfully deployed:
```bash
cd apps/cms
npx opennextjs-cloudflare build
npx wrangler deploy
```

**Deployed URL**: `https://tripcanvas-cms.academyt.workers.dev`

---

## Task 6 — Database Schema ⚠️ PARTIAL

The database has tables but may be missing tables for:
- Localization tables (posts_title, posts_slug, etc.)
- Versions tables (for drafts)

Check tables:
```bash
wrangler d1 execute tripcanvas-db --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
```

---

## Next Steps

### Option 1: Debug Initialization Error (Recommended)

1. Check worker logs: `wrangler tail tripcanvas-cms`
2. Verify PAYLOAD_SECRET is set: `wrangler secret list --name tripcanvas-cms`
3. Test admin login at `/admin/login`
4. Create user through UI registration if available

### Option 2: Recreate Database with Fresh Migrations

1. Drop all tables in D1
2. Create proper migration file matching collection config
3. Run migrations

### Option 3: Continue Without Admin (API-Only)

The API endpoints may still work even if admin UI has issues.
Test with GraphQL or REST API.

---

## Phase 2 Complete Checklist

- [x] Monorepo setup (pnpm workspaces)
- [x] Cloudflare D1 database created
- [x] Cloudflare R2 bucket created
- [x] Payload CMS installed
- [x] Collection definitions created
- [x] Worker deployed to Cloudflare
- [x] PAYLOAD_SECRET set
- [ ] Admin UI accessible (blocked - initialization error)
- [ ] Test post created with multilanguage fields

---

## Phase 3 Preview

After Phase 2 completion:
1. Fix admin UI initialization issue
2. Set up custom domain `cms.tripcanvas.co` → Worker
3. Create admin user and verify login
4. Begin Phase 3: Frontend (Astro on Cloudflare Pages)
