#!/usr/bin/env node
// Migrate WordPress categories + tags → Payload CMS.
//
// Strategy:
// - Merge by slug across all 4 locales (slugs are the stable cross-site key).
// - Each slug → one Payload document. The localized `name` field is populated
//   per locale via separate PATCH ?locale=<x> calls after the initial create.
// - Writes a slug→payload_id map to export/taxonomy-id-map.json for use by
//   migrate-posts.js.
//
// DRY_RUN=1 skips all writes but still prints what would happen.

import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { getPayloadClient, isDryRun } from './lib/payload-client.js'
import { loadAllSites, LOCALES } from './lib/exports.js'

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env') })

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'export')

function mergeTerms(sites, kind /* 'categories' | 'tags' */) {
  const bySlug = new Map()
  for (const locale of LOCALES) {
    const terms = sites[locale][kind] || []
    for (const t of terms) {
      let entry = bySlug.get(t.slug)
      if (!entry) {
        entry = { slug: t.slug, names: {}, parent_slug: null, wp_ids: {} }
        bySlug.set(t.slug, entry)
      }
      entry.names[locale] = t.name
      entry.wp_ids[locale] = t.wp_id
      if (kind === 'categories' && t.parent_slug && !entry.parent_slug) {
        entry.parent_slug = t.parent_slug
      }
    }
  }
  return [...bySlug.values()]
}

async function migrateCollection(client, collection, merged) {
  const slugToId = {}
  let created = 0
  let updated = 0

  for (const term of merged) {
    // Check for existing by slug (idempotent re-runs).
    const existing = await client.find(collection, {
      where: { slug: { equals: term.slug } },
      limit: 1,
      depth: 0,
    })
    const existingDoc = existing.docs?.[0]

    // Pick primary locale = first locale where we have a name
    const primaryLocale = LOCALES.find((l) => term.names[l]) || 'en'
    const primaryName = term.names[primaryLocale]

    let doc
    if (existingDoc) {
      doc = existingDoc
    } else {
      doc = await client.create(
        collection,
        { name: primaryName, slug: term.slug },
        { locale: primaryLocale },
      )
      created++
    }

    // Fill in remaining locales
    for (const locale of LOCALES) {
      if (locale === primaryLocale) continue
      const name = term.names[locale]
      if (!name) continue
      await client.update(collection, doc.id, { name }, { locale })
      updated++
    }

    slugToId[term.slug] = doc.id
  }

  console.log(`  ${collection}: ${created} created, ${updated} locale PATCHes`)
  return slugToId
}

async function main() {
  console.log(`Taxonomy migration (dry_run=${isDryRun()})`)
  const sites = loadAllSites()

  const mergedCategories = mergeTerms(sites, 'categories')
  const mergedTags = mergeTerms(sites, 'tags')
  console.log(`\nMerged: ${mergedCategories.length} categories, ${mergedTags.length} tags`)
  console.log(`  category locales seen per slug: avg ${avgLocales(mergedCategories).toFixed(2)}`)
  console.log(`  tag      locales seen per slug: avg ${avgLocales(mergedTags).toFixed(2)}`)

  const client = await getPayloadClient()

  console.log('\n→ Categories')
  const catMap = await migrateCollection(client, 'categories', mergedCategories)

  console.log('\n→ Tags')
  const tagMap = await migrateCollection(client, 'tags', mergedTags)

  const outPath = resolve(OUT_DIR, 'taxonomy-id-map.json')
  writeFileSync(
    outPath,
    JSON.stringify({ categories: catMap, tags: tagMap, dry_run: isDryRun() }, null, 2),
  )
  console.log(`\n✓ Wrote ${outPath}`)
}

function avgLocales(terms) {
  if (!terms.length) return 0
  return terms.reduce((n, t) => n + Object.keys(t.names).length, 0) / terms.length
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
