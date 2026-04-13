# AGENTS-phase2.md — Phase 2: Payload CMS Schema + CF Setup

> Rename this to AGENTS.md when Phase 2 begins.

---

## Phase 2 Goal

Stand up the Cloudflare infrastructure and design the Payload CMS schema.
By end of phase: Payload admin UI is accessible at cms.tripcanvas.co,
collections are defined, and a test post can be created with multilanguage fields.

---

## Task 1 — Initialize monorepo tooling

From repo root:

```bash
# Initialize pnpm workspaces
cat > package.json << 'EOF'
{
  "name": "tripcanvas",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "workspaces": ["apps/*", "packages/*"]
}
EOF

# Create workspace packages
mkdir -p apps/cms apps/frontend packages/shared-types

# Init each package
cd apps/cms && pnpm init
cd ../frontend && pnpm init
cd ../../packages/shared-types && pnpm init
```

Commit: `chore: initialize pnpm monorepo structure`

---

## Task 2 — Create Cloudflare resources

Run these wrangler commands and save the output IDs to `.env.example`:

```bash
# D1 database
wrangler d1 create tripcanvas-db
# → Note the database_id

# R2 bucket
wrangler r2 bucket create tripcanvas-media

# Create wrangler.toml at repo root
```

Create `wrangler.toml`:
```toml
name = "tripcanvas-cms"
main = "apps/cms/src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "tripcanvas-db"
database_id = "REPLACE_WITH_YOUR_D1_ID"

[[r2_buckets]]
binding = "R2"
bucket_name = "tripcanvas-media"

[vars]
ENVIRONMENT = "production"
```

Commit: `chore: add wrangler config and cloudflare resources`

---

## Task 3 — Install and configure Payload CMS

```bash
cd apps/cms

pnpm add payload @payloadcms/db-sqlite @payloadcms/richtext-lexical
pnpm add hono  # HTTP framework for Worker
pnpm add -D wrangler typescript @cloudflare/workers-types
```

Create `apps/cms/src/payload.config.ts`:

```typescript
import { buildConfig } from 'payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || '',
  editor: lexicalEditor({}),
  
  // Localization — matches our 4 subdomains
  localization: {
    locales: [
      { label: 'English (Global)', code: 'en' },
      { label: 'Malaysia', code: 'my' },
      { label: 'Indonesia', code: 'id' },
      { label: 'Thailand', code: 'th' },
    ],
    defaultLocale: 'en',
    fallback: true, // fall back to 'en' if locale translation missing
  },

  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL || 'file:./dev.db',
    },
  }),

  collections: [
    // Import collection configs (created in Task 4)
    require('./collections/Posts').Posts,
    require('./collections/Categories').Categories,
    require('./collections/Tags').Tags,
    require('./collections/Media').Media,
    require('./collections/Authors').Authors,
  ],

  admin: {
    user: 'authors',
  },
})
```

Commit: `feat(cms): add payload config with localization`

---

## Task 4 — Define Payload collections

Create each file below in `apps/cms/src/collections/`:

### Posts.ts
```typescript
import { CollectionConfig } from 'payload'

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'locale', 'status', 'publishedAt'],
    description: 'Travel articles and guides',
  },
  access: {
    read: () => true, // public read
  },
  versions: {
    drafts: true, // enable draft/publish workflow
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: { description: 'URL-friendly identifier. Auto-generated from title.' },
    },
    {
      name: 'content',
      type: 'richText',
      localized: true,
    },
    {
      name: 'excerpt',
      type: 'textarea',
      localized: true,
      admin: { description: 'Short summary shown in post listings.' },
    },
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: { position: 'sidebar' },
    },
    {
      name: 'seo',
      type: 'group',
      localized: true,
      admin: { description: 'SEO metadata' },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'description', type: 'textarea' },
      ],
    },
    // Preserve original WordPress ID for migration matching
    {
      name: 'wpId',
      type: 'number',
      admin: { description: 'Original WordPress post ID (migration reference)', readOnly: true },
    },
  ],
}
```

### Categories.ts
```typescript
import { CollectionConfig } from 'payload'

export const Categories: CollectionConfig = {
  slug: 'categories',
  admin: { useAsTitle: 'name' },
  access: { read: () => true },
  fields: [
    { name: 'name', type: 'text', required: true, localized: true },
    { name: 'slug', type: 'text', required: true, unique: true },
    { name: 'parent', type: 'relationship', relationTo: 'categories' },
    { name: 'wpId', type: 'number', admin: { readOnly: true } },
  ],
}
```

### Tags.ts
```typescript
import { CollectionConfig } from 'payload'

export const Tags: CollectionConfig = {
  slug: 'tags',
  admin: { useAsTitle: 'name' },
  access: { read: () => true },
  fields: [
    { name: 'name', type: 'text', required: true, localized: true },
    { name: 'slug', type: 'text', required: true, unique: true },
    { name: 'wpId', type: 'number', admin: { readOnly: true } },
  ],
}
```

