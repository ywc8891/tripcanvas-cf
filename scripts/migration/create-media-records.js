#!/usr/bin/env node
/**
 * Phase 1: Create Media records in D1 for all R2 files.
 *
 * Reads the media-url-map.json, extracts unique R2 file paths,
 * and generates SQL INSERT statements for the media table.
 * Executes via `wrangler d1 execute --file`.
 *
 * Usage:
 *   node create-media-records.js          # dry-run (generates SQL only)
 *   node create-media-records.js --live   # executes against D1
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname, extname, basename } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LIVE = process.argv.includes('--live')
const R2_PUBLIC_URL = 'https://pub-2faca0649c2047a1859536a3114d3f95.r2.dev'
const R2_SCHEME = 'r2://tripcanvas-media/'
const BATCH_SIZE = 100 // rows per INSERT statement
const CMS_DIR = resolve(__dirname, '../../apps/cms')

const MIME_MAP = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
}

function escSql(s) {
  return s.replace(/'/g, "''")
}

function getMimeType(filepath) {
  const ext = extname(filepath).slice(1).toLowerCase()
  return MIME_MAP[ext] || 'application/octet-stream'
}

async function main() {
  // 1. Load media-url-map.json
  const mapPath = resolve(__dirname, 'export', 'media-url-map.json')
  if (!existsSync(mapPath)) {
    console.error('media-url-map.json not found')
    process.exit(1)
  }

  const { map: urlMap } = JSON.parse(readFileSync(mapPath, 'utf-8'))
  const entries = Object.entries(urlMap)

  // 2. Extract unique R2 paths and build wp_original_url mapping
  const pathToOriginals = new Map() // R2 path → first original WP URL
  for (const [wpUrl, r2Url] of entries) {
    let r2Path = null
    if (r2Url.startsWith(R2_PUBLIC_URL + '/')) {
      r2Path = r2Url.slice(R2_PUBLIC_URL.length + 1)
    } else if (r2Url.startsWith(R2_SCHEME)) {
      r2Path = r2Url.slice(R2_SCHEME.length)
    }
    if (r2Path && !pathToOriginals.has(r2Path)) {
      pathToOriginals.set(r2Path, wpUrl)
    }
  }

  const allPaths = [...pathToOriginals.keys()].sort()
  console.log(`Found ${allPaths.length} unique R2 file paths`)

  // 3. Check existing media records
  let existingCount = 0
  try {
    const out = execSync(
      `npx wrangler d1 execute tripcanvas-db --remote --command "SELECT COUNT(*) as cnt FROM media"`,
      { cwd: CMS_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const m = out.match(/"cnt":\s*(\d+)/)
    if (m) existingCount = parseInt(m[1])
  } catch { /* ignore */ }
  console.log(`Existing media records: ${existingCount}`)

  if (existingCount > 0 && process.argv.includes('--clear') && LIVE) {
    console.log('Clearing existing media records...')
    execSync(
      `npx wrangler d1 execute tripcanvas-db --remote --command "DELETE FROM media"`,
      { cwd: CMS_DIR, encoding: 'utf-8', stdio: 'inherit' }
    )
    console.log('✓ Cleared')
  } else if (existingCount > 0) {
    console.log('ℹ Using INSERT OR IGNORE — existing records will be skipped.')
  }

  // 4. Generate SQL INSERT batches
  const now = new Date().toISOString().replace('T', 'T').replace(/\.\d{3}Z$/, '.000Z')
  const sqlBatches = []
  let currentBatch = []

  for (let i = 0; i < allPaths.length; i++) {
    const r2Path = allPaths[i]
    const filename = r2Path // full path to ensure uniqueness (basename collides across dirs)
    const mimeType = getMimeType(r2Path)
    const url = `${R2_PUBLIC_URL}/${r2Path}`
    const wpOrigUrl = pathToOriginals.get(r2Path) || ''
    const alt = basename(r2Path).replace(/[-_]/g, ' ').replace(/\.\w+$/, '').slice(0, 200)

    currentBatch.push(
      `('${escSql(alt)}', '${escSql(url)}', '${escSql(filename)}', '${escSql(mimeType)}', '${escSql(wpOrigUrl)}', '${now}', '${now}')`
    )

    if (currentBatch.length >= BATCH_SIZE || i === allPaths.length - 1) {
      const sql = `INSERT OR IGNORE INTO media (alt, url, filename, mime_type, wp_original_url, updated_at, created_at) VALUES\n${currentBatch.join(',\n')};`
      sqlBatches.push(sql)
      currentBatch = []
    }
  }

  console.log(`Generated ${sqlBatches.length} SQL batches (${BATCH_SIZE} rows each)`)

  // 5. Write SQL file and optionally execute
  const sqlDir = resolve(__dirname, 'export')
  const sqlPath = resolve(sqlDir, 'media-inserts.sql')

  // Write all batches to a single file
  writeFileSync(sqlPath, sqlBatches.join('\n\n'))
  console.log(`SQL written to ${sqlPath} (${(readFileSync(sqlPath).length / 1024 / 1024).toFixed(1)} MB)`)

  if (!LIVE) {
    console.log('\nDry-run complete. Pass --live to execute against D1.')
    console.log(`Sample SQL (first batch):\n${sqlBatches[0].slice(0, 500)}...`)
    return
  }

  // Execute batches - combine BATCHES_PER_FILE batches into one file to reduce CLI calls
  console.log('\nExecuting SQL batches against D1...')
  const BATCHES_PER_FILE = 5
  const numFiles = Math.ceil(sqlBatches.length / BATCHES_PER_FILE)
  let inserted = 0
  let errors = 0

  for (let f = 0; f < numFiles; f++) {
    const start = f * BATCHES_PER_FILE
    const end = Math.min(start + BATCHES_PER_FILE, sqlBatches.length)
    const combined = sqlBatches.slice(start, end).join('\n\n')
    const batchFile = resolve(sqlDir, `_media_file_${f}.sql`)
    writeFileSync(batchFile, combined)

    let ok = false
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        execSync(
          `npx wrangler d1 execute tripcanvas-db --remote --file "${batchFile}"`,
          { cwd: CMS_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        )
        ok = true
        inserted += (end - start) * BATCH_SIZE
      } catch (err) {
        if (attempt < 2) {
          console.log(`  ⟳ file ${f + 1}/${numFiles} attempt ${attempt + 1} failed, retrying in 8s...`)
          await new Promise(r => setTimeout(r, 8000))
        } else {
          console.error(`  ✗ file ${f + 1}/${numFiles} failed after 3 attempts`)
          errors++
        }
      }
    }

    if ((f + 1) % 5 === 0 || f === numFiles - 1) {
      console.log(`  file ${f + 1}/${numFiles} done`)
    }
    // Delay between files to avoid D1 rate limits
    await new Promise(r => setTimeout(r, 3000))
  }

  if (errors > 0) {
    console.log(`\n⚠ ${errors} files failed. Re-run to fill gaps (INSERT OR IGNORE handles duplicates).`)
  }

  // 6. Verify
  try {
    const out = execSync(
      `npx wrangler d1 execute tripcanvas-db --remote --command "SELECT COUNT(*) as cnt FROM media"`,
      { cwd: CMS_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const m = out.match(/"cnt":\s*(\d+)/)
    console.log(`\n✓ Media table now has ${m ? m[1] : '?'} records`)
  } catch { /* ignore */ }

  // 7. Export URL→ID mapping for next phase
  console.log('\nExporting URL→ID mapping...')
  try {
    const out = execSync(
      `npx wrangler d1 execute tripcanvas-db --remote --command "SELECT id, url FROM media"`,
      { cwd: CMS_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 100 * 1024 * 1024 }
    )
    // Parse the JSON results
    const jsonMatch = out.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const results = JSON.parse(jsonMatch[0])
      const rows = results[0]?.results || []
      const mapping = {}
      for (const row of rows) {
        if (row.url) mapping[row.url] = row.id
      }
      const mapOutPath = resolve(sqlDir, 'media-id-map.json')
      writeFileSync(mapOutPath, JSON.stringify({ map: mapping }, null, 2))
      console.log(`✓ Wrote ${Object.keys(mapping).length} URL→ID mappings to ${mapOutPath}`)
    }
  } catch (err) {
    console.error('Failed to export mapping:', err.message?.slice(0, 200))
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
