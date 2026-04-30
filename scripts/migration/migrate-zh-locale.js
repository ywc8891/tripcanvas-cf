#!/usr/bin/env node
/**
 * Populates the `zh` locale fields on existing Payload CMS post documents.
 *
 * Strategy: for each ZH post (from export/site-zh-v2.json), look up the
 * matching Payload document by slug. If found and the zh locale is blank,
 * PATCH title + excerpt + content with locale=zh.
 *
 * Run dry-run first:
 *   node migrate-zh-locale.js
 *
 * Then live:
 *   node migrate-zh-locale.js --live
 */

import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

import { getPayloadClient } from './lib/payload-client.js'
import { htmlToLexical } from './lib/html-to-lexical.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '.env') })

const LIVE_MODE = process.argv.includes('--live')
const FORCE = process.argv.includes('--force')
const CLEAR_FIRST = process.argv.includes('--clear-first')
const DRY_RUN = !LIVE_MODE

const MEDIA_URL_RE = /https?:\/\/[^\s"'<>]+\/wp-content\/uploads\/[^\s"'<>]+/gi
const PAGE_SIZE = 50

function loadMediaUrlMap() {
  const path = resolve(__dirname, 'export', 'media-url-map.json')
  if (!existsSync(path)) return {}
  const json = JSON.parse(readFileSync(path, 'utf-8'))
  return json?.map || {}
}

function rewriteMediaUrls(html, mediaUrlMap) {
  if (!html) return ''
  return html.replace(MEDIA_URL_RE, (url) => {
    try {
      const u = new URL(url)
      u.hash = ''
      const normalized = decodeURI(u.toString())
      return mediaUrlMap[normalized] || mediaUrlMap[url] || url
    } catch {
      return url
    }
  })
}

const R2_PUBLIC_URL = 'https://pub-2faca0649c2047a1859536a3114d3f95.r2.dev'
const R2_BUCKET = 'tripcanvas-media'

// Convert a placeholder-image node to r2:// text (used in text paragraphs).
// Returns a string like 'Image: alt (r2://bucket/path)' or null if URL can't be mapped.
function placeholderToR2Text(node) {
  const url = node.wp_url || ''
  if (!url.startsWith(R2_PUBLIC_URL + '/')) return null
  const r2Path = url.slice(R2_PUBLIC_URL.length + 1)
  const r2Url = `r2://${R2_BUCKET}/${r2Path}`
  const alt = (node.alt || '').trim()
  return alt ? `Image: ${alt} (${r2Url})` : `Image (${r2Url})`
}

function mkTextParagraph(text) {
  return {
    type: 'paragraph',
    version: 1,
    format: '',
    indent: 0,
    direction: 'ltr',
    children: [{ type: 'text', version: 1, detail: 0, mode: 'normal', style: '', format: 0, text }],
  }
}

// Recursively remove placeholder-image and upload from inline node trees.
function stripImagesFromInline(children) {
  if (!Array.isArray(children)) return []
  const out = []
  for (const k of children) {
    if (!k || typeof k !== 'object') continue
    if (k.type === 'placeholder-image' || k.type === 'upload') continue
    const next = { ...k }
    if (Array.isArray(k.children)) next.children = stripImagesFromInline(k.children)
    out.push(next)
  }
  return out
}

// Collect all top-level placeholder-images from a children array (for image-only links etc.)
function extractImages(children) {
  if (!Array.isArray(children)) return []
  return children.filter(k => k && k.type === 'placeholder-image')
}

// Strip upload nodes (require valid media IDs).
// Convert placeholder-image nodes to r2:// text paragraphs:
//   - Top-level placeholder-image → standalone text paragraph
//   - Paragraph whose children are all placeholder-images → replaced by text paragraphs
//   - Paragraph with only an image-link (a[href]>img) → extracted to text paragraphs
//   - placeholder-image anywhere else → recursively stripped (image lost, text preserved)
function sanitizeTopLevel(children) {
  if (!Array.isArray(children)) return []
  const out = []
  for (const child of children) {
    if (!child || typeof child !== 'object') continue
    if (child.type === 'upload') continue
    if (child.type === 'placeholder-image') {
      const text = placeholderToR2Text(child)
      if (text) out.push(mkTextParagraph(text))
      continue
    }
    if (child.type === 'paragraph') {
      const kids = Array.isArray(child.children) ? child.children : []
      // All direct children are images
      if (kids.length > 0 && kids.every(k => k.type === 'placeholder-image')) {
        for (const img of kids) {
          const text = placeholderToR2Text(img)
          if (text) out.push(mkTextParagraph(text))
        }
        continue
      }
      // Paragraph contains a link whose only children are images (image-link pattern: <a><img/></a>)
      if (kids.length > 0 && kids.every(k => k.type === 'link' || k.type === 'placeholder-image')) {
        let allConverted = true
        for (const k of kids) {
          if (k.type === 'placeholder-image') {
            const text = placeholderToR2Text(k)
            if (text) out.push(mkTextParagraph(text))
          } else if (k.type === 'link') {
            const imgKids = extractImages(k.children || [])
            if (imgKids.length > 0 && imgKids.length === (k.children || []).length) {
              for (const img of imgKids) {
                const text = placeholderToR2Text(img)
                if (text) out.push(mkTextParagraph(text))
              }
            } else {
              allConverted = false
              break
            }
          }
        }
        if (allConverted) continue
      }
      // Mixed paragraph: recursively strip images from all children
      const cleaned = stripImagesFromInline(kids)
      const next = { ...child, children: cleaned.length > 0 ? cleaned : [{ type: 'text', version: 1, detail: 0, mode: 'normal', style: '', format: 0, text: '' }] }
      out.push(next)
      continue
    }
    // All other block nodes: recursively strip images from children
    const next = { ...child }
    if (Array.isArray(child.children)) next.children = stripImagesFromInline(child.children)
    out.push(next)
  }
  return out
}

function sanitizeLexical(lexical) {
  if (!lexical?.root) return lexical
  return { root: { ...lexical.root, children: sanitizeTopLevel(lexical.root.children) } }
}

function isBlank(v) {
  return typeof v !== 'string' || v.trim().length === 0
}

function hasLexicalContent(v) {
  return v && typeof v === 'object' && Array.isArray(v?.root?.children) && v.root.children.length > 0
}

function localizedValue(doc, field, locale) {
  const v = doc?.[field]
  if (!v || typeof v !== 'object') return v
  return locale in v ? v[locale] : undefined
}

async function main() {
  const exportPath = resolve(__dirname, 'export', 'site-zh-v2.json')
  if (!existsSync(exportPath)) {
    throw new Error(`Missing ${exportPath}. Run \`node export-zh-posts.js\` first.`)
  }

  const { posts: zhPosts } = JSON.parse(readFileSync(exportPath, 'utf-8'))
  console.log(`Loaded ${zhPosts.length} ZH source posts (${zhPosts.filter(p => p.market === 'my').length} MY, ${zhPosts.filter(p => p.market === 'th').length} TH)`)

  const mediaUrlMap = loadMediaUrlMap()
  const client = await getPayloadClient()

  const stats = {
    zhPostsTotal: zhPosts.length,
    notFoundInCms: 0,
    skippedAlreadyHasZh: 0,
    patched: 0,
    errors: 0,
  }
  const samples = []

  // --clear-first: wipe all zh content fields before re-importing (fixes posts with
  // corrupted upload nodes that block Payload validation on PATCH).
  if (CLEAR_FIRST && !DRY_RUN) {
    console.log('\n→ Pre-clearing zh content for all matching posts ...')
    const EMPTY_LEXICAL = { root: { type: 'root', format: '', indent: 0, version: 1, direction: 'ltr', children: [{ type: 'paragraph', version: 1, format: '', indent: 0, direction: 'ltr', children: [{ type: 'text', version: 1, detail: 0, mode: 'normal', style: '', format: 0, text: '' }] }] } }
    let cleared = 0
    for (const zhSource of zhPosts) {
      if (!zhSource.slug) continue
      try {
        const res = await client.find('posts', { locale: 'zh', depth: 0, where: { slug: { equals: zhSource.slug } }, limit: 1 })
        const doc = res.docs?.[0]
        if (!doc) continue
        await client.update('posts', doc.id, { content: EMPTY_LEXICAL, title: ' ' }, { locale: 'zh' })
        cleared++
      } catch { /* ignore */ }
    }
    console.log(`  ✓ cleared ${cleared} posts`)
  }

  // Iterate over each ZH source post and look up by slug individually.
  // This avoids expensive locale=all bulk pagination that exceeds CF Worker CPU limits.
  for (let i = 0; i < zhPosts.length; i++) {
    const zhSource = zhPosts[i]
    if (!zhSource.slug) continue

    if ((i + 1) % 20 === 0) {
      console.log(`  progress: ${i + 1}/${zhPosts.length}, patched=${stats.patched}`)
    }

    // Find Payload doc by slug
    let doc
    try {
      const res = await client.find('posts', {
        locale: 'zh',
        depth: 0,
        draft: true,
        where: { slug: { equals: zhSource.slug } },
        limit: 1,
      })
      doc = res.docs?.[0]
    } catch (err) {
      console.warn(`  ✗ slug lookup failed for "${zhSource.slug}": ${err.message}`)
      stats.errors++
      continue
    }

    if (!doc) {
      stats.notFoundInCms++
      continue
    }

    // In locale=zh query, fields are returned directly (not nested under locale key)
    const existingTitle = doc.title
    const existingContent = doc.content

    if (!FORCE && !isBlank(existingTitle) && hasLexicalContent(existingContent)) {
      stats.skippedAlreadyHasZh++
      continue
    }

    const patch = {}

    if ((FORCE || isBlank(existingTitle)) && !isBlank(zhSource.title)) {
      patch.title = zhSource.title
    }

    if ((FORCE || isBlank(doc.excerpt)) && !isBlank(zhSource.excerpt)) {
      patch.excerpt = zhSource.excerpt
    }

    if ((FORCE || !hasLexicalContent(existingContent)) && !isBlank(zhSource.content)) {
      const rewritten = rewriteMediaUrls(zhSource.content, mediaUrlMap)
      patch.content = sanitizeLexical(htmlToLexical(rewritten))
    }

    if (Object.keys(patch).length === 0) {
      stats.skippedAlreadyHasZh++
      continue
    }

    stats.patched++
    if (samples.length < 20) {
      samples.push({ slug: doc.slug, market: zhSource.market, fields: Object.keys(patch), title: patch.title || existingTitle })
    }

    if (!DRY_RUN) {
      try {
        await client.update('posts', doc.id, patch, { locale: 'zh' })
      } catch (err) {
        console.warn(`  ✗ update failed for "${zhSource.slug}": ${err.message}`)
        stats.errors++
      }
    }

    // Small pause between writes
    await new Promise((r) => setTimeout(r, 150))
  }

  console.log(`\nSummary (mode=${DRY_RUN ? 'dry-run' : 'live'})`)
  console.log(`  zh posts total:       ${stats.zhPostsTotal}`)
  console.log(`  not found in CMS:     ${stats.notFoundInCms}`)
  console.log(`  already had zh:       ${stats.skippedAlreadyHasZh}`)
  console.log(`  patched:              ${stats.patched}`)
  console.log(`  errors:               ${stats.errors}`)

  if (samples.length > 0) {
    console.log('\nSample patches:')
    for (const s of samples) {
      console.log(`  [${s.market}] ${s.slug} → ${s.fields.join(', ')} | "${String(s.title).slice(0, 60)}"`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