### Media.ts

> ✅ DESIGN DECISION: Payload stores the R2 URL only. No server-side image resizing in Payload.
> Cloudflare Workers have no disk access, so Payload cannot process/resize images on the Worker.
> Image optimization is handled by Astro's `<Image>` component at the edge via Cloudflare Image
> Resizing. This means: faster uploads, no Worker CPU wasted on image processing, and responsive
> images generated on-demand by the CDN.
>
> PREREQUISITE: Enable Cloudflare Image Resizing on the tripcanvas.co zone in CF dashboard
> (Speed → Optimization → Resize images from any origin → ON). Without this, Astro's
> `<Image>` will still work but will serve the raw R2 file instead of an optimized version.

```typescript
import { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    // Serve directly from R2 — no local processing
    staticURL: process.env.R2_PUBLIC_URL || '/media',
    staticDir: 'media', // local dev fallback only
    // NO imageSizes — Cloudflare Image Resizing handles this at the CDN edge
    // Adding imageSizes here would cause Payload to attempt local Sharp processing,
    // which fails silently on Cloudflare Workers (no filesystem)
    adminThumbnail: 'url', // show the raw URL as thumbnail in admin
    disableLocalStorage: true, // never write to disk — always use R2 handler
  },
  access: { read: () => true },
  fields: [
    {
      name: 'alt',
      type: 'text',
      localized: true,
      admin: { description: 'Describe the image for screen readers and SEO.' },
    },
    { name: 'caption', type: 'text', localized: true },
    {
      name: 'width',
      type: 'number',
      admin: { description: 'Original image width in pixels' },
    },
    {
      name: 'height',
      type: 'number',
      admin: { description: 'Original image height in pixels' },
    },
    { name: 'wpId', type: 'number', admin: { readOnly: true } },
  ],
}
```

**How Astro consumes this in the frontend (Phase 4 reference):**
```astro
---
// In any Astro component — Cloudflare Image Resizing via URL params
const { src, alt, width, height } = post.featuredImage
const optimizedSrc = `${src}?width=800&quality=85&format=webp`
---
<img src={optimizedSrc} alt={alt} width={800} loading="lazy" decoding="async" />
```
No npm packages needed — resizing is a CF zone feature, activated by URL query params.

### Authors.ts
```typescript
import { CollectionConfig } from 'payload'

export const Authors: CollectionConfig = {
  slug: 'authors',
  auth: true, // this collection handles authentication
  admin: { useAsTitle: 'email' },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'bio', type: 'textarea', localized: true },
    { name: 'avatar', type: 'upload', relationTo: 'media' },
    {
      name: 'role',
      type: 'select',
      options: ['admin', 'editor', 'writer'],
      defaultValue: 'writer',
    },
  ],
}
```

Commit: `feat(cms): add all payload collection definitions`

---

## Task 5 — Create subdomain routing Worker

Create `apps/cms/src/router.ts`:

This Worker intercepts requests to all subdomains and injects the locale:

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const host = url.hostname

    // Map subdomain to locale
    const localeMap: Record<string, string> = {
      'malaysia.tripcanvas.co': 'my',
      'indonesia.tripcanvas.co': 'id',
      'thailand.tripcanvas.co': 'th',
      'tripcanvas.co': 'en',
      'www.tripcanvas.co': 'en',
    }

    const locale = localeMap[host] ?? 'en'

    // Clone request, add locale header for the frontend to read
    const modifiedRequest = new Request(request, {
      headers: {
        ...Object.fromEntries(request.headers),
        'X-TC-Locale': locale,
        'X-TC-Host': host,
      },
    })

    // Route to Cloudflare Pages frontend
    return fetch(modifiedRequest)
  },
}

interface Env {
  DB: D1Database
  R2: R2Bucket
}
```

Commit: `feat(cms): add subdomain locale routing worker`

---

## Task 6 — Local dev smoke test

```bash
cd apps/cms
wrangler dev --local  # starts local D1 + Worker

# In another terminal, verify:
curl http://localhost:8787/api/posts
# Should return { docs: [], totalDocs: 0, ... }

# Access admin UI
open http://localhost:8787/admin
# Create a test post in all 4 locales
# Upload a test image
# Verify it saves without errors
```

Document any issues in `docs/dev-notes.md`.
Commit: `chore: confirm local dev environment working`

---

## Phase 2 Complete

1. Update `CLAUDE.md` — check off Phase 2
2. Replace `AGENTS.md` with `AGENTS-phase3.md`
3. Final commit: `chore: complete phase 2 — cms schema and cf infra done`
