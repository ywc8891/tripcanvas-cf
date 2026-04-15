import { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    adminThumbnail: 'url',
  },
  access: { read: () => true },
  fields: [
    {
      name: 'alt',
      type: 'text',
      localized: true,
      admin: { description: 'Describe the image for screen readers and SEO.' },
    },
    { name: 'caption', type: 'text', localized: true },
    {
      name: 'width',
      type: 'number',
      admin: { description: 'Original image width in pixels' },
    },
    {
      name: 'height',
      type: 'number',
      admin: { description: 'Original image height in pixels' },
    },
    { name: 'wpId', type: 'number', admin: { readOnly: true } },
  ],
}