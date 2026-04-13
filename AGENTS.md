# AGENTS.md — Phase 1: Export from WordPress

> Swap this file for the next phase's AGENTS.md when Phase 1 is complete.
> Work through tasks TOP TO BOTTOM. Commit after each task. Do not skip ahead.

---

## Phase 1 Goal

Extract everything from the live WordPress site into structured, portable formats
that Phase 4 migration scripts will consume. Do NOT modify the live site.

## Pre-flight Checklist

Before starting any task, confirm:
- [ ] SSH access to EC2 instance works
- [ ] WP-CLI is installed on EC2 (`wp --info`)
- [ ] WordPress REST API is accessible: `curl https://tripcanvas.co/wp-json/wp/v2/posts` returns JSON
- [ ] Detect multilanguage plugin: `wp plugin list | grep -E "wpml|polylang"` — note which one
- [ ] If WPML: install plugin **WPML REST API** on the live site (exposes `?lang=` param to REST API)
- [ ] If Polylang: install plugin **Polylang REST API** on the live site
- [ ] Local `scripts/migration/` directory exists in repo

> ⚠️ NOTE: We use the WordPress REST API for all content extraction — NOT direct MySQL queries.
> Raw MySQL access to WPML/Polylang schema is fragile and error-prone. The REST API approach
> is safer and produces cleaner, already-structured output.

---

## Task 1 — Inventory the WordPress site

```bash
# Run on EC2 via SSH
wp post-type list --format=json
wp taxonomy list --format=json
wp plugin list --format=json
wp theme list --format=json
wp language list --format=json
```

Save output to `scripts/migration/inventory/`:
- `post-types.json`
- `taxonomies.json`
- `plugins.json`
- `themes.json`
- `languages.json`

Commit: `chore(migration): add wp inventory files`

---

## Task 2 — Export posts per locale via REST API

> ✅ APPROACH: Use the WordPress REST API — NOT direct MySQL queries.
> WPML/Polylang database schemas are convoluted and AI-generated SQL will produce
> broken locale mappings. The REST API (with the language plugin installed) is reliable.

Write `scripts/migration/export-posts.js` (Node.js) that:

1. Reads from `.env`:
   ```
   WP_BASE_URL=https://tripcanvas.co
   WP_APP_USERNAME=your-wp-username
   WP_APP_PASSWORD=your-wp-application-password
   # Generate app password: WP Admin → Users → Profile → Application Passwords
   ```

2. Fetches all published posts for each locale using the REST API with `?lang=` parameter:
   ```
   GET /wp-json/wp/v2/posts?per_page=100&page=1&status=publish&lang=en&_embed
   GET /wp-json/wp/v2/posts?per_page=100&page=1&status=publish&lang=ms&_embed
   GET /wp-json/wp/v2/posts?per_page=100&page=1&status=publish&lang=id&_embed
   GET /wp-json/wp/v2/posts?per_page=100&page=1&status=publish&lang=th&_embed
   ```
   Handle pagination: loop until response array length < per_page.

3. The `_embed` flag includes featured image and taxonomy data inline — no separate queries needed.

4. For each post, extract and normalize to this shape:
```json
{
  "wp_id": 123,
  "slug": "best-beaches-langkawi",
  "locale": "my",
  "title": "...",
  "content": "<p>HTML content...</p>",
  "excerpt": "...",
  "date": "2023-01-15T10:00:00Z",
  "modified": "2023-06-20T14:30:00Z",
  "featured_image_id": 456,
  "featured_image_url": "https://tripcanvas.co/wp-content/uploads/...",
  "categories": [{ "id": 5, "slug": "beaches", "name": "Beaches" }],
  "tags": [{ "id": 12, "slug": "travel", "name": "Travel" }],
  "meta": { "seo_title": "...", "seo_description": "..." }
}
```

5. Output one file per locale: `scripts/migration/export/posts-{locale}.json`

6. Before finishing, strip WP shortcodes from all `content` fields. They will break
   the HTML-to-Lexical converter in Phase 3. Strip these patterns:
   - `[caption ...] ... [/caption]` → keep inner `<img>` tag, discard wrapper
   - `[gallery ...]` → replace with empty string (images are in media library separately)
   - `[embed ...]...[/embed]` → replace with the URL as plain text
   - Any remaining `[...]` shortcodes → replace with empty string

Run the script. Print total post count per locale to stdout.
Commit: `feat(migration): add rest api post export script and output files`

**Troubleshooting:**
- If `?lang=` returns all posts instead of filtered: the WPML/Polylang REST API plugin isn't active
- If getting 401: check WP Application Password is set correctly (Basic auth: base64 of `user:apppassword`)
- WP language codes may differ from our locale codes — map them:
  `ms` or `ms-MY` → `my`, `id` or `id-ID` → `id`, `th` → `th`, `en` → `en`

---

## Task 3 — Export taxonomy terms via REST API

Write `scripts/migration/export-taxonomies.js`:

Fetch categories and tags for each locale via the REST API:
```
GET /wp-json/wp/v2/categories?per_page=100&lang=en
GET /wp-json/wp/v2/tags?per_page=100&lang=en
# Repeat for ms, id, th
```

Handle pagination. Use the same `.env` credentials as Task 2.

Group translations: the same category in 4 languages should be one entry with
localized names, not 4 separate entries. Use the `slug` as the stable key to group them.

Output: `scripts/migration/export/taxonomies.json`

