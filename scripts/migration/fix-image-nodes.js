#!/usr/bin/env node
/**
 * fix-image-nodes.js
 *
 * One-time migration: converts "Image reference (r2://...)" text paragraphs
 * stored in posts_locales.content back into proper upload-like nodes with
 * real HTTPS URLs, using the Payload REST API.
 *
 * Run: node fix-image-nodes.js
 */

import { readFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '.env') })

const PAYLOAD_API_URL = (process.env.PAYLOAD_API_URL || 'https://tripcanvas-cms.academyt.workers.dev/api').replace(/\/$/, '')
const PAYLOAD_EMAIL = process.env.PAYLOAD_EMAIL
const PAYLOAD_PASSWORD = process.env.PAYLOAD_PASSWORD
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || 'https://pub-2faca0649c2047a1859536a3114d3f95.r2.dev').replace(/\/$/, '')
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const LOCALES = ['en', 'my', 'id', 'th']
const LIMIT = 100

const R2_PARA_RE = /^(Image[^(]*) \(r2:\/\/([^)]+)\)$/

function r2ToHttps(r2Url) {
  if (r2Url.startsWith('r2://')) {
    const withoutScheme = r2Url.slice('r2://'.length)
    const slash = withoutScheme.indexOf('/')
    const key = slash >= 0 ? withoutScheme.slice(slash + 1) : withoutScheme
    return `${R2_PUBLIC_URL}/${key}`
  }
  return r2Url
}

function fixNode(node) {
  if (!node || typeof node !== 'object') return { node, changed: false }

  if (node.type === 'paragraph') {
    const children = Array.isArray(node.children) ? node.children : []
    const rawText = children
      .map(c => (c.type === 'text' ? (c.text ?? '') : ''))
      .join('')
    const m = R2_PARA_RE.exec(rawText)
    if (m) {
      const altLabel = m[1].startsWith('Image:') ? m[1].slice('Image:'.length).trim() : ''
      const httpsUrl = r2ToHttps(`r2://${m[2]}`)
      return {
        node: { type: 'upload', version: 1, relationTo: 'media', value: { url: httpsUrl, alt: altLabel } },
        changed: true,
      }
    }
  }

  if (Array.isArray(node.children)) {
    let anyChanged = false
    const newChildren = node.children.map(child => {
      const { node: n, changed } = fixNode(child)
      if (changed) anyChanged = true
      return n
    })
    if (anyChanged) return { node: { ...node, children: newChildren }, changed: true }
  }

  return { node, changed: false }
}

function fixLexicalContent(content) {
  if (!content || typeof content !== 'object') return { content, changed: false }
  const root = content.root
  if (!root) return { content, changed: false }
  const { node: newRoot, changed } = fixNode(root)
  if (!changed) return { content, changed: false }
  return { content: { ...content, root: newRoot }, changed: true }
}

async function login() {
  const res = await fetch(`${PAYLOAD_API_URL}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: PAYLOAD_EMAIL, password: PAYLOAD_PASSWORD }),
  })
  const data = await res.json()
  if (!data.token) throw new Error(`Login failed: ${JSON.stringify(data)}`)
  return data.token
}

async function fetchPostsPage(locale, page, token) {
  const params = new URLSearchParams({
    locale,
    limit: String(LIMIT),
    page: String(page),
    depth: '0',
    'where[title][exists]': 'true',
  })
  const res = await fetch(`${PAYLOAD_API_URL}/posts?${params}`, {
    headers: { Authorization: `JWT ${token}` },
  })
  return res.json()
}

async function updatePost(id, locale, content, token) {
  const res = await fetch(`${PAYLOAD_API_URL}/posts/${id}?locale=${locale}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `JWT ${token}`,
    },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PATCH ${id} ${locale} failed ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

async function main() {
  console.log(`DRY_RUN=${DRY_RUN}  API=${PAYLOAD_API_URL}  R2=${R2_PUBLIC_URL}`)

  if (!PAYLOAD_EMAIL || !PAYLOAD_PASSWORD) {
    throw new Error('PAYLOAD_EMAIL and PAYLOAD_PASSWORD must be set in .env')
  }

  const token = await login()
  console.log('Logged in.')

  let totalPosts = 0, totalFixed = 0, totalNodes = 0

  for (const locale of LOCALES) {
    let page = 1, hasMore = true
    while (hasMore) {
      const data = await fetchPostsPage(locale, page, token)
      const docs = data.docs ?? []
      hasMore = page < (data.totalPages ?? 1)
      page++

      for (const post of docs) {
        totalPosts++
        const { content, changed } = fixLexicalContent(post.content)
        if (!changed) continue

        // count replaced nodes
        let cnt = 0
        const countUploads = (n) => {
          if (n.type === 'upload' && n.value?.url?.startsWith('https://pub-')) cnt++
          if (Array.isArray(n.children)) n.children.forEach(countUploads)
        }
        if (content?.root) countUploads(content.root)
        totalNodes += cnt

        if (DRY_RUN) {
          console.log(`[DRY] locale=${locale} id=${post.id} slug=${post.slug} images=${cnt}`)
        } else {
          await updatePost(post.id, locale, content, token)
          console.log(`FIXED locale=${locale} id=${post.id} slug=${post.slug} images=${cnt}`)
        }
        totalFixed++
      }
    }
    console.log(`locale=${locale} done.`)
  }

  console.log(`\nSummary: scanned=${totalPosts} posts_with_changes=${totalFixed} image_nodes_converted=${totalNodes}`)
  if (DRY_RUN) console.log('(dry run — no writes performed)')
}

main().catch(err => { console.error(err); process.exit(1) })
