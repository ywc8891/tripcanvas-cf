# AGENTS-phase3.md — Phase 3: Data Migration Scripts

> Rename to AGENTS.md when Phase 3 begins.
> Prerequisite: Phase 1 export files exist in scripts/migration/export/
> Prerequisite: Payload CMS is running locally (Phase 2 complete)

---

## Phase 3 Goal

Write and run scripts that take the Phase 1 export files and import them
into Payload CMS via its REST API. End state: all WP content lives in D1,
all images live in R2, slugs preserved, locales assigned correctly.

---

## Task 1 — Set up migration script environment

```bash
cd scripts/migration
pnpm init
pnpm add axios form-data dotenv @aws-sdk/client-s3
pnpm add jsdom @types/jsdom          # for HTML-to-Lexical conversion
pnpm add p-limit                      # for batch concurrency control
pnpm add @payloadcms/richtext-lexical # for the official HTML converter
```

Create `scripts/migration/.env`:
```
# Payload CMS target
PAYLOAD_API_URL=http://localhost:8787/api
PAYLOAD_EMAIL=admin@tripcanvas.co
PAYLOAD_PASSWORD=set-this-in-payload-admin-first

# R2 for direct media upload
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret
R2_BUCKET_NAME=tripcanvas-media
R2_PUBLIC_URL=https://media.tripcanvas.co
```

Commit: `chore(migration): setup migration script dependencies`

---

## Task 2 — Auth helper

Create `scripts/migration/lib/auth.js`:

```javascript
import axios from 'axios'
import dotenv from 'dotenv'
dotenv.config()

let token = null

export async function getToken() {
  if (token) return token
  
  const res = await axios.post(`${process.env.PAYLOAD_API_URL}/authors/login`, {
    email: process.env.PAYLOAD_EMAIL,
    password: process.env.PAYLOAD_PASSWORD,
  })
  
  token = res.data.token
  return token
}

export function authHeader() {
  return { Authorization: `JWT ${token}` }
}
```

---

## Task 3 — Migrate taxonomies first (categories + tags)

Create `scripts/migration/migrate-taxonomies.js`:

Logic:
1. Read `export/taxonomies.json`
2. For each category: POST to `PAYLOAD_API_URL/categories`
3. Store a mapping: `{ wp_id: 5 → payload_id: "abc123" }`
4. Save mapping to `export/taxonomy-id-map.json` (used by post migration)
5. Handle parent categories: migrate parents before children
6. Idempotent: check if slug exists before creating (use ?where[slug][equals]=...)

```javascript
// Pseudocode structure — write full implementation
async function migrateTaxonomies() {
  const { categories, tags } = JSON.parse(readFileSync('export/taxonomies.json'))
  const idMap = { categories: {}, tags: {} }
  
  // Sort: parents before children
  const sorted = sortByParent(categories)
  
  for (const cat of sorted) {
    const existing = await findBySlug('categories', cat.slug)
    if (existing) {
      idMap.categories[cat.wp_id] = existing.id
      continue
    }
    
    const created = await createInPayload('categories', {
      name: cat.name,   // Payload will set this for locale 'en'
      slug: cat.slug,
      wpId: cat.wp_id,
      ...(cat.parent_id ? { parent: idMap.categories[cat.parent_id] } : {}),
    })
    idMap.categories[cat.wp_id] = created.id
  }
  
  // Same for tags...
  
  writeFileSync('export/taxonomy-id-map.json', JSON.stringify(idMap, null, 2))
  console.log(`Migrated ${sorted.length} categories, ${tags.length} tags`)
}
```

Run: `node migrate-taxonomies.js`
Verify in Payload admin that categories appear.
Commit: `feat(migration): add and run taxonomy migration`

---

## Task 4 — Migrate media to R2

Create `scripts/migration/migrate-media.js`:

This is the most time-sensitive script — large files, run it early.

Logic:
1. Read `export/media-inventory.json`
2. For each item:
   a. Check if file exists in `media-download/` folder (from Phase 1 Task 5)
   b. Upload to R2 using S3-compatible API
   c. POST media record to Payload `/api/media` with the R2 URL
   d. Store mapping: `{ wp_id: 789 → payload_id: "xyz789" }` in `export/media-id-map.json`
3. Skip already-uploaded files (check R2 first)
4. Log failures to `media-migration-errors.log`

```javascript
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { createReadStream, statSync } from 'fs'

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

async function uploadToR2(localPath, key, mimeType) {
  // Check if already uploaded
  try {
    await s3.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }))
    return `${process.env.R2_PUBLIC_URL}/${key}` // already exists
  } catch {}
  
  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: createReadStream(localPath),
    ContentType: mimeType,
  }))
  
  return `${process.env.R2_PUBLIC_URL}/${key}`
}
```

Run: `node migrate-media.js`
This may take 30–60 minutes depending on media volume.
Commit: `feat(migration): add media migration script + id map`

---

## Task 5 — Convert WordPress HTML to Lexical JSON

> ✅ APPROACH: Use Payload's official `convertHTMLToLexical` — do NOT write a custom parser.
> A custom `parseHtmlToNodes` function handles ~10% of real WP content correctly and
> silently breaks on nested lists, blockquotes, tables, inline styles, and WP blocks.
> Payload ships a battle-tested converter — use it.

Create `scripts/migration/lib/html-to-lexical.js`:

