// Shared loader for the re-exported WP site JSON files (produced by export-via-ssh.sh).

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const EXPORT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'export')

export const LOCALES = ['en', 'my', 'id', 'th']

export function loadAllSites() {
  const sites = {}
  for (const locale of LOCALES) {
    const path = resolve(EXPORT_DIR, `site-${locale}-v2.json`)
    if (!existsSync(path)) {
      throw new Error(`Missing ${path}. Run \`pnpm export:ssh\` first.`)
    }
    sites[locale] = JSON.parse(readFileSync(path, 'utf-8'))
  }
  return sites
}
