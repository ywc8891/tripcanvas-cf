import { CollectionConfig } from 'payload'

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'locale', 'status', 'publishedAt'],
    description: 'Travel articles and guides',
  },
  access: {
    read: () => true, // public read
  },
  versions: {
    drafts: true, // enable draft/publish workflow
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
      admin: { description: 'URL-friendly identifier. Auto-generated from title.' },
    },
    {
      name: 'content',
      type: 'richText',
      localized: true,
    },
    {
      name: 'excerpt',
      type: 'textarea',
      localized: true,
      admin: { description: 'Short summary shown in post listings.' },
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
      relationTo: 'authors',
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
      admin: { description: 'SEO metadata' },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'description', type: 'textarea' },
      ],
    },
    // Preserve original WordPress ID for migration matching
    {
      name: 'wpId',
      type: 'number',
      admin: { description: 'Original WordPress post ID (migration reference)', readOnly: true },
    },
  ],
}