```javascript
import { convertHTMLToLexical } from '@payloadcms/richtext-lexical'
import { JSDOM } from 'jsdom'

/**
 * Convert WordPress HTML to Payload Lexical JSON.
 *
 * IMPORTANT: Call cleanWordPressHtml() BEFORE this function.
 * WP shortcodes and Gutenberg block comments confuse the HTML parser.
 */
export async function htmlToLexical(html, mediaIdMap) {
  // Step 1: rewrite internal image URLs to R2 before converting
  const rewrittenHtml = rewriteImageUrls(html, mediaIdMap)

  // Step 2: convert using Payload's official converter
  const lexical = await convertHTMLToLexical({
    html: rewrittenHtml,
    JSDOM,
    // Pass your Payload editor config so custom nodes are registered
    editorConfig: (await import('../../apps/cms/src/payload.config')).default,
  })

  return lexical
}

/**
 * Rewrite /wp-content/uploads/ URLs to R2 URLs.
 * mediaIdMap: { "original-filename.jpg": "https://media.tripcanvas.co/filename.jpg" }
 */
function rewriteImageUrls(html, mediaIdMap) {
  return html.replace(
    /https?:\/\/[^"]+\/wp-content\/uploads\/[^"]+/g,
    (match) => {
      const filename = match.split('/').pop()
      return mediaIdMap[filename] || match // fall back to original if not found
    }
  )
}
```

Note: The shortcode stripping was already done in Phase 1 Task 2.
If any shortcodes remain in the exported JSON (check a few files), strip them now:
```javascript
function stripRemainingShortcodes(html) {
  return html
    .replace(/\[caption[^\]]*\]([\s\S]*?)\[\/caption\]/gi, '$1')
    .replace(/\[gallery[^\]]*\]/gi, '')
    .replace(/\[embed\]([\s\S]*?)\[\/embed\]/gi, '$1')
    .replace(/\[[^\]]+\]/g, '') // catch-all for remaining shortcodes
}
```

Commit: `feat(migration): add html-to-lexical using payload native converter`

---

## Task 6 — Migrate posts

Create `scripts/migration/migrate-posts.js`:

> ⚠️ BATCH CONSTRAINT: Cloudflare D1 has per-request write limits and Workers have a
> 30-second CPU time limit. Importing posts one-by-one in a tight loop will cause
> silent failures or timeouts. Process in batches of 10 with a 500ms delay between batches.

Logic:
1. Read all `export/posts-{locale}.json` files
2. Load `taxonomy-id-map.json` and `media-id-map.json`
3. Group posts by slug across locales (one Payload document = all locale versions)
4. For each post group:
   a. Convert content HTML → Lexical JSON (Task 5 function)
   b. POST to Payload `/api/posts` with base locale first
   c. PATCH with each additional locale translation
   d. Store mapping `{ wp_id → payload_id }` in `export/post-id-map.json`
5. Idempotent: check slug before creating

**Batching pattern — implement exactly this:**

```javascript
import pLimit from 'p-limit'

const BATCH_SIZE = 10
const BATCH_DELAY_MS = 500

async function migratePostsInBatches(postGroups) {
  const limit = pLimit(3) // max 3 concurrent Payload API calls
  const results = []

  for (let i = 0; i < postGroups.length; i += BATCH_SIZE) {
    const batch = postGroups.slice(i, i + BATCH_SIZE)
    
    const batchResults = await Promise.allSettled(
      batch.map(group => limit(() => migratePostGroup(group)))
    )
    
    results.push(...batchResults)
    
    const done = Math.min(i + BATCH_SIZE, postGroups.length)
    const failed = batchResults.filter(r => r.status === 'rejected').length
    console.log(`Progress: ${done}/${postGroups.length} — batch failures: ${failed}`)
    
    // Delay between batches — gives D1 breathing room
    if (i + BATCH_SIZE < postGroups.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
    }
  }
  
  return results
}
```

**Locale grouping pattern:**
```javascript
// Group: { "best-beaches-langkawi": { en: {...}, my: {...} } }
const grouped = groupPostsBySlug(allPosts)

for (const [slug, locales] of Object.entries(grouped)) {
  const base = locales['en'] || locales['my'] || Object.values(locales)[0]
  
  const created = await createInPayload('posts', {
    title: base.title,
    slug: base.slug,
    content: await htmlToLexical(base.content, mediaIdMap),
    categories: base.categories.map(c => taxonomyIdMap.categories[c.id]).filter(Boolean),
    tags: base.tags.map(t => taxonomyIdMap.tags[t.id]).filter(Boolean),
    featuredImage: mediaIdMap[base.featured_image_id]?.payload_id,
    publishedAt: base.date,
    wpId: base.wp_id,
  })
  
  for (const [locale, post] of Object.entries(locales)) {
    if (locale === base.locale) continue
    await patchPayload(`posts/${created.id}?locale=${locale}`, {
      title: post.title,
      content: await htmlToLexical(post.content, mediaIdMap),
      excerpt: post.excerpt,
    })
  }
}
```

Run: `node migrate-posts.js`
Verify post count in Payload admin matches WordPress export count.
Commit: `feat(migration): add batched post migration script`

---

## Task 7 — Verify migration integrity

Create `scripts/migration/verify.js`:

Checks:
1. Count posts in Payload == count in WP export per locale
2. Spot-check 10 random posts: title, slug, categories match
3. Check all featured images resolve (HTTP 200 from R2)
4. Check no posts have empty content
5. Print a summary report

Run and fix any issues before marking phase complete.
Commit: `feat(migration): add verification script and fix any issues found`

---

## Phase 3 Complete

1. Update CLAUDE.md — check off Phase 3
2. Replace AGENTS.md with AGENTS-phase4.md
3. Final commit: `chore: complete phase 3 — all wp data migrated to payload`
