import fs from 'fs'
import path from 'path'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { CloudflareContext, getCloudflareContext } from '@opennextjs/cloudflare'
import { GetPlatformProxyOptions } from 'wrangler'
import { r2Storage } from '@payloadcms/storage-r2'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Posts } from './collections/Posts'
import { Categories } from './collections/Categories'
import { Tags } from './collections/Tags'
import { migrations } from './migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const realpath = (value: string) => (fs.existsSync(value) ? fs.realpathSync(value) : undefined)

const isCLI = process.argv.some((value) => realpath(value).endsWith(path.join('payload', 'bin.js')))
const isProduction = process.env.NODE_ENV === 'production'

const cloudflare =
  isCLI || !isProduction
    ? await getCloudflareContextFromWrangler()
    : await getCloudflareContext({ async: true })

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  localization: {
    locales: ['en', 'my', 'id', 'th', 'zh'],
    defaultLocale: 'en',
  },
  collections: [Users, Categories, Tags, Media, Posts],
  editor: lexicalEditor(),

  serverURL: process.env.PAYLOAD_SERVER_URL || 'https://tripcanvas-cms.academyt.workers.dev',
  secret: process.env.PAYLOAD_SECRET || '',
  cors: [
    'https://tripcanvas-cms.academyt.workers.dev',
    'https://tripcanvas.academyt.workers.dev',
    'https://tripcanvas-my.academyt.workers.dev',
    'https://tripcanvas-id.academyt.workers.dev',
    'https://tripcanvas-th.academyt.workers.dev',
    'https://tripcanvas-my-zh.academyt.workers.dev',
    'https://tripcanvas-th-zh.academyt.workers.dev',
    'http://localhost:4321',
  ],
  csrf: [
    'https://tripcanvas-cms.academyt.workers.dev',
    'https://tripcanvas.academyt.workers.dev',
    'https://tripcanvas-my.academyt.workers.dev',
    'https://tripcanvas-id.academyt.workers.dev',
    'https://tripcanvas-th.academyt.workers.dev',
    'https://tripcanvas-my-zh.academyt.workers.dev',
    'https://tripcanvas-th-zh.academyt.workers.dev',
    'http://localhost:4321',
  ],
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteD1Adapter({
    binding: cloudflare.env.D1,
    migrationDir: path.resolve(dirname, 'migrations'),
    prodMigrations: migrations,
  }),
  plugins: [
    r2Storage({
      bucket: cloudflare.env.R2,
      collections: { media: true },
    }),
  ],
})

function getCloudflareContextFromWrangler(): Promise<CloudflareContext> {
  return import(/* webpackIgnore: true */ `${'__wrangler'.replaceAll('_', '')}`).then(
    ({ getPlatformProxy }) =>
      getPlatformProxy({
        environment: process.env.CLOUDFLARE_ENV,
        remoteBindings: isProduction,
      } satisfies GetPlatformProxyOptions),
  )
}