```json
{
  "categories": [
    {
      "wp_id": 5,
      "slug": "beaches",
      "parent_id": null,
      "names": {
        "en": "Beaches",
        "my": "Pantai",
        "id": "Pantai",
        "th": "ชายหาด"
      }
    }
  ],
  "tags": [
    {
      "wp_id": 12,
      "slug": "travel",
      "names": { "en": "Travel", "my": "Pelancongan", "id": "Perjalanan", "th": "การท่องเที่ยว" }
    }
  ]
}
```

Commit: `feat(migration): add taxonomy export via rest api`

---

## Task 4 — Export media inventory via REST API

Write `scripts/migration/export-media.js`:

Fetch all media attachments via the REST API:
```
GET /wp-json/wp/v2/media?per_page=100&page=N
```

Handle pagination. No `?lang=` needed — media is not translated.

Output: `scripts/migration/export/media-inventory.json`

```json
[
  {
    "wp_id": 789,
    "filename": "langkawi-beach.jpg",
    "url": "https://tripcanvas.co/wp-content/uploads/2023/01/langkawi-beach.jpg",
    "mime_type": "image/jpeg",
    "alt": "Langkawi beach sunset",
    "caption": "...",
    "attached_to_post_id": 123,
    "width": 1920,
    "height": 1080
  }
]
```

Print total count on completion.
Commit: `feat(migration): add media inventory export`

---

## Task 5 — Download all media files

> ✅ APPROACH: Node.js with p-limit and axios retries — NOT a bash/curl script.
> A travel blog may have thousands of high-res images. Bash curl loops fail silently
> on timeouts and have no concurrency control. Node.js handles this reliably.

Write `scripts/migration/download-media.js`:

```bash
pnpm add p-limit axios
```

Implementation requirements:
- Read `export/media-inventory.json`
- Use `p-limit` with concurrency of **5** (avoids rate limiting the WP server)
- Use `axios` with a 3-attempt retry on failure (exponential backoff: 1s, 2s, 4s)
- Save each file to `scripts/migration/media-download/{filename}`
- Skip files that already exist on disk (idempotent — safe to re-run)
- Log progress every 50 files: `Downloaded 50/1247 (4%) — 3 failures so far`
- Write all failures to `scripts/migration/media-download-errors.json` with url + error message
- Exit with code 1 if more than 5% of files failed (likely a connectivity problem, not individual errors)

```javascript
import pLimit from 'p-limit'
import axios from 'axios'
import { existsSync, createWriteStream, writeFileSync } from 'fs'
import { resolve } from 'path'

const limit = pLimit(5)
const OUTPUT_DIR = './media-download'
const MAX_RETRIES = 3

async function downloadWithRetry(url, dest, attempt = 1) {
  try {
    const res = await axios({ url, responseType: 'stream', timeout: 30000 })
    await new Promise((resolve, reject) => {
      const writer = createWriteStream(dest)
      res.data.pipe(writer)
      writer.on('finish', resolve)
      writer.on('error', reject)
    })
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)))
      return downloadWithRetry(url, dest, attempt + 1)
    }
    throw err
  }
}

// ... main loop using limit() wrapper
```

Run: `node download-media.js`
Report final count: `Downloaded 1244/1247. Failures: 3 (see media-download-errors.json)`

Note: Do NOT commit media files — `scripts/migration/media-download/` is in `.gitignore`.
Commit: `feat(migration): add robust media download script with retry logic`

---

## Task 6 — Export WordPress menus and settings

```bash
# Run on EC2
wp menu list --format=json > menus.json
wp option get blogname
wp option get siteurl
wp option get permalink_structure
```

Save to `scripts/migration/export/site-settings.json`
Commit: `feat(migration): add site settings export`

---

## Task 7 — Document URL structure

Create `scripts/migration/export/url-map.md`:

Manually document:
- Current permalink structure (e.g. `/%postname%/` or `/%category%/%postname%/`)
- Any custom rewrite rules
- The subdomain → language mapping

This is critical for generating correct 301 redirects in Phase 5.

Commit: `docs(migration): add url structure map`

---

## Phase 1 Complete

When all tasks above are done and committed:

1. Update `CLAUDE.md` — check off Phase 1 in the status section
2. Update active phase to Phase 2
3. Replace this file with `AGENTS-phase2.md` renamed to `AGENTS.md`
4. Final commit: `chore: complete phase 1 — wordpress export done`

---

## Troubleshooting

**WP-CLI not installed:**
```bash
curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
chmod +x wp-cli.phar
sudo mv wp-cli.phar /usr/local/bin/wp
```

**WPML vs Polylang detection:**
```bash
wp plugin list | grep -E "wpml|polylang"
```
Install the corresponding REST API plugin on the live WP site:
- WPML → search "WPML REST API" in WP plugin directory
- Polylang → search "Polylang REST API" in WP plugin directory

**WordPress Application Password (for REST API auth):**
WP Admin → Users → Your Profile → scroll to "Application Passwords"
Name it "Migration Script" → Generate → copy the password
Use as Basic auth: `Authorization: Basic base64("username:xxxx xxxx xxxx xxxx xxxx xxxx")`

**REST API returns 401:**
Check that Application Passwords are enabled. Some hosts disable them.
If disabled, temporarily add this to `wp-config.php`:
`define('WP_APPLICATION_PASSWORDS_ENABLED', true);`

**`?lang=` param not filtering:**
The WPML/Polylang REST API plugin is not active. Install and activate it on the live site.

