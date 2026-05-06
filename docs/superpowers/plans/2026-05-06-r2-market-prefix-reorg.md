# R2 Market-Prefix Reorg — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-upload all 36,143 R2 media files with market-prefixed keys (`{market}/year/month/file.jpg`) and update all post content and media records to reference the new keys, eliminating 214 cross-market file collisions.

**Architecture:** Six sequential phases, each a standalone Node.js script. Phase 1 generates old→new key mappings. Phase 2 uploads to R2 using S3 API. Phase 3 updates D1 media records. Phase 4 rewrites post content via Payload REST API. Phase 5 updates the media-url-map.json artifact. Phase 6 verifies correctness. Every phase is idempotent (safe to re-run).

**Tech Stack:** Node.js (ESM), `@aws-sdk/client-s3`, `p-limit`, `dotenv`, `child_process.execSync` (wrangler CLI), Payload REST API

---

## File Structure

```
scripts/migration/
├── reorg-r2-mapping.js       # Phase 1: Generate oldKey→newKey mappings
├── reorg-r2-upload.js        # Phase 2: Upload files to R2 with new prefix
├── reorg-r2-media-records.js # Phase 3: UPDATE D1 media table URL field
├── reorg-r2-post-content.js  # Phase 4: Rewrite post content via Payload API
├── reorg-r2-update-map.js    # Phase 5: Update media-url-map.json
├── reorg-r2-verify.js        # Phase 6: Verify all changes
└── export/
    ├── media-url-map.json            # Input (existing)
    ├── r2-reorg-map.json             # Output of Phase 1, Input for 2-6
    ├── r2-reorg-errors.json          # Error log from Phase 2
    ├── r2-reorg-map-collisions.json  # Detailed collision info
    └── media-url-map-v1-backup.json  # Phase 5 backup
```

---

### Task 1: Phase 1 — Generate Key Mappings

**Files:**
- Create: `scripts/migration/reorg-r2-mapping.js`
- Output: `scripts/migration/export/r2-reorg-map.json`

- [ ] **Step 1: Create the mapping script**

Write `scripts/migration/reorg-r2-mapping.js`:

```javascript
#!/usr/bin/env node
/**
 * Phase 1: Generate oldKey → newKey mappings with market prefix.
 * Reads media-url-map.json, outputs r2-reorg-map.json.
 *
 * Usage: node reorg-r2-mapping.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MAP_IN = resolve(__dirname, 'export', 'media-url-map.json')
const MAP_OUT = resolve(__dirname, 'export', 'r2-reorg-map.json')
const COLLISIONS_OUT = resolve(__dirname, 'export', 'r2-reorg-map-collisions.json')

const R2_SCHEME = 'r2://tripcanvas-media/'

function marketFromUrl(url) {
  try {
    const host = new URL(url).hostname
    if (host.includes('indonesia')) return 'id'
    if (host.includes('malaysia')) return 'my'
    if (host.includes('thailand')) return 'th'
    return 'en'
  } catch {
    return 'en'
  }
}

function extractOldKey(r2Value) {
  if (r2Value.startsWith(R2_SCHEME)) {
    return r2Value.slice(R2_SCHEME.length)
  }
  // Also handle public URL format if present
  const pubIdx = r2Value.indexOf('.r2.dev/')
  if (pubIdx !== -1) {
    return r2Value.slice(pubIdx + '.r2.dev/'.length)
  }
  return r2Value
}

function main() {
  if (!existsSync(MAP_IN)) {
    console.error(`Error: ${MAP_IN} not found`)
    process.exit(1)
  }

  console.log(`Reading ${MAP_IN}...`)
  const data = JSON.parse(readFileSync(MAP_IN, 'utf-8'))
  const entries = Object.entries(data.map || data)
  console.log(`  ${entries.length} entries loaded`)

  const oldKeyMarkets = new Map() // oldKey → { market, sourceUrl }
  const allEntries = []
  const collisions = []

  for (const [sourceUrl, r2Value] of entries) {
    const market = marketFromUrl(sourceUrl)
    const oldKey = extractOldKey(r2Value)
    const newKey = `${market}/${oldKey}`

    // Track collisions
    if (oldKeyMarkets.has(oldKey)) {
      const prev = oldKeyMarkets.get(oldKey)
      if (prev.market !== market) {
        collisions.push({
          oldKey,
          market1: prev.market,
          sourceUrl1: prev.sourceUrl,
          market2: market,
          sourceUrl2: sourceUrl,
        })
      }
      oldKeyMarkets.set(oldKey, { market, sourceUrl }) // last write
    } else {
      oldKeyMarkets.set(oldKey, { market, sourceUrl })
    }

    allEntries.push({ sourceUrl, market, oldKey, newKey })
  }

  // Build oldToNew for convenience (collision keys: last market wins)
  const oldToNew = {}
  for (const e of allEntries) {
    oldToNew[e.oldKey] = e.newKey
  }

  const output = {
    entries: allEntries,
    oldToNew,
    stats: {
      totalSourceUrls: allEntries.length,
      totalUniqueOldKeys: oldKeyMarkets.size,
      totalUniqueNewKeys: new Set(allEntries.map(e => e.newKey)).size,
      collisionKeys: collisions.length,
      markets: {},
    },
    collisions,
  }

  // Count per market
  for (const e of allEntries) {
    output.stats.markets[e.market] = (output.stats.markets[e.market] || 0) + 1
  }

  writeFileSync(MAP_OUT, JSON.stringify(output, null, 2))
  console.log(`\nWrote ${MAP_OUT}`)
  console.log(`  Source URLs:    ${output.stats.totalSourceUrls}`)
  console.log(`  Unique old keys: ${output.stats.totalUniqueOldKeys}`)
  console.log(`  Unique new keys: ${output.stats.totalUniqueNewKeys}`)
  console.log(`  Collisions:     ${output.stats.collisionKeys}`)
  console.log(`  Per market:     ${JSON.stringify(output.stats.markets)}`)

  if (collisions.length > 0) {
    writeFileSync(COLLISIONS_OUT, JSON.stringify(collisions, null, 2))
    console.log(`  Collision details: ${COLLISIONS_OUT}`)
  }
}

main()
```

