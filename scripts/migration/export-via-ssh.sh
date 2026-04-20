#!/usr/bin/env bash
# Export WP data from all 4 TripCanvas sites via SSH + wp-cli.
#
# Requires: `ssh tripcanvas` alias configured in ~/.ssh/config.
#
# For each site:
#   1. scp remote/export-site.php to a temp path on the server
#   2. Run `wp-cli --path=<site> eval-file /tmp/export-site.php <locale>`
#   3. Capture stdout as export/site-<locale>-v2.json locally
#
# The PHP script emits one JSON blob per site with posts + taxonomies + media.

set -euo pipefail

HOST="tripcanvas"
SCRIPT_LOCAL="$(dirname "$0")/remote/export-site.php"
SCRIPT_REMOTE="/tmp/tripcanvas-export-site.php"
OUT_DIR="$(dirname "$0")/export"

mkdir -p "$OUT_DIR"

if [[ ! -f "$SCRIPT_LOCAL" ]]; then
  echo "error: $SCRIPT_LOCAL not found" >&2
  exit 1
fi

echo "→ uploading export-site.php to $HOST:$SCRIPT_REMOTE"
scp -q "$SCRIPT_LOCAL" "$HOST:$SCRIPT_REMOTE"

# site_label:site_path (absolute path on remote host)
SITES=(
  "en:/var/www/html/tripcanvas.co"
  "my:/var/www/html/malaysia.tripcanvas.co/public"
  "id:/var/www/html/indonesia.tripcanvas.co/public"
  "th:/var/www/html/thailand.tripcanvas.co/public"
)

for spec in "${SITES[@]}"; do
  locale="${spec%%:*}"
  sitepath="${spec#*:}"
  out="$OUT_DIR/site-${locale}-v2.json"

  echo ""
  echo "── Exporting [$locale] from $sitepath ──"

  # Run wp-cli on remote host. 2>/dev/null silences PHP notices from old sites;
  # any real fatal still surfaces via non-zero exit code. We pipe the valid JSON
  # stdout directly into the local file.
  #
  # Note: we pass the locale via `--` so wp-cli treats it as a positional arg
  # accessible via $args[0] in eval-file.
  ssh "$HOST" "wp-cli --path='$sitepath' eval-file '$SCRIPT_REMOTE' '$locale' 2>/dev/null" \
    > "$out"

  if [[ ! -s "$out" ]]; then
    echo "  ✗ empty output for $locale; aborting" >&2
    exit 1
  fi

  # Use python for a tiny sanity check + summary (jq may not be installed).
  python3 - "$out" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
m = data.get("meta", {})
print(f"  ✓ {m.get('locale')}: posts={m.get('post_count')} media={m.get('media_count')} "
      f"cats={m.get('cat_count')} tags={m.get('tag_count')} "
      f"multisite={m.get('is_multisite')} url={m.get('site_url')}")
PY
done

echo ""
echo "✓ all sites exported to $OUT_DIR/site-<locale>-v2.json"

echo ""
echo "→ cleaning up remote script"
ssh "$HOST" "rm -f '$SCRIPT_REMOTE'"

echo "done."
