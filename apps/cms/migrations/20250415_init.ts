import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // System tables
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS payload_migrations (
      id integer PRIMARY KEY NOT NULL,
      name text,
      batch numeric,
      updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS payload_locked_documents (
      id integer PRIMARY KEY NOT NULL,
      global_slug text,
      updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_payload_locked_documents_global_slug ON payload_locked_documents (global_slug)`)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS payload_locked_documents_rels (
      id integer PRIMARY KEY NOT NULL,
      parent_id integer NOT NULL,
      version_id integer,
      order integer,
      path text,
      FOREIGN KEY (parent_id) REFERENCES payload_locked_documents(id) ON DELETE cascade
    )
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_payload_locked_documents_rels_parent ON payload_locked_documents_rels (parent_id)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_payload_locked_documents_rels_order ON payload_locked_documents_rels (order)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_payload_locked_documents_rels_path ON payload_locked_documents_rels (path)`)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS payload_preferences (
      id integer PRIMARY KEY NOT NULL,
      key text,
      value text,
      updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_payload_preferences_key ON payload_preferences (key)`)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS payload_preferences_rels (
      id integer PRIMARY KEY NOT NULL,
      parent_id integer NOT NULL,
      order_index integer,
      path text,
      FOREIGN KEY (parent_id) REFERENCES payload_preferences(id) ON DELETE cascade
    )
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_payload_preferences_rels_parent ON payload_preferences_rels (parent_id)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_payload_preferences_rels_order ON payload_preferences_rels (order_index)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_payload_preferences_rels_path ON payload_preferences_rels (path)`)

  // Users collection
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS users (
      id integer PRIMARY KEY NOT NULL,
      updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      email text NOT NULL,
      reset_password_token text,
      reset_password_expiration text,
      salt text,
      hash text,
      login_attempts numeric DEFAULT 0,
      lock_until text
    )
  `)
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users (updated_at)`)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS users_sessions (
      id text PRIMARY KEY NOT NULL,
      user_id integer NOT NULL,
      created_at text,
      expires_at text NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
    )
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_users_sessions_user_id ON users_sessions (user_id)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_users_sessions_expires_at ON users_sessions (expires_at)`)

  // Media collection
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS media (
      id integer PRIMARY KEY NOT NULL,
      alt text NOT NULL,
      updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      url text,
      thumbnail_u_r_l text,
      filename text,
      mime_type text,
      filesize numeric,
      width numeric,
      height numeric
    )
  `)
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_media_filename ON media (filename)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_media_updated_at ON media (updated_at)`)

  // Categories collection
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS categories (
      id integer PRIMARY KEY NOT NULL,
      name text NOT NULL,
      slug text NOT NULL,
      updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      parent_id integer,
      wp_id numeric
    )
  `)
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug ON categories (slug)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories (parent_id)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_categories_updated_at ON categories (updated_at)`)

  // Tags collection
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS tags (
      id integer PRIMARY KEY NOT NULL,
      name text NOT NULL,
      slug text NOT NULL,
      updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      wp_id numeric
    )
  `)
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_slug ON tags (slug)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_tags_updated_at ON tags (updated_at)`)

  // Posts collection (main table without localized fields)
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS posts (
      id integer PRIMARY KEY NOT NULL,
      updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      title text NOT NULL,
      slug text NOT NULL,
      content text,
      excerpt text,
      featured_image_id integer,
      author_id integer,
      published_at text,
      _status text,
      seo_title text,
      seo_description text,
      wp_id numeric,
      UNIQUE(slug)
    )
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_updated_at ON posts (updated_at)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts (author_id)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_wp_id ON posts (wp_id)`)

  // Posts localization tables (using flat structure)
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS posts_title (
      id integer PRIMARY KEY NOT NULL,
      updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      locale_code text NOT NULL,
      value text NOT NULL,
      post_id integer NOT NULL,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE cascade
    )
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_title_post_id ON posts_title (post_id)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_title_locale ON posts_title (locale_code)`)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS posts_slug (
      id integer PRIMARY KEY NOT NULL,
      updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      locale_code text NOT NULL,
      value text NOT NULL,
      post_id integer NOT NULL,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE cascade
    )
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_slug_post_id ON posts_slug (post_id)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_slug_locale ON posts_slug (locale_code)`)
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_slug_unique ON posts_slug (post_id, locale_code)`)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS posts_content (
      id integer PRIMARY KEY NOT NULL,
      updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      locale_code text NOT NULL,
      value text,
      post_id integer NOT NULL,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE cascade
    )
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_content_post_id ON posts_content (post_id)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_content_locale ON posts_content (locale_code)`)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS posts_excerpt (
      id integer PRIMARY KEY NOT NULL,
      updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      locale_code text NOT NULL,
      value text,
      post_id integer NOT NULL,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE cascade
    )
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_excerpt_post_id ON posts_excerpt (post_id)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_excerpt_locale ON posts_excerpt (locale_code)`)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS posts_seo_title (
      id integer PRIMARY KEY NOT NULL,
      updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      locale_code text NOT NULL,
      value text,
      post_id integer NOT NULL,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE cascade
    )
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_seo_title_post_id ON posts_seo_title (post_id)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_seo_title_locale ON posts_seo_title (locale_code)`)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS posts_seo_description (
      id integer PRIMARY KEY NOT NULL,
      updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      locale_code text NOT NULL,
      value text,
      post_id integer NOT NULL,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE cascade
    )
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_seo_description_post_id ON posts_seo_description (post_id)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_seo_description_locale ON posts_seo_description (locale_code)`)

  // Junction tables
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS posts_categories (
      id integer PRIMARY KEY NOT NULL,
      order_index integer,
      post_id integer NOT NULL,
      category_id integer,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE cascade,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE cascade
    )
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_categories_post_id ON posts_categories (post_id)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_categories_category_id ON posts_categories (category_id)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_categories_order ON posts_categories (order_index)`)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS posts_tags (
      id integer PRIMARY KEY NOT NULL,
      order_index integer,
      post_id integer NOT NULL,
      tag_id integer,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE cascade,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE cascade
    )
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_tags_post_id ON posts_tags (post_id)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_tags_tag_id ON posts_tags (tag_id)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_tags_order ON posts_tags (order_index)`)

  // Versions table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS posts_versions (
      id integer PRIMARY KEY NOT NULL,
      updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      parent_id integer NOT NULL,
      version_title text,
      version_slug text,
      version_content text,
      version_excerpt text,
      version_featured_image_id integer,
      version_author_id integer,
      version_published_at text,
      version_wp_id numeric,
      created_by_id integer,
      FOREIGN KEY (parent_id) REFERENCES posts(id) ON DELETE cascade
    )
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_versions_parent_id ON posts_versions (parent_id)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_versions_created_at ON posts_versions (created_at)`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS posts_versions`)
  await db.run(sql`DROP TABLE IF EXISTS posts_tags`)
  await db.run(sql`DROP TABLE IF EXISTS posts_categories`)
  await db.run(sql`DROP TABLE IF EXISTS posts_seo_description`)
  await db.run(sql`DROP TABLE IF EXISTS posts_seo_title`)
  await db.run(sql`DROP TABLE IF EXISTS posts_excerpt`)
  await db.run(sql`DROP TABLE IF EXISTS posts_content`)
  await db.run(sql`DROP TABLE IF EXISTS posts_slug`)
  await db.run(sql`DROP TABLE IF EXISTS posts_title`)
  await db.run(sql`DROP TABLE IF EXISTS posts`)
  await db.run(sql`DROP TABLE IF EXISTS tags`)
  await db.run(sql`DROP TABLE IF EXISTS categories`)
  await db.run(sql`DROP TABLE IF EXISTS media`)
  await db.run(sql`DROP TABLE IF EXISTS users_sessions`)
  await db.run(sql`DROP TABLE IF EXISTS users`)
  await db.run(sql`DROP TABLE IF EXISTS payload_preferences_rels`)
  await db.run(sql`DROP TABLE IF EXISTS payload_preferences`)
  await db.run(sql`DROP TABLE IF EXISTS payload_locked_documents_rels`)
  await db.run(sql`DROP TABLE IF EXISTS payload_locked_documents`)
  await db.run(sql`DROP TABLE IF EXISTS payload_migrations`)
}
