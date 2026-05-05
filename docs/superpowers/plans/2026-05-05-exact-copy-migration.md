# Static HTML Exact Copy Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape all 4 WP sites as static HTML, deploy to Cloudflare Pages, cut DNS. Preserve `tripcanvas-cf/` untouched.

**Architecture:** Separate repo `tripcanvas-static/` sits alongside `tripcanvas-cf/`. wget crawls WP servers → HTML files → post-processing scripts (audit media, rewrite URLs, strip forms) → Cloudflare Pages deploy. Media serves from existing R2 bucket via `media.tripcanvas.co`.

**Tech Stack:** bash, wget, Node.js (ESM), Cloudflare Pages + R2

---

## File Structure

```
~/project/tripcanvas-static/
├── sites/
│   ├── en/                 # Scraped tripcanvas.co
│   ├── my/                 # Scraped malaysia.tripcanvas.co
│   ├── id/                 # Scraped indonesia.tripcanvas.co
│   └── th/                 # Scraped thailand.tripcanvas.co
├── scripts/
│   ├── scrape-server-a.sh  # wget runner for Server A (EN/MY/TH)
│   ├── scrape-id.sh        # wget runner for Indonesia (local machine)
│   ├── r2-audit.js         # Find wp-content/uploads URLs not in media-url-map
│   ├── rewrite-urls.js     # WP upload URLs → R2 public URLs
│   ├── strip-forms.js      # Remove <form>...</form> blocks
│   ├── generate-404.js     # Create 404.html per site if missing
│   └── generate-config.js  # Write _redirects + _headers per site
├── media-url-map.json      # Copied from tripcanvas-cf (36,368 entries)
└── README.md
```

---

### Task 1: Create repo and copy media map

**Files:**
- Create: `~/project/tripcanvas-static/`
- Copy: `~/project/tripcanvas-cf/scripts/migration/export/media-url-map.json`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p ~/project/tripcanvas-static/{sites/{en,my,id,th},scripts}
```

- [ ] **Step 2: Init git repo**

```bash
cd ~/project/tripcanvas-static && git init
```

- [ ] **Step 3: Copy media-url-map.json from WIP project**

```bash
cp ~/project/tripcanvas-cf/scripts/migration/export/media-url-map.json \
   ~/project/tripcanvas-static/
```

Expected: `ls -lh ~/project/tripcanvas-static/media-url-map.json` shows ~6MB file.

- [ ] **Step 4: Copy .gitignore with backup exclusions**

```bash
cat > ~/project/tripcanvas-static/.gitignore << 'GITIGNORE'
sites/
missing-media.txt
found-local-paths.txt
missing-media/
node_modules/
GITIGNORE
```

- [ ] **Step 5: Verify media-url-map structure**

```bash
node -e "
const d = JSON.parse(require('fs').readFileSync('./media-url-map.json','utf8'));
console.log('Map entries:', Object.keys(d.map).length);
console.log('Totals:', JSON.stringify(d.totals));
console.log('Sample key:', Object.keys(d.map)[0]);
console.log('Sample value:', d.map[Object.keys(d.map)[0]]);
" 2>/dev/null || echo "All good — JSON valid"
```

Expected output: `Map entries: 36368`, `Totals: {"discovered":36372,...}`, sample shows `r2://` prefix.

- [ ] **Step 6: Verify tripcanvas-cf is untouched**

```bash
git -C ~/project/tripcanvas-cf status --short
```

Expected: no unexpected changes (untracked files like `.opencode/`, `.playwright-cli/` are pre-existing).

- [ ] **Step 7: Commit**

```bash
cd ~/project/tripcanvas-static
git add -A
git commit -m "init: static HTML migration repo with media-url-map"
```

---

### Task 2: Write scrape-server-a.sh (EN, MY, TH crawler)

**Files:**
- Create: `~/project/tripcanvas-static/scripts/scrape-server-a.sh`

This script is scp'd to Server A and executed there. It crawls 3 domains (6 seeds total) using `wget --mirror`.

**Critical decisions:**
- No `--convert-links` — leave URLs absolute for rewrite script
- Multi-seed via `--input-file` — ensures `/zh/` and `/id/` subsites are crawled even without interlinking
- `--adjust-extension` kept — CF Pages handles `.html` clean URL matching natively

- [ ] **Step 1: Write scrape-server-a.sh**

