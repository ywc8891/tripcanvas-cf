#!/usr/bin/env node
import pLimit from 'p-limit';
import axios from 'axios';
import { existsSync, createWriteStream, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, 'media-download');
const INVENTORY_FILE = resolve(__dirname, 'export', 'media-inventory.json');
const MAX_RETRIES = 3;
const CONCURRENCY = 5;

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

async function downloadWithRetry(url, dest, filename, attempt = 1) {
  try {
    const res = await axios({ url, responseType: 'stream', timeout: 60000 });
    await new Promise((resolve, reject) => {
      const writer = createWriteStream(dest);
      res.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    return { success: true, filename };
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const delay = 1000 * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
      return downloadWithRetry(url, dest, filename, attempt + 1);
    }
    return { success: false, filename, error: err.message, url };
  }
}

async function main() {
  if (!existsSync(INVENTORY_FILE)) {
    console.error('Error: media-inventory.json not found');
    process.exit(1);
  }

  const inventory = JSON.parse(readFileSync(INVENTORY_FILE, 'utf-8'));
  console.log(`Total media items: ${inventory.length}`);

  const limit = pLimit(CONCURRENCY);
  const errors = [];
  let completed = 0;
  let failed = 0;

  const tasks = inventory.map((item, index) => limit(async () => {
    const url = item.url;
    if (!url) return { success: true, filename: item.slug };

    const filename = item.slug || `media-${item.wp_id}`;
    const dest = resolve(OUTPUT_DIR, filename);

    if (existsSync(dest)) {
      completed++;
      if (completed % 50 === 0) {
        console.log(`Progress: ${completed}/${inventory.length} (${Math.round(completed/inventory.length*100)}%) — ${failed} failures`);
      }
      return { success: true, filename };
    }

    const result = await downloadWithRetry(url, dest, filename);
    
    if (result.success) {
      completed++;
    } else {
      failed++;
      errors.push({ url: result.url, error: result.error });
    }

    if (completed % 50 === 0 || failed > 0) {
      console.log(`Progress: ${completed}/${inventory.length} (${Math.round(completed/inventory.length*100)}%) — ${failed} failures so far`);
    }

    return result;
  }));

  await Promise.all(tasks);

  const errorFile = resolve(__dirname, 'media-download-errors.json');
  writeFileSync(errorFile, JSON.stringify(errors, null, 2));

  console.log(`\nDownloaded ${completed}/${inventory.length}. Failures: ${failed} (see media-download-errors.json)`);

  if (failed > inventory.length * 0.05) {
    console.error('Error: More than 5% failed, likely a connectivity problem');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});