#!/usr/bin/env node
/**
 * migrate-zh-media.js
 *
 * Downloads ZH-specific media from the WP server via rsync (bypasses HTTP 403)
 * and uploads to Cloudflare R2. Updates export/media-url-map.json with HTTPS URLs.
 *
 * ZH images live on the server at:
 *   malaysia: /var/www/html/malaysia.tripcanvas.co/public/wp-content/uploads/sites/2/
 *   thailand: /var/www/html/thailand.tripcanvas.co/public/wp-content/uploads/sites/2/
 *
 * Run dry-run first:
 *   DRY_RUN=1 node migrate-zh-media.js
 *
 * Then live:
 *   node migrate-zh-media.js
 */

import { execSync, spawnSync } from 'child_process'
import { writeFileSync, readFileSync, existsSync, mkdirSync, statSync } from 'fs'
import { readFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import pLimit from 'p-limit'
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '.env') })

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'tripcanvas-media'
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
const CONCURRENCY = parseInt(process.env.MEDIA_CONCURRENCY || '10', 10)

const SSH_HOST = 'tripcanvas'
const EXPORT_DIR = resolve(__dirname, 'export')
const TMP_DIR = resolve(__dirname, '.tmp-zh-media')
const MAP_PATH = resolve(EXPORT_DIR, 'media-url-map.json')

if (!R2_PUBLIC_URL) throw new Error('R2_PUBLIC_URL must be set in .env')
if (!DRY_RUN && (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY)) {
  throw new Error('Missing R2 credentials in .env')
}

const MEDIA_URL_RE = /https?:\/\/[^\s"'<>]+\/wp-content\/uploads\/[^\s"'<>]+/gi

// URL → { host, remotePath, r2Key }
const SERVER_MAP = {
  'malaysia.tripcanvas.co': {
    sshAlias: SSH_HOST,
    remoteBase: '/var/www/html/malaysia.tripcanvas.co/public/wp-content/uploads/sites/2',
  },
  'thailand.tripcanvas.co': {
    sshAlias: SSH_HOST,
    remoteBase: '/var/www/html/thailand.tripcanvas.co/public/wp-content/uploads/sites/2',
  },
}

function toR2Key(url) {
  const idx = url.indexOf('/wp-content/uploads/')
  if (idx === -1) return null
  return url.slice(idx + '/wp-content/uploads/'.length).split('?')[0]
}

function guessContentType(url) {
  const lower = url.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

function loadMediaUrlMap() {
  if (!existsSync(MAP_PATH)) return {}
  const json = JSON.parse(readFileSync(MAP_PATH, 'utf-8'))
  return json?.map || {}
}

function saveMediaUrlMap(mapObj) {
  const existing = existsSync(MAP_PATH)
    ? JSON.parse(readFileSync(MAP_PATH, 'utf-8'))
    : { totals: {}, map: {} }
  existing.map = mapObj
  writeFileSync(MAP_PATH, JSON.stringify(existing, null, 2))
}

function makeS3Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  })
}

async function headExists(s3, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }))
    return true
  } catch { return false }
}

// Extract all unique wp-content image URLs from ZH export
function collectZhImageUrls() {
  const dataPath = resolve(EXPORT_DIR, 'site-zh-v2.json')
  const data = JSON.parse(readFileSync(dataPath, 'utf-8'))
  const urls = new Set()
  for (const post of data.posts || []) {
    const matches = (post.content || '').match(MEDIA_URL_RE) || []
    for (const u of matches) {
      try { urls.add(new URL(u).toString()) } catch { /* skip */ }
    }
  }
  return [...urls]
}

// Group URLs by server (host)
function groupByServer(urls) {
  const groups = {}
  for (const url of urls) {
    try {
      const hostname = new URL(url).hostname
      const server = SERVER_MAP[hostname]
      if (!server) continue
      const key = toR2Key(url)
      if (!key || !key.startsWith('sites/2/')) continue
      const relPath = key.slice('sites/2/'.length)   // e.g. 2019/12/file.jpg
      if (!groups[hostname]) groups[hostname] = { server, files: [] }
      groups[hostname].files.push({ url, relPath, r2Key: key })
    } catch { /* skip */ }
  }
  return groups
}

// Use rsync to batch-download files from a remote server
function rsyncFiles(sshAlias, remoteBase, relPaths, localBase) {
  mkdirSync(localBase, { recursive: true })
  const listFile = resolve(TMP_DIR, 'rsync-list.txt')
  writeFileSync(listFile, relPaths.join('\n') + '\n')

  console.log(`  rsync: ${relPaths.length} files from ${sshAlias}:${remoteBase}/`)
  const result = spawnSync(
    'rsync',
    [
      '-a', '--ignore-missing-args',
      `--files-from=${listFile}`,
      `${sshAlias}:${remoteBase}/`,
      `${localBase}/`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 1_800_000 },
  )
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || ''
    // rsync exits 23 when some files missing — treat as partial success
    if (result.status !== 23) {
      console.warn(`  rsync warning (exit ${result.status}): ${stderr.slice(0, 200)}`)
    }
  }
}

async function main() {
  mkdirSync(TMP_DIR, { recursive: true })

  console.log('Collecting ZH image URLs from export/site-zh-v2.json ...')
  const allUrls = collectZhImageUrls()
  console.log(`  Found ${allUrls.length} unique image URLs`)

  const mediaMap = loadMediaUrlMap()
  const groups = groupByServer(allUrls)

  // Find URLs that need uploading (not in map with HTTPS URL, or mapped to r2://)
  const toProcess = []
  for (const hostname of Object.keys(groups)) {
    for (const { url, relPath, r2Key } of groups[hostname].files) {
      const existing = mediaMap[url]
      if (existing && existing.startsWith('https://')) continue   // already done
      toProcess.push({ url, relPath, r2Key, hostname })
    }
  }
  console.log(`  ${toProcess.length} URLs need uploading (${allUrls.length - toProcess.length} already mapped)`)

  if (toProcess.length === 0) {
    console.log('Nothing to do.')
    return
  }

  if (DRY_RUN) {
    console.log('DRY_RUN=1 — skipping download/upload.')
    toProcess.slice(0, 5).forEach(({ url }) => console.log('  would upload:', url))
    return
  }

  // rsync download per server
  const localDirs = {}
  for (const hostname of Object.keys(groups)) {
    const { server, files } = groups[hostname]
    const toDownload = files.filter(f => {
      const ex = mediaMap[f.url]
      return !ex || !ex.startsWith('https://')
    })
    if (toDownload.length === 0) continue

    const localBase = resolve(TMP_DIR, hostname.replace(/\./g, '_'))
    localDirs[hostname] = localBase
    rsyncFiles(server.sshAlias, server.remoteBase, toDownload.map(f => f.relPath), localBase)
  }

  // Upload to R2
  const s3 = makeS3Client()
  const limit = pLimit(CONCURRENCY)
  let uploaded = 0, skipped = 0, failed = 0, done = 0

  await Promise.all(
    toProcess.map(({ url, relPath, r2Key, hostname }) =>
      limit(async () => {
        try {
          const exists = await headExists(s3, r2Key)
          if (exists) {
            skipped++
            mediaMap[url] = `${R2_PUBLIC_URL}/${r2Key}`
          } else {
            const localBase = localDirs[hostname]
            const localFile = localBase ? resolve(localBase, relPath) : null

            if (!localFile || !existsSync(localFile) || statSync(localFile).size === 0) {
              failed++
              return
            }

            const body = await readFile(localFile)
            await s3.send(new PutObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: r2Key,
              Body: body,
              ContentType: guessContentType(url),
            }))
            uploaded++
            mediaMap[url] = `${R2_PUBLIC_URL}/${r2Key}`
          }
        } catch (err) {
          failed++
          console.error(`  error ${url.slice(-50)}: ${err.message}`)
        } finally {
          done++
          if (done % 200 === 0 || done === toProcess.length) {
            console.log(`  [${done}/${toProcess.length}] uploaded=${uploaded} skipped=${skipped} failed=${failed}`)
          }
        }
      }),
    ),
  )

  saveMediaUrlMap(mediaMap)
  console.log(`\n✓ media-url-map.json updated`)
  console.log(`Summary: uploaded=${uploaded}, skipped=${skipped}, failed=${failed}`)
  if (failed > 0) process.exitCode = 1
}

main().catch(err => { console.error(err); process.exit(1) })
