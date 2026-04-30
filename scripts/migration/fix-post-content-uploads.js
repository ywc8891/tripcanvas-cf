#!/usr/bin/env node
/**
 * Phase 2: Transform post content to use proper upload nodes.
 *
 * Reads each post's Lexical content from the CMS API, replaces:
 *   - placeholder-image nodes → upload nodes with Media document IDs
 *   - r2:// text paragraphs    → upload nodes with Media document IDs
 *
 * Usage:
 *   node fix-post-content-uploads.js              # dry-run (shows changes)
 *   node fix-post-content-uploads.js --live       # applies changes via API
 *   node fix-post-content-uploads.js --live --locale=zh  # only process zh locale
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { getPayloadClient } from './lib/payload-client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '.env') })

const LIVE = process.argv.includes('--live')
const DRY_RUN = !LIVE
const LOCALE_ARG = process.argv.find(a => a.startsWith('--locale='))
const TARGET_LOCALE = LOCALE_ARG ? LOCALE_ARG.split('=')[1] : null

const R2_PUBLIC = 'https://pub-2faca0649c2047a1859536a3114d3f95.r2.dev/'
const R2_SCHEME = 'r2://tripcanvas-media/'
const R2_PARA_RE = /^(?:Image:\s*)?(.+?)\s*\((?:r2:\/\/[^/]+\/|https:\/\/pub-[a-f0-9]+\.r2\.dev\/)([^)]+)\)\s*$/

// Load media ID mapping
const mediaMapPath = resolve(__dirname, 'export', 'media-id-map.json')
const mediaMap = JSON.parse(readFileSync(mediaMapPath, 'utf-8'))
const urlToId = mediaMap.urlToId || {}
const r2ToId = mediaMap.r2ToId || {}

// Also index by path for flexible lookup
const pathToId = {}
for (const [url, id] of Object.entries(urlToId)) {
  if (url.startsWith(R2_PUBLIC)) {
    pathToId[url.slice(R2_PUBLIC.length)] = id
  }
}

function lookupMediaId(url) {
  if (!url) return null
  // Direct URL match
  if (urlToId[url]) return urlToId[url]
  if (r2ToId[url]) return r2ToId[url]
  // Convert r2:// to https and try
  if (url.startsWith('r2://')) {
    const path = url.replace(/^r2:\/\/[^/]+\//, '')
    if (pathToId[path]) return pathToId[path]
    const httpsUrl = `${R2_PUBLIC}${path}`
    if (urlToId[httpsUrl]) return urlToId[httpsUrl]
  }
  // Convert https to path and try
  if (url.startsWith(R2_PUBLIC)) {
    const path = url.slice(R2_PUBLIC.length)
    if (pathToId[path]) return pathToId[path]
  }
  return null
}

function makeUploadNode(mediaId) {
  return {
    type: 'upload',
    version: 3,
    format: '',
    indent: 0,
    direction: null,
    relationTo: 'media',
    value: mediaId,
    fields: null,
  }
}

function transformChildren(children) {
  if (!Array.isArray(children)) return { children: children || [], changed: false }

  const out = []
  let changed = false

  for (const node of children) {
    if (!node || typeof node !== 'object') {
      out.push(node)
      continue
    }

    // 1. placeholder-image → upload
    if (node.type === 'placeholder-image') {
      const url = node.wp_url || ''
      const mediaId = lookupMediaId(url)
      if (mediaId) {
        out.push(makeUploadNode(mediaId))
        changed = true
        continue
      }
      // If no media ID, convert to a paragraph with the URL as text
      out.push(node)
      continue
    }

    // 2. paragraph containing only an r2:// or R2 image URL as text
    if (node.type === 'paragraph') {
      const textContent = extractTextContent(node.children)
      const m = R2_PARA_RE.exec(textContent.trim())
      if (m) {
        const path = m[2]
        const mediaId = pathToId[path] || lookupMediaId(`${R2_PUBLIC}${path}`) || lookupMediaId(`r2://tripcanvas-media/${path}`)
        if (mediaId) {
          out.push(makeUploadNode(mediaId))
          changed = true
          continue
        }
      }
    }

    // 3. Recurse into children
    const nextNode = { ...node }
    if (Array.isArray(node.children)) {
      const result = transformChildren(node.children)
      if (result.changed) {
        nextNode.children = result.children
        changed = true
      }
    }
    out.push(nextNode)
  }

  return { children: out, changed }
}

function extractTextContent(children) {
  if (!Array.isArray(children)) return ''
  return children.map(c => {
    if (typeof c === 'string') return c
    if (c?.text) return c.text
    if (c?.children) return extractTextContent(c.children)
    return ''
  }).join('')
}

function transformContent(content) {
  if (!content || typeof content !== 'object') return { content, changed: false }
  const root = content.root
  if (!root || !Array.isArray(root.children)) return { content, changed: false }

  const result = transformChildren(root.children)
  if (!result.changed) return { content, changed: false }

  return {
    content: { ...content, root: { ...root, children: result.children } },
    changed: true,
  }
}

async function main() {
  console.log(`Media ID mapping: ${Object.keys(urlToId).length} URLs, ${Object.keys(pathToId).length} paths`)
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`)
  if (TARGET_LOCALE) console.log(`Target locale: ${TARGET_LOCALE}`)

  const client = await getPayloadClient()
  const locales = TARGET_LOCALE ? [TARGET_LOCALE] : ['en', 'my', 'id', 'th', 'zh']

  let totalPosts = 0
  let totalChanged = 0
  let totalNodes = 0

  for (const locale of locales) {
    console.log(`\nProcessing locale: ${locale}`)
    let page = 1
    let hasMore = true

    while (hasMore) {
      const result = await client.find('posts', {
        locale,
        'fallback-locale': 'none',
        depth: 0,
        limit: 20,
        page,
        sort: 'id',
      })

      const posts = result?.docs || []
      if (posts.length === 0) break

      for (const post of posts) {
        totalPosts++
        const content = post.content
        if (!content || !content.root) continue

        const { content: newContent, changed } = transformContent(content)
        if (!changed) continue

        totalChanged++
        // Count nodes changed
        const origNodes = JSON.stringify(content).length
        const newNodes = JSON.stringify(newContent).length
        const diff = origNodes - newNodes

        console.log(`  ${post.slug} [${locale}]: content transformed (${diff > 0 ? '-' : '+'}${Math.abs(diff)} chars)`)

        if (!DRY_RUN) {
          try {
            await client.update('posts', post.id, { content: newContent }, { locale })
          } catch (err) {
            console.error(`    ✗ update failed:`, err.message?.slice(0, 200) || err)
          }
          // Small delay to avoid rate limits
          await new Promise(r => setTimeout(r, 300))
        }
      }

      hasMore = result?.hasNextPage ?? false
      page++
      // Delay between pages
      await new Promise(r => setTimeout(r, 500))
    }
  }

  console.log(`\n--- Summary ---`)
  console.log(`Posts checked: ${totalPosts}`)
  console.log(`Posts with content changes: ${totalChanged}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (no changes applied)' : 'LIVE (changes applied)'}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
