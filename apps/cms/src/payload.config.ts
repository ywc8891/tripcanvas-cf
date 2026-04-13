import { buildConfig } from 'payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || '',
  editor: lexicalEditor({}),
  
  // Localization — matches our 4 subdomains
  localization: {
    locales: [
      { label: 'English (Global)', code: 'en' },
      { label: 'Malaysia', code: 'my' },
      { label: 'Indonesia', code: 'id' },
      { label: 'Thailand', code: 'th' },
    ],
    defaultLocale: 'en',
    fallback: true, // fall back to 'en' if locale translation missing
  },

  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL || 'file:./dev.db',
    },
  }),

  collections: [
    // Import collection configs (created in Task 4)
    require('./collections/Posts').Posts,
    require('./collections/Categories').Categories,
    require('./collections/Tags').Tags,
    require('./collections/Media').Media,
    require('./collections/Authors').Authors,
  ],

  admin: {
    user: 'authors',
  },
})
