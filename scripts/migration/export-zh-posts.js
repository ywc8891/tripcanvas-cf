#!/usr/bin/env node
/**
 * Exports ZH (Chinese Simplified) posts from WordPress multisite via SSH + wp-cli.
 *
 * Uses the same export-site.php PHP script as the other locales, targeting each
 * ZH sub-site via wp-cli --url. This ensures shortcodes are stripped and HTML
 * is properly rendered (identical pipeline to en/my/id/th exports).
 *
 * Sources:
 *   malaysia.tripcanvas.co/zh  → wp-cli --url='https://malaysia.tripcanvas.co/zh'
 *   thailand.tripcanvas.co/zh  → wp-cli --url='https://thailand.tripcanvas.co/zh'
 *
 * Output:
 *   export/site-zh-v2.json  — combined ZH posts for use by migrate-zh-locale.js
 */

import { execSync } from 'child_process'
import { writeFileSync, readFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXPORT_DIR = resolve(__dirname, 'export')
const PHP_SCRIPT_LOCAL = resolve(__dirname, 'remote', 'export-site.php')
const PHP_SCRIPT_REMOTE = '/tmp/tripcanvas-export-site.php'
const SSH_HOST = 'tripcanvas'

const ZH_SITES = [
  {
    market: 'my',
    wpPath: '/var/www/html/malaysia.tripcanvas.co/public',
    wpUrl: 'https://malaysia.tripcanvas.co/zh',
    locale: 'zh-my',
  },
  {
    market: 'th',
    wpPath: '/var/www/html/thailand.tripcanvas.co/public',
    wpUrl: 'https://thailand.tripcanvas.co/zh',
    locale: 'zh-th',
  },
]

function sshExec(cmd) {
  return execSync(`ssh ${SSH_HOST} ${JSON.stringify(cmd)}`, {
    maxBuffer: 50 * 1024 * 1024,
  }).toString()
}

function exportSite(site) {
  console.log(`Exporting [${site.locale}] from ${site.wpUrl} ...`)
  const cmd = `wp-cli --path='${site.wpPath}' --url='${site.wpUrl}' eval-file '${PHP_SCRIPT_REMOTE}' '${site.locale}' 2>/dev/null`
  const raw = sshExec(cmd)
  const data = JSON.parse(raw)
  const { post_count, cat_count, tag_count } = data.meta || {}
  console.log(`  ✓ posts=${post_count} cats=${cat_count} tags=${tag_count}`)
  return data
}

async function main() {
  mkdirSync(EXPORT_DIR, { recursive: true })

  console.log(`→ uploading export-site.php to ${SSH_HOST}:${PHP_SCRIPT_REMOTE}`)
  execSync(`scp -q ${PHP_SCRIPT_LOCAL} ${SSH_HOST}:${PHP_SCRIPT_REMOTE}`)

  const allPosts = []

  for (const site of ZH_SITES) {
    const data = exportSite(site)
    for (const post of data.posts || []) {
      allPosts.push({ ...post, market: site.market })
    }
  }

  const out = { locale: 'zh', posts: allPosts }
  const outPath = resolve(EXPORT_DIR, 'site-zh-v2.json')
  writeFileSync(outPath, JSON.stringify(out, null, 2))

  console.log(`\nWrote ${allPosts.length} ZH posts → ${outPath}`)

  console.log(`\n→ cleaning up remote script`)
  sshExec(`rm -f ${PHP_SCRIPT_REMOTE}`)
  console.log('done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
