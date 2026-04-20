import { CollectionConfig } from 'payload'

const LOCALES = ['en', 'my', 'id', 'th'] as const

type LexicalNode = {
  type?: string
  version?: number
  format?: number | string
  indent?: number
  direction?: string | null
  children?: LexicalNode[]
  [key: string]: unknown
}

function textNode(text: string): LexicalNode {
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

function paragraphNode(children: LexicalNode[]): LexicalNode {
  return {
    type: 'paragraph',
    version: 1,
    format: '',
    indent: 0,
    direction: 'ltr',
    children,
  }
}

function sanitizeChildren(children: unknown): LexicalNode[] {
  if (!Array.isArray(children)) return []

  const out: LexicalNode[] = []

  for (const child of children) {
    if (!child || typeof child !== 'object') continue
    const node = child as LexicalNode

    if (node.type === 'placeholder-image') {
      const url = typeof node.wp_url === 'string' ? node.wp_url : ''
      const alt = typeof node.alt === 'string' ? node.alt.trim() : ''

      if (url) {
        const label = alt ? `Image: ${alt}` : 'Image reference'
        out.push(paragraphNode([textNode(label), textNode(` (${url})`)]))
      }

      continue
    }

    const nextNode: LexicalNode = { ...node }
    if (Array.isArray(node.children)) {
      nextNode.children = sanitizeChildren(node.children)
    }

    out.push(nextNode)
  }

  return out
}

function sanitizeLexicalState(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value

  const data = value as { root?: LexicalNode }
  if (!data.root || typeof data.root !== 'object') return value

  const root = data.root
  return {
    ...data,
    root: {
      ...root,
      children: sanitizeChildren(root.children),
    },
  }
}

function sanitizeLocalizedLexical(value: unknown): unknown {
  if (!value || typeof value !== 'object') return sanitizeLexicalState(value)

  const data = value as Record<string, unknown>
  const hasLocalizedShape = LOCALES.some((locale) => locale in data)

  if (!hasLocalizedShape) {
    return sanitizeLexicalState(value)
  }

  const next: Record<string, unknown> = { ...data }
  for (const locale of LOCALES) {
    if (locale in next) {
      next[locale] = sanitizeLexicalState(next[locale])
    }
  }

  return next
}

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'slug',
    defaultColumns: ['slug', 'title', 'locale', 'status', 'publishedAt'],
    description: 'Travel articles and guides',
  },
  access: {
    read: () => true,
  },
  versions: {
    drafts: true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: { description: 'URL-friendly identifier' },
    },
    {
      name: 'content',
      type: 'richText',
      localized: true,
      hooks: {
        beforeChange: [
          ({ value }) => sanitizeLocalizedLexical(value),
        ],
        afterRead: [
          ({ value }) => sanitizeLocalizedLexical(value),
        ],
      },
    },
    {
      name: 'excerpt',
      type: 'textarea',
      localized: true,
    },
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: { position: 'sidebar' },
    },
    {
      name: 'seo',
      type: 'group',
      localized: true,
      fields: [
        { name: 'title', type: 'text' },
        { name: 'description', type: 'textarea' },
      ],
    },
    {
      name: 'wpId',
      type: 'number',
      admin: { readOnly: true },
    },
  ],
}
