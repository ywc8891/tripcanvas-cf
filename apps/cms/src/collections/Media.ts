import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'url', 'mimeType', 'filesize'],
  },
  upload: {
    crop: false,
    imageSizes: [
      {
        name: 'thumbnail',
        width: 400,
        height: 300,
        position: 'centre',
      },
      {
        name: 'medium',
        width: 800,
        height: 600,
        position: 'centre',
      },
      {
        name: 'large',
        width: 1200,
        height: 900,
        position: 'centre',
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      admin: {
        description: 'Alternative text for accessibility',
      },
    },
    {
      name: 'caption',
      type: 'textarea',
      admin: {
        description: 'Caption displayed below the image',
      },
    },
    {
      name: 'wp_id',
      type: 'number',
      admin: {
        readOnly: true,
        description: 'Original WordPress attachment ID',
      },
    },
    {
      name: 'wp_original_url',
      type: 'text',
      admin: {
        readOnly: true,
        description: 'Original WordPress media URL',
      },
    },
  ],
}
