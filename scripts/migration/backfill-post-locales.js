#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

import { getPayloadClient } from './lib/payload-client.js'
import { loadAllSites, LOCALES } from './lib/exports.js'
import { htmlToLexical } from './lib/html-to-lexical.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '.env') })

const MEDIA_URL_RE = /https?:\/\/[^\s"'<>]+\/wp-content\/uploads\/[^\s"'<>]+/gi
const LIMIT = parseInt(process.env.BACKFILL_LIMIT || '0', 10) || 0
const PAGE_SIZE = parseInt(process.env.BACKFILL_PAGE_SIZE || '100', 10) || 100
const TARGET_LOCALES = (process.env.BACKFILL_LOCALES || 'id,my')
  .split(',')
  .map((v) => v.trim())
  .filter((v) => v && LOCALES.includes(v))
const LIVE_MODE = process.argv.includes('--live')
const DRY_RUN_MODE = !LIVE_MODE

function normalizeSourceUrl(url) {
  try {
    const u = new URL(url)
    u.hash = ''
    return decodeURI(u.toString())
  } catch {
    return url
  }
}

function loadMediaUrlMap() {
  const path = resolve(__dirname, 'export', 'media-url-map.json')
  if (!existsSync(path)) {
    console.warn('⚠ media-url-map.json not found; content backfill will keep source media URLs')
    return {}
  }

  const json = JSON.parse(readFileSync(path, 'utf-8'))
  return json?.map || {}
}

function rewriteMediaUrlsInHtml(html, mediaUrlMap) {
  if (!html) return ''
  return html.replace(MEDIA_URL_RE, (rawUrl) => {
    const normalized = normalizeSourceUrl(rawUrl)
    return mediaUrlMap[normalized] || mediaUrlMap[rawUrl] || rawUrl
  })
}

function isBlankString(value) {
  return typeof value !== 'string' || value.trim().length === 0
}

function hasLexicalContent(value) {
  if (!value || typeof value !== 'object') return false
  const children = value?.root?.children
  return Array.isArray(children) && children.length > 0
}

function localizedValue(doc, field, locale) {
  const value = doc?.[field]
  if (!value || typeof value !== 'object') return value
  if (locale in value) return value[locale]
  return undefined
}

function buildSourceIndex(sites) {
  const index = {}

  for (const locale of TARGET_LOCALES) {
    const map = new Map()
    for (const post of sites[locale]?.posts || []) {
      if (!post?.slug) continue
      map.set(post.slug, post)
    }
    index[locale] = map
  }

  return index
}

async function main() {
  if (TARGET_LOCALES.length === 0) {
    throw new Error(`No valid BACKFILL_LOCALES provided. Allowed: ${LOCALES.join(', ')}`)
  }

  console.log(
    `Backfill post localized fields (mode=${DRY_RUN_MODE ? 'dry-run' : 'live'}, locales=${TARGET_LOCALES.join(',')}, limit=${LIMIT || 'none'})`,
  )

  const sites = loadAllSites()
  const sourceIndex = buildSourceIndex(sites)
  const mediaUrlMap = loadMediaUrlMap()
  const client = await getPayloadClient()

  const stats = {
    docsScanned: 0,
    localeScanned: 0,
    noSourceMatch: 0,
    localePatched: 0,
    titlePatched: 0,
    excerptPatched: 0,
    contentPatched: 0,
  }

  const samples = []
  let page = 1
  let remaining = LIMIT

  while (true) {
    const currentLimit = LIMIT > 0 ? Math.min(PAGE_SIZE, remaining) : PAGE_SIZE
    if (currentLimit <= 0) break

    const res = await client.find('posts', {
      locale: 'all',
      depth: 0,
      draft: true,
      page,
      limit: currentLimit,
    })

    const docs = res.docs || []
    if (docs.length === 0) break

    for (const doc of docs) {
      stats.docsScanned++

      for (const locale of TARGET_LOCALES) {
        stats.localeScanned++

        const source = sourceIndex[locale]?.get(doc.slug)
        if (!source) {
          stats.noSourceMatch++
          continue
        }

        const existingTitle = localizedValue(doc, 'title', locale)
        const existingExcerpt = localizedValue(doc, 'excerpt', locale)
        const existingContent = localizedValue(doc, 'content', locale)

        const patch = {}

        if (isBlankString(existingTitle)) {
          const sourceTitle = !isBlankString(source.title) ? source.title : doc.slug
          if (!isBlankString(sourceTitle)) {
            patch.title = sourceTitle
            stats.titlePatched++
          }
        }

        if (isBlankString(existingExcerpt) && !isBlankString(source.excerpt)) {
          patch.excerpt = source.excerpt
          stats.excerptPatched++
        }

        if (!hasLexicalContent(existingContent) && !isBlankString(source.content)) {
          patch.content = htmlToLexical(rewriteMediaUrlsInHtml(source.content, mediaUrlMap))
          stats.contentPatched++
        }

        if (Object.keys(patch).length === 0) continue

        stats.localePatched++

        if (samples.length < 20) {
          samples.push({
            slug: doc.slug,
            locale,
            fields: Object.keys(patch),
          })
        }

        if (!DRY_RUN_MODE) {
          await client.update('posts', doc.id, patch, { locale })
        }
      }
    }

    if (LIMIT > 0) {
      remaining -= docs.length
      if (remaining <= 0) break
    }

    if (!res.hasNextPage) break
    page += 1

    if (page % 3 === 0) {
      console.log(`  progress: page=${page - 1}, docs=${stats.docsScanned}, locale patches=${stats.localePatched}`)
    }
  }

  console.log('\nSummary')
  console.log(`  docs scanned:       ${stats.docsScanned}`)
  console.log(`  locale rows checked:${stats.localeScanned}`)
  console.log(`  no source match:    ${stats.noSourceMatch}`)
  console.log(`  locale patches:     ${stats.localePatched}`)
  console.log(`  title patches:      ${stats.titlePatched}`)
  console.log(`  excerpt patches:    ${stats.excerptPatched}`)
  console.log(`  content patches:    ${stats.contentPatched}`)

  if (samples.length > 0) {
    console.log('\nSample patches')
    for (const sample of samples) {
      console.log(`  - ${sample.slug} [${sample.locale}] -> ${sample.fields.join(', ')}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
