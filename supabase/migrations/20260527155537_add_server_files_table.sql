/*
  # Add server_files table for panel-managed file storage

  1. New Tables
    - `server_files`
      - `id` (serial, primary key)
      - `server_id` (integer, foreign key to servers)
      - `path` (text, file path)
      - `content` (text, file content)
      - `is_directory` (boolean, whether this is a directory)
      - `size_bytes` (integer, file size)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `server_files` table
    - Add policy for authenticated users to read/write files for servers they can access

  3. Indexes
    - Unique index on (server_id, path) for fast lookups
*/

CREATE TABLE IF NOT EXISTS server_files (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT DEFAULT '',
  is_directory BOOLEAN DEFAULT false,
  size_bytes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(server_id, path)
);

-- Enable RLS
ALTER TABLE server_files ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage files for any server (viewer+ access)
CREATE POLICY "Authenticated users can read server files"
  ON server_files FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and moderators can insert server files"
  ON server_files FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'moderator')
    )
  );

CREATE POLICY "Admins and moderators can update server files"
  ON server_files FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'moderator')
    )
  );

CREATE POLICY "Admins and moderators can delete server files"
  ON server_files FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'moderator')
    )
  );

-- Index for fast path lookups
CREATE INDEX IF NOT EXISTS idx_server_files_server_path ON server_files(server_id, path);
CREATE INDEX IF NOT EXISTS idx_server_files_server_id ON server_files(server_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_server_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER server_files_updated_at
  BEFORE UPDATE ON server_files
  FOR EACH ROW
  EXECUTE FUNCTION update_server_files_updated_at();
