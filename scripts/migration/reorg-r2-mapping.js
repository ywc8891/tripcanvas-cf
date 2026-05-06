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

  const oldKeyMarkets = new Map()
  const allEntries = []
  const collisions = []

  for (const [sourceUrl, r2Value] of entries) {
    const market = marketFromUrl(sourceUrl)
    const oldKey = extractOldKey(r2Value)
    const newKey = `${market}/${oldKey}`

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
      oldKeyMarkets.set(oldKey, { market, sourceUrl })
    } else {
      oldKeyMarkets.set(oldKey, { market, sourceUrl })
    }

    allEntries.push({ sourceUrl, market, oldKey, newKey })
  }

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

  for (const e of allEntries) {
    const m = e.market
    output.stats.markets[m] = (output.stats.markets[m] || 0) + 1
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
