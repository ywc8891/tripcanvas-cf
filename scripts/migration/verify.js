#!/usr/bin/env node
// Integrity check after migration.
//
// Validates:
// - Exported slugs exist in export files (sanity)
// - Slug uniqueness and overlap report
// - Taxonomy slug coverage (missing from categories/tags)
// - HTML→Lexical conversion sanity on a sample of posts
// - CMS post count per locale (if PAYLOAD_* credentials are available)

import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loadAllSites, LOCALES } from './lib/exports.js'
import { htmlToLexical } from './lib/html-to-lexical.js'
import { getPayloadClient, isDryRun } from './lib/payload-client.js'

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env') })

async function main() {
  const sites = loadAllSites()

  // ── Post counts & slug overlap ───────────────────────────────────────────
  const slugMap = new Map() // slug → Set<locale>
  for (const locale of LOCALES) {
    for (const p of sites[locale].posts) {
      if (!slugMap.has(p.slug)) slugMap.set(p.slug, new Set())
      slugMap.get(p.slug).add(locale)
    }
  }
  const overlaps = [...slugMap.entries()].filter(([, ls]) => ls.size > 1)
  console.log('Posts')
  for (const l of LOCALES) console.log(`  ${l}: ${sites[l].posts.length}`)
  console.log(`  unique slugs: ${slugMap.size}`)
  console.log(`  cross-locale slug overlaps: ${overlaps.length}`)
  for (const [slug, ls] of overlaps.slice(0, 5)) {
    console.log(`    - ${slug} (${[...ls].join(',')})`)
  }

  // ── Taxonomy coverage ────────────────────────────────────────────────────
  const allCatSlugs = new Set()
  const allTagSlugs = new Set()
  for (const l of LOCALES) {
    for (const c of sites[l].categories) allCatSlugs.add(c.slug)
    for (const t of sites[l].tags) allTagSlugs.add(t.slug)
  }
  const refCats = new Set()
  const refTags = new Set()
  for (const l of LOCALES) {
    for (const p of sites[l].posts) {
      for (const s of p.category_slugs || []) refCats.add(s)
      for (const s of p.tag_slugs || []) refTags.add(s)
    }
  }
  const orphanCats = [...refCats].filter((s) => !allCatSlugs.has(s))
  const orphanTags = [...refTags].filter((s) => !allTagSlugs.has(s))
  console.log('\nTaxonomy coverage')
  console.log(`  defined: ${allCatSlugs.size} cats, ${allTagSlugs.size} tags`)
  console.log(`  referenced by posts: ${refCats.size} cats, ${refTags.size} tags`)
  if (orphanCats.length) console.log(`  ⚠ orphan cat slugs (ref but undefined):`, orphanCats)
  if (orphanTags.length) console.log(`  ⚠ orphan tag slugs (ref but undefined):`, orphanTags)

  // ── HTML→Lexical sanity on a sample ──────────────────────────────────────
  console.log('\nHTML → Lexical conversion sample')
  let convSuccess = 0
  let convFail = 0
  let imagePlaceholders = 0
  for (const l of LOCALES) {
    for (const p of sites[l].posts) {
      try {
        const tree = htmlToLexical(p.content)
        if (!tree?.root?.children) throw new Error('missing root')
        convSuccess++
        imagePlaceholders += countByType(tree, 'placeholder-image')
      } catch (e) {
        convFail++
        console.log(`  ✗ ${l}:${p.slug} — ${e.message}`)
      }
    }
  }
  console.log(`  ok: ${convSuccess}, fail: ${convFail}`)
  console.log(`  image placeholders emitted: ${imagePlaceholders}`)

  // ── Live CMS counts (optional) ───────────────────────────────────────────
  if (process.env.PAYLOAD_API_URL && process.env.PAYLOAD_EMAIL) {
    console.log(`\nLive CMS check (dry_run=${isDryRun()})`)
    try {
      const client = await getPayloadClient()
      const pRes = await client.find('posts', { limit: 1, depth: 0 })
      const cRes = await client.find('categories', { limit: 1, depth: 0 })
      const tRes = await client.find('tags', { limit: 1, depth: 0 })
      console.log(`  CMS posts=${pRes.totalDocs} categories=${cRes.totalDocs} tags=${tRes.totalDocs}`)
    } catch (e) {
      console.log(`  ⚠ live check failed: ${e.message}`)
    }
  }
}

function countByType(tree, type) {
  let n = 0
  function walk(node) {
    if (!node) return
    if (node.type === type) n++
    if (Array.isArray(node.children)) node.children.forEach(walk)
  }
  walk(tree?.root)
  return n
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
