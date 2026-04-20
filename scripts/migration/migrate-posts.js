#!/usr/bin/env node
// Migrate WordPress posts → Payload CMS.
//
// Strategy:
// - Pool all 871 posts across the 4 locales and group by slug. Most slugs are
//   unique to one locale (~1 overlap between MY & ID), but the grouping
//   handles any cross-locale translations cleanly.
// - Each slug group → one Payload document:
//     * POST with ?locale=<primary>, title/content/excerpt set
//     * PATCH ?locale=<other> for each additional locale
//     * categories / tags resolved via export/taxonomy-id-map.json
//     * featuredImage left null (media pipeline is a separate phase)
//     * content: HTML → Lexical JSON
//     * slug collisions (different wp posts, same slug, different locales)
//       are handled by grouping. If two locales have the same slug but are
//       genuinely unrelated (not translations), the second locale's content
//       will overwrite the first on that slug — this is an acceptable
//       approximation for dry-run; verify.js reports these cases.
// - Writes export/post-id-map.json ({ "<locale>:<wp_id>": "<payload_id>" }).

import { writeFileSync, readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { getPayloadClient, isDryRun } from './lib/payload-client.js'
import { loadAllSites, LOCALES } from './lib/exports.js'
import { htmlToLexical } from './lib/html-to-lexical.js'

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env') })

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'export')
const POST_LIMIT = parseInt(process.env.POST_LIMIT || '0', 10) || 0
const MEDIA_URL_RE = /https?:\/\/[^\s"'<>]+\/wp-content\/uploads\/[^\s"'<>]+/gi

function loadTaxonomyIdMap() {
  const p = resolve(OUT_DIR, 'taxonomy-id-map.json')
  if (!existsSync(p)) {
    throw new Error(`Missing ${p}. Run \`pnpm migrate:taxonomies\` first.`)
  }
  return JSON.parse(readFileSync(p, 'utf-8'))
}

function loadMediaUrlMap() {
  const p = resolve(OUT_DIR, 'media-url-map.json')
  if (!existsSync(p)) {
    throw new Error(`Missing ${p}. Run \`pnpm migrate:media\` first.`)
  }
  const json = JSON.parse(readFileSync(p, 'utf-8'))
  return json?.map || {}
}

function normalizeSourceUrl(url) {
  try {
    const u = new URL(url)
    u.hash = ''
    return decodeURI(u.toString())
  } catch {
    return url
  }
}

function rewriteMediaUrlsInHtml(html, mediaUrlMap, stats) {
  if (!html) return ''
  let replaced = 0
  const output = html.replace(MEDIA_URL_RE, (rawUrl) => {
    const normalized = normalizeSourceUrl(rawUrl)
    const mapped = mediaUrlMap[normalized] || mediaUrlMap[rawUrl]
    if (!mapped) return rawUrl
    replaced++
    return mapped
  })
  stats.mediaUrlsReplaced += replaced
  return output
}

/**
 * Group WP posts across locales by slug.
 * Returns: [{ slug, locales: { en?: post, my?: post, ... }, wp_ids: [..] }]
 */
function groupBySlug(sites) {
  const bySlug = new Map()
  for (const locale of LOCALES) {
    for (const p of sites[locale].posts || []) {
      if (!p.slug) continue
      let g = bySlug.get(p.slug)
      if (!g) {
        g = { slug: p.slug, locales: {}, wp_ids: [] }
        bySlug.set(p.slug, g)
      }
      if (g.locales[locale]) {
        // Same locale, same slug — shouldn't happen (WP slugs unique per site).
        console.warn(`  ⚠ duplicate ${locale} slug: ${p.slug} (wp_ids ${g.locales[locale].wp_id}, ${p.wp_id})`)
      }
      g.locales[locale] = p
      g.wp_ids.push({ locale, wp_id: p.wp_id })
    }
  }
  return [...bySlug.values()]
}

function resolveTermIds(slugs, slugToId) {
  const ids = []
  const missing = []
  for (const s of slugs || []) {
    if (slugToId[s]) ids.push(slugToId[s])
    else missing.push(s)
  }
  return { ids, missing }
}

async function migrateOne(client, group, catMap, tagMap, mediaUrlMap, stats) {
  // Pick primary locale: first locale in LOCALES order that has a post in this group.
  const primaryLocale = LOCALES.find((l) => group.locales[l])
  if (!primaryLocale) return null
  const primaryPost = group.locales[primaryLocale]

  // Resolve relationships from the primary post's slugs (same slug set is
  // usually consistent across locales for a translated post; for non-translated
  // overlaps we accept the primary's).
  const { ids: categoryIds, missing: missingCats } = resolveTermIds(
    primaryPost.category_slugs,
    catMap,
  )
  const { ids: tagIds, missing: missingTags } = resolveTermIds(primaryPost.tag_slugs, tagMap)
  if (missingCats.length) stats.missingCategories.push(...missingCats)
  if (missingTags.length) stats.missingTags.push(...missingTags)

  // Check for existing doc by slug
  const existing = await client.find('posts', {
    where: { slug: { equals: group.slug } },
    limit: 1,
    depth: 0,
  })
  let doc = existing.docs?.[0]

  const baseData = {
    title: primaryPost.title || group.slug,
    slug: group.slug,
    content: htmlToLexical(rewriteMediaUrlsInHtml(primaryPost.content, mediaUrlMap, stats)),
    excerpt: primaryPost.excerpt || '',
    publishedAt: primaryPost.date || null,
    wpId: primaryPost.wp_id,
    categories: categoryIds,
    tags: tagIds,
  }

  if (!doc) {
    doc = await client.create('posts', baseData, { locale: primaryLocale })
    stats.created++
  } else {
    // Update primary locale fields (but don't touch wpId/slug on re-runs).
    await client.update('posts', doc.id, baseData, { locale: primaryLocale })
    stats.updated++
  }

  // Fill in remaining locales with localized fields only.
  for (const locale of LOCALES) {
    if (locale === primaryLocale) continue
    const lp = group.locales[locale]
    if (!lp) continue
    await client.update(
      'posts',
      doc.id,
      {
        title: lp.title || group.slug,
        content: htmlToLexical(rewriteMediaUrlsInHtml(lp.content, mediaUrlMap, stats)),
        excerpt: lp.excerpt || '',
      },
      { locale },
    )
    stats.localePatches++
  }

  // Track id mapping
  for (const { locale, wp_id } of group.wp_ids) {
    stats.idMap[`${locale}:${wp_id}`] = doc.id
  }
  return doc
}

async function main() {
  console.log(`Post migration (dry_run=${isDryRun()}, limit=${POST_LIMIT || 'none'})`)
  const sites = loadAllSites()
  const { categories: catMap, tags: tagMap } = loadTaxonomyIdMap()
  const mediaUrlMap = loadMediaUrlMap()

  const groups = groupBySlug(sites)
  console.log(
    `\nGrouped ${totalPosts(sites)} posts into ${groups.length} slug groups (overlap=${groups.filter((g) => Object.keys(g.locales).length > 1).length})`,
  )

  const toProcess = POST_LIMIT > 0 ? groups.slice(0, POST_LIMIT) : groups

  const client = await getPayloadClient()

  const stats = {
    created: 0,
    updated: 0,
    localePatches: 0,
    mediaUrlsReplaced: 0,
    missingCategories: [],
    missingTags: [],
    idMap: {},
  }

  let i = 0
  for (const group of toProcess) {
    i++
    const locales = Object.keys(group.locales).join(',')
    if (i % 50 === 0 || i === 1 || i === toProcess.length) {
      console.log(`  [${i}/${toProcess.length}] ${group.slug} (${locales})`)
    }
    try {
      await migrateOne(client, group, catMap, tagMap, mediaUrlMap, stats)
    } catch (err) {
      console.error(`  ✗ ${group.slug}: ${err.message}`)
      if (!isDryRun()) throw err
    }
  }

  console.log(`\nSummary:`)
  console.log(`  created:         ${stats.created}`)
  console.log(`  updated:         ${stats.updated}`)
  console.log(`  locale PATCHes:  ${stats.localePatches}`)
  console.log(`  media URL swaps: ${stats.mediaUrlsReplaced}`)
  console.log(`  missing cats:    ${new Set(stats.missingCategories).size} unique`)
  console.log(`  missing tags:    ${new Set(stats.missingTags).size} unique`)
  if (stats.missingCategories.length) {
    console.log(`    sample missing cats:`, [...new Set(stats.missingCategories)].slice(0, 10))
  }

  const outPath = resolve(OUT_DIR, 'post-id-map.json')
  writeFileSync(
    outPath,
    JSON.stringify({ idMap: stats.idMap, stats: { ...stats, idMap: undefined } }, null, 2),
  )
  console.log(`\n✓ Wrote ${outPath}`)
}

function totalPosts(sites) {
  return LOCALES.reduce((n, l) => n + (sites[l].posts?.length || 0), 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
