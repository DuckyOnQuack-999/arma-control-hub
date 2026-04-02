

# Hardwire Binaries & Full Edge Function Integration

## What This Does

Ensures the uploaded `armagetronad-dedicated` and `armagetronad-serverquery` binaries are fully integrated with the app, and all edge functions work correctly with real game servers on private networks.

## Changes

### 1. Fix SSRF validation to allow private networks
**Files**: `supabase/functions/server-control/index.ts`, `supabase/functions/server-status/index.ts`

The current `validateAgentUrl` blocks all private IPs (192.168.x, 10.x, 172.16-31.x, localhost). Game servers run on private networks, so this must be relaxed. Keep blocking only the cloud metadata endpoint (169.254.169.254).

### 2. Add automatic status polling for agent-connected servers
**File**: `src/pages/ServerDetailPage.tsx`

Add a `useEffect` with a 15-second interval that calls `pollServerStatus(serverId)` when the server has a non-empty `agent_url`. On success, trigger `refetch()` to sync live metrics from the host agent.

### 3. Show agent status in OverviewTab
**File**: `src/components/tabs/OverviewTab.tsx`

- Add "Agent" row showing the URL or "Not configured (simulation mode)"
- Add an inline editable `agent_url` field with save button for admins
- Uses existing `updateServer` API

### 4. Add agent indicator to ServerCard
**File**: `src/components/server/ServerCard.tsx`

Show a small icon distinguishing agent-connected servers (Wifi icon) from simulation-mode servers (Monitor icon).

### 5. Upload binaries to storage bucket
The user uploaded `armagetronad-dedicated` and `armagetronad-serverquery`. These need to be copied into the `binaries` storage bucket so the download buttons on the Settings page actually serve the real files. This will be done by reading the uploaded files and uploading them to Supabase storage via the API in an edge function or script.

### 6. Update default paths in CreateServerModal
**File**: `src/components/server/CreateServerModal.tsx`

Ensure defaults match the Armagetron standard paths:
- Executable: `/usr/bin/armagetronad-dedicated` (already correct)
- Data dir: `/usr/share/armagetronad` (already correct)
- Config dir: `/etc/armagetronad/new` (already correct)
- Default port: change from `4537` to `4534` (the actual Armagetron default)

---

**No database migrations needed.** 5 files modified, edge functions redeployed.