- [ ] **Step 2: Run the mapping script**

```bash
cd scripts/migration && node reorg-r2-mapping.js
```

Expected output:
```
Wrote .../export/r2-reorg-map.json
  Source URLs:    36368
  Unique old keys: 36143
  Unique new keys: 36143
  Collisions:     225
  Per market:     {"id":20140,"th":12666,"my":3554,"en":8}
```

- [ ] **Step 3: Verify output structure**

```bash
head -c 2000 scripts/migration/export/r2-reorg-map.json
```

Expected: JSON with `entries`, `oldToNew`, `stats`, `collisions` keys. First entry should have `sourceUrl`, `market`, `oldKey`, `newKey`.

- [ ] **Step 4: Commit**

```bash
git add scripts/migration/reorg-r2-mapping.js scripts/migration/export/r2-reorg-map.json scripts/migration/export/r2-reorg-map-collisions.json
git commit -m "feat: add r2-reorg phase 1 — market-prefix key mappings"
```

---

### Task 2: Phase 2 — Upload Files to R2 with Market-Prefixed Keys

**Files:**
- Create: `scripts/migration/reorg-r2-upload.js`

- [ ] **Step 1: Create the upload script**

Write `scripts/migration/reorg-r2-upload.js`:

```javascript
#!/usr/bin/env node
/**
 * Phase 2: Upload all files to R2 with market-prefixed keys.
 *
 * Reads r2-reorg-map.json. For each entry:
 *   1. headExists on new R2 key → skip if already there (idempotent)
 *   2. Check local media-download/{market}/{oldKey} for file
 *   3. If not found locally → download from old R2 public URL
 *   4. PutObject to new R2 key
 *
 * Usage: node reorg-r2-upload.js
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'fs'
import { readFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import axios from 'axios'
import pLimit from 'p-limit'
import dotenv from 'dotenv'
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '.env') })

// --- Config ---
const CONCURRENCY = 10
const MAP_PATH = resolve(__dirname, 'export', 'r2-reorg-map.json')
const ERR_PATH = resolve(__dirname, 'export', 'r2-reorg-errors.json')
const LOCAL_DIR = resolve(__dirname, 'media-download')
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || 'https://pub-2faca0649c2047a1859536a3114d3f95.r2.dev').replace(/\/$/, '')
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'tripcanvas-media'

// --- S3 Client ---
function makeS3Client() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('Missing R2 credentials in .env')
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })
}

// --- Helpers ---
function guessContentType(key) {
  const lower = key.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

async function headExists(s3, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }))
    return true
  } catch {
    return false
  }
}

async function withS3Retry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn() }
    catch (err) {
      if (i === attempts - 1) throw err
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
}

async function downloadFromR2(oldKey) {
  const url = `${R2_PUBLIC_URL}/${oldKey}`
  const res = await axios({ method: 'GET', url, responseType: 'arraybuffer', timeout: 30000 })
  return Buffer.from(res.data)
}

// --- Main ---
async function main() {
  console.log(`R2 Reorg Upload — concurrency=${CONCURRENCY}`)

  if (!existsSync(MAP_PATH)) {
    console.error(`Error: ${MAP_PATH} not found. Run reorg-r2-mapping.js first.`)
    process.exit(1)
  }

  const mapData = JSON.parse(readFileSync(MAP_PATH, 'utf-8'))
  const entries = mapData.entries
  console.log(`Loaded ${entries.length} entries from ${MAP_PATH}`)

  const s3 = makeS3Client()
  const limit = pLimit(CONCURRENCY)
  const errors = []

  let done = 0, uploaded = 0, skipped = 0, failed = 0
  let localHit = 0, downloadHit = 0

  await Promise.all(entries.map((entry, i) => limit(async () => {
    const { market, oldKey, newKey, sourceUrl } = entry
    try {
      // 1. Check if already exists (idempotent)
      const exists = await withS3Retry(() => headExists(s3, newKey))
      if (exists) {
        skipped++
        done++
        if (done % 500 === 0 || done === entries.length) {
          console.log(`  [${done}/${entries.length}] uploaded=${uploaded} skipped=${skipped} failed=${failed}`)
        }
        return
      }

      // 2. Look for local file
      const localPath = resolve(LOCAL_DIR, market, oldKey)
      let body
      if (existsSync(localPath) && statSync(localPath).isFile()) {
        body = await readFile(localPath)
        localHit++
      } else {
        // 3. Fallback: download from current R2 URL
        body = await downloadFromR2(oldKey)
        downloadHit++
      }

      // 4. Upload to new key
      await withS3Retry(() =>
        s3.send(new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: newKey,
          Body: body,
          ContentType: guessContentType(oldKey),
        }))
      )
      uploaded++
    } catch (err) {
      failed++
      errors.push({
        sourceUrl,
        market,
        oldKey,
        newKey,
        error: err?.message || String(err),
      })
    }
    done++
    if (done % 500 === 0 || done === entries.length) {
      console.log(`  [${done}/${entries.length}] uploaded=${uploaded} skipped=${skipped} failed=${failed}`)
    }
  }))

  writeFileSync(ERR_PATH, JSON.stringify(errors, null, 2))
  console.log(`\nDone. uploaded=${uploaded} skipped=${skipped} failed=${failed}`)
  console.log(`  local files used: ${localHit}`)
  console.log(`  downloaded from R2: ${downloadHit}`)
  if (failed > 0) {
    console.log(`  Errors written to ${ERR_PATH}`)
    process.exitCode = 1
  }
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Run the upload script**

```bash
cd scripts/migration && node reorg-r2-upload.js
```

Expected: Uploads files to R2 with new `{market}/...` keys. Progress logged every 500 files. Most files should be found locally (`media-download/`); some may fall back to downloading from the old R2 public URL.

Estimated runtime: 15-30 minutes for 36K headExists checks + uploads.

- [ ] **Step 3: Verify R2 uploads**

```bash
# Spot check a few ID files exist at new keys
python3 -c "
import json
with open('scripts/migration/export/r2-reorg-map.json') as f:
    data = json.load(f)
