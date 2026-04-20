// Minimal HTML → Lexical converter for migration purposes.
//
// Produces a Lexical editor state matching the shape consumed by
// `apps/frontend/src/lib/lexical.ts`. Covers the node types Payload's
// default lexicalEditor() accepts and that the frontend renders:
//   root, paragraph, heading (h1..h6), quote, list/listitem (ul/ol),
//   link, text (with bold/italic/underline/strikethrough/code format bits),
//   linebreak, horizontalrule.
//
// Images (<img>) are emitted as `upload` nodes with a placeholder
// `value: { wp_url: '...', alt, width, height }`. The media-migration
// step will later rewrite these to real { relationTo: 'media', value: <id> }.
//
// Limitations (acceptable for dry-run fidelity):
// - Nested inline formatting beyond 1 level collapses to the outermost tag.
// - <table>/<iframe>/<video> become paragraphs with their text content.
// - Scripts and style blocks are dropped.

import { JSDOM } from 'jsdom'

const FORMAT = {
  BOLD: 1,
  ITALIC: 2,
  STRIKETHROUGH: 4,
  UNDERLINE: 8,
  CODE: 16,
  SUBSCRIPT: 32,
  SUPERSCRIPT: 64,
}

function normalizeLinkUrl(raw) {
  const url = (raw || '')
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
    .trim()
  if (!url) return null
  if (/\s/.test(url)) return null

  const lower = url.toLowerCase()
  if (lower.startsWith('javascript:') || lower.startsWith('data:')) return null

  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:') || lower.startsWith('tel:')) {
    return url
  }

  return null
}

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'aside', 'header', 'footer', 'main',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'hr',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'figure', 'figcaption',
])

function mkRoot(children) {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children,
    },
  }
}

function mkText(text, format = 0) {
  return {
    type: 'text',
    version: 1,
    detail: 0,
    mode: 'normal',
    style: '',
    format,
    text,
  }
}

function mkParagraph(children) {
  return {
    type: 'paragraph',
    version: 1,
    format: '',
    indent: 0,
    direction: 'ltr',
    children: children.length ? children : [mkText('')],
  }
}

function mkHeading(tag, children) {
  return {
    type: 'heading',
    version: 1,
    tag,
    format: '',
    indent: 0,
    direction: 'ltr',
    children,
  }
}

function mkQuote(children) {
  return {
    type: 'quote',
    version: 1,
    format: '',
    indent: 0,
    direction: 'ltr',
    children,
  }
}

function mkList(listType, children) {
  return {
    type: 'list',
    version: 1,
    listType,
    start: 1,
    tag: listType === 'number' ? 'ol' : 'ul',
    format: '',
    indent: 0,
    direction: 'ltr',
    children,
  }
}

function mkListItem(children, value = 1) {
  return {
    type: 'listitem',
    version: 1,
    value,
    format: '',
    indent: 0,
    direction: 'ltr',
    children,
  }
}

function mkLink(url, newTab, children) {
  return {
    type: 'link',
    version: 3,
    format: '',
    indent: 0,
    direction: 'ltr',
    fields: {
      url,
      newTab: !!newTab,
      linkType: 'custom',
    },
    children,
  }
}

function mkLineBreak() {
  return { type: 'linebreak', version: 1 }
}

function mkHorizontalRule() {
  return { type: 'horizontalrule', version: 1 }
}

function mkUploadPlaceholder({ src, alt, width, height }) {
  // Payload `upload` nodes normally look like:
  //   { type: 'upload', relationTo: 'media', value: <mediaId>, fields: {} }
  // We don't have a media id yet. Emit a `placeholder` node type that carries
  // the wp URL so the later media-rewrite step can resolve it without another
  // HTML parse. The frontend lexical.ts renderer falls through to children
  // for unknown types, so this is benign until rewritten.
  return {
    type: 'placeholder-image',
    version: 1,
    wp_url: src,
    alt: alt || '',
    width: width || null,
    height: height || null,
    children: [],
  }
}

function inlineFormatForTag(tag) {
  switch (tag) {
    case 'strong':
    case 'b':
      return FORMAT.BOLD
    case 'em':
    case 'i':
      return FORMAT.ITALIC
    case 'u':
      return FORMAT.UNDERLINE
    case 's':
    case 'del':
    case 'strike':
      return FORMAT.STRIKETHROUGH
    case 'code':
      return FORMAT.CODE
    case 'sub':
      return FORMAT.SUBSCRIPT
    case 'sup':
      return FORMAT.SUPERSCRIPT
    default:
      return 0
  }
}

/**
 * Convert a DOM node's children into Lexical inline nodes (text, link, linebreak, upload).
 * Inline formats accumulate via `format` bitmask.
 */
