

# RetroCycles Panel — Full Integration Plan

## Current State Assessment

The codebase is already well-structured with real Supabase integration:
- Database tables exist: servers, server_events, bans, metrics, server_configs, map_files, players, user_roles
- Auth works via Supabase Auth with role-based access (admin/moderator/viewer)
- Real-time subscriptions are wired for servers, console events, and metrics
- All CRUD operations use `supabaseApi.ts` with real Supabase queries
- RLS policies are in place on all tables
- Storage bucket `maps` exists for file uploads

**What's actually missing or incomplete:**

1. **Config keys are sparse** — only 24 keys vs the 40+ from the uploaded Armagetron docs
2. **Console commands list is incomplete** — missing many commands from the server admin docs (BAN_IP, UNBAN_IP, SILENCE, VOICE, PLAYERS, LOGIN, LOGOUT, MAP_FILE, etc.)
3. **Server control actions just update status in DB** — no edge function to proxy commands to a real game server agent
4. **Realtime for server_events not enabled** — need `ALTER PUBLICATION supabase_realtime ADD TABLE` for tables used in realtime
5. **No `profiles` table** — Settings page shows user_id UUIDs instead of emails
6. **Server browser returns empty array** — `getBrowserServers()` returns `[]`
7. **No edge function for server control** — start/stop/restart just flip a DB flag
8. **`handle_new_user` trigger not created** — the function exists but the trigger on `auth.users` was never attached
9. **`update_updated_at_column` trigger not attached** to servers/server_configs tables
10. **ConfirmDialog `onOpenChange` prop mismatch** — SettingsPage passes `onOpenChange` but ServerControlBar uses `onCancel`

## Implementation Plan

### Phase 1: Database Fixes (Migration)
- Enable realtime on `server_events`, `metrics`, `servers`, `players` tables
- Create trigger for `handle_new_user` on `auth.users` (it exists as function but no trigger)
- Create triggers for `update_updated_at_column` on `servers` and `server_configs`
- Add `profiles` table (id uuid PK references auth.users, email text, display_name text, created_at) with RLS
- Create trigger to auto-populate profiles on user signup
- Add `audit_log` table for admin action tracking

### Phase 2: Expand Config Keys from Uploaded Docs
Update `src/data/configKeys.ts` with all keys from the configuration docs:
- Physics: `CYCLE_SPEED_DECAY_BELOW`, `CYCLE_SPEED_DECAY_ABOVE`, `CYCLE_ACCEL_OFFSET`, `CYCLE_WALL_NEAR`, `CYCLE_ACCEL_SELF`, `CYCLE_ACCEL_TEAM`, `CYCLE_ACCEL_ENEMY`, `CYCLE_ACCEL_RIM`, `CYCLE_ACCEL_SLINGSHOT`, `CYCLE_ACCEL_TUNNEL`, `CYCLE_DELAY`, `CYCLE_DELAY_TIMEBASED`, `CYCLE_TURN_SPEED_FACTOR`, `CYCLE_RUBBER_SPEED`, `CYCLE_RUBBER_TIME`, `CYCLE_RUBBER_MINDISTANCE`, `CYCLE_RUBBER_MINADJUST`, `CYCLE_RUBBER_TIMEBASED`, `CYCLE_RUBBER_DELAY`, `CYCLE_RUBBER_DELAY_BONUS`, `CYCLE_PING_RUBBER`, `CYCLE_RUBBER_MINDISTANCE_RATIO`, `CYCLE_RUBBER_MINDISTANCE_RESERVOIR`, `CYCLE_RUBBER_MINDISTANCE_UNPREPARED`, `CYCLE_RUBBER_MINDISTANCE_PREPARATION`, `CYCLE_SPEED_BOOST`, `CYCLE_BOOSTFACTOR_SELF`, `CYCLE_BOOSTFACTOR_TEAM`, `CYCLE_BOOSTFACTOR_ENEMY`, `CYCLE_BOOSTFACTOR_RIM`, `CYCLE_BOOST_SELF`, `CYCLE_BOOST_TEAM`, `CYCLE_BOOST_ENEMY`, `CYCLE_BOOST_RIM`, `CYCLE_WALL_LENGTH`
- Network: `SERVER_IP`, `SERVER_PORT`, `MAX_OUT_RATE`, `NETWORK_AUTOBAN_FACTOR`, `NETWORK_AUTOBAN_OFFSET`, `MASTER_SERVER_NAME`, `MASTER_SERVER_PORT`
- Gameplay: `MAP_FILE`, `MAP_URI`, `RESOURCE_REPOSITORY`, `ARENA_AXES`, `ROUND_WINNER_TEAM_OVERRIDE`, `WIN_ZONE_RANDOMNESS`, `WIN_ZONE_EXPAND`, `TEAM_MAX_IMBALANCE`, `ALLOW_TEAM_NAME_COLOR`, `ALLOW_TEAM_NAME_PLAYER`, `SP_SCORE_WIN`, `SP_LIMIT_ROUNDS`, `SP_LIMIT_TIME`, `SP_AIS`
- Admin: `SPAM_PROTECTION_CHAT`, `SPAM_PENALTY`, `PASSWORD_HASH`, `ADMIN_IP_LIST`, `LIMIT_TIME`, `SCORE_HOLE`
- Camera: `CAMERA_FORBID_FREE`, `CAMERA_FORBID_CUSTOM_GLANCE`, `CAMERA_OVERRIDE_CUSTOM_GLANCE`