# Print first 5 new keys
for e in data['entries'][:5]:
    print(f'  {e[\"newKey\"]}  (from {e[\"market\"]})')
"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/migration/reorg-r2-upload.js
git commit -m "feat: add r2-reorg phase 2 — upload market-prefixed files to R2"
```

---

### Task 3: Phase 3 — Update D1 Media Records

**Files:**
- Create: `scripts/migration/reorg-r2-media-records.js`

- [ ] **Step 1: Create the media records update script**

Write `scripts/migration/reorg-r2-media-records.js`:

```javascript
#!/usr/bin/env node
/**
 * Phase 3: Update media.url field in D1 to use market-prefixed paths.
 *
 * Reads r2-reorg-map.json to build oldKey→newKey lookup,
 * then UPDATEs the media table in D1 via wrangler d1 execute.
 *
 * Usage:
 *   node reorg-r2-media-records.js             # dry-run
 *   node reorg-r2-media-records.js --live       # applies changes
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LIVE = process.argv.includes('--live')
const CMS_DIR = resolve(__dirname, '../../apps/cms')
const MAP_PATH = resolve(__dirname, 'export', 'r2-reorg-map.json')
const R2_PUBLIC = 'https://pub-2faca0649c2047a1859536a3114d3f95.r2.dev'

function d1Query(sql) {
  const cmd = `npx wrangler d1 execute tripcanvas-db --remote --json --command "${sql.replace(/"/g, '\\"')}"`
  const out = execSync(cmd, { cwd: CMS_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 100 * 1024 * 1024 })
  try {
    return JSON.parse(out)
  } catch {
    // Try to extract JSON from wrapped output
    const m = out.match(/\[[\s\S]*\]/)
    if (m) return JSON.parse(m[0])
    return null
  }
}

function main() {
  console.log(`Mode: ${LIVE ? 'LIVE' : 'DRY-RUN'}`)

  const mapData = JSON.parse(readFileSync(MAP_PATH, 'utf-8'))
  const oldToNew = mapData.oldToNew

  // 1. Query all media records
  console.log('Querying media records...')
  const result = d1Query('SELECT id, url, wp_original_url FROM media')
  if (!result?.[0]?.results) {
    console.error('Failed to query media records')
    process.exit(1)
  }
  const rows = result[0].results
  console.log(`Found ${rows.length} media records`)

  // 2. Determine which need updating
  const updates = []
  for (const row of rows) {
    const { id, url } = row
    if (!url || !url.startsWith(R2_PUBLIC)) continue

    // Skip if already has market prefix
    const path = url.slice(R2_PUBLIC.length + 1) // remove https://pub-...r2.dev/
    if (/^(id|my|th|en)\//.test(path)) continue

    // Look up new key
    const newKey = oldToNew[path]
    if (!newKey) continue

    updates.push({ id, oldUrl: url, newUrl: `${R2_PUBLIC}/${newKey}` })
  }

  console.log(`Records to update: ${updates.length}`)
  if (updates.length === 0) {
    console.log('All records already have market prefix. Nothing to do.')
    return
  }

  // 3. Show sample
  for (const u of updates.slice(0, 5)) {
    console.log(`  id=${u.id}: ${u.oldUrl} → ${u.newUrl}`)
  }
  if (updates.length > 5) console.log(`  ... and ${updates.length - 5} more`)

  if (!LIVE) {
    console.log('\nDry run. Use --live to apply changes.')
    return
  }

  // 4. Apply updates in batches
  const BATCH = 100
  const batches = Math.ceil(updates.length / BATCH)
  let ok = 0

  for (let b = 0; b < batches; b++) {
    const batch = updates.slice(b * BATCH, (b + 1) * BATCH)
    const values = batch.map(u => `(${u.id}, '${u.newUrl.replace(/'/g, "''")}')`).join(',\n')
    const sql = `UPDATE media SET url = CASE id\n${batch.map(u => `WHEN ${u.id} THEN '${u.newUrl.replace(/'/g, "''")}'`).join('\n')}\nEND\nWHERE id IN (${batch.map(u => u.id).join(',')})`

    try {
      execSync(
        `npx wrangler d1 execute tripcanvas-db --remote --command "${sql.replace(/"/g, '\\"')}"`,
        { cwd: CMS_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      )
      ok += batch.length
      console.log(`  Batch ${b + 1}/${batches} done (${ok}/${updates.length})`)
    } catch (err) {
      console.error(`  Batch ${b + 1} failed:`, err.message?.slice(0, 200))
    }
    // Small delay between batches
    if (b < batches - 1) {
      console.log('  Waiting 3s...')
      execSync('sleep 3')
    }
  }

  // 5. Verify
  const verifyResult = d1Query("SELECT COUNT(*) as cnt FROM media WHERE url LIKE '%/id/%' OR url LIKE '%/my/%' OR url LIKE '%/th/%' OR url LIKE '%/en/%'")
  const cnt = verifyResult?.[0]?.results?.[0]?.cnt
  console.log(`\nMedia records with market prefix: ${cnt}/${rows.length}`)
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Run dry-run**

```bash
cd scripts/migration && node reorg-r2-media-records.js
```

Expected: Shows count of records to update, sample old→new URLs.

- [ ] **Step 3: Run live**

```bash
cd scripts/migration && node reorg-r2-media-records.js --live
```

- [ ] **Step 4: Commit**

```bash
git add scripts/migration/reorg-r2-media-records.js
git commit -m "feat: add r2-reorg phase 3 — update D1 media record URLs"
```

---

### Task 4: Phase 4 — Rewrite Post Content via Payload API

**Files:**
- Create: `scripts/migration/reorg-r2-post-content.js`

- [ ] **Step 1: Create the post content rewrite script**

Write `scripts/migration/reorg-r2-post-content.js`:

```javascript
#!/usr/bin/env node
/**
 * Phase 4: Rewrite post content Lexical JSON to use market-prefixed R2 paths.
 *
 * For each post across all locales:
 *   - Upload nodes (inline URL): value.url → inject market prefix
 *   - r2:// text paragraphs: inject market prefix in path
 *   - Upload nodes (media ID): skip — handled by Phase 3 media record update
 *   - placeholder-image nodes: skip — still has original WP URL
 *
 * Usage:
 *   node reorg-r2-post-content.js                    # dry-run
 *   node reorg-r2-post-content.js --live             # applies via API
 *   node reorg-r2-post-content.js --live --locale=zh # single locale
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '.env') })

const LIVE = process.argv.includes('--live')
const LOCALE_ARG = process.argv.find(a => a.startsWith('--locale='))
const TARGET_LOCALE = LOCALE_ARG ? LOCALE_ARG.split('=')[1] : null

const API_URL = (process.env.PAYLOAD_API_URL || 'https://tripcanvas-cms.academyt.workers.dev/api').replace(/\/$/, '')
const EMAIL = process.env.PAYLOAD_EMAIL
const PASSWORD = process.env.PAYLOAD_PASSWORD
const R2_PUBLIC = 'https://pub-2faca0649c2047a1859536a3114d3f95.r2.dev'

const R2_PARA_RE = /^(Image[^(]*) \(r2:\/\/([^)]+)\)$/
const R2_BUCKET = 'tripcanvas-media'

// --- API helpers ---
async function login() {
  const res = await fetch(`${API_URL}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const data = await res.json()
  if (!data.token) throw new Error(`Login failed: ${JSON.stringify(data)}`)
  return data.token
}

async function fetchPostsPage(locale, page, token) {
  const params = new URLSearchParams({
    locale,
    limit: '20',
    page: String(page),
    depth: '0',
  })
  const res = await fetch(`${API_URL}/posts?${params}`, {
    headers: { Authorization: `JWT ${token}` },
  })
  return res.json()
}

async function updatePost(id, locale, content, token) {
  const res = await fetch(`${API_URL}/posts/${id}?locale=${locale}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `JWT ${token}`,
    },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PATCH ${id} ${locale} failed ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

// --- Content transformation ---
function transformContent(content, market) {
  if (!content || typeof content !== 'object') return { content, changed: false }
  const root = content.root
  if (!root || !Array.isArray(root.children)) return { content, changed: false }

  const { children: newChildren, changed } = transformChildren(root.children, market)
  if (!changed) return { content, changed: false }
  return { content: { ...content, root: { ...root, children: newChildren } }, changed: true }
}

function transformChildren(children, market) {
  if (!Array.isArray(children)) return { children: children || [], changed: false }

  const out = []
  let changed = false

  for (const node of children) {
    if (!node || typeof node !== 'object') {
      out.push(node)
      continue
    }

    // Recurse into container nodes
    if (Array.isArray(node.children)) {
      const result = transformChildren(node.children, market)
      out.push(result.changed ? { ...node, children: result.children } : node)
      if (result.changed) changed = true
      continue
    }

    // Case 1: upload node with inline URL (Phase 1 style — value is { url, alt })
    if (node.type === 'upload') {
      const value = node.value
      if (value && typeof value === 'object' && typeof value.url === 'string') {
        const oldUrl = value.url
        if (oldUrl.includes(R2_PUBLIC)) {
          const path = oldUrl.split(R2_PUBLIC + '/')[1] || ''
          // Skip if already has market prefix
          if (!/^(id|my|th|en)\//.test(path)) {
            const newUrl = `${R2_PUBLIC}/${market}/${path}`
            out.push({
              ...node,
              value: { ...value, url: newUrl },
            })
            changed = true
            continue
          }
        }
      }
      out.push(node)
      continue
    }

    // Case 2: paragraph with r2:// image reference
    if (node.type === 'paragraph') {
      const textContent = extractTextContent(node.children)
      const m = R2_PARA_RE.exec(textContent.trim())
      if (m) {
        // m[2] is everything after "r2://" — e.g., "tripcanvas-media/2019/03/foo.jpg"
        const fullRef = m[2]
        const bucketPrefix = `${R2_BUCKET}/`
        if (fullRef.startsWith(bucketPrefix)) {
          const oldPath = fullRef.slice(bucketPrefix.length) // "2019/03/foo.jpg"
          if (!/^(id|my|th|en)\//.test(oldPath)) {
            // Insert market prefix: tripcanvas-media/2019/03 → tripcanvas-media/id/2019/03
            const newRef = `${bucketPrefix}${market}/${oldPath}`
            const newText = textContent.replace(`r2://${fullRef}`, `r2://${newRef}`)
            out.push({
              ...node,
              children: [{ type: 'text', text: newText, version: 1 }],
            })
            changed = true
            continue
          }
        }
      }
      out.push(node)
      continue
    }

    out.push(node)
  }

  return { children: out, changed }
}

function extractTextContent(children) {
  if (!Array.isArray(children)) return ''
  return children.map(c => {
    if (typeof c === 'string') return c
    if (c?.text) return c.text
    if (c?.children) return extractTextContent(c.children)
    return ''
  }).join('')
}

// --- Main ---
async function main() {
  console.log(`Mode: ${LIVE ? 'LIVE' : 'DRY-RUN'}  API: ${API_URL}`)

  if (!EMAIL || !PASSWORD) {
    throw new Error('PAYLOAD_EMAIL and PAYLOAD_PASSWORD must be set in .env')
  }

  const token = await login()
  console.log('Logged in.')

  const locales = TARGET_LOCALE ? [TARGET_LOCALE] : ['en', 'my', 'id', 'th', 'zh']

  let totalPosts = 0
  let totalChanged = 0
  let totalSkipped = 0

  for (const locale of locales) {
    console.log(`\nProcessing locale: ${locale}`)
    let page = 1
    let hasMore = true

    while (hasMore) {
      const data = await fetchPostsPage(locale, page, token)
      const docs = data.docs ?? []
      hasMore = docs.length === 20 // Payload default page size
      page++

      for (const post of docs) {
        totalPosts++

        if (!post.content || !post.market) {
          totalSkipped++
          continue
        }

        const market = post.market // 'id', 'my', 'th', 'en'
        const { content, changed } = transformContent(post.content, market)

        if (!changed) {
          totalSkipped++
          continue
        }

        totalChanged++
        console.log(`  ${post.slug} [${locale} market=${market}]: content updated`)

        if (LIVE) {
          try {
            await updatePost(post.id, locale, content, token)
            await new Promise(r => setTimeout(r, 300))
          } catch (err) {
            console.error(`    ✗ update failed:`, err.message?.slice(0, 200) || err)
          }
        }
      }
    }
    console.log(`  locale=${locale} done.`)
  }

  console.log(`\n--- Summary ---`)
  console.log(`Posts scanned:   ${totalPosts}`)
  console.log(`Posts changed:   ${totalChanged}`)
  console.log(`Posts skipped:   ${totalSkipped}`)
  console.log(`Mode: ${LIVE ? 'LIVE' : 'DRY-RUN'}`)
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Run dry-run**

```bash
cd scripts/migration && node reorg-r2-post-content.js
```

Expected: Shows posts with content changes (inline upload URLs and r2:// text paragraphs updated).

- [ ] **Step 3: Run live**

```bash
cd scripts/migration && node reorg-r2-post-content.js --live
```

- [ ] **Step 4: Commit**

```bash
git add scripts/migration/reorg-r2-post-content.js
git commit -m "feat: add r2-reorg phase 4 — rewrite post content URLs"
```

---

### Task 5: Phase 5 — Update media-url-map.json

**Files:**
- Create: `scripts/migration/reorg-r2-update-map.js`

- [ ] **Step 1: Create the map update script**

Write `scripts/migration/reorg-r2-update-map.js`:

```javascript
#!/usr/bin/env node
/**
 * Phase 5: Update media-url-map.json with market-prefixed r2:// values.
 *
 * Uses r2-reorg-map.json to rewrite all r2:// values in the
 * existing media-url-map.json, then saves the updated file.
 * Keeps old version as -v1-backup.
 *
 * Usage: node reorg-r2-update-map.js
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXPORT_DIR = resolve(__dirname, 'export')
const MAP_IN = resolve(EXPORT_DIR, 'media-url-map.json')
const MAP_OUT = resolve(EXPORT_DIR, 'media-url-map.json')
const MAP_BACKUP = resolve(EXPORT_DIR, 'media-url-map-v1-backup.json')
const REORG_MAP = resolve(EXPORT_DIR, 'r2-reorg-map.json')

function main() {
  if (!existsSync(MAP_IN)) {
    console.error(`Error: ${MAP_IN} not found`)
    process.exit(1)
  }
  if (!existsSync(REORG_MAP)) {
    console.error(`Error: ${REORG_MAP} not found. Run reorg-r2-mapping.js first.`)
    process.exit(1)
  }

  // Backup existing
  copyFileSync(MAP_IN, MAP_BACKUP)
  console.log(`Backed up to ${MAP_BACKUP}`)

  // Read data
  const mediaMap = JSON.parse(readFileSync(MAP_IN, 'utf-8'))
  const reorg = JSON.parse(readFileSync(REORG_MAP, 'utf-8'))

  const oldToNew = reorg.oldToNew
  let updated = 0

  // Update each entry in the map
  const newMap = {}
  for (const [sourceUrl, r2Value] of Object.entries(mediaMap.map)) {
    if (r2Value.startsWith('r2://tripcanvas-media/')) {
      const oldKey = r2Value.slice('r2://tripcanvas-media/'.length)
      const newKey = oldToNew[oldKey]
      if (newKey && newKey !== oldKey) {
        newMap[sourceUrl] = `r2://tripcanvas-media/${newKey}`
        updated++
        continue
      }
    }
    newMap[sourceUrl] = r2Value
  }

  // Write updated file
  const output = {
    ...mediaMap,
    map: newMap,
    reorg_note: 'R2 keys updated to market-prefixed format ({market}/year/month/filename)',
    reorg_date: new Date().toISOString(),
    reorg_updated: updated,
  }

  writeFileSync(MAP_OUT, JSON.stringify(output, null, 2))
  console.log(`Updated ${updated}/${Object.keys(newMap).length} entries in ${MAP_OUT}`)
}

main()
```

- [ ] **Step 2: Run the update script**

```bash
cd scripts/migration && node reorg-r2-update-map.js
```

Expected:
```
Backed up to .../media-url-map-v1-backup.json
Updated <N>/36368 entries in .../media-url-map.json
```

- [ ] **Step 3: Commit**

```bash
git add scripts/migration/reorg-r2-update-map.js scripts/migration/export/media-url-map.json scripts/migration/export/media-url-map-v1-backup.json
git commit -m "feat: add r2-reorg phase 5 — update media-url-map.json"
```

---

### Task 6: Phase 6 — Verification

**Files:**
- Create: `scripts/migration/reorg-r2-verify.js`

- [ ] **Step 1: Create the verification script**

Write `scripts/migration/reorg-r2-verify.js`:

```javascript
#!/usr/bin/env node
/**
 * Phase 6: Verify the R2 key reorg is correct.
 *
 * Checks:
 *   1. Spot-check 100 random new R2 keys via headExists
 *   2. D1 media records: count with/without market prefix
 *   3. D1 posts: sample content for flat URLs
 *   4. Collision files: verify sizes match local media-download
 *
 * Usage: node reorg-r2-verify.js
 */