function collectInline(node, format = 0) {
  const out = []
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      // text
      const t = child.nodeValue || ''
      if (t) out.push(mkText(t, format))
      continue
    }
    if (child.nodeType !== 1) continue

    const tag = child.tagName.toLowerCase()

    if (tag === 'br') {
      out.push(mkLineBreak())
      continue
    }
    if (tag === 'img') {
      out.push(
        mkUploadPlaceholder({
          src: child.getAttribute('src') || '',
          alt: child.getAttribute('alt') || '',
          width: parseInt(child.getAttribute('width'), 10) || null,
          height: parseInt(child.getAttribute('height'), 10) || null,
        }),
      )
      continue
    }
    if (tag === 'a') {
      const url = normalizeLinkUrl(child.getAttribute('href'))
      const newTab = (child.getAttribute('target') || '').toLowerCase() === '_blank'
      const inner = collectInline(child, format)
      if (url) {
        out.push(mkLink(url, newTab, inner.length ? inner : [mkText('')]))
      } else {
        out.push(...(inner.length ? inner : [mkText('')]))
      }
      continue
    }

    const addFormat = inlineFormatForTag(tag)
    if (addFormat !== 0) {
      out.push(...collectInline(child, format | addFormat))
      continue
    }

    if (BLOCK_TAGS.has(tag)) {
      // Block element nested inside inline context — flatten its text.
      out.push(...collectInline(child, format))
      continue
    }

    // Unknown inline tag — flatten children.
    out.push(...collectInline(child, format))
  }
  return out
}

function convertList(node) {
  const listType = node.tagName.toLowerCase() === 'ol' ? 'number' : 'bullet'
  const items = []
  let idx = 1
  for (const li of node.children) {
    if (li.tagName.toLowerCase() !== 'li') continue
    items.push(mkListItem(collectInline(li), idx++))
  }
  return mkList(listType, items)
}

function convertBlock(node) {
  const tag = node.tagName.toLowerCase()

  if (/^h[1-6]$/.test(tag)) {
    return mkHeading(tag, collectInline(node))
  }
  if (tag === 'blockquote') {
    return mkQuote(collectInline(node))
  }
  if (tag === 'ul' || tag === 'ol') {
    return convertList(node)
  }
  if (tag === 'hr') {
    return mkHorizontalRule()
  }
  if (tag === 'figure') {
    // Usually <figure><img/></figure> or <figure><img/><figcaption/></figure>.
    // Emit the upload node plus an optional caption paragraph.
    const out = []
    for (const c of node.children) {
      const ct = c.tagName.toLowerCase()
      if (ct === 'img') {
        out.push(
          mkUploadPlaceholder({
            src: c.getAttribute('src') || '',
            alt: c.getAttribute('alt') || '',
            width: parseInt(c.getAttribute('width'), 10) || null,
            height: parseInt(c.getAttribute('height'), 10) || null,
          }),
        )
      } else if (ct === 'figcaption') {
        const children = collectInline(c)
        if (children.length) out.push(mkParagraph(children))
      }
    }
    // Figure becomes multiple top-level nodes; caller unwraps.
    return out.length === 1 ? out[0] : { __multi: out }
  }
  if (tag === 'pre') {
    // Treat as paragraph with code format on text children.
    const children = collectInline(node, FORMAT.CODE)
    return mkParagraph(children)
  }

  // Default: paragraph of its inline content.
  return mkParagraph(collectInline(node))
}

export function htmlToLexical(html) {
  const safe = (html ?? '').trim()
  if (!safe) return mkRoot([mkParagraph([])])

  const dom = new JSDOM(`<!doctype html><html><body>${safe}</body></html>`)
  const body = dom.window.document.body

  const out = []
  for (const child of body.childNodes) {
    if (child.nodeType === 3) {
      const t = child.nodeValue?.trim()
      if (t) out.push(mkParagraph([mkText(t)]))
      continue
    }
    if (child.nodeType !== 1) continue
    const tag = child.tagName.toLowerCase()

    // Script/style/noscript dropped entirely.
    if (tag === 'script' || tag === 'style' || tag === 'noscript') continue

    if (BLOCK_TAGS.has(tag)) {
      const node = convertBlock(child)
      if (node && node.__multi) {
        out.push(...node.__multi)
      } else if (node) {
        out.push(node)
      }
    } else {
      // Top-level inline element — wrap in paragraph.
      const inline = collectInline(child)
      if (inline.length) out.push(mkParagraph(inline))
    }
  }

  if (out.length === 0) out.push(mkParagraph([]))
  return mkRoot(out)
}
