#!/usr/bin/env node
/**
 * Phase 3: Update media.url field in D1 to use market-prefixed paths.
 *
 * Reads r2-reorg-map.json to build oldKey->newKey lookup,
 * then UPDATEs the media table in D1 via wrangler d1 execute.
 *
 * Usage:
 *   node reorg-r2-media-records.js             # dry-run
 *   node reorg-r2-media-records.js --live       # applies changes
 */

import { readFileSync, existsSync } from 'fs'
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
  try { return JSON.parse(out) }
  catch {
    const m = out.match(/\[[\s\S]*\]/)
    if (m) return JSON.parse(m[0])
    return null
  }
}

async function main() {
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
    const path = url.slice(R2_PUBLIC.length + 1)
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
    console.log(`  id=${u.id}: ${u.oldUrl} -> ${u.newUrl}`)
  }
  if (updates.length > 5) console.log(`  ... and ${updates.length - 5} more`)

  if (!LIVE) {
    console.log('\nDry run. Use --live to apply changes.')
    return
  }

  // 4. Apply updates in batches
  const BATCH = 200
  const batches = Math.ceil(updates.length / BATCH)
  let ok = 0

  for (let b = 0; b < batches; b++) {
    const batch = updates.slice(b * BATCH, (b + 1) * BATCH)
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
    if (b < batches - 1) {
      execSync('sleep 2')
    }
  }

  // 5. Verify
  const verifyResult = d1Query("SELECT COUNT(*) as cnt FROM media WHERE url LIKE '%/id/%' OR url LIKE '%/my/%' OR url LIKE '%/th/%' OR url LIKE '%/en/%'")
  const cnt = verifyResult?.[0]?.results?.[0]?.cnt
  console.log(`\nMedia records with market prefix: ${cnt}/${rows.length}`)
}

try {
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
