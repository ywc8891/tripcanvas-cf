import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  fields: [
    {
      name: 'role',
      type: 'select',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
      ],
      defaultValue: 'editor',
      required: true,
      saveToJWT: true,
    },
    {
      name: 'allowedMarkets',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'English (Hub)', value: 'en' },
        { label: 'Malaysia', value: 'my' },
        { label: 'Indonesia', value: 'id' },
        { label: 'Thailand', value: 'th' },
      ],
      saveToJWT: true,
      admin: {
        description: 'Markets this user can manage. Admin role overrides this.',
      },
    },
  ],
}
