<?php
/**
 * WordPress → JSON export (run server-side via `wp-cli eval-file`).
 *
 * Outputs a single JSON document to stdout containing:
 *   - posts:      array (published posts with category_slugs, tag_slugs, featured_media_wp_id)
 *   - categories: array (wp_id, slug, name, parent_slug, description)
 *   - tags:       array (wp_id, slug, name, description)
 *   - media:      array (wp_id, slug, filename, source_url, upload_path, mime_type,
 *                        width, height, alt, caption, title, date, attached_to_post_id)
 *   - meta:       { site_url, exported_at, post_count, ... }
 *
 * This is designed to run via:
 *   wp-cli --path=/var/www/html/<site> eval-file export-site.php <locale>
 *
 * For multisite networks we only export the *main* network site (same
 * convention as the existing export-posts.sh).
 *
 * We never query wpdb directly when a WP function exists — this keeps us
 * compatible with plugins that hook term/post queries (WPML, Polylang, etc.).
 */

// First extra arg (after the script path) is the locale label we want stamped
// on every row. wp-cli passes --positional args after the script via
// $args in eval-file context.
$locale = isset($args[0]) ? $args[0] : 'unknown';

function term_to_array($t) {
    return [
        'wp_id'       => (int) $t->term_id,
        'slug'        => $t->slug,
        'name'        => html_entity_decode($t->name, ENT_QUOTES, 'UTF-8'),
        'parent'      => (int) $t->parent,        // wp term_id; resolved to slug below
        'description' => $t->description ?: '',
        'count'       => (int) $t->count,
    ];
}

// ── Taxonomies ─────────────────────────────────────────────────────────────
$raw_categories = get_terms(['taxonomy' => 'category', 'hide_empty' => false]);
$raw_tags       = get_terms(['taxonomy' => 'post_tag', 'hide_empty' => false]);

if (is_wp_error($raw_categories)) $raw_categories = [];
if (is_wp_error($raw_tags))       $raw_tags       = [];

$cat_id_to_slug = [];
foreach ($raw_categories as $c) $cat_id_to_slug[$c->term_id] = $c->slug;

$categories = [];
foreach ($raw_categories as $c) {
    $row = term_to_array($c);
    $row['parent_slug'] = $row['parent'] && isset($cat_id_to_slug[$row['parent']])
        ? $cat_id_to_slug[$row['parent']]
        : null;
    unset($row['parent']);
    $categories[] = $row;
}

$tags = [];
foreach ($raw_tags as $t) {
    $row = term_to_array($t);
    unset($row['parent']);
    $tags[] = $row;
}

// ── Posts ──────────────────────────────────────────────────────────────────
// Use WP_Query with no limit. For very large sites we page to keep memory sane.
function clean_wp_content($html) {
    if (!$html) return '';
    // WordPress stores content with slash-escaped quotes (legacy magic quotes).
    // Without unslashing, sequences like `\&quot;` end up in the JSON output
    // with a literal backslash before an ampersand — invalid JSON.
    $html = wp_unslash($html);
    // Strip Gutenberg block comments
    $html = preg_replace('/<!--\s*\/?wp:[^>]*-->/', '', $html);
    // [caption ...]inner[/caption] → inner
    $html = preg_replace('/\[caption[^\]]*\]([\s\S]*?)\[\/caption\]/i', '$1', $html);
    // [gallery ...] → dropped
    $html = preg_replace('/\[gallery[^\]]*\]/i', '', $html);
    // [embed]url[/embed] → url
    $html = preg_replace('/\[embed[^\]]*\]([\s\S]*?)\[\/embed\]/i', '$1', $html);
    // Catch-all remaining shortcodes
    $html = preg_replace('/\[[^\]]+\]/', '', $html);
    return $html;
}

