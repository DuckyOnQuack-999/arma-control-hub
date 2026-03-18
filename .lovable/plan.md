

# Fix Loading — Auth Store Race Condition

## Problem
The `initialize()` function has a race condition: `onAuthStateChange` fires immediately with the current session AND `getSession()` runs concurrently, both calling `get_user_role` RPC. If either RPC fails, `isLoading` stays `true` forever — infinite spinner.

## Changes

### `src/stores/authStore.ts`
- Remove the duplicate `getSession()` block (lines 39-54) — `onAuthStateChange` already fires with the initial session
- Wrap the `get_user_role` RPC in try/catch, defaulting to `'viewer'` on failure
- Add a 5-second safety timeout that forces `isLoading: false`

### `src/App.tsx`  
- Add a 5-second fallback timeout in `ProtectedRoute` so infinite spinner redirects to login