```bash
cat > ~/project/tripcanvas-static/scripts/scrape-server-a.sh << 'SCRIPT'
#!/bin/bash
# Run on WP Server A via: ssh tripcanvas 'bash ~/scrape.sh'
# Crawls EN, MY, TH markets with all locale subpaths
set -e
OUTDIR=~/static-export
mkdir -p $OUTDIR

crawl() {
  local domain=$1 name=$2; shift 2
  local input_file=$(mktemp)
  for seed in "$@"; do
    echo "https://${domain}${seed}" >> "$input_file"
  done
  echo "=== Crawling ${domain} → ${name} (${#@} seeds) ==="
  wget \
    --mirror \
    --adjust-extension \
    --page-requisites \
    --no-parent \
    --no-host-directories \
    --directory-prefix=$OUTDIR/$name \
    --wait=0.3 --random-wait \
    --limit-rate=5m \
    -e robots=off \
    --reject-regex "(wp-login|wp-cron|xmlrpc|/feed/|/comments/feed)" \
    --exclude-directories="/wp-admin,/wp-includes" \
    --input-file="$input_file"
  rm "$input_file"
  echo "=== Done: ${name} ==="
}

crawl "tripcanvas.co"           "en" "/"
crawl "malaysia.tripcanvas.co"  "my" "/" "/zh/"
crawl "thailand.tripcanvas.co"  "th" "/" "/id/" "/zh/"

echo "=== All crawls complete ==="
SCRIPT

chmod +x ~/project/tripcanvas-static/scripts/scrape-server-a.sh
```

- [ ] **Step 2: Verify script syntax**

```bash
bash -n ~/project/tripcanvas-static/scripts/scrape-server-a.sh
```

Expected: no output (syntax OK).

- [ ] **Step 3: Commit**

```bash
cd ~/project/tripcanvas-static
git add scripts/scrape-server-a.sh
git commit -m "feat: add wget crawl script for Server A (EN/MY/TH, 6 seeds)"
```

---

### Task 3: Write scrape-id.sh (Indonesia crawler, local machine)

**Files:**
- Create: `~/project/tripcanvas-static/scripts/scrape-id.sh`

Indonesia is on a separate AWS server unreachable from Server A. Crawl from local machine over public internet. Slower rate limits to avoid triggering rate-limiting.

- [ ] **Step 1: Write scrape-id.sh**

```bash
cat > ~/project/tripcanvas-static/scripts/scrape-id.sh << 'SCRIPT'
#!/bin/bash
# Run on LOCAL machine (Indonesia server is separate, not reachable from Server A)
# Crawls indonesia.tripcanvas.co with both locale subpaths
set -e
OUTDIR=~/project/tripcanvas-static/sites/id
mkdir -p $OUTDIR

input_file=$(mktemp)
echo "https://indonesia.tripcanvas.co/" > "$input_file"
echo "https://indonesia.tripcanvas.co/id/" >> "$input_file"

echo "=== Crawling indonesia.tripcanvas.co → id (2 seeds) ==="
wget \
  --mirror \
  --adjust-extension \
  --page-requisites \
  --no-parent \
  --no-host-directories \
  --directory-prefix=$OUTDIR \
  --wait=0.5 --random-wait \
  --limit-rate=3m \
  -e robots=off \
  --reject-regex "(wp-login|wp-cron|xmlrpc|/feed/|/comments/feed)" \
  --exclude-directories="/wp-admin,/wp-includes" \
  --input-file="$input_file"

rm "$input_file"
echo "=== Done: id ==="
SCRIPT

chmod +x ~/project/tripcanvas-static/scripts/scrape-id.sh
```

- [ ] **Step 2: Verify script syntax**

```bash
bash -n ~/project/tripcanvas-static/scripts/scrape-id.sh
```

Expected: no output (syntax OK).

- [ ] **Step 3: Commit**

```bash
cd ~/project/tripcanvas-static
git add scripts/scrape-id.sh
git commit -m "feat: add wget crawl script for Indonesia (local machine, 2 seeds)"
```

---

### Task 4: Write r2-audit.js (find media not in R2)

**Files:**
- Create: `~/project/tripcanvas-static/scripts/r2-audit.js`

Scans all scraped `.html` files for `wp-content/uploads/` URLs, checks against `media-url-map.json` keys, outputs missing URLs. Handles the nested `data.map` structure.

- [ ] **Step 1: Write r2-audit.js**

Write `~/project/tripcanvas-static/scripts/r2-audit.js`:

