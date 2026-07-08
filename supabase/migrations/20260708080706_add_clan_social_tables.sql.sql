/*
# Add Clan Social Features

## Purpose
This migration adds clan social features (clans, posts, comments, likes).

## New Tables

### clans
- `id` (uuid, primary key): Unique clan identifier
- `name` (text, unique): Clan display name
- `tag` (text, unique): Short clan tag shown in-game
- `description` (text): Optional clan description
- `owner_id` (uuid, NOT NULL, defaults to auth.uid()): Clan creator/leader
- `created_at` (timestamptz): Creation timestamp
- `updated_at` (timestamptz): Last update timestamp

### clan_members
- `user_id` (uuid, primary key): User ID from auth.users
- `clan_id` (uuid, not null): Reference to clan
- `role` (text): 'leader', 'officer', or 'member'
- `joined_at` (timestamptz): When user joined clan
- Foreign key to clans with CASCADE DELETE

### posts
- `id` (uuid, primary key): Unique post identifier
- `author_id` (uuid, NOT NULL, defaults to auth.uid()): Post author
- `clan_id` (uuid, nullable): NULL for public posts, clan_id for clan-only posts
- `content` (text): Post content
- `image_url` (text, nullable): Optional image attachment
- `created_at` (timestamptz): Creation timestamp
- `updated_at` (timestamptz): Last update timestamp

### comments
- `id` (uuid, primary key): Unique comment identifier
- `post_id` (uuid, not null): Reference to parent post
- `author_id` (uuid, NOT NULL, defaults to auth.uid()): Comment author
- `content` (text): Comment content
- `created_at` (timestamptz): Creation timestamp
- Foreign key to posts with CASCADE DELETE

### likes
- `user_id` (uuid, part of primary key): User who liked
- `post_id` (uuid, part of primary key): Liked post
- `created_at` (timestamptz): When liked
- Primary key on (user_id, post_id) to prevent duplicate likes

## RLS Policy Changes

### clans
- SELECT: Anyone can view clans (public directory)
- INSERT: Authenticated users can create clans (become owner)
- UPDATE: Only clan leaders can update clan info
- DELETE: Only clan leaders can delete clan

### clan_members
- SELECT: Clan members can view own clan's members
- INSERT: Only leaders can add members
- UPDATE: Only leaders can change member roles
- DELETE: Leaders can remove any member, members can remove themselves

### posts
- SELECT: 
  - Public posts (clan_id IS NULL) visible to all authenticated users
  - Clan posts visible only to clan members
- INSERT: Authenticated users can create posts
- UPDATE: Only post authors can update their posts
- DELETE: Post authors or clan leaders/officers can delete

### comments
- SELECT: Follow post visibility rules
- INSERT: Authenticated users can comment on visible posts
- UPDATE: Only comment authors can update
- DELETE: Comment authors or post authors can delete

### likes
- SELECT: Users can see likes on posts they can view
- INSERT: Authenticated users can like visible posts
- DELETE: Only the user who liked can remove their like

## Notes

1. All user_id columns DEFAULT to auth.uid() so inserts succeed without client passing owner
2. Clan membership is limited to ONE clan per user (primary key on user_id)
3. Cascade deletes ensure cleanup when clans or posts are removed
4. Posts with NULL clan_id are public; posts with clan_id are clan-internal
*/

-- ============================================
-- CLANS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS clans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  tag text UNIQUE NOT NULL,
  description text DEFAULT '',
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE clans ENABLE ROW LEVEL SECURITY;

-- Anyone can view clans (public directory)
DROP POLICY IF EXISTS "clans_select_public" ON clans;
CREATE POLICY "clans_select_public" ON clans FOR SELECT
  TO authenticated USING (true);

-- Any authenticated user can create a clan (becomes owner via DEFAULT)
DROP POLICY IF EXISTS "clans_insert_authenticated" ON clans;
CREATE POLICY "clans_insert_authenticated" ON clans FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id);

-- Only clan leaders can update clan info
DROP POLICY IF EXISTS "clans_update_leader" ON clans;
CREATE POLICY "clans_update_leader" ON clans FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Only clan leaders can delete clan
DROP POLICY IF EXISTS "clans_delete_leader" ON clans;
CREATE POLICY "clans_delete_leader" ON clans FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);

-- ============================================
-- CLAN MEMBERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS clan_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  clan_id uuid NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'officer', 'member')),
  joined_at timestamptz DEFAULT now()
);

ALTER TABLE clan_members ENABLE ROW LEVEL SECURITY;

-- Clan members can view own clan's members
DROP POLICY IF EXISTS "clan_members_select_member" ON clan_members;
CREATE POLICY "clan_members_select_member" ON clan_members FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM clan_members cm
      WHERE cm.clan_id = clan_members.clan_id AND cm.user_id = auth.uid()
    )
  );

-- Leaders can add members; new member's user_id comes from authenticated session
DROP POLICY IF EXISTS "clan_members_insert_leader" ON clan_members;
CREATE POLICY "clan_members_insert_leader" ON clan_members FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM clan_members cm
      WHERE cm.clan_id = clan_members.clan_id 
      AND cm.user_id = auth.uid() 
      AND cm.role = 'leader'
    )
  );

