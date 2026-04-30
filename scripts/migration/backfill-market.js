#!/usr/bin/env node
/**
 * Backfill the `market` field on all Payload CMS post documents.
 *
 * Strategy: build a slug→market map from the per-locale WP export files
 * (site-my-v2.json, site-th-v2.json, site-id-v2.json, site-en-v2.json),
 * then PATCH each post via the API.
 *
 * Dry-run:  node backfill-market.js
 * Live:     node backfill-market.js --live
 */

import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { getPayloadClient } from './lib/payload-client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '.env') })

const LIVE = process.argv.includes('--live')

// Build slug → market map from export files
function buildSlugMarketMap() {
  const map = {}
  const markets = ['my', 'id', 'th', 'en']
  for (const mkt of markets) {
    const path = resolve(__dirname, 'export', `site-${mkt}-v2.json`)
    if (!existsSync(path)) continue
    const { posts = [] } = JSON.parse(readFileSync(path, 'utf-8'))
    for (const p of posts) {
      if (p.slug && !map[p.slug]) {
        map[p.slug] = mkt
      }
    }
  }
  return map
}

async function main() {
  const slugMarketMap = buildSlugMarketMap()
  console.log(`Loaded slug→market map: ${Object.keys(slugMarketMap).length} slugs`)

  const client = await getPayloadClient()

  let page = 1
  const pageSize = 100
  let totalPatched = 0
  let totalSkipped = 0
  let totalErrors = 0
  let totalUnknown = 0

  while (true) {
    const result = await client.find('posts', {
      depth: 0,
      limit: pageSize,
      page,
      sort: 'id',
    })

    const docs = result.docs || []
    if (docs.length === 0) break

    for (const doc of docs) {
      const market = slugMarketMap[doc.slug]

      if (!market) {
        totalUnknown++
        continue
      }

      if (doc.market === market) {
        totalSkipped++
        continue
      }

      if (LIVE) {
        try {
          // Pass the market locale so Payload validates the locale that has a title
          await client.update('posts', doc.id, { market }, { locale: market })
          totalPatched++
        } catch (err) {
          console.warn(`  ✗ ${doc.slug}: ${err.message}`)
          totalErrors++
        }
      } else {
        console.log(`  [dry] ${doc.slug} → market=${market}`)
        totalPatched++
      }
    }

    console.log(`  Page ${page}: ${docs.length} docs, running patched=${totalPatched} skipped=${totalSkipped} unknown=${totalUnknown}`)

    if (!result.hasNextPage && docs.length < pageSize) break
    page++
  }

  console.log(`\nDone (${LIVE ? 'live' : 'dry-run'})`)
  console.log(`  patched: ${totalPatched}`)
  console.log(`  already correct: ${totalSkipped}`)
  console.log(`  no slug match (unknown): ${totalUnknown}`)
  console.log(`  errors: ${totalErrors}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