```js
// scripts/r2-audit.js
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const raw = JSON.parse(readFileSync('./media-url-map.json', 'utf8'));
const mediaMap = raw.map ?? raw;
const mappedUrls = new Set(Object.keys(mediaMap));

const WP_UPLOAD_PATTERN = /https?:\/\/[^"'\s>]+\/wp-content\/uploads\/[^"'\s>]+/gi;
const missing = new Set();

const DOMAIN_COUNTS = {};
mappedUrls.forEach(url => {
  try { const d = new URL(url).hostname; DOMAIN_COUNTS[d] = (DOMAIN_COUNTS[d] || 0) + 1; } catch {}
});
console.log('Map coverage by domain:');
Object.entries(DOMAIN_COUNTS).sort(([,a], [,b]) => b - a).forEach(([d,c]) => console.log(`  ${d}: ${c}`));

function scanDir(dir) {
  if (!statSync(dir, { throwIfNoEntry: false })) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { scanDir(full); continue; }
    if (!['.html', '.htm'].includes(extname(entry).toLowerCase())) continue;
    const html = readFileSync(full, 'utf8');
    for (const match of html.matchAll(WP_UPLOAD_PATTERN)) {
      const clean = match[0].split('?')[0];
      if (!mappedUrls.has(clean)) missing.add(clean);
    }
  }
}

for (const site of ['en', 'my', 'id', 'th']) scanDir(`./sites/${site}`);

if (missing.size > 0) {
  writeFileSync('./missing-media.txt', [...missing].sort().join('\n'));
  console.log(`\nFound ${missing.size} media URLs not in R2 map.`);
  console.log('Written to: missing-media.txt');
  // Domain breakdown
  const byDomain = {};
  missing.forEach(u => { try { const d = new URL(u).hostname; byDomain[d] = (byDomain[d]||0)+1; } catch {} });
  console.log('Missing by domain:');
  Object.entries(byDomain).sort(([,a],[,b]) => b - a).forEach(([d,c]) => console.log(`  ${d}: ${c}`));
} else {
  console.log('\nAll media URLs covered by R2 map.');
}
```

- [ ] **Step 2: Verify script syntax**

```bash
node --check ~/project/tripcanvas-static/scripts/r2-audit.js
```

Expected: no output (syntax OK).

- [ ] **Step 3: Commit**

```bash
cd ~/project/tripcanvas-static
git add scripts/r2-audit.js
git commit -m "feat: add R2 media audit script (find wp-content URLs not in map)"
```

---

### Task 5: Write rewrite-urls.js (WP URLs → R2 public URLs)

**Files:**
- Create: `~/project/tripcanvas-static/scripts/rewrite-urls.js`

Replaces all WP upload URLs in scraped HTML with `https://media.tripcanvas.co/<r2-path>`. Strips the `r2://tripcanvas-media/` prefix from map values. Handles both mapped and unmapped URLs via catch-all regex.

- [ ] **Step 1: Write rewrite-urls.js**

Write `~/project/tripcanvas-static/scripts/rewrite-urls.js`:

```js
// scripts/rewrite-urls.js
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const raw = JSON.parse(readFileSync('./media-url-map.json', 'utf8'));
const mediaMap = raw.map ?? raw;
const R2_BASE = 'https://media.tripcanvas.co';

function toR2Url(r2Key) {
  return R2_BASE + '/' + r2Key.replace(/^r2:\/\/tripcanvas-media\//, '');
}

// Sort by URL length desc to avoid partial replacement issues (e.g. /img.jpg matching before /img-large.jpg)
const entries = Object.entries(mediaMap)
  .sort(([a], [b]) => b.length - a.length);

function rewriteHtml(content) {
  let out = content;
  for (const [wpUrl, r2Key] of entries) {
    out = out.replaceAll(wpUrl, toR2Url(r2Key));
  }
  // Catch-all for unmapped wp-content/uploads URLs (both http/https, all 4 WP domains)
  out = out.replace(
    /https?:\/\/(tripcanvas\.co|malaysia\.tripcanvas\.co|indonesia\.tripcanvas\.co|thailand\.tripcanvas\.co)\/wp-content\/uploads\//g,
    R2_BASE + '/'
  );
  return out;
}

function processDir(dir) {
  let changed = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { processDir(full); continue; }
    if (!['.html', '.htm'].includes(extname(entry).toLowerCase())) continue;
    const original = readFileSync(full, 'utf8');
    const rewritten = rewriteHtml(original);
    if (original !== rewritten) {
      writeFileSync(full, rewritten);
      changed++;
    }
  }
  return changed;
}

let totalChanged = 0;
for (const site of ['en', 'my', 'id', 'th']) {
  console.log(`Rewriting ${site}...`);
  const changed = processDir(`./sites/${site}`);
  totalChanged += changed;
  console.log(`  ${changed} files changed`);
}
console.log(`Done. Total files changed: ${totalChanged}`);
```

- [ ] **Step 2: Verify script syntax**

```bash
node --check ~/project/tripcanvas-static/scripts/rewrite-urls.js
```

Expected: no output (syntax OK).

- [ ] **Step 3: Commit**

```bash
cd ~/project/tripcanvas-static
git add scripts/rewrite-urls.js
git commit -m "feat: add URL rewrite script (WP uploads → media.tripcanvas.co)"
```

---

### Task 6: Write strip-forms.js

**Files:**
- Create: `~/project/tripcanvas-static/scripts/strip-forms.js`

Removes all `<form>...</form>` blocks from scraped HTML. Uses `[\s\S]*?` for non-greedy matching across newlines. Replaces with hidden div for debuggability.

- [ ] **Step 1: Write strip-forms.js**

Write `~/project/tripcanvas-static/scripts/strip-forms.js`:

