-- KJA ERD metadata catalog in data/erd.sqlite (SQLite).
-- Run once manually, or start the app: it creates these empty tables automatically.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS metadata_tables (
  schema_name TEXT NOT NULL DEFAULT '' COLLATE NOCASE CHECK (schema_name = trim(schema_name)),
  table_name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(table_name)) > 0 AND table_name = trim(table_name)),
  logical_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (schema_name, table_name)
);
CREATE TABLE IF NOT EXISTS metadata_columns (
  schema_name TEXT NOT NULL DEFAULT '' COLLATE NOCASE CHECK (schema_name = trim(schema_name)),
  table_name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(table_name)) > 0 AND table_name = trim(table_name)),
  ordinal_position INTEGER NOT NULL CHECK (typeof(ordinal_position) = 'integer' AND ordinal_position > 0),
  column_name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(column_name)) > 0 AND column_name = trim(column_name)),
  logical_name TEXT NOT NULL DEFAULT '',
  data_type TEXT NOT NULL CHECK (length(trim(data_type)) > 0),
  is_pk INTEGER NOT NULL DEFAULT 0 CHECK (is_pk IN (0, 1)),
  is_nullable INTEGER NOT NULL DEFAULT 1 CHECK (is_nullable IN (0, 1)),
  is_unique INTEGER NOT NULL DEFAULT 0 CHECK (is_unique IN (0, 1)),
  default_value TEXT NOT NULL DEFAULT '',
  is_identity INTEGER NOT NULL DEFAULT 0 CHECK (is_identity IN (0, 1)),
  identity_mode TEXT NOT NULL DEFAULT 'BY DEFAULT' CHECK (identity_mode IN ('ALWAYS', 'BY DEFAULT')),
  PRIMARY KEY (schema_name, table_name, column_name),
  UNIQUE (schema_name, table_name, ordinal_position),
  CHECK (is_pk = 0 OR is_nullable = 0),
  CHECK (is_identity = 0 OR (is_nullable = 0 AND default_value = '')),
  FOREIGN KEY (schema_name, table_name) REFERENCES metadata_tables (schema_name, table_name) ON DELETE CASCADE
);
