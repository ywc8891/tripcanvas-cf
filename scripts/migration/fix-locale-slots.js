#!/usr/bin/env node
// Copy market-locale content → en locale slot for non-EN market posts.
//
// Why: migrate-posts.js created posts with locale=<market> (th/id/my),
// so the en (default) locale slot is empty. This copies market content
// to en so Payload's admin UI and fallback reads work correctly.
//
// Usage:
//   DRY_RUN=0 node fix-locale-slots.js          # dry-run (reads only)
//   DRY_RUN=0 node fix-locale-slots.js --live    # actually writes
//   DRY_RUN=0 node fix-locale-slots.js --live --market=th  # single market

import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { getPayloadClient } from './lib/payload-client.js'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '.env') })

const LIVE_MODE = process.argv.includes('--live')
const DRY_RUN = !LIVE_MODE
const MARKET_ARG = process.argv.find(a => a.startsWith('--market='))
const SINGLE_MARKET = MARKET_ARG ? MARKET_ARG.split('=')[1] : null
const MARKETS = SINGLE_MARKET ? [SINGLE_MARKET] : ['th', 'id', 'my']
const PAGE_SIZE = 10
const PAGE_DELAY_MS = 1500
const WRITE_DELAY_MS = 300

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log(`Fix locale slots (mode: ${DRY_RUN ? 'dry-run' : 'LIVE'}, markets: ${MARKETS.join(',')})`)

  const client = await getPayloadClient()

  const stats = { scanned: 0, patched: 0, skipped: 0, errors: 0 }

  for (const market of MARKETS) {
    console.log(`\n=== Market: ${market} ===`)
    let page = 1
    let marketPatched = 0

    while (true) {
      // Fetch posts for this market using the market's own locale
      // This avoids the heavy locale=all query
      const res = await client.find('posts', {
        where: { market: { equals: market } },
        locale: market,
        depth: 0,
        limit: PAGE_SIZE,
        page,
        sort: 'slug',
      })

      if (!res.docs || res.docs.length === 0) break

      for (const doc of res.docs) {
        stats.scanned++

        // doc.title / doc.content / doc.excerpt are the market-locale values
        const enPatch = {}
        if (doc.title) enPatch.title = doc.title
        if (doc.content) enPatch.content = doc.content
        if (doc.excerpt) enPatch.excerpt = doc.excerpt

        if (Object.keys(enPatch).length === 0) {
          stats.skipped++
          continue
        }

        if (!DRY_RUN) {
          try {
            await client.update('posts', doc.id, enPatch, { locale: 'en' })
            marketPatched++
            stats.patched++
            if (stats.patched % 50 === 0) {
              console.log(`  patched ${stats.patched} so far...`)
            }
            await sleep(WRITE_DELAY_MS)
          } catch (err) {
            console.error(`  ✗ ${doc.slug}: ${err.message}`)
            stats.errors++
          }
        } else {
          marketPatched++
          stats.patched++
        }
      }

      if (!res.hasNextPage) break
      page++
      if (page % 5 === 0) {
        console.log(`  page ${page}, scanned ${stats.scanned}...`)
      }
      await sleep(PAGE_DELAY_MS)
    }

    console.log(`  ${market}: ${marketPatched} posts ${DRY_RUN ? 'would be' : ''} patched`)
  }

  console.log(`\n--- Summary ---`)
  console.log(`Mode:     ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`)
  console.log(`Scanned:  ${stats.scanned}`)
  console.log(`Patched:  ${stats.patched}`)
  console.log(`Skipped:  ${stats.skipped}`)
  console.log(`Errors:   ${stats.errors}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
