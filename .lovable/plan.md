

# Fix Blank Page on Publish + Full Code Review & Enhancements

## Root Cause: Blank Page on Publish

**Two issues combine to cause the blank page:**

1. **`onAuthStateChange` deadlock**: In `authStore.ts`, the `resolveSession` function is `async` and is called inside `onAuthStateChange`. Supabase's auth event queue blocks while this callback runs. The `supabase.rpc('get_user_role')` call inside it creates a deadlock — the RPC needs the auth token, but the auth state change hasn't finished processing. On cold start (published app), there's no cached session, so `getSession()` returns null, the user sees the login page, logs in, `onAuthStateChange` fires, and the RPC call deadlocks. The preview works because HMR restarts keep the session warm.

2. **Missing database trigger**: The migration `20260406072054` creates both the `handle_new_user` trigger AND adds tables to `supabase_realtime`. If the tables were already in the publication (they are), the `ALTER PUBLICATION` lines fail, rolling back the entire migration — including the trigger. So the trigger was **never created** on the live database. New users who register get no `user_roles` row, meaning `get_user_role` returns null, and RLS blocks all data access.

## Fix Plan

### Database Migration (new)
- Re-create the `on_auth_user_created` trigger with `IF NOT EXISTS` / `DROP TRIGGER IF EXISTS` pattern
- Use `BEGIN ... EXCEPTION` blocks for the `ALTER PUBLICATION` lines to prevent rollback on duplicate
- This ensures the trigger actually gets applied on both test and live

```sql
-- Safely re-apply trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Safe publication adds (ignore if already present)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.servers;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.server_events;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

### File: `src/stores/authStore.ts` — Fix the deadlock
- Change `onAuthStateChange` to use fire-and-forget pattern (no `await` in the callback)
- Move the RPC call outside the callback chain: resolve auth state immediately with a default role, then fetch the role separately and update state
- Add a retry with 1s delay if the RPC fails on first attempt

```typescript
// Inside onAuthStateChange — fire and forget, no await
supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    // Set authenticated immediately with default role
    set({ user: { id: session.user.id, email: session.user.email || '', role: 'viewer' }, isAuthenticated: true, isLoading: false });
    // Then fetch real role in background (non-blocking)
    supabase.rpc('get_user_role', { _user_id: session.user.id })
      .then(({ data }) => {
        if (data) set(s => ({ user: s.user ? { ...s.user, role: data } : s.user }));
      });
  } else {
    set({ user: null, isAuthenticated: false, isLoading: false });
  }
});
```

### Security Fixes (from scan findings)

**1. Profiles email exposure** — Create a view `profiles_public` that excludes email, restrict base table SELECT to own row only:
```sql
-- New RLS: users can only SELECT own profile
DROP POLICY "Users can view all profiles" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (id = auth.uid());
-- Admins can view all
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (has_role(auth.uid(), 'admin'));
```

**2. Audit log INSERT** — Remove client-side INSERT policy. Audit entries should only be written by service-role (edge functions):
```sql
DROP POLICY "Users can insert own audit entries" ON audit_log;
```

**3. Enable leaked password protection** — Use `configure_auth` tool to enable HIBP check.

### Files Modified

| File | Change |
|------|--------|
| `src/stores/authStore.ts` | Fix `onAuthStateChange` deadlock — fire-and-forget pattern, non-blocking role fetch |
| DB migration (new) | Re-create trigger safely, fix publication adds |
| DB migration (security) | Tighten profiles SELECT, remove audit_log client INSERT |
| Auth config | Enable HIBP leaked password protection |

### What This Fixes
- **Blank page on publish**: Auth initializes immediately without blocking on RPC
- **New user registration**: Trigger auto-assigns roles so RLS works from first login
- **Security findings**: Profiles email no longer globally readable, audit log no longer writable by clients

No new pages or edge functions needed. 1 store file + 2 migrations + 1 auth config change.

