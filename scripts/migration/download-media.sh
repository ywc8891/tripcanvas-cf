#!/bin/bash
# Download all media files from WordPress uploads directories via rsync

set -e

OUTPUT_DIR="$(dirname "$0")/media-download"
SSH_USER="ubuntu@tripcanvas"

mkdir -p "$OUTPUT_DIR"

echo "Media download started at $(date)"

sync_site() {
    local locale=$1
    local server_path=$2
    
    echo "Syncing ${locale} from ${server_path}..."
    
    local dest_dir="$OUTPUT_DIR/${locale}"
    mkdir -p "$dest_dir"
    
    rsync -avz \
        -e "ssh -o StrictHostKeyChecking=no" \
        "${SSH_USER}:${server_path}/wp-content/uploads/" \
        "$dest_dir/"
    
    echo "  → ${locale}: $(du -sh "$dest_dir" | cut -f1)"
}

sync_site "my" "/var/www/html/malaysia.tripcanvas.co/public"
sync_site "id" "/var/www/html/indonesia.tripcanvas.co/public"  
sync_site "th" "/var/www/html/thailand.tripcanvas.co/public"

echo ""
echo "Media sync completed at $(date)"
echo "Total:"
du -sh "$OUTPUT_DIR"