import { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    // Serve directly from R2 — no local processing
    staticURL: process.env.R2_PUBLIC_URL || '/media',
    staticDir: 'media', // local dev fallback only
    // NO imageSizes — Cloudflare Image Resizing handles this at the CDN edge
    // Adding imageSizes here would cause Payload to attempt local Sharp processing,
    // which fails silently on Cloudflare Workers (no filesystem)
    adminThumbnail: 'url', // show the raw URL as thumbnail in admin
    disableLocalStorage: true, // never write to disk — always use R2 handler
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
