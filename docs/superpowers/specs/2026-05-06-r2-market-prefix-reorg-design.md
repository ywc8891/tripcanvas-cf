# R2 Key Reorg — Market-Prefixed Paths

**Date**: 2026-05-06
**Status**: Approved

---

## Problem

R2 media files are stored with flat keys (`year/month/filename.jpg`). Files from different WordPress markets (ID, MY, TH) with the same relative path collide in R2 — the later upload silently overwrites the earlier one.

**Analysis of current R2** (`media-url-map.json`):

| | Count |
|---|---|
| Total R2 keys | 36,143 |
| Keys with cross-market collisions | 225 |
| Collisions with **different** file content (data loss) | 214 |
| Collisions with identical file content (dedup, fine) | 8 |
| Collisions where local files missing (unknown status) | 3 |

214 images in R2 currently serve the wrong image for at least one market.

## Solution

Prefix all R2 keys with market identifier: `{market}/{year}/{month}/{filename}`.

```
Before:  tripcanvas-media/2019/03/foo.jpg
After:   tripcanvas-media/id/2019/03/foo.jpg
         tripcanvas-media/my/2019/03/foo.jpg
         tripcanvas-media/th/2019/03/foo.jpg
         tripcanvas-media/en/2019/03/foo.jpg
```

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Old R2 keys | Keep both old + new | Safe rollback. Delete in follow-up. |
| Content update method | Payload REST API | Preserves version history, triggers hooks. |
| Idempotency | Every phase re-runnable | Resume from partial failures. |
| Market detection | Source URL domain | `indonesia.tripcanvas.co` → `id` |
| Key format | `{market}/year/month/file.jpg` | Same structure as local `media-download/` dir. |
| Concurrency | 10 parallel R2 uploads | R2 handles this rate; `p-limit` throttles. |

## Architecture

```
Phase 1              Phase 2              Phase 3              Phase 4              Phase 5              Phase 6
Generate             Upload               Update               Rewrite              Update               Verify
mappings             to R2                D1 media             D1 posts             map file             all
(reorg-r2-           (reorg-r2-           records              (Payload             (media-url-          (reorg-r2-
 mapping.js)          upload.js)           (reorg-r2-           API)                 map.json)            verify.js)
   │                    │                   media-                                     │
   ▼                    ▼                   records.js)                                ▼
r2-reorg-map.json   ┌──────────┐              │                                   Updated
(old→new key        │ R2 bucket │              ▼                                   media-url-map.json
 mappings)          │  (S3 API) │         ┌──────────┐
                    └──────────┘         │ D1 media │
                         │               │   table  │
                         ▼               └──────────┘
                    All files at              │
                    {market}/...              ▼
                    now in R2            url field updated
                    (alongside old            │
                     flat keys)               ▼
                                        Phase 2 style
                                        upload nodes now
                                        resolve correctly
```

## Phase 1: Generate Key Mappings

**Script**: `scripts/migration/reorg-r2-mapping.js`

**Input**: `scripts/migration/export/media-url-map.json`
**Output**: `scripts/migration/export/r2-reorg-map.json`

For each entry in media-url-map.json:
1. Parse source URL to determine market:
   - `indonesia.tripcanvas.co` → `id`
   - `malaysia.tripcanvas.co` → `my`
   - `thailand.tripcanvas.co` → `th`
   - everything else → `en`
2. Extract old R2 key from the `r2://tripcanvas-media/...` value
3. Construct new key: `{market}/{oldKey}`
4. For collision keys, each source URL gets its own new key per its market

**Output format**:
```json
{
  "oldToNew": {
    "2019/03/foo.jpg": "id/2019/03/foo.jpg"
  },
  "bySource": {
    "https://indonesia.tripcanvas.co/wp-content/uploads/2019/03/foo.jpg": {
      "market": "id",
      "oldKey": "2019/03/foo.jpg",
      "newKey": "id/2019/03/foo.jpg"
    }
  },
  "stats": {
    "totalKeys": 36143,
    "collisionKeys": 225,
    "totalSourceUrls": 36368
  }
}
```

**Idempotent**: overwrites output file on every run.

## Phase 2: Upload Files to R2

**Script**: `scripts/migration/reorg-r2-upload.js`

**Input**: `scripts/migration/export/r2-reorg-map.json`
**Uses**: R2 S3 client (same credentials as migrate-media.js)

For each entry in `bySource`:
1. `headExists(s3, newKey)` → skip if already present (idempotent)
2. Construct local path: `media-download/{market}/{oldKey}`
3. If local file exists → read + `PutObject` to new key
4. If local file missing → download from `https://pub-...r2.dev/{oldKey}` → `PutObject` to new key
5. On error → log to `export/r2-reorg-errors.json`, continue
6. Progress logging every 100 files