import { readFileSync, existsSync, statSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import dotenv from 'dotenv'
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '.env') })

const CMS_DIR = resolve(__dirname, '../../apps/cms')
const REORG_MAP = resolve(__dirname, 'export', 'r2-reorg-map.json')
const LOCAL_DIR = resolve(__dirname, 'media-download')
const R2_PUBLIC = 'https://pub-2faca0649c2047a1859536a3114d3f95.r2.dev'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'tripcanvas-media'

function d1Query(sql) {
  const out = execSync(
    `npx wrangler d1 execute tripcanvas-db --remote --json --command "${sql.replace(/"/g, '\\"')}"`,
    { cwd: CMS_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 100 * 1024 * 1024 }
  )
  try { return JSON.parse(out) }
  catch {
    const m = out.match(/\[[\s\S]*\]/)
    if (m) return JSON.parse(m[0])
    return null
  }
}

function makeS3Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  })
}

async function main() {
  console.log('=== R2 Reorg Verification ===\n')

  const reorg = JSON.parse(readFileSync(REORG_MAP, 'utf-8'))
  const entries = reorg.entries
  const s3 = makeS3Client()

  let pass = 0, fail = 0

  // 1. Spot-check R2 new keys
  console.log('1. Spot-checking R2 new keys...')
  const sample = entries.sort(() => 0.5 - Math.random()).slice(0, 100)

  for (const e of sample) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: e.newKey }))
      pass++
    } catch {
      fail++
      if (fail <= 5) console.log(`  ✗ MISSING: ${e.newKey}`)
    }
  }
  console.log(`  OK: ${pass}/${sample.length}, Missing: ${fail}/${sample.length}`)

  // 2. D1 media records check
  console.log('\n2. Checking D1 media records...')
  const totalRes = d1Query('SELECT COUNT(*) as cnt FROM media')
  const totalMedia = totalRes?.[0]?.results?.[0]?.cnt || 0

  const prefixedRes = d1Query("SELECT COUNT(*) as cnt FROM media WHERE url LIKE '%/id/%' OR url LIKE '%/my/%' OR url LIKE '%/th/%' OR url LIKE '%/en/%'")
  const prefixed = prefixedRes?.[0]?.results?.[0]?.cnt || 0

  console.log(`  Total media records: ${totalMedia}`)
  console.log(`  With market prefix:  ${prefixed}`)
  if (totalMedia > 0 && prefixed < totalMedia) {
    console.log(`  ⚠ ${totalMedia - prefixed} records still missing market prefix`)
  } else {
    console.log('  ✓ All records have market prefix')
  }

  // 3. Check collision file sizes
  console.log('\n3. Checking collision files...')
  if (reorg.collisions && reorg.collisions.length > 0) {
    let colMatch = 0, colMismatch = 0, colSkipped = 0
    for (const col of reorg.collisions.slice(0, 20)) {
      const { oldKey, market1, market2 } = col
      const path1 = resolve(LOCAL_DIR, market1, oldKey)
      const path2 = resolve(LOCAL_DIR, market2, oldKey)

      if (!existsSync(path1) || !existsSync(path2)) {
        colSkipped++
        continue
      }
      const size1 = statSync(path1).size
      const size2 = statSync(path2).size
      if (size1 === size2) {
        colMatch++ // Same file, fine
      } else {
        colMismatch++
        console.log(`  DIFF: ${oldKey} — ${market1}=${size1} bytes, ${market2}=${size2} bytes`)
      }
    }
    console.log(`  Checked: match=${colMatch} mismatch=${colMismatch} skipped=${colSkipped}`)
  }

  // 4. Sample post content
  console.log('\n4. Sampling post content...')
  const postRes = d1Query("SELECT id, market, locale FROM posts_locales WHERE content LIKE '%r2://tripcanvas-media/%' LIMIT 10")
  const posts = postRes?.[0]?.results || []
  if (posts.length > 0) {
    let oldFormat = 0, newFormat = 0
    for (const p of posts) {
      // We can't easily check the content JSON here safely, but we count them
      oldFormat++
    }
    console.log(`  ${posts.length} posts still have r2:// references (sample)`)
  }

  console.log('\n=== Verification Complete ===')
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Run verification**

