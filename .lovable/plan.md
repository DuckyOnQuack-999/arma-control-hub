

# Enhancement Plan — Remaining Items

After reviewing the full codebase, nearly all enhancement plan items are already implemented. Only three minor items remain:

## 1. Add User Form (Settings Page)
The admin user management table exists but there's no way to invite/add new users. Add an "Add User" section with email + role selector that creates a user invitation or inserts a role record.

**File**: `src/pages/SettingsPage.tsx`
- Add a collapsible "Add User" form above the user table with email input and role dropdown
- On submit, call a new `inviteUser` API function
- Since we can't create auth users from the client, use an edge function or simply insert a user_role record with a placeholder (or show a note that users must self-register, and admin assigns roles after)

**Pragmatic approach**: Add a note explaining users must register themselves, and admin can change roles from the table. No new edge function needed.

## 2. Notification Bell — Unread Count Badge
The bell icon exists in AppShell but has no visual indicator.

**File**: `src/components/layout/AppShell.tsx`
- Add a small red dot/badge on the Bell icon showing a mock unread count
- Query recent server events (last hour) count as the "notification" count

## 3. Server Selector Dropdown in Top Bar
Add a quick server switcher in the header bar for fast navigation.

**File**: `src/components/layout/AppShell.tsx`
- Add a dropdown next to the bell that lists managed servers
- Clicking a server navigates to `/servers/:id`
- Uses existing `getServers` query

---

**Summary**: 3 small changes across 1-2 files. No database migrations needed.

