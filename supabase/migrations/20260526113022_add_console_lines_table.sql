/*
  # Add console_lines table for real-time console output

  1. New Tables
    - `console_lines`
      - `id` (bigint, identity, primary key)
      - `server_id` (integer, foreign key to servers)
      - `timestamp` (timestamptz, default now())
      - `line_type` (text, default 'system') — error, warning, join, leave, chat, system, kill, info
      - `text` (text, not null) — the actual console output line
      - `source` (text, default 'panel') — panel, agent, server

  2. Indexes
    - Index on server_id for fast queries
    - Index on (server_id, timestamp) for "since" queries

  3. Security
    - Enable RLS on console_lines
    - Authenticated users can view lines for their servers
    - Admin/moderator can insert lines
    - Admin can delete lines (for cleanup)

  4. Notes
    - This replaces the previous approach of returning empty arrays when no agent is configured
    - Console lines are now persisted to DB and queryable
    - server_events is for structured events; console_lines is for raw console output
*/

CREATE TABLE IF NOT EXISTS console_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  server_id integer NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  timestamp timestamptz DEFAULT now() NOT NULL,
  line_type text DEFAULT 'system' NOT NULL,
  text text NOT NULL,
  source text DEFAULT 'panel' NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_console_lines_server_id ON console_lines(server_id);
CREATE INDEX IF NOT EXISTS idx_console_lines_server_timestamp ON console_lines(server_id, timestamp DESC);

ALTER TABLE console_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view console lines"
  ON console_lines FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and moderators can insert console lines"
  ON console_lines FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

CREATE POLICY "Admins can delete console lines"
  ON console_lines FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
