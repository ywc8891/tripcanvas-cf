import path from 'path'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { r2Storage } from '@payloadcms/storage-r2'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Posts } from './collections/Posts'
import { Categories } from './collections/Categories'
import { Tags } from './collections/Tags'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Categories, Tags, Media, Posts],
  editor: lexicalEditor(),
  
  localization: {
    locales: [
      { label: 'English (Global)', code: 'en' },
      { label: 'Malaysia', code: 'my' },
      { label: 'Indonesia', code: 'id' },
      { label: 'Thailand', code: 'th' },
    ],
    defaultLocale: 'en',
    fallback: true,
  },

  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteD1Adapter({
    binding: process.env.CLOUDFLARE_D1_BINDING || 'D1',
  }),
  plugins: [
    r2Storage({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bucket: process.env.CLOUDFLARE_R2_BINDING as any || ('R2' as any),
      collections: { media: true },
    }),
  ],
})