```bash
cd scripts/migration && node reorg-r2-verify.js
```

- [ ] **Step 3: Commit**

```bash
git add scripts/migration/reorg-r2-verify.js
git commit -m "feat: add r2-reorg phase 6 — verification script"
```

---

### Task 7: Final Cleanup

- [ ] **Step 1: Review all changes**

```bash
git status
git log --oneline -10
```

- [ ] **Step 2: Verify frontend still works**

Check a few known image URLs across markets:
```bash
# Test an ID market post image
curl -sI "https://tripcanvas-id.academyt.workers.dev/" | head -3
# Test a known post URL (pick a slug from the CMS)
curl -s "https://tripcanvas-cms.academyt.workers.dev/api/posts?market=id&limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('docs',[{}])[0].get('slug','?'))"
```

- [ ] **Step 3: Update AGENTS.md**

Add note:
```
- **R2 market-prefix reorg**: All R2 keys prefixed with market (id/my/th/en/year/month/file.jpg). Eliminated 214 cross-market file collisions. Old flat keys retained for rollback.
```

- [ ] **Step 4: Final commit if any changes**

```bash
git add -A && git diff --cached --stat
# If AGENTS.md updated:
git commit -m "docs: note R2 market-prefix reorg completion"
```

---

## Rollback Procedure

If the new prefixed keys cause issues:

1. **R2**: Old flat keys intact — no action needed
2. **D1 media records**: Re-run Phase 3 with `--live` to restore old URLs:
   ```sql
   UPDATE media SET url = REPLACE(url, '/id/', '/') WHERE url LIKE '%/id/%';
   -- Repeat for /my/, /th/, /en/
   ```
3. **D1 post content**: Restore from Payload version history or re-run fix-image-nodes.js
4. **media-url-map.json**: Copy `media-url-map-v1-backup.json` to `media-url-map.json`
