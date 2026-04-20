#!/usr/bin/env node

import { writeFileSync, mkdirSync, existsSync, createWriteStream, readdirSync, statSync } from 'fs'
import { readFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import axios from 'axios'
import pLimit from 'p-limit'
import dotenv from 'dotenv'
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { loadAllSites, LOCALES } from './lib/exports.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '.env') })

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'tripcanvas-media'
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
const MEDIA_LIMIT = parseInt(process.env.MEDIA_LIMIT || '0', 10) || 0
const CONCURRENCY = parseInt(process.env.MEDIA_CONCURRENCY || '5', 10) || 5

const OUT_DIR = resolve(__dirname, 'export')
const TMP_DIR = resolve(__dirname, '.tmp-media')
const LOCAL_MEDIA_DIR = resolve(__dirname, 'media-download')
const MAP_PATH = resolve(OUT_DIR, 'media-url-map.json')
const ERR_PATH = resolve(OUT_DIR, 'media-migration-errors.json')

if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true })

const DEFAULT_LOCALE = 'en'

function toPosixPath(p) {
  return p.replace(/\\/g, '/')
}

function decodeKeySafe(key) {
  try {
    return decodeURIComponent(key)
  } catch {
    return key
  }
}

function keyVariants(key) {
  const out = new Set([key])
  const decoded = decodeKeySafe(key)
  out.add(decoded)

  for (const value of [key, decoded]) {
    out.add(value.replace(/^sites\/\d+\//, ''))
  }

  return [...out].filter(Boolean)
}

function buildLocalMediaIndex() {
  const relPathMap = new Map()
  const basenameMap = new Map()

  function walk(dir) {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        walk(abs)
        continue
      }
      if (!entry.isFile()) continue

      const rel = toPosixPath(abs.slice(LOCAL_MEDIA_DIR.length + 1))
      relPathMap.set(rel, abs)

      const base = entry.name
      const arr = basenameMap.get(base) || []
      arr.push(abs)
      basenameMap.set(base, arr)
    }
  }

  walk(LOCAL_MEDIA_DIR)
  return { relPathMap, basenameMap }
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

function isTransientS3Error(err) {
  const code = err?.code || err?.cause?.code
  const msg = String(err?.message || '')
  return (
    code === 'EAI_AGAIN' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    msg.includes('EAI_AGAIN') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT')
  )
}

async function withS3Retry(fn) {
  let lastErr
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isTransientS3Error(err) || attempt >= 4) throw err
      await sleep(500 * attempt)
    }
  }
  throw lastErr
}

function extractImageUrlsFromHtml(html) {
  if (!html) return []
  const urls = []
  const re = /https?:\/\/[^\s"'<>]+\/wp-content\/uploads\/[^\s"'<>]+/gi
  let m
  while ((m = re.exec(html)) !== null) {
    urls.push(m[0])
  }
  return urls
}

function normalizeSourceUrl(url) {
  try {
    const u = new URL(url)
    u.hash = ''
    return decodeURI(u.toString())
  } catch {
    return null
  }
}

function toR2Key(url) {
  const idx = url.indexOf('/wp-content/uploads/')
  if (idx === -1) return null
  const tail = url.slice(idx + '/wp-content/uploads/'.length)
  if (!tail) return null
  return tail.split('?')[0]
}

function guessContentType(url) {
  const lower = url.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.avif')) return 'image/avif'
  return 'application/octet-stream'
}

function localeFromSourceUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.includes('malaysia.tripcanvas.co')) return 'my'
    if (host.includes('indonesia.tripcanvas.co')) return 'id'
    if (host.includes('thailand.tripcanvas.co')) return 'th'
    return 'en'
  } catch {
    return 'en'
  }
}

function localMediaPathFor(url, key) {
  const locale = localeFromSourceUrl(url)
  return resolve(LOCAL_MEDIA_DIR, locale, key)
}

function resolveLocalMediaPath(url, key, localIndex) {
  const locale = localeFromSourceUrl(url)
  const preferredLocales = locale === DEFAULT_LOCALE ? LOCALES : [locale, ...LOCALES.filter((l) => l !== locale)]
  const variants = keyVariants(key)

  for (const loc of preferredLocales) {
    for (const variant of variants) {
      const rel = `${loc}/${toPosixPath(variant)}`
      const found = localIndex.relPathMap.get(rel)
      if (found) return found
    }
  }

  const basename = key.split('/').pop()
  if (!basename) return null

  const candidates = localIndex.basenameMap.get(basename) || []
  if (candidates.length === 0) return null

  for (const loc of preferredLocales) {
    const hit = candidates.find((p) => toPosixPath(p).includes(`/${loc}/`))
    if (hit) return hit
  }

  return candidates[0]
}

