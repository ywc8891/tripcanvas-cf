#!/usr/bin/env node

import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getPayloadClient, isDryRun } from './lib/payload-client.js'
import { LOCALES } from './lib/exports.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '.env') })

function textNode(text) {
  return {
    type: 'text',
    version: 1,
    detail: 0,
    mode: 'normal',
    style: '',
    format: 0,
    text,
  }
}

function paragraphNode(children) {
  return {
    type: 'paragraph',
    version: 1,
    format: '',
    indent: 0,
    direction: 'ltr',
    children,
  }
}

function sanitizeChildren(children) {
  if (!Array.isArray(children)) return []

  const out = []
  for (const child of children) {
    if (!child || typeof child !== 'object') continue

    if (child.type === 'placeholder-image') {
      const url = typeof child.wp_url === 'string' ? child.wp_url : ''
      const alt = typeof child.alt === 'string' ? child.alt.trim() : ''
      if (url) {
        const label = alt ? `Image: ${alt}` : 'Image reference'
        out.push(paragraphNode([textNode(label), textNode(` (${url})`)]))
      }
      continue
    }

    const next = { ...child }
    if (Array.isArray(child.children)) {
      next.children = sanitizeChildren(child.children)
    }
    out.push(next)
  }

  return out
}

function sanitizeLexicalState(value) {
  if (!value || typeof value !== 'object') return value
  if (!value.root || typeof value.root !== 'object') return value

  return {
    ...value,
    root: {
      ...value.root,
      children: sanitizeChildren(value.root.children),
    },
  }
}

function countPlaceholderImages(value) {
  let n = 0

  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'placeholder-image') n++
    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child)
    }
  }

  walk(value?.root)
  return n
}

async function main() {
  console.log(`Fix placeholder-image nodes (dry_run=${isDryRun()})`)

  const client = await getPayloadClient()
  const limit = 100
  let page = 1

  let totalDocs = 0
  let totalLocalesPatched = 0
  let totalPlaceholderBefore = 0

  while (true) {
    const res = await client.find('posts', {
      locale: 'all',
      depth: 0,
      page,
      limit,
      draft: true,
    })

    const docs = res.docs || []
    if (docs.length === 0) break

    for (const doc of docs) {
      totalDocs++
      const localizedContent = doc.content && typeof doc.content === 'object' ? doc.content : null
      if (!localizedContent) continue

      for (const locale of LOCALES) {
        const current = localizedContent[locale]
        if (!current) continue

        const before = countPlaceholderImages(current)
        if (before === 0) continue

        const sanitized = sanitizeLexicalState(current)
        const after = countPlaceholderImages(sanitized)

        totalPlaceholderBefore += before
        if (after === before) continue

        await client.update('posts', doc.id, { content: sanitized }, { locale })
        totalLocalesPatched++
      }
    }

    if (!res.hasNextPage) break
    page += 1
    console.log(`  processed page ${page - 1}/${res.totalPages || '?'} (docs=${totalDocs}, locales patched=${totalLocalesPatched})`)
  }

  console.log('\nSummary:')
  console.log(`  docs scanned: ${totalDocs}`)
  console.log(`  locale patches: ${totalLocalesPatched}`)
  console.log(`  placeholder-image nodes seen before patch: ${totalPlaceholderBefore}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
