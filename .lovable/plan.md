

# Fix Login Button Hang

## Root Cause

The `onAuthStateChange` callback in `authStore.ts` (line 39) uses `await resolveSession(session)`. Per Supabase docs, using `await` inside `onAuthStateChange` callbacks **blocks the auth event queue**, creating a deadlock. When you click Login:

1. `signInWithPassword` succeeds and returns
2. `onAuthStateChange` fires with the new session
3. The callback `await`s the `get_user_role` RPC call
4. This blocks the auth event processing — the UI never updates, button stays in "AUTHENTICATING..." state forever

## Fix

### `src/stores/authStore.ts`
- Remove `async` and `await` from the `onAuthStateChange` callback — use fire-and-forget (`resolveSession(session)` without `await`)
- This lets the auth event queue continue processing while the role lookup happens in the background
- The `resolveSession` function still calls `set()` when done, so the UI updates correctly

Single change: line 39 from `async (_event, session) => { await resolveSession(session); }` to `(_event, session) => { resolveSession(session); }`