function makeS3Client() {
  if (DRY_RUN) return null
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('Missing R2 credentials in .env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)')
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })
}

async function headExists(s3, key) {
  try {
    await withS3Retry(() => s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })))
    return true
  } catch {
    return false
  }
}

async function downloadToFile(url, targetPath) {
  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios({
        method: 'GET',
        url,
        responseType: 'stream',
        timeout: 60_000,
        headers: {
          'User-Agent': 'TripCanvasMigration/1.0',
        },
        validateStatus: (s) => s >= 200 && s < 400,
      })

      await new Promise((resolvePromise, rejectPromise) => {
        const w = createWriteStream(targetPath)
        res.data.pipe(w)
        w.on('finish', resolvePromise)
        w.on('error', rejectPromise)
      })
      return
    } catch (err) {
      lastErr = err
      if (attempt >= 3) break
      await new Promise((r) => setTimeout(r, attempt * 1000))
    }
  }

  throw lastErr
}

async function uploadOne({ s3, sourceUrl, key, tmpPath, localIndex }) {
  if (DRY_RUN) return { uploaded: false, skipped: false }

  const exists = await headExists(s3, key)
  if (exists) return { uploaded: false, skipped: true }

  const localPath = resolveLocalMediaPath(sourceUrl, key, localIndex)
  let body

  if (localPath && existsSync(localPath) && statSync(localPath).isFile()) {
    body = await readFile(localPath)
  } else {
    await downloadToFile(sourceUrl, tmpPath)
    body = await readFile(tmpPath)
  }

  await withS3Retry(() =>
    s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: guessContentType(sourceUrl),
      }),
    ),
  )

  return { uploaded: true, skipped: false }
}

async function main() {
  console.log(`Media migration (dry_run=${DRY_RUN}, limit=${MEDIA_LIMIT || 'none'}, concurrency=${CONCURRENCY})`)

  const sites = loadAllSites()
  const all = new Set()

  for (const locale of LOCALES) {
    for (const post of sites[locale].posts || []) {
      for (const u of extractImageUrlsFromHtml(post.content || '')) {
        const normalized = normalizeSourceUrl(u)
        if (normalized) all.add(normalized)
      }
    }
  }

  const urls = [...all]
  console.log(`Found ${urls.length} unique wp-content image URLs in exported post HTML`)

  const processUrls = MEDIA_LIMIT > 0 ? urls.slice(0, MEDIA_LIMIT) : urls
  const s3 = makeS3Client()
  const limit = pLimit(CONCURRENCY)
  const localIndex = buildLocalMediaIndex()

  console.log(`Indexed ${localIndex.relPathMap.size} local media files for fallback`) 

  const map = {}
  const errors = []

  let uploaded = 0
  let skipped = 0
  let failed = 0
  let done = 0

  await Promise.all(
    processUrls.map((sourceUrl, i) =>
      limit(async () => {
        const key = toR2Key(sourceUrl)
        if (!key) {
          failed++
          errors.push({ sourceUrl, error: 'Cannot derive R2 key from source URL' })
          return
        }

        const tmpPath = resolve(TMP_DIR, `media-${i}`)

        try {
          const result = await uploadOne({ s3, sourceUrl, key, tmpPath, localIndex })
          if (result.uploaded) uploaded++
          if (result.skipped) skipped++

          const publicUrl = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : `r2://${R2_BUCKET_NAME}/${key}`
          map[sourceUrl] = publicUrl
        } catch (err) {
          failed++
          errors.push({ sourceUrl, key, error: err?.message || String(err) })
        } finally {
          done++
          if (done % 100 === 0 || done === processUrls.length) {
            console.log(`  [${done}/${processUrls.length}] uploaded=${uploaded} skipped=${skipped} failed=${failed}`)
          }
        }
      }),
    ),
  )

  writeFileSync(
    MAP_PATH,
    JSON.stringify(
      {
        dry_run: DRY_RUN,
        totals: {
          discovered: urls.length,
          processed: processUrls.length,
          uploaded,
          skipped,
          failed,
        },
        map,
      },
      null,
      2,
    ),
  )

  writeFileSync(ERR_PATH, JSON.stringify(errors, null, 2))

  console.log(`\n✓ Wrote ${MAP_PATH}`)
  console.log(`✓ Wrote ${ERR_PATH}`)
  console.log(`Summary: uploaded=${uploaded}, skipped=${skipped}, failed=${failed}`)

  if (failed > 0 && !DRY_RUN) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
