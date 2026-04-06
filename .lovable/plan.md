

# Complete Code Review, Bug Fixes & Feature Expansion

## Blank Page Root Cause

The blank page is caused by the `get_user_role` RPC call in `authStore.ts` line 25. If the user has no role entry in `user_roles` (new users), the RPC returns `null`, and the role defaults to `'viewer'`. However, the RLS policies require roles for all data access — so a user without a `user_roles` row can authenticate but sees nothing (queries return empty/error). The real fix: ensure a role row is created on signup via a database trigger.

Additionally, the `ProtectedRoute` timeout of 5 seconds can cause a flash-to-login if `resolveSession` takes too long due to the RPC call.

## Issues Found

### 1. Missing auto-role assignment on signup
New users get no `user_roles` row. The first user should be `admin`, subsequent users `viewer`. A database trigger is needed.

### 2. `handleSilence` in PlayersTab is a no-op (line 56-58)
It shows a toast but never sends the `SILENCE` command to the server. Must call `serverAction(serverId, 'command', 'SILENCE playerName')`.

### 3. Console `handleReconnect` is fake (line 212-215)
It just sets `connected = true` and shows a toast. It should unsubscribe and re-subscribe to the Supabase channel.

### 4. `getRecentEventsAll` joins server name manually
This works but is inefficient. Should use a single query or accept current approach (it's fine functionally).

### 5. No password reset flow
Login page has no "Forgot Password" link. No `/reset-password` route exists.

### 6. No delete server confirmation or functionality from dashboard
`ServerCard` has no delete button. `deleteServer` exists in API but is unreachable from UI.

### 7. Missing realtime on `server_events` table
The `server_events` table is used for realtime subscriptions in `ConsoleTab` but may not be added to the `supabase_realtime` publication.

### 8. Metrics INSERT policy blocks edge functions
The metrics INSERT policy requires `has_role(auth.uid(), 'admin')` — but edge functions use the service role key, which bypasses RLS. This is actually fine since service role bypasses RLS.

### 9. Binary storage bucket may not be public
`getBinaryDownloadUrl` uses `getPublicUrl` but the `binaries` bucket may not have public access enabled, causing the Agent Wizard download test to fail.

## Plan

### Database Migration
Create a trigger to auto-assign roles on signup:
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  user_count int;
  assigned_role app_role;
BEGIN
  SELECT count(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'viewer';
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

Also enable realtime on `servers` and `server_events`:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.servers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_events;
```

### File: `src/stores/authStore.ts`
- Add fallback: if `get_user_role` returns null, default to `'viewer'` (already done, but add explicit handling)
- Add retry logic with a brief delay if role lookup fails on first try

### File: `src/pages/LoginPage.tsx`
- Add "Forgot Password?" link below the form
- Create a `ForgotPasswordDialog` that calls `supabase.auth.resetPasswordForEmail()`

### New File: `src/pages/ResetPasswordPage.tsx`
- Route: `/reset-password`
- Checks URL for `type=recovery` hash
- Shows new password form
- Calls `supabase.auth.updateUser({ password })`

### File: `src/App.tsx`
- Add `/reset-password` route (public, outside `ProtectedRoute`)

### File: `src/components/tabs/PlayersTab.tsx`
- Fix `handleSilence`: actually send `SILENCE` command via `serverAction(serverId, 'command', \`SILENCE ${name}\`)`
- Add error handling

### File: `src/components/tabs/ConsoleTab.tsx`
- Fix `handleReconnect`: unsubscribe existing channel and re-create the subscription
- Store channel ref to enable proper cleanup

### File: `src/components/server/ServerCard.tsx`
- Add a delete button (trash icon) with confirmation dialog
- Call `deleteServer(server.id)` and invalidate queries

### File: `src/pages/DashboardPage.tsx`
- Add "delete" support via `ServerCard` (already handled by card changes)

### File: `src/pages/SettingsPage.tsx`
- Add dark/light theme toggle (currently dark-only, add the preference)
- Persist theme in localStorage

### File: `src/components/layout/AppShell.tsx`
- Show "Agent Wizard" nav link only for admin/moderator users (currently shown to all)

## Summary

| Change | File |
|--------|------|
| Auto-assign role on signup trigger | DB migration |
| Enable realtime publication | DB migration |
| Forgot password + reset page | LoginPage, new ResetPasswordPage, App.tsx |
| Fix SILENCE command (no-op) | PlayersTab.tsx |
| Fix console reconnect (fake) | ConsoleTab.tsx |
| Add delete server from card | ServerCard.tsx |
| Role-gate Agent Wizard nav | AppShell.tsx |

No new edge functions needed. 1 migration, 1 new page, 6 files modified.