$posts = [];
$paged = 1;
$per_page = 200;
while (true) {
    $q = new WP_Query([
        'post_type'        => 'post',
        'post_status'      => 'publish',
        'posts_per_page'   => $per_page,
        'paged'            => $paged,
        'orderby'          => 'ID',
        'order'            => 'ASC',
        'ignore_sticky_posts' => true,
        'no_found_rows'    => false,
        'update_post_meta_cache' => true,
        'update_post_term_cache' => true,
    ]);
    if (!$q->have_posts()) break;

    while ($q->have_posts()) {
        $q->the_post();
        $p = $q->post;

        $cat_objs = wp_get_post_terms($p->ID, 'category', ['fields' => 'all']);
        $tag_objs = wp_get_post_terms($p->ID, 'post_tag', ['fields' => 'all']);

        $thumb_id = (int) get_post_thumbnail_id($p->ID) ?: null;

        $posts[] = [
            'wp_id'                 => (int) $p->ID,
            'slug'                  => $p->post_name,
            'locale'                => $locale,
            'title'                 => html_entity_decode(wp_unslash(get_the_title($p)), ENT_QUOTES, 'UTF-8'),
            'content'               => clean_wp_content($p->post_content),
            'excerpt'               => html_entity_decode(strip_tags(wp_unslash($p->post_excerpt)), ENT_QUOTES, 'UTF-8'),
            'date'                  => $p->post_date_gmt ?: $p->post_date,
            'modified'              => $p->post_modified_gmt ?: $p->post_modified,
            'status'                => $p->post_status,
            'author_id'             => (int) $p->post_author,
            'category_slugs'        => array_values(array_filter(array_map(function ($t) { return is_object($t) ? $t->slug : null; }, $cat_objs ?: []))),
            'tag_slugs'             => array_values(array_filter(array_map(function ($t) { return is_object($t) ? $t->slug : null; }, $tag_objs ?: []))),
            'featured_media_wp_id'  => $thumb_id,
        ];
    }
    wp_reset_postdata();

    if ($paged >= $q->max_num_pages) break;
    $paged++;
}

// ── Media ──────────────────────────────────────────────────────────────────
$media = [];
$paged = 1;
while (true) {
    $q = new WP_Query([
        'post_type'      => 'attachment',
        'post_status'    => 'inherit',
        'posts_per_page' => $per_page,
        'paged'          => $paged,
        'orderby'        => 'ID',
        'order'          => 'ASC',
        'no_found_rows'  => false,
    ]);
    if (!$q->have_posts()) break;

    while ($q->have_posts()) {
        $q->the_post();
        $a = $q->post;
        $source_url = wp_get_attachment_url($a->ID);
        $file_path  = get_post_meta($a->ID, '_wp_attached_file', true); // "YYYY/MM/filename.ext"
        $meta       = wp_get_attachment_metadata($a->ID);

        $media[] = [
            'wp_id'               => (int) $a->ID,
            'locale'              => $locale,
            'slug'                => $a->post_name,
            'filename'            => $file_path ? basename($file_path) : basename((string) $source_url),
            'source_url'          => $source_url ?: null,
            'upload_path'         => $file_path ?: null,
            'mime_type'           => $a->post_mime_type ?: null,
            'width'               => isset($meta['width'])  ? (int) $meta['width']  : null,
            'height'              => isset($meta['height']) ? (int) $meta['height'] : null,
            'alt'                 => (string) get_post_meta($a->ID, '_wp_attachment_image_alt', true),
            'caption'             => html_entity_decode(strip_tags((string) $a->post_excerpt), ENT_QUOTES, 'UTF-8'),
            'title'               => html_entity_decode((string) $a->post_title, ENT_QUOTES, 'UTF-8'),
            'date'                => $a->post_date_gmt ?: $a->post_date,
            'attached_to_post_id' => $a->post_parent ? (int) $a->post_parent : null,
        ];
    }
    wp_reset_postdata();

    if ($paged >= $q->max_num_pages) break;
    $paged++;
}

// ── Output ─────────────────────────────────────────────────────────────────
$payload = [
    'meta' => [
        'locale'      => $locale,
        'site_url'    => home_url('/'),
        'exported_at' => gmdate('c'),
        'is_multisite'=> is_multisite() ? true : false,
        'post_count'  => count($posts),
        'media_count' => count($media),
        'cat_count'   => count($categories),
        'tag_count'   => count($tags),
    ],
    'categories' => $categories,
    'tags'       => $tags,
    'posts'      => $posts,
    'media'      => $media,
];

// JSON_UNESCAPED_UNICODE keeps non-ASCII (Thai, Chinese, Indonesian) readable.
// JSON_UNESCAPED_SLASHES keeps URLs readable.
// JSON_INVALID_UTF8_SUBSTITUTE replaces any malformed UTF-8 sequences with
// U+FFFD instead of failing silently (json_encode returns false on bad UTF-8).
$json = json_encode(
    $payload,
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
);
if ($json === false) {
    fwrite(STDERR, 'json_encode failed: ' . json_last_error_msg() . "\n");
    exit(1);
}

// Tear down all active output buffers before emitting. Some plugins (e.g.
// Schema & Structured Data for WP `saswp_remove_microdata`, FacetWP
// `FWP_Final_Output::_cb_apply`) install ob_start callbacks that mangle
// our raw JSON — they strip or rewrite sequences like `\&quot;`, which
// produces invalid JSON at the client. Flushing/closing all buffers
// ensures our echo goes straight to stdout untouched.
while (ob_get_level() > 0) {
    ob_end_clean();
}

echo $json;
