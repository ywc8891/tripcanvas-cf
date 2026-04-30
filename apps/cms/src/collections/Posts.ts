import { CollectionConfig } from 'payload'
import { isAdmin, marketFilter, canAccessMarket } from '../access'

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'slug',
    defaultColumns: ['slug', 'title', 'locale', 'status', 'publishedAt'],
    description: 'Travel articles and guides',
    baseListFilter: ({ req: { user } }) => isAdmin(user as any) ? {} : marketFilter(user as any) as any,
  },
  access: {
    read: ({ req: { user } }) => {
      if (!user) return true
      return isAdmin(user as any) ? true : marketFilter(user as any)
    },
    create: ({ req: { user }, data }) => isAdmin(user as any) || (data?.market ? canAccessMarket(user as any, data.market as string) : false),
    update: ({ req: { user } }) => isAdmin(user as any) ? true : marketFilter(user as any),
    delete: ({ req: { user } }) => isAdmin(user as any),
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
      name: 'market',
      type: 'select',
      options: [
        { label: 'English (Hub)', value: 'en' },
        { label: 'Malaysia', value: 'my' },
        { label: 'Indonesia', value: 'id' },
        { label: 'Thailand', value: 'th' },
      ],
      admin: { position: 'sidebar', description: 'Which market this post belongs to' },
      hooks: {
        beforeChange: [
          ({ value, req: { user } }) => {
            const u = user as any;
            if (!value && u?.allowedMarkets?.length === 1) {
              return u.allowedMarkets[0];
            }
            return value;
          }
        ]
      }
    },
    {
      name: 'wpId',
      type: 'number',
      admin: { readOnly: true },
    },
  ],
}