-- Leaders can update member roles
DROP POLICY IF EXISTS "clan_members_update_leader" ON clan_members;
CREATE POLICY "clan_members_update_leader" ON clan_members FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM clan_members cm
      WHERE cm.clan_id = clan_members.clan_id 
      AND cm.user_id = auth.uid() 
      AND cm.role = 'leader'
    )
  );

-- Leaders can remove any member; members can remove themselves
DROP POLICY IF EXISTS "clan_members_delete_leader_or_self" ON clan_members;
CREATE POLICY "clan_members_delete_leader_or_self" ON clan_members FOR DELETE
  TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM clan_members cm
      WHERE cm.clan_id = clan_members.clan_id 
      AND cm.user_id = auth.uid() 
      AND cm.role = 'leader'
    )
  );

-- ============================================
-- POSTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  clan_id uuid REFERENCES clans(id) ON DELETE CASCADE,
  content text NOT NULL,
  image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Select: public posts OR clan posts visible to members
DROP POLICY IF EXISTS "posts_select_visible" ON posts;
CREATE POLICY "posts_select_visible" ON posts FOR SELECT
  TO authenticated USING (
    clan_id IS NULL
    OR EXISTS (
      SELECT 1 FROM clan_members cm
      WHERE cm.clan_id = posts.clan_id AND cm.user_id = auth.uid()
    )
  );

-- Authenticated users can create posts (author_id defaults to auth.uid())
DROP POLICY IF EXISTS "posts_insert_authenticated" ON posts;
CREATE POLICY "posts_insert_authenticated" ON posts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = author_id);

-- Only post authors can update
DROP POLICY IF EXISTS "posts_update_author" ON posts;
CREATE POLICY "posts_update_author" ON posts FOR UPDATE
  TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);

-- Post authors OR clan leaders/officers can delete
DROP POLICY IF EXISTS "posts_delete_author_or_officer" ON posts;
CREATE POLICY "posts_delete_author_or_officer" ON posts FOR DELETE
  TO authenticated USING (
    auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM clan_members cm
      WHERE cm.clan_id = posts.clan_id 
      AND cm.user_id = auth.uid() 
      AND cm.role IN ('leader', 'officer')
    )
  );

-- ============================================
-- COMMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Follow post visibility: public posts visible to all, clan posts to members
DROP POLICY IF EXISTS "comments_select_visible" ON comments;
CREATE POLICY "comments_select_visible" ON comments FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM posts p
      WHERE p.id = comments.post_id
      AND (
        p.clan_id IS NULL
        OR EXISTS (
          SELECT 1 FROM clan_members cm
          WHERE cm.clan_id = p.clan_id AND cm.user_id = auth.uid()
        )
      )
    )
  );

-- Authenticated users can comment on visible posts
DROP POLICY IF EXISTS "comments_insert_authenticated" ON comments;
CREATE POLICY "comments_insert_authenticated" ON comments FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM posts p
      WHERE p.id = comments.post_id
      AND (
        p.clan_id IS NULL
        OR EXISTS (
          SELECT 1 FROM clan_members cm
          WHERE cm.clan_id = p.clan_id AND cm.user_id = auth.uid()
        )
      )
    )
  );

-- Only comment authors can update
DROP POLICY IF EXISTS "comments_update_author" ON comments;
CREATE POLICY "comments_update_author" ON comments FOR UPDATE
  TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);

-- Comment authors or post authors can delete
DROP POLICY IF EXISTS "comments_delete_author" ON comments;
CREATE POLICY "comments_delete_author" ON comments FOR DELETE
  TO authenticated USING (
    auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM posts p WHERE p.id = comments.post_id AND p.author_id = auth.uid()
    )
  );

-- ============================================
-- LIKES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS likes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

-- Users can see likes on posts they can view
DROP POLICY IF EXISTS "likes_select_visible" ON likes;
CREATE POLICY "likes_select_visible" ON likes FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM posts p
      WHERE p.id = likes.post_id
      AND (
        p.clan_id IS NULL
        OR EXISTS (
          SELECT 1 FROM clan_members cm
          WHERE cm.clan_id = p.clan_id AND cm.user_id = auth.uid()
        )
      )
    )
  );

-- Authenticated users can like visible posts
DROP POLICY IF EXISTS "likes_insert_authenticated" ON likes;
CREATE POLICY "likes_insert_authenticated" ON likes FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM posts p
      WHERE p.id = likes.post_id
      AND (
        p.clan_id IS NULL
        OR EXISTS (
          SELECT 1 FROM clan_members cm
          WHERE cm.clan_id = p.clan_id AND cm.user_id = auth.uid()
        )
      )
    )
  );

-- Only the user who liked can remove their like
DROP POLICY IF EXISTS "likes_delete_self" ON likes;
CREATE POLICY "likes_delete_self" ON likes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- INDEXES for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_clan_members_clan_id ON clan_members(clan_id);
CREATE INDEX IF NOT EXISTS idx_posts_clan_id ON posts(clan_id);
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);

-- ============================================
-- FIX: Add operator role to audit_log INSERT
-- ============================================
DROP POLICY IF EXISTS "audit_log_insert" ON audit_log;
CREATE POLICY "audit_log_insert" ON audit_log FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'operator', 'moderator')
    )
  );
