

# Full Pipeline: Blank Page Fix, Host Settings Hub, Editable Paths, End-to-End Enhancements

## Audit Report: Published Blank Page Root Cause

**Finding 1: `onAuthStateChange` double-subscription leak**
`authStore.ts` `initialize()` is called by `AuthInitializer` on mount. However, it calls `supabase.auth.onAuthStateChange()` without storing the subscription, so if `initialize` is called twice (React StrictMode, HMR), there are multiple listeners. More critically, the subscription's `_event` parameter is never checked — on `SIGNED_OUT` or `TOKEN_REFRESHED`, the background `fetchRole` fires unnecessarily.

**Finding 2: Migration `20260406072054` has unguarded `ALTER PUBLICATION`**
Lines 31-32 have bare `ALTER PUBLICATION supabase_realtime ADD TABLE` without `DO $$ BEGIN...EXCEPTION`. If tables were already in the publication (they are from the first migration's trigger), **this migration fails entirely**, rolling back the updated `handle_new_user()` function. The subsequent migration `20260411101529` re-applies the trigger but does NOT re-apply the updated function body (which includes `INSERT INTO profiles`). So on the live DB, `handle_new_user()` may be the old version without profile creation, causing profile-dependent queries to fail silently.

**Finding 3: `initialize()` races with `onAuthStateChange`**
Both `onAuthStateChange` and the manual `getSession()` call set state. On a cold start with a valid session cookie, both fire near-simultaneously, leading to two `fetchRole` calls. This is wasteful but not the blank page cause.

**Finding 4: `ProtectedRoute` timeout is 5s — if `isLoading` never resolves, user sees login page**
If `initialize()` throws (e.g., network error on `getSession()`), `isLoading` stays `true`, the 5s timeout hits, and the user is redirected to login. But since they're not authenticated, they see the login page — not a blank page. So this is a UX issue, not the blank page.

**Actual blank page cause**: The `ErrorBoundary` catches render errors but the error screen requires CSS to display. If the Supabase client fails to initialize (e.g., environment variables missing in the build), the entire app crashes before any component renders. The `vite.config.ts` and `package.json` are correct — `build` output goes to `dist/` by default, and asset paths use `/src/main.tsx` (absolute from root, which Vite resolves correctly). The most likely published blank page scenario is: **migration failure prevents `handle_new_user` from creating a profile row, the `profiles` RLS policy (from migration 7) restricts SELECT to `id = auth.uid()`, but `getProfiles()` in SettingsPage queries all profiles causing a silent RLS error**. Combined with the `getServers()` query succeeding but returning empty results for a new user who has a `viewer` role (since RLS allows SELECT), the dashboard renders but with nothing visible.

**However**, the user says "blank page" not "empty dashboard". This means something is crashing. The most likely crash: `server.cpu_percent.toFixed(1)` on line 102 of `ServerDetailPage.tsx` — if `cpu_percent` is `null` (not `0`), `.toFixed()` throws. Same for `memory_mb`. The dashboard has the same issue on lines 54-55.

## Plan

### 1. Fix auth store: prevent double-subscription, handle errors
- Store the `onAuthStateChange` subscription and unsubscribe on re-init
- Wrap `getSession()` in try/catch — on failure, set `isLoading: false`
- Check `_event` to skip `fetchRole` on `SIGNED_OUT`

### 2. Fix null-safety across all numeric property access
- `DashboardPage.tsx` lines 54-55: `s.cpu_percent` and `s.memory_mb` may be null
- `ServerDetailPage.tsx` lines 101-103: same issue
- Add `?? 0` fallbacks for all `cpu_percent`, `memory_mb`, `player_count`, `uptime` accesses

### 3. Rename Agent Wizard → Host Settings
- Rename route from `/agent-wizard` to `/host-settings` in `App.tsx`
- Update all navigation references in `AppShell.tsx`, `DashboardPage.tsx`, `SettingsPage.tsx`, `OverviewTab.tsx`
- Rename the nav item label from "Agent Wizard" to "Host Settings"

### 4. Expand Host Settings (formerly Agent Wizard) into a full configuration hub
**Current state**: Single-page script generator with binary tests.
**New structure** — 4 tabbed sections:

**Tab 1: Registered Hosts**
- List servers grouped by `agent_url`
- Connection status indicator (green/red) via `testAgentConnection()`
- "Test All" button
- Quick link to each server detail page

**Tab 2: Host Setup**
- Keep existing script generator
- Add localhost preset (`127.0.0.1:8080`)
- Add Docker Compose snippet toggle
- Binary availability tests (existing)

**Tab 3: Server Paths (NEW)**
- Editable form for each server's `executable_path`, `data_dir`, `config_dir`, `port`, `max_players`
- Load current values from DB via `getServer()`
- Save via `updateServer()`
- Allow changing these after server creation

**Tab 4: Agent API Reference**
- Full endpoint spec (control, status, console, files, launch)
- Move from SettingsPage into here

### 5. Make server paths editable from OverviewTab
- Add edit buttons next to Executable, Data Dir, Config Dir fields
- Inline editing with save/cancel
- Call `updateServer()` on save

### 6. Fix ConfirmDialog usage in FilesTab
- `FilesTab` passes `onCancel` but `ConfirmDialog` also needs `onOpenChange` for proper closing behavior
- Add `onOpenChange` prop

### 7. Fix migration: ensure `handle_new_user` includes profile creation
- New migration that re-creates the function with the profile INSERT
- Idempotent — uses `CREATE OR REPLACE`

### 8. Dashboard quick action link update
- Change "Agent Wizard" → "Host Settings" in quick actions

## Files Modified

| File | Change |
|------|--------|
| `src/stores/authStore.ts` | Fix double-subscription, error handling, event filtering |
| `src/pages/AgentWizardPage.tsx` | Rename + rewrite as tabbed Host Settings hub with Registered Hosts, Setup, Server Paths, API Reference |
| `src/App.tsx` | Rename route `/agent-wizard` → `/host-settings` |
| `src/components/layout/AppShell.tsx` | Update nav item label and URL |
| `src/pages/DashboardPage.tsx` | Null-safe numeric access, rename quick action |
| `src/pages/ServerDetailPage.tsx` | Null-safe numeric access |
| `src/pages/SettingsPage.tsx` | Update link to `/host-settings`, remove API spec section |
| `src/components/tabs/OverviewTab.tsx` | Add inline editing for paths, update wizard link |
| `src/components/tabs/FilesTab.tsx` | Fix ConfirmDialog `onOpenChange` |
| DB migration (new) | Re-apply `handle_new_user` with profile creation, ensure trigger exists |

No new pages or edge functions. 1 migration, 10 files modified.

