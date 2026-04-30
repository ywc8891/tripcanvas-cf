#!/usr/bin/env node
/**
 * Export URL→ID mapping from D1 media table in pages.
 * Output: export/media-id-map.json
 */

import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CMS_DIR = resolve(__dirname, '../../apps/cms')
const OUT_PATH = resolve(__dirname, 'export', 'media-id-map.json')

const PAGE_SIZE = 5000
const mapping = {} // url → id
let offset = 0
let total = 0

// First get total count
try {
  const out = execSync(
    `npx wrangler d1 execute tripcanvas-db --remote --command "SELECT COUNT(*) as cnt FROM media"`,
    { cwd: CMS_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
  )
  const m = out.match(/"cnt":\s*(\d+)/)
  total = m ? parseInt(m[1]) : 0
  console.log(`Total media records: ${total}`)
} catch (err) {
  console.error('Failed to get count:', err.message?.slice(0, 200))
  process.exit(1)
}

// Paginate through all records
while (offset < total) {
  const sql = `SELECT id, url FROM media ORDER BY id LIMIT ${PAGE_SIZE} OFFSET ${offset}`
  try {
    const out = execSync(
      `npx wrangler d1 execute tripcanvas-db --remote --command "${sql}"`,
      { cwd: CMS_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 }
    )
    // Parse results from wrangler output
    const jsonMatch = out.match(/\[\s*\{[\s\S]*\}\s*\]/)
    if (jsonMatch) {
      const results = JSON.parse(jsonMatch[0])
      const rows = results[0]?.results || []
      for (const row of rows) {
        if (row.url) mapping[row.url] = row.id
      }
      console.log(`  offset ${offset}: got ${rows.length} rows (total mapped: ${Object.keys(mapping).length})`)
    } else {
      console.log(`  offset ${offset}: no results parsed`)
    }
  } catch (err) {
    console.error(`  offset ${offset} failed:`, err.message?.slice(0, 200))
    // Wait and retry once
    await new Promise(r => setTimeout(r, 5000))
    try {
      const out = execSync(
        `npx wrangler d1 execute tripcanvas-db --remote --command "${sql}"`,
        { cwd: CMS_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 }
      )
      const jsonMatch = out.match(/\[\s*\{[\s\S]*\}\s*\]/)
      if (jsonMatch) {
        const results = JSON.parse(jsonMatch[0])
        const rows = results[0]?.results || []
        for (const row of rows) {
          if (row.url) mapping[row.url] = row.id
        }
        console.log(`  offset ${offset} retry: got ${rows.length} rows`)
      }
    } catch { /* skip this page */ }
  }
  offset += PAGE_SIZE
  await new Promise(r => setTimeout(r, 2000))
}

// Also build r2:// scheme mapping
const R2_PUBLIC = 'https://pub-2faca0649c2047a1859536a3114d3f95.r2.dev/'
const r2SchemeMap = {}
for (const [url, id] of Object.entries(mapping)) {
  if (url.startsWith(R2_PUBLIC)) {
    const path = url.slice(R2_PUBLIC.length)
    r2SchemeMap[`r2://tripcanvas-media/${path}`] = id
  }
}

const output = { urlToId: mapping, r2ToId: r2SchemeMap }
writeFileSync(OUT_PATH, JSON.stringify(output, null, 2))
console.log(`\n✓ Wrote ${Object.keys(mapping).length} URL→ID + ${Object.keys(r2SchemeMap).length} r2://→ID mappings to ${OUT_PATH}`)
