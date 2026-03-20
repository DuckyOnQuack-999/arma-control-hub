

# Fix Login Hang + Integrate Dedicated Server

## Status of Requested Checks

- **Notification bell badge**: Already implemented with real-time event count and red badge
- **Server switcher dropdown**: Already implemented with status indicators
- **Settings user management note**: Already implemented with info alert for admins
- **Real-time dashboard**: Already implemented via Supabase Realtime subscription on `servers` table

These features are all working. The two items requiring changes are below.

---

## 1. Fix Login/Register Page Hang

**Root cause**: The `LoginPage` component calls `navigate('/dashboard')` during render (lines 21-24) when `isAuthenticated` is true. This is invalid in React — navigation side effects during render cause the component to silently break. Additionally, after successful login, the auth state change listener fires and re-renders the component while the `handleSubmit` async function is still in its `finally` block, causing a race condition.

**Fix** (in `src/pages/LoginPage.tsx`):
- Replace the render-time `navigate()` call with a `useEffect` that watches `isAuthenticated`
- Remove the `navigate('/dashboard')` from `handleSubmit` (the `useEffect` handles it)
- Remove `forwardRef` wrapper (unnecessary, causes console warnings)

**Fix** (in `src/App.tsx`):
- Wrap `ProtectedRoute` with `forwardRef` to eliminate the remaining ref warning from React Router

## 2. Integrate Dedicated Server Binaries

The uploaded files (`armagetronad-dedicated` and `armagetronad-serverquery`) are native Linux binaries. They cannot run inside edge functions or the browser. The architecture requires a **host agent** pattern:

**Architecture**:
```text
Browser ──► Edge Function ──► Agent API (on game server host)
                                  │
                                  ├── armagetronad-dedicated (process mgmt)
                                  └── armagetronad-serverquery (status polling)
```

**What we'll build**:

1. **Store binaries in file storage** — Upload both binaries to a `binaries` storage bucket so admins can download them to their host machines

2. **Add `agent_url` column to `servers` table** — Each server record gets an optional `agent_url` field pointing to the host agent's HTTP endpoint (e.g., `http://192.168.1.10:8080`)

3. **Update `server-control` edge function** — When `agent_url` is set on a server, proxy start/stop/restart/kill/command actions to the agent instead of simulating. Fall back to simulation when no agent is configured.

4. **Create `server-status` edge function** — New function that calls `armagetronad-serverquery` via the agent to get live server status (players, ping, map), updating the `servers` table with real data.

5. **Add agent setup instructions** — Add a section to the Settings page or server detail page with download links for the binaries and instructions for setting up the agent on a host machine.

**Database migration**: Add `agent_url` column to `servers` table:
```sql
ALTER TABLE public.servers ADD COLUMN agent_url text DEFAULT '';
```

**Files changed**:
- `src/pages/LoginPage.tsx` — Fix hang with useEffect navigation
- `src/App.tsx` — Fix ref warning on ProtectedRoute
- `supabase/functions/server-control/index.ts` — Add agent proxy logic
- `supabase/functions/server-status/index.ts` — New function for live status polling
- `src/lib/supabaseApi.ts` — Add agent-related API calls
- `src/components/server/CreateServerModal.tsx` — Add agent_url field
- `src/pages/SettingsPage.tsx` — Add agent setup documentation section