**Concurrency**: 10 parallel uploads (`p-limit`).
**Content-Type**: Derived from file extension (jpg/png/webp/gif/svg).
**Old keys**: NOT deleted — kept alongside new keys.

## Phase 3: Update D1 Media Records

**Script**: `scripts/migration/reorg-r2-media-records.js`

**Input**: `scripts/migration/export/r2-reorg-map.json`
**Database**: D1, via `wrangler d1 execute`

For each row in the `media` table:
1. Read `wp_original_url` field → determine market from domain
2. Read current `url` field → extract path after `.r2.dev/`
3. If path already has market prefix (`/id/`, `/my/`, `/th/`, `/en/`) → skip (idempotent)
4. Otherwise: UPDATE `url` to new market-prefixed public URL
5. Batch SQL UPDATEs in groups of 100 (`UPDATE ... WHERE id IN (...)`)
6. Verify with count query after completion

**Rolling back**: Old public URLs still work since old R2 keys are preserved.

## Phase 4: Rewrite Post Content

**Script**: `scripts/migration/reorg-r2-post-content.js`

**Method**: Payload REST API (authenticated via JWT)

For all posts across all locales (`en`, `my`, `id`, `th`, `zh`):
1. Fetch post page via `GET /api/posts?locale=X&page=N&limit=20`
2. For each post's `content` (Lexical JSON):
   - Determine post's `market` field → prefix to use
   - **Upload nodes (Phase 1 — inline URL)**: `value.url` = `https://pub-...r2.dev/2019/03/foo.jpg` → inject market prefix after `.r2.dev/`
   - **r2:// text paragraphs**: `r2://tripcanvas-media/2019/03/foo.jpg` → `r2://tripcanvas-media/{market}/2019/03/foo.jpg`
   - **Upload nodes (Phase 2 — media ID)**: Skip — handled by Phase 3 media record update
   - **placeholder-image nodes**: Skip — still holds original WP URL, resolved at render time
3. If content changed → `PATCH /api/posts/{id}?locale={locale}` with new content
4. If content already has market prefix → skip (idempotent)
5. Delay 300ms between PATCH calls to avoid API rate limits

**Modes**: `--dry-run` first (logs changes, no writes), then `--live`.

## Phase 5: Update media-url-map.json

**Script**: `scripts/migration/reorg-r2-update-map.js`

**Input**: `media-url-map.json` + `r2-reorg-map.json`

1. Read both files
2. For each source URL → R2 URL entry in the map:
   - Replace `r2://tripcanvas-media/{oldKey}` with `r2://tripcanvas-media/{newKey}`
3. Write updated `media-url-map.json`
4. Copy old version to `media-url-map-v1-backup.json`

## Phase 6: Verification

**Script**: `scripts/migration/reorg-r2-verify.js`

Checks:
1. **R2 head-exists**: Sample 100 random new keys — confirm all return 200
2. **D1 media records**: Count with/without market prefix; confirm prefix count = total
3. **D1 posts**: Query sample of 10 posts per locale via API; confirm no flat URLs in content
4. **Collision files**: For all 225 collision keys, verify each market's file is correct (compare sizes with local media-download)

## Scope: What Changes

| Component | Change |
|---|---|
| R2 bucket | New keys added at `{market}/{oldPath}` |
| D1 `media.url` | Updated to market-prefixed URLs |
| D1 `posts_locales.content` | Inline URLs and r2:// text paragraphs updated |
| `export/media-url-map.json` | All r2:// values updated |
| `export/r2-reorg-map.json` | **NEW** — old→new key mappings |
| `export/r2-reorg-errors.json` | **NEW** — upload errors log |

## Scope: What Does NOT Change

| Component | Reason |
|---|---|
| `apps/frontend/src/lib/lexical.ts` | `r2ToHttps()` is path-agnostic; just strips scheme, adds prefix |
| `apps/frontend/src/lib/payload.ts` | Same r2:// scheme, just longer paths |
| `apps/cms/src/payload.config.ts` | R2 storage plugin unchanged |
| `apps/cms/src/collections/*.ts` | No r2:// logic in collections |
| CCWR configs (`wrangler.toml`, `wrangler.jsonc`) | Bucket binding unchanged |
| All homepage Astro components | Use `firstImageUrl()` → follows same path resolution |
| Old R2 keys (`year/month/file.jpg`) | Preserved for rollback |

## Rollback Strategy

If something goes wrong:
1. Old R2 keys still exist — direct URLs still work
2. Old `media-url-map.json` backed up as `-v1-backup.json`
3. Phase 3 (D1 media) — old URLs still valid since old R2 keys exist
4. Phase 4 (D1 posts) — Payload version history preserves previous content
5. Full rollback: revert D1 media + posts content, point back to old flat keys

## Implementation Order

Phases must run sequentially (each depends on output of prior phase):
1. Generate mappings
2. Upload to R2
3. Update D1 media records
4. Rewrite D1 post content
5. Update media-url-map.json
6. Verify
