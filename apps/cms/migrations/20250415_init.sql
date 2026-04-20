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
);
CREATE INDEX users_updated_at_idx ON users (updated_at);
CREATE INDEX users_created_at_idx ON users (created_at);
CREATE UNIQUE INDEX users_email_idx ON users (email);

CREATE TABLE IF NOT EXISTS users_sessions (
  _order integer NOT NULL,
  _parent_id integer NOT NULL,
  id text PRIMARY KEY NOT NULL,
  created_at text,
  expires_at text NOT NULL,
  FOREIGN KEY (_parent_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX users_sessions_order_idx ON users_sessions (_order);
CREATE INDEX users_sessions_parent_id_idx ON users_sessions (_parent_id);

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
);
CREATE INDEX media_updated_at_idx ON media (updated_at);
CREATE INDEX media_created_at_idx ON media (created_at);
CREATE UNIQUE INDEX media_filename_idx ON media (filename);

CREATE TABLE IF NOT EXISTS categories (
  id integer PRIMARY KEY NOT NULL,
  updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  name text NOT NULL,
  slug text NOT NULL
);
CREATE UNIQUE INDEX categories_slug_idx ON categories (slug);
CREATE INDEX categories_updated_at_idx ON categories (updated_at);

CREATE TABLE IF NOT EXISTS tags (
  id integer PRIMARY KEY NOT NULL,
  updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  name text NOT NULL,
  slug text NOT NULL
);
CREATE UNIQUE INDEX tags_slug_idx ON tags (slug);
CREATE INDEX tags_updated_at_idx ON tags (updated_at);

CREATE TABLE IF NOT EXISTS posts (
  id integer PRIMARY KEY NOT NULL,
  updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  title text NOT NULL,
  slug text NOT NULL,
  content text
);
CREATE INDEX posts_updated_at_idx ON posts (updated_at);
CREATE INDEX posts_created_at_idx ON posts (created_at);
CREATE INDEX posts_slug_idx ON posts (slug);

CREATE TABLE IF NOT EXISTS payload_locked_documents (
  id integer PRIMARY KEY NOT NULL,
  global_slug text,
  updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
CREATE INDEX payload_locked_documents_global_slug_idx ON payload_locked_documents (global_slug);
CREATE INDEX payload_locked_documents_updated_at_idx ON payload_locked_documents (updated_at);
CREATE INDEX payload_locked_documents_created_at_idx ON payload_locked_documents (created_at);

CREATE TABLE IF NOT EXISTS payload_locked_documents_rels (
  id integer PRIMARY KEY NOT NULL,
  _order integer,
  _parent_id integer NOT NULL,
  path text NOT NULL,
  users_id integer,
  media_id integer,
  FOREIGN KEY (_parent_id) REFERENCES payload_locked_documents(id) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX payload_locked_documents_rels_order_idx ON payload_locked_documents_rels (_order);
CREATE INDEX payload_locked_documents_rels_parent_idx ON payload_locked_documents_rels (_parent_id);
CREATE INDEX payload_locked_documents_rels_path_idx ON payload_locked_documents_rels (path);
CREATE INDEX payload_locked_documents_rels_users_id_idx ON payload_locked_documents_rels (users_id);
CREATE INDEX payload_locked_documents_rels_media_id_idx ON payload_locked_documents_rels (media_id);

CREATE TABLE IF NOT EXISTS payload_preferences (
  id integer PRIMARY KEY NOT NULL,
  key text,
  value text,
  updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
CREATE INDEX payload_preferences_key_idx ON payload_preferences (key);
CREATE INDEX payload_preferences_updated_at_idx ON payload_preferences (updated_at);
CREATE INDEX payload_preferences_created_at_idx ON payload_preferences (created_at);

CREATE TABLE IF NOT EXISTS payload_preferences_rels (
  id integer PRIMARY KEY NOT NULL,
  _order integer,
  _parent_id integer NOT NULL,
  path text NOT NULL,
  users_id integer,
  FOREIGN KEY (_parent_id) REFERENCES payload_preferences(id) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX payload_preferences_rels_order_idx ON payload_preferences_rels (_order);
CREATE INDEX payload_preferences_rels_parent_idx ON payload_preferences_rels (_parent_id);
CREATE INDEX payload_preferences_rels_path_idx ON payload_preferences_rels (path);
CREATE INDEX payload_preferences_rels_users_id_idx ON payload_preferences_rels (users_id);

CREATE TABLE IF NOT EXISTS payload_migrations (
  id integer PRIMARY KEY NOT NULL,
  name text,
  batch numeric,
  updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
CREATE INDEX payload_migrations_updated_at_idx ON payload_migrations (updated_at);
CREATE INDEX payload_migrations_created_at_idx ON payload_migrations (created_at);
