# AGENTS-phase4.md — Phase 4: Astro Frontend

> Rename to AGENTS.md when Phase 4 begins.
> Prerequisite: Payload CMS running with migrated content (Phase 3 complete)

---

## Phase 4 Goal

Build the Astro frontend that reads from Payload CMS and matches the existing
tripcanvas.co visual design. Deploy to Cloudflare Pages.

---

## Task 1 — Initialize Astro project

```bash
cd apps/frontend
pnpm create astro@latest . --template minimal --typescript strict --no-install
pnpm install
pnpm add @astrojs/cloudflare @astrojs/sitemap
pnpm add -D @cloudflare/workers-types
```

Update `apps/frontend/astro.config.mjs`:
```javascript
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import sitemap from '@astrojs/sitemap'

export default defineConfig({
  output: 'server', // SSR — reads locale from request
  adapter: cloudflare({ mode: 'directory' }),
  integrations: [sitemap()],
  site: 'https://tripcanvas.co',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'my', 'id', 'th'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
})
```

Commit: `feat(frontend): initialize astro project`

---

## Task 2 — Create Payload API client

Create `apps/frontend/src/lib/api.ts`:

```typescript
const CMS_URL = import.meta.env.CMS_URL || 'https://cms.tripcanvas.co'

interface FetchOptions {
  locale?: string
  page?: number
  limit?: number
  category?: string
}

export async function getPosts(opts: FetchOptions = {}) {
  const params = new URLSearchParams({
    locale: opts.locale || 'en',
    limit: String(opts.limit || 10),
    page: String(opts.page || 1),
    depth: '2', // include related category/tag objects
    'where[_status][equals]': 'published',
    sort: '-publishedAt',
    ...(opts.category ? { 'where[categories.slug][equals]': opts.category } : {}),
  })
  
  const res = await fetch(`${CMS_URL}/api/posts?${params}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getPost(slug: string, locale: string) {
  const params = new URLSearchParams({
    locale,
    depth: '3',
    'where[slug][equals]': slug,
  })
  const res = await fetch(`${CMS_URL}/api/posts?${params}`)
  const data = await res.json()
  return data.docs?.[0] || null
}

export async function getCategories(locale: string) {
  const res = await fetch(`${CMS_URL}/api/categories?locale=${locale}&limit=100`)
  return res.json()
}
```

Commit: `feat(frontend): add cms api client`

---

## Task 3 — Read locale from request

Create `apps/frontend/src/middleware.ts`:

```typescript
import { defineMiddleware } from 'astro:middleware'

export const onRequest = defineMiddleware(async (context, next) => {
  // Locale injected by our Cloudflare routing Worker (X-TC-Locale header)
  // Fallback to URL path prefix or default
  const localeFromHeader = context.request.headers.get('X-TC-Locale')
  const localeFromUrl = context.currentLocale
  
  context.locals.locale = localeFromHeader || localeFromUrl || 'en'
  context.locals.host = context.request.headers.get('X-TC-Host') || 'tripcanvas.co'
  
  return next()
})
```

Add to `env.d.ts`:
```typescript
declare namespace App {
  interface Locals {
    locale: string
    host: string
  }
}
```

Commit: `feat(frontend): add locale middleware`

---

## Task 4 — Build core pages

Create these Astro pages. Match the existing tripcanvas.co design exactly —
open the live site in a browser and replicate the CSS/layout:

### `src/pages/index.astro` — Homepage
- Hero section
- Featured posts grid (latest 6 posts for current locale)
- Category navigation

### `src/pages/[...slug].astro` — Post detail
```astro
---
import Layout from '../layouts/Layout.astro'
import { getPost } from '../lib/api'

const { slug } = Astro.params
const locale = Astro.locals.locale
const post = await getPost(slug, locale)

if (!post) return Astro.redirect('/404')
---
<Layout title={post.title} seo={post.seo}>
  <article>
    {post.featuredImage && (
      <img src={post.featuredImage.url} alt={post.featuredImage.alt} />
    )}
    <h1>{post.title}</h1>
    <RichText content={post.content} />
  </article>
</Layout>
```

### `src/pages/category/[category].astro` — Category listing

### `src/components/RichText.astro` — Renders Payload Lexical JSON to HTML

For Lexical → HTML, write a recursive renderer that handles:
`paragraph`, `heading`, `list`, `listitem`, `link`, `text` (with bold/italic/code formats)

Commit: `feat(frontend): add all core pages`

---

## Task 5 — Replicate existing styles

This is important: writers and readers must not notice a visual change.

1. Take screenshots of the live tripcanvas.co
2. Open browser DevTools → copy the computed CSS for key elements
3. Create `src/styles/global.css` that matches:
   - Font family, sizes, colors
   - Post card layout
   - Navigation/header
   - Footer

Do NOT redesign. Copy.

Commit: `feat(frontend): replicate tripcanvas visual design`

---

## Task 6 — Build sitemap and redirects

Create `public/_redirects` (Cloudflare Pages redirect syntax):
```
# Preserve old WordPress URLs
/blog/* /:splat 301
/?p=:id /archives/:id 301
```

Add all old-format URLs from `scripts/migration/export/url-map.md`.

Commit: `feat(frontend): add redirects and sitemap`

---

## Task 7 — Deploy to Cloudflare Pages

```bash
cd apps/frontend

# Preview deploy
wrangler pages deploy dist/ --project-name tripcanvas-frontend

# Bind to CMS worker
# Add in Cloudflare dashboard: Pages → Settings → Functions → KV/Service bindings
# Bind CMS_URL = https://tripcanvas-cms.workers.dev
```

Run through QA checklist:
- [ ] Homepage loads with posts in correct locale per subdomain
- [ ] Post detail pages load
- [ ] Images load from R2
- [ ] Category pages work
- [ ] No console errors

Commit: `chore: frontend deployed to cf pages preview`

---

## Phase 4 Complete

1. Update CLAUDE.md — check off Phase 4
2. Replace AGENTS.md with AGENTS-phase5.md (cutover)
3. Final commit: `chore: complete phase 4 — frontend built and deployed`
