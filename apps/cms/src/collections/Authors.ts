import { CollectionConfig } from 'payload'

export const Authors: CollectionConfig = {
  slug: 'authors',
  auth: true, // this collection handles authentication
  admin: { useAsTitle: 'email' },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'bio', type: 'textarea', localized: true },
    { name: 'avatar', type: 'upload', relationTo: 'media' },
    {
      name: 'role',
      type: 'select',
      options: ['admin', 'editor', 'writer'],
      defaultValue: 'writer',
    },
  ],
}
