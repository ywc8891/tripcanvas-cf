#!/bin/bash
# Export posts from each WordPress site via WP-CLI over SSH

set -e

WP_CLI="/usr/bin/wp-cli"
OUTPUT_DIR="$(dirname "$0")/../export"

mkdir -p "$OUTPUT_DIR"

# Export function
export_site() {
    local locale=$1
    local path=$2
    local url=$3
    
    echo "Exporting ${locale} posts from ${url}..."
    
    $WP_CLI post list \
        --post_type=post \
        --post_status=publish \
        --format=json \
        --path="$path" \
        --posts_per_page=1000 \
        2>/dev/null | python3 -c "
import sys, json

def strip_shortcodes(text):
    if not text: return ''
    # Remove [caption...]...[/caption] keep inner
    import re
    text = re.sub(r'\[caption[^\]]*\]([\s\S]*?)\[/caption\]', r'\1', text)
    # Remove [gallery...]
    text = re.sub(r'\[gallery[^\]]*\]', '', text)
    # Replace [embed...]...[/embed] with url
    text = re.sub(r'\[embed[^\]]*\]([\s\S]*?)\[/embed\]', r'\1', text)
    # Remove remaining [...]
    text = re.sub(r'\[[^\]]+\]', '', text)
    return text

posts = json.load(sys.stdin)
normalized = []
for p in posts:
    normalized.append({
        'wp_id': p.get('ID'),
        'slug': p.get('post_name'),
        'locale': '$locale',
        'title': p.get('post_title'),
        'content': strip_shortcodes(p.get('post_content', '')),
        'excerpt': p.get('post_excerpt', ''),
        'date': p.get('post_date'),
        'modified': p.get('post_modified'),
        'status': p.get('post_status'),
    })
print(json.dumps(normalized, ensure_ascii=False, indent=2))
" > "$OUTPUT_DIR/posts-${locale}.json"
    
    count=$(python3 -c "print(len(json.load(open('$OUTPUT_DIR/posts-${locale}.json'))))")
    echo "  → ${count} posts"
}

# Main site (en)
export_site "en" "/var/www/html/tripcanvas.co" "https://tripcanvas.co"

# Malaysia
export_site "my" "/var/www/html/malaysia.tripcanvas.co/public" "https://malaysia.tripcanvas.co"

# Indonesia
export_site "id" "/var/www/html/indonesia.tripcanvas.co/public" "https://indonesia.tripcanvas.co"

# Thailand
export_site "th" "/var/www/html/thailand.tripcanvas.co/public" "https://thailand.tripcanvas.co"

echo "Done!"