### Phase 3: Expand Console Commands
Update `ARMA_COMMANDS` in `ConsoleTab.tsx` with full list from server admin docs:
- Player management: `PLAYERS`, `KICK`, `BAN`, `BAN_IP`, `UNBAN`, `UNBAN_IP`, `SILENCE`, `VOICE`
- Auth: `LOGIN`, `LOGOUT`
- Server control: `QUIT`, `EXIT`, `SHUTDOWN`, `RESTART`
- Chat: `SAY`, `CENTER_MESSAGE`, `CONSOLE_MESSAGE`
- Config: `INCLUDE`, `RINCLUDE`, `MAP_FILE`, `DEDICATED_FPS`
- All config variables (since any `KEY value` is a valid console command)

### Phase 4: Edge Function for Server Control
Create `supabase/functions/server-control/index.ts`:
- Accepts `{ serverId, action, command? }` 
- Validates auth (admin/moderator required)
- For `start/stop/restart/kill`: updates server status in DB and logs event to `server_events`
- For `command`: inserts into `server_events` with type `command`
- Returns structured response
- This is the proxy layer; a real game server agent would poll `server_events` for commands

### Phase 5: Settings Page with Profiles
- Update SettingsPage to show email from profiles table instead of raw UUIDs
- Add password change functionality
- Add audit log viewer for admins

### Phase 6: Server Browser Edge Function
Create `supabase/functions/server-browser/index.ts`:
- Fetches from armagetron master server list via HTTP scraping
- Caches results for 30 seconds
- Returns structured server list

### Phase 7: UI Refinements
- Fix ConfirmDialog prop consistency across all usages
- Fix the LoadingSpinner forwardRef warning in ProtectedRoute
- Add real-time player count badge in sidebar/topbar

## Files to Create/Modify

**New files:**
- `supabase/functions/server-control/index.ts` — edge function for server actions
- `supabase/functions/server-browser/index.ts` — edge function for master server query

**Database migration:**
- Enable realtime on key tables
- Create profiles table + trigger
- Create audit_log table
- Attach triggers for updated_at and handle_new_user

**Modified files:**
- `src/data/configKeys.ts` — expand to 80+ config keys with full Armagetron docs
- `src/components/tabs/ConsoleTab.tsx` — expand ARMA_COMMANDS, use edge function for commands
- `src/lib/supabaseApi.ts` — use edge functions for server control and browser
- `src/pages/SettingsPage.tsx` — show emails via profiles, add password change
- `src/pages/ServerBrowserPage.tsx` — call edge function instead of empty array
- `src/pages/ServerDetailPage.tsx` — use edge function for start/stop/restart/kill
- `src/components/server/ServerCard.tsx` — use edge function for actions
- `src/components/shared/LoadingSpinner.tsx` — add forwardRef to fix warning
- `src/App.tsx` — fix ProtectedRoute ref warning