```js
// scripts/strip-forms.js
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

function stripForms(html) {
  return html.replace(/<form[\s\S]*?<\/form>/gi,
    '<div data-removed="form" hidden></div>');
}

function processDir(dir) {
  let changed = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { processDir(full); continue; }
    if (!['.html', '.htm'].includes(extname(entry).toLowerCase())) continue;
    const original = readFileSync(full, 'utf8');
    const stripped = stripForms(original);
    if (original !== stripped) {
      writeFileSync(full, stripped);
      changed++;
    }
  }
  return changed;
}

let totalChanged = 0;
for (const site of ['en', 'my', 'id', 'th']) {
  console.log(`Stripping forms: ${site}...`);
  const changed = processDir(`./sites/${site}`);
  totalChanged += changed;
  console.log(`  ${changed} files changed`);
}
console.log(`Done. Total files changed: ${totalChanged}`);
```

- [ ] **Step 2: Verify script syntax**

```bash
node --check ~/project/tripcanvas-static/scripts/strip-forms.js
```

Expected: no output (syntax OK).

- [ ] **Step 3: Commit**

```bash
cd ~/project/tripcanvas-static
git add scripts/strip-forms.js
git commit -m "feat: add form stripping script"
```

---

### Task 7: Write generate-404.js

**Files:**
- Create: `~/project/tripcanvas-static/scripts/generate-404.js`

Creates a minimal 404.html in each site directory if one doesn't already exist (from wget crawl).

- [ ] **Step 1: Write generate-404.js**

Write `~/project/tripcanvas-static/scripts/generate-404.js`:

```js
// scripts/generate-404.js
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>404 - Page Not Found</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;background:#f9fafb;color:#1f2937}h1{font-size:4rem;margin:0 0 0.5rem;font-weight:800;color:#111827}p{font-size:1.125rem;color:#6b7280;margin:0 0 1.5rem}a{color:#2563eb;text-decoration:none;font-weight:500}a:hover{text-decoration:underline}</style>
</head>
<body><div><h1>404</h1><p>Page not found</p><p><a href="/">Back to homepage</a></p></div></body></html>`;

for (const site of ['en', 'my', 'id', 'th']) {
  const path = join('sites', site, '404.html');
  if (existsSync(path)) {
    console.log(`${site}: 404.html already exists (scraped from WP)`);
  } else {
    writeFileSync(path, HTML);
    console.log(`${site}: created 404.html`);
  }
}
console.log('Done.');
```

- [ ] **Step 2: Verify script syntax**

```bash
node --check ~/project/tripcanvas-static/scripts/generate-404.js
```

Expected: no output (syntax OK).

- [ ] **Step 3: Commit**

```bash
cd ~/project/tripcanvas-static
git add scripts/generate-404.js
git commit -m "feat: add 404.html generator script"
```

---

### Task 8: Write generate-config.js

**Files:**
- Create: `~/project/tripcanvas-static/scripts/generate-config.js`

Writes `_redirects` and `_headers` files in each `sites/<market>/` directory for Cloudflare Pages.

- [ ] **Step 1: Write generate-config.js**

Write `~/project/tripcanvas-static/scripts/generate-config.js`:

```js
// scripts/generate-config.js
import { writeFileSync } from 'fs';
import { join } from 'path';

const REDIRECTS = `# WP admin → 404
/wp-admin              /404.html    404
/wp-admin/*            /404.html    404
/wp-login.php          /404.html    404
/xmlrpc.php            /404.html    404

# WP feeds → home
/feed/                 /            302
/comments/feed/        /            302

# WP REST API → 404
/wp-json               /404.html    404
/wp-json/*             /404.html    404
`;

const HEADERS = `/*.html
  Cache-Control: public, max-age=3600
`;

