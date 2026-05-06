#!/usr/bin/env node
/**
 * Phase 2: Upload all files to R2 with market-prefixed keys.
 *
 * Reads r2-reorg-map.json. For each entry:
 *   1. headExists on new R2 key -> skip if already there (idempotent)
 *   2. Check local media-download/{market}/{oldKey}
 *   3. If not found -> download from old R2 public URL
 *   4. PutObject to new R2 key
 *
 * Usage: node reorg-r2-upload.js
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'fs'
import { readFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import axios from 'axios'
import pLimit from 'p-limit'
import dotenv from 'dotenv'
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '.env') })

const CONCURRENCY = 10
const MAP_PATH = resolve(__dirname, 'export', 'r2-reorg-map.json')
const ERR_PATH = resolve(__dirname, 'export', 'r2-reorg-errors.json')
const LOCAL_DIR = resolve(__dirname, 'media-download')
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || 'https://pub-2faca0649c2047a1859536a3114d3f95.r2.dev').replace(/\/$/, '')
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'tripcanvas-media'

function makeS3Client() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('Missing R2 credentials in .env')
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

function guessContentType(key) {
  const lower = key.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

async function headExists(s3, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }))
    return true
  } catch {
    return false
  }
}

async function withS3Retry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn() }
    catch (err) {
      if (i === attempts - 1) throw err
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
}

async function downloadFromR2(oldKey) {
  const url = `${R2_PUBLIC_URL}/${oldKey}`
  const res = await axios({ method: 'GET', url, responseType: 'arraybuffer', timeout: 30000 })
  return Buffer.from(res.data)
}

async function main() {
  console.log(`R2 Reorg Upload - concurrency=${CONCURRENCY}`)

  if (!existsSync(MAP_PATH)) {
    console.error(`Error: ${MAP_PATH} not found. Run reorg-r2-mapping.js first.`)
    process.exit(1)
  }

  const mapData = JSON.parse(readFileSync(MAP_PATH, 'utf-8'))
  const entries = mapData.entries
  console.log(`Loaded ${entries.length} entries from ${MAP_PATH}`)

  const s3 = makeS3Client()
  const limit = pLimit(CONCURRENCY)
  const errors = []

  let done = 0, uploaded = 0, skipped = 0, failed = 0
  let localHit = 0, downloadHit = 0

  await Promise.all(entries.map((entry, i) => limit(async () => {
    const { market, oldKey, newKey, sourceUrl } = entry
    try {
      const exists = await withS3Retry(() => headExists(s3, newKey))
      if (exists) {
        skipped++
        done++
        if (done % 500 === 0 || done === entries.length) {
          console.log(`  [${done}/${entries.length}] uploaded=${uploaded} skipped=${skipped} failed=${failed}`)
        }
        return
      }

      const localPath = resolve(LOCAL_DIR, market, oldKey)
      let body
      if (existsSync(localPath) && statSync(localPath).isFile()) {
        body = await readFile(localPath)
        localHit++
      } else {
        body = await downloadFromR2(oldKey)
        downloadHit++
      }

      await withS3Retry(() =>
        s3.send(new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: newKey,
          Body: body,
          ContentType: guessContentType(oldKey),
        }))
      )
      uploaded++
    } catch (err) {
      failed++
      errors.push({
        sourceUrl,
        market,
        oldKey,
        newKey,
        error: err?.message || String(err),
      })
    }
    done++
    if (done % 500 === 0 || done === entries.length) {
      console.log(`  [${done}/${entries.length}] uploaded=${uploaded} skipped=${skipped} failed=${failed}`)
    }
  })))

  writeFileSync(ERR_PATH, JSON.stringify(errors, null, 2))
  console.log(`\nDone. uploaded=${uploaded} skipped=${skipped} failed=${failed}`)
  console.log(`  local files used: ${localHit}`)
  console.log(`  downloaded from R2: ${downloadHit}`)
  if (failed > 0) {
    console.log(`  Errors written to ${ERR_PATH}`)
    process.exitCode = 1
  }
}

main().catch(err => { console.error(err); process.exit(1) })