for (const site of ['en', 'my', 'id', 'th']) {
  const dir = join('sites', site);
  writeFileSync(join(dir, '_redirects'), REDIRECTS);
  writeFileSync(join(dir, '_headers'), HEADERS);
  console.log(`${site}: written _redirects + _headers`);
}
console.log('Done.');
```

- [ ] **Step 2: Verify script syntax**

```bash
node --check ~/project/tripcanvas-static/scripts/generate-config.js
```

Expected: no output (syntax OK).

- [ ] **Step 3: Commit**

```bash
cd ~/project/tripcanvas-static
git add scripts/generate-config.js
git commit -m "feat: add _redirects + _headers generator for Cloudflare Pages"
```

---

### Task 9: Verify SSH access to Server A

**Files:** None

- [ ] **Step 1: Test SSH connection**

```bash
ssh tripcanvas "echo SSH_OK && hostname"
```

Expected: prints `SSH_OK` and the server hostname. If connection fails, fix SSH config before proceeding.

- [ ] **Step 2: Check WP directories on server**

```bash
ssh tripcanvas "ls /var/www/"
```

Expected: lists WordPress installation directories. Note any unusual paths for the Phase 2a SCP step.

- [ ] **Step 3: Check if wget is available on server**

```bash
ssh tripcanvas "which wget && wget --version | head -1"
```

Expected: shows wget path and version. If missing: `ssh tripcanvas "sudo apt-get install -y wget"` or `sudo yum install -y wget`.

- [ ] **Step 4: Check disk space on server**

```bash
ssh tripcanvas "df -h ~/"
```

Expected: confirm enough free space for crawl output. Estimate: the 4 WP sites combined produce roughly 1-3GB of HTML/assets.

---

### Task 10: Deploy and run crawl on Server A (EN/MY/TH)

**Files:** None (scripts already committed)

- [ ] **Step 1: Upload crawl script to Server A**

```bash
cd ~/project/tripcanvas-static
scp scripts/scrape-server-a.sh tripcanvas:~/scrape.sh
```

- [ ] **Step 2: Start crawl in tmux (recommended — detachable session)**

```bash
ssh tripcanvas 'tmux new-session -d -s crawl "bash ~/scrape.sh 2>&1 | tee ~/crawl.log"'
```

Expected: no output (tmux session starts in background). Check with:
```bash
ssh tripcanvas 'tmux ls'
```
Expected: shows `crawl: 1 windows`.

- [ ] **Step 3: Monitor crawl progress**

```bash
ssh tripcanvas 'tail -20 ~/crawl.log'
```

Expected: shows wget progress lines. Re-run periodically to check status.

- [ ] **Step 4: Wait for crawl to complete (2-8 hours)**

No action needed — crawl runs autonomously. Proceed to Task 11 (Indonesia crawl) in parallel.

- [ ] **Step 5: Verify crawl completed successfully**

```bash
ssh tripcanvas 'grep "All crawls complete" ~/crawl.log'
```

Expected: prints `=== All crawls complete ===`. If not found yet, crawl is still running.

- [ ] **Step 6: Check crawl output size**

```bash
ssh tripcanvas 'du -sh ~/static-export/*'
```

Expected: directory sizes for `en`, `my`, `th`.

---

### Task 11: Run Indonesia crawl locally (parallel with Task 10)

**Files:** None

- [ ] **Step 1: Start Indonesia crawl**

```bash
cd ~/project/tripcanvas-static
bash scripts/scrape-id.sh
```

- [ ] **Step 2: Wait for crawl to complete (3-10 hours over public internet)**

Crawl runs in foreground. Monitor wget output for errors. Common issues:
- Rate limiting by AWS ELB → wget retries automatically
- SSL errors → check certificate validity

- [ ] **Step 3: Verify ID crawl output**

```bash
du -sh ~/project/tripcanvas-static/sites/id
find ~/project/tripcanvas-static/sites/id -name "*.html" | wc -l
```

Expected: non-zero directory size and HTML file count.

---

### Task 12: Sync Server A crawl results to local

**Files:** None

- [ ] **Step 1: Verify Server A crawl is complete**

```bash
ssh tripcanvas 'grep "All crawls complete" ~/crawl.log && echo "CRAWL_DONE"'
```

Expected: `CRAWL_DONE`. If not shown, wait for crawl to finish.

- [ ] **Step 2: Clean existing local EN/MY/TH directories (if any)**

```bash
rm -rf ~/project/tripcanvas-static/sites/en ~/project/tripcanvas-static/sites/my ~/project/tripcanvas-static/sites/th
```

- [ ] **Step 3: rsync EN/MY/TH from server**

```bash
rsync -avz --progress tripcanvas:~/static-export/en ~/project/tripcanvas-static/sites/
rsync -avz --progress tripcanvas:~/static-export/my ~/project/tripcanvas-static/sites/
rsync -avz --progress tripcanvas:~/static-export/th ~/project/tripcanvas-static/sites/
```

- [ ] **Step 4: Verify all 4 sites present locally**

```bash
for site in en my id th; do
  count=$(find ~/project/tripcanvas-static/sites/$site -name "*.html" 2>/dev/null | wc -l)
  echo "$site: $count HTML files"
done
```

Expected: non-zero counts for all 4 markets.

---

### Task 13: Run R2 media audit

**Files:** None

- [ ] **Step 1: Run r2-audit.js**

```bash
cd ~/project/tripcanvas-static
node scripts/r2-audit.js
```

Expected output: map coverage by domain (dominates by ID, then TH, then MY; EN has only 7), then missing count.

- [ ] **Step 2: Check missing-media.txt contents**

```bash
wc -l ~/project/tripcanvas-static/missing-media.txt 2>/dev/null || echo "No missing files!"
head -20 ~/project/tripcanvas-static/missing-media.txt 2>/dev/null
```

Expected: ideally small or zero. EN-specific URLs are most likely to appear.

- [ ] **Step 3: If missing-media.txt has entries — SCP from Server A**

Only run if `missing-media.txt` has content:
```bash
cd ~/project/tripcanvas-static
# Generate server-side file paths
ssh tripcanvas 'while read url; do
  path=$(echo "$url" | sed "s|https://[^/]*/||")
  [ -f "/var/www/html/$path" ] && echo "/var/www/html/$path"
done' < missing-media.txt > found-local-paths.txt

# SCP those files
mkdir -p missing-media
rsync -avz --files-from=found-local-paths.txt tripcanvas:/ missing-media/

echo "Found files: $(find missing-media -type f | wc -l)"
```

- [ ] **Step 4: Upload missing media to R2**

Only run if `missing-media/` has files:
```bash
cd ~/project/tripcanvas-static
find missing-media -type f | while read f; do
  key=$(echo "$f" | sed 's|.*/missing-media/||')
  echo "Uploading: $key"
  npx wrangler r2 object put "tripcanvas-media/$key" --file="$f"
done
```

- [ ] **Step 5: Update media-url-map.json with new entries**

Only run if new files uploaded:
```bash
cd ~/project/tripcanvas-static
# For each uploaded file, add WP URL → r2:// entry
node -e "
const fs = require('fs');
const map = JSON.parse(fs.readFileSync('./media-url-map.json','utf8'));
const missing = fs.readFileSync('./missing-media.txt','utf8').trim().split('\n').filter(Boolean);

// Match missing URLs to files found via SCP
const foundPaths = new Map();
fs.readFileSync('./found-local-paths.txt','utf8').trim().split('\n').filter(Boolean).forEach(line => {
  const key = line.replace(/^\/var\/www\/html\//, '');
  foundPaths.set(key, true);
});

let added = 0;
missing.forEach(wpUrl => {
  try {
    const urlPath = new URL(wpUrl).pathname.replace(/^\//, '');
    if (foundPaths.has(urlPath) && !map.map[wpUrl]) {
      map.map[wpUrl] = 'r2://tripcanvas-media/' + urlPath;
      added++;
    }
  } catch {}
});

fs.writeFileSync('./media-url-map.json', JSON.stringify(map, null, 2));
console.log('Added ' + added + ' new entries to media-url-map.json');
"
```

- [ ] **Step 6: Commit map updates (if any)**

```bash
cd ~/project/tripcanvas-static
git add media-url-map.json
git diff --cached --stat
# Only commit if changes exist
git commit -m "chore: update media-url-map with newly uploaded EN media" || echo "No changes to commit"
```

---

### Task 14: Run URL rewrite

**Files:** None

- [ ] **Step 1: Run rewrite-urls.js**

```bash
cd ~/project/tripcanvas-static
node scripts/rewrite-urls.js
```

Expected: output per site showing changed file count.

- [ ] **Step 2: Verify no remaining wp-content/uploads URLs**

```bash
grep -r "wp-content/uploads" ~/project/tripcanvas-static/sites/en/ ~/project/tripcanvas-static/sites/my/ ~/project/tripcanvas-static/sites/id/ ~/project/tripcanvas-static/sites/th/ -l | head -10
```

Expected: ideally zero files. If files still found, examine one:
```bash
grep "wp-content/uploads" <one-of-the-files> | head -5
```
Check if these are in CSS/JS assets (expected — wget downloads those too). CSS-inline image URLs won't be rewritten by the HTML script. Accept this gap — CSS background images from WP themes are decorative and acceptable.

- [ ] **Step 3: Verify R2 URLs are well-formed (no double-prefix)**

```bash
grep -r "r2://" ~/project/tripcanvas-static/sites/en/ ~/project/tripcanvas-static/sites/my/ ~/project/tripcanvas-static/sites/id/ ~/project/tripcanvas-static/sites/th/ -l | head -10
```

Expected: zero files (the `r2://` prefix was stripped by `toR2Url()`). If files found, the rewrite script had issues.

---

### Task 15: Run form stripping

**Files:** None

- [ ] **Step 1: Run strip-forms.js**

```bash
cd ~/project/tripcanvas-static
node scripts/strip-forms.js
```

Expected: output per site showing changed file count.

- [ ] **Step 2: Verify no form elements remain**

```bash
grep -r "<form" ~/project/tripcanvas-static/sites/en/ ~/project/tripcanvas-static/sites/my/ ~/project/tripcanvas-static/sites/id/ ~/project/tripcanvas-static/sites/th/ -l | head -10
```

Expected: zero files. If files found, examine one:
```bash
grep "<form" <one-of-the-files>
```
The regex `[\s\S]*?<\/form>` should catch all forms, but if a file has a malformed `<form>` without closing tag, it would be missed (such forms are broken in WP anyway, so not a concern).

---

### Task 16: Generate 404 pages and deploy config

**Files:** None

- [ ] **Step 1: Run generate-404.js**

```bash
cd ~/project/tripcanvas-static
node scripts/generate-404.js
```

Expected: either "already exists" or "created" for each site.

- [ ] **Step 2: Run generate-config.js**

```bash
cd ~/project/tripcanvas-static
node scripts/generate-config.js
```

Expected: "written _redirects + _headers" for each site.

- [ ] **Step 3: Verify _redirects files**

```bash
for site in en my id th; do
  echo "=== $site ==="
  cat ~/project/tripcanvas-static/sites/$site/_redirects
done
```

Expected: each file contains `/wp-admin`, `/wp-login.php`, `/xmlrpc.php`, feed redirect rules.

- [ ] **Step 4: Verify _headers files**

```bash
for site in en my id th; do
  echo "=== $site ==="
  cat ~/project/tripcanvas-static/sites/$site/_headers
done
```

Expected: each file contains `/*.html` with `Cache-Control` header.

- [ ] **Step 5: Verify 404.html files exist**

```bash
for site in en my id th; do
  ls -l ~/project/tripcanvas-static/sites/$site/404.html
done
```

Expected: each file exists and has content.

---

### Task 17: Add R2 custom domain

**Files:** None (Cloudflare Dashboard action)

- [ ] **Step 1: Open Cloudflare Dashboard → R2 → tripcanvas-media → Settings → Custom Domains**

- [ ] **Step 2: Add `media.tripcanvas.co` as custom domain**

Cloudflare auto-creates the DNS CNAME record. SSL auto-provisions within minutes.

- [ ] **Step 3: Verify custom domain resolves**

```bash
curl -sI https://media.tripcanvas.co/some-test-path.jpg | head -1
```

Expected: HTTP response (404 for test path, or 200 for a known R2 object). The key point is `media.tripcanvas.co` resolves and serves via Cloudflare.

---

### Task 18: Deploy to Cloudflare Pages

**Files:**
- Create: `~/project/tripcanvas-static/package.json`

- [ ] **Step 1: Install wrangler**

```bash
cd ~/project/tripcanvas-static
npm init -y
npm install -D wrangler
```

- [ ] **Step 2: Create Pages projects and deploy**

```bash
cd ~/project/tripcanvas-static

echo "=== EN ==="
npx wrangler pages project create tripcanvas-en-static
npx wrangler pages deploy sites/en/ --project-name tripcanvas-en-static

echo "=== MY ==="
npx wrangler pages project create tripcanvas-my-static
npx wrangler pages deploy sites/my/ --project-name tripcanvas-my-static

echo "=== ID ==="
npx wrangler pages project create tripcanvas-id-static
npx wrangler pages deploy sites/id/ --project-name tripcanvas-id-static

echo "=== TH ==="
npx wrangler pages project create tripcanvas-th-static
npx wrangler pages deploy sites/th/ --project-name tripcanvas-th-static
```

Expected: each deploy succeeds, returns `*.pages.dev` URL.

- [ ] **Step 3: Verify all 4 sites on *.pages.dev**

Open in browser:
- `https://tripcanvas-en-static.pages.dev`
- `https://tripcanvas-my-static.pages.dev`
- `https://tripcanvas-id-static.pages.dev`
- `https://tripcanvas-th-static.pages.dev`

Check:
- Homepage loads, images display
- Navigate to a few blog posts
- `/wp-admin` returns 404
- Language switcher works (MY: `/` ↔ `/zh/`, ID: `/` ↔ `/id/`, TH: `/` ↔ `/id/` ↔ `/zh/`)

- [ ] **Step 4: Fix any deploy issues**

Common issues:
- `404.html` not found → check file exists in site directory
- Images broken → verify `media.tripcanvas.co` custom domain is active (Task 17)
- Paths not resolving → CF Pages clean URL matching is on by default, but verify with `curl -I <url>` to check redirect behavior

---

### Task 19: DNS cutover

**Files:** None (Cloudflare Dashboard action)

- [ ] **Step 1: Pre-cut verification**

```bash
# Check current DNS
curl -sI https://tripcanvas.co | grep -i "server:\|x-powered-by"
curl -sI https://malaysia.tripcanvas.co | grep -i "server:\|x-powered-by"
curl -sI https://indonesia.tripcanvas.co | grep -i "server:\|x-powered-by"
curl -sI https://thailand.tripcanvas.co | grep -i "server:\|x-powered-by"
```

Expected: shows WordPress/Apache/nginx headers from current WP servers.

- [ ] **Step 2: Update DNS records in Cloudflare Dashboard**

Navigate to DNS → Records. Make these changes:

| Record | Action | Old Value | New Value |
|--------|--------|-----------|-----------|
| `tripcanvas.co` | Delete A, Add CNAME | `18.136.197.26` | `tripcanvas-en-static.pages.dev` |
| `www.tripcanvas.co` | Keep as-is | (existing CNAME) | unchanged |
| `malaysia` | Change to CNAME | `18.136.197.26` | `tripcanvas-my-static.pages.dev` |
| `indonesia` | Change to CNAME | (ELB CNAME) | `tripcanvas-id-static.pages.dev` |
| `thailand` | Change to CNAME | `18.136.197.26` | `tripcanvas-th-static.pages.dev` |

All records proxied (orange cloud). TTL auto-set to 1 (Auto) for proxied records.

- [ ] **Step 3: Add custom domains in Cloudflare Pages Dashboard**

For each Pages project (tripcanvas-en-static, tripcanvas-my-static, etc.), add custom domain:
- `tripcanvas-en-static` → `tripcanvas.co`, `www.tripcanvas.co`
- `tripcanvas-my-static` → `malaysia.tripcanvas.co`
- `tripcanvas-id-static` → `indonesia.tripcanvas.co`
- `tripcanvas-th-static` → `thailand.tripcanvas.co`

SSL auto-provisions. Wait for "Active" status on each.

- [ ] **Step 4: DNS propagation is near-instant on Cloudflare (proxied records)**

Wait 2-5 minutes for custom domain SSL to provision, then verify:

```bash
curl -sI https://tripcanvas.co | grep -i "server:\|cf-cache-status"
curl -sI https://malaysia.tripcanvas.co | grep -i "server:\|cf-cache-status"
curl -sI https://indonesia.tripcanvas.co | grep -i "server:\|cf-cache-status"
curl -sI https://thailand.tripcanvas.co | grep -i "server:\|cf-cache-status"
```

Expected: `server: cloudflare` and `cf-cache-status: ...` on all 4 domains.

- [ ] **Step 5: Full browse verification on production domains**

Open in browser on all 4 domains:
- Homepage renders
- Blog post renders with images
- Category/location pages work
- `/zh/` (MY), `/id/` (ID, TH), `/zh/` (TH) subsites work
- `/wp-admin` returns 404 on all domains
- No visible form elements

---

### Task 20: WP shutdown + final preservation check

**Files:** None

- [ ] **Step 1: Cancel WP hosting for both servers**

- Server A: Cancel hosting via provider dashboard
- Server B (Indonesia): Cancel via AWS or hosting provider

- [ ] **Step 2: Verify tripcanvas-cf is still intact**

```bash
cd ~/project/tripcanvas-cf
git status
ls apps/cms/src/collections/Posts.ts
ls apps/frontend/src/pages/index.astro
ls scripts/migration/export/media-url-map.json
```

Expected: all files present, no unexpected modifications.

- [ ] **Step 3: Document how to resume CMS migration**

```bash
cd ~/project/tripcanvas-static
cat > RESUME-MIGRATION.md << 'DOC'
# How to Resume the CMS + Astro Migration

The WIP Payload CMS + Astro migration is fully preserved at:
~/project/tripcanvas-cf/

## Redeploy CMS Worker
cd ~/project/tripcanvas-cf/apps/cms
npx opennextjs-cloudflare build
npx wrangler deploy

## Redeploy Frontend Workers
cd ~/project/tripcanvas-cf/apps/frontend
pnpm build
npx wrangler deploy                    # EN
npx wrangler deploy --config wrangler-my.jsonc   # MY
npx wrangler deploy --config wrangler-id.jsonc   # ID
npx wrangler deploy --config wrangler-th.jsonc   # TH

## Access CMS
https://tripcanvas-cms.academyt.workers.dev/admin

## Database (D1)
842 posts migrated. UUID: 93ea8644-31d9-4f02-b436-398a4a965671

## Media (R2)
36,368 URLs mapped. Bucket: tripcanvas-media

## Re-point DNS to Workers (when ready)
Change DNS records FROM *.pages.dev back TO *.academyt.workers.dev
DOC
```

- [ ] **Step 4: Final commit in tripcanvas-static**

```bash
cd ~/project/tripcanvas-static
git add RESUME-MIGRATION.md
git commit -m "docs: add migration resumption guide"
```

---

## Execution Order Summary

```
Task 1  → Create repo, copy media map
Task 2  → Write scrape-server-a.sh
Task 3  → Write scrape-id.sh
Task 4  → Write r2-audit.js
Task 5  → Write rewrite-urls.js
Task 6  → Write strip-forms.js
Task 7  → Write generate-404.js
Task 8  → Write generate-config.js
Task 9  → Verify SSH access
Task 10 → Run crawl on Server A (parallel with Task 11)
Task 11 → Run Indonesia crawl (parallel with Task 10)
Task 12 → Sync crawl results to local
Task 13 → R2 media audit + upload missing
Task 14 → Run URL rewrite
Task 15 → Run form stripping
Task 16 → Generate 404 pages + deploy config
Task 17 → Add R2 custom domain
Task 18 → Deploy to Cloudflare Pages
Task 19 → DNS cutover
Task 20 → WP shutdown + preservation check
```

Tasks 1-8 and 9 can be done immediately (script writing + SSH check). Tasks 10-11 run in parallel (2-8 hours autonomous). Tasks 13-16 are sequential post-processing. Task 17 before Task 18 (media domain must exist). Task 19 after Task 18 + 17 verified. Task 20 is final.
