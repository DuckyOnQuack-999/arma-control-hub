

# Full Pipeline: Agent-Centric Architecture, Remote File Manager, Server Launch Integration

## Context

The panel currently manages servers via edge functions that proxy to an agent HTTP endpoint on the VPS. The Agent Wizard generates a setup script but is disconnected from the server creation flow. The user wants:

1. **Agent Wizard as the central hub** for all host/agent configuration
2. **Server creation triggers a real dedicated server launch** on the VPS via the agent
3. **Remote file manager** — browse, upload, rename, edit, delete files on the VPS through the agent
4. **localhost support** — agent_url can be `http://localhost:8080` or `http://127.0.0.1:8080`

## Architecture

```text
┌─────────────┐    HTTPS    ┌──────────────┐    HTTP    ┌─────────────────┐
│  Panel UI   │ ──────────> │ Edge Function │ ────────> │  Host Agent     │
│  (Lovable)  │             │  (Supabase)   │           │  (VPS/localhost) │
└─────────────┘             └──────────────┘           │                 │
                                                       │  /control       │
                                                       │  /status        │
                                                       │  /console       │
                                                       │  /files/*  NEW  │
                                                       │  /launch   NEW  │
                                                       └─────────────────┘
```

The agent on the VPS exposes new endpoints. The panel's edge functions proxy to them.

## Changes

### 1. New Edge Function: `server-files`

Proxies file operations to the agent's `/files` endpoint.

**Endpoints the agent must implement** (documented in wizard):
- `GET /files?path=/etc/armagetronad` — list directory
- `GET /files/read?path=/etc/armagetronad/settings_custom.cfg` — read file content
- `POST /files/write` — write/create file `{path, content}`
- `POST /files/rename` — rename `{oldPath, newPath}`
- `POST /files/delete` — delete `{path}`
- `POST /files/upload` — multipart file upload `{path, file}`
- `POST /files/mkdir` — create directory `{path}`

**File: `supabase/functions/server-files/index.ts`**
- Auth + role check (admin/moderator)
- Lookup server's `agent_url`
- Proxy the request to agent
- SSRF validation (same as existing)
- Path traversal protection: reject paths containing `..`, null bytes

### 2. New Tab: `FilesTab` (Server Detail)

**File: `src/components/tabs/FilesTab.tsx`**
- Tree-based file browser showing directories and files from the VPS
- Breadcrumb navigation (click path segments)
- File actions: view/edit (opens in a code editor textarea), rename (inline), delete (with confirm), create new file/folder
- Upload button (drag-and-drop or click)
- Syntax highlighting hint via file extension
- Calls new API functions in `supabaseApi.ts`

### 3. Expanded Agent Wizard (`AgentWizardPage.tsx`)

Transform from a simple script generator into a multi-section hub:

**Section 1: Registered Hosts** (new)
- List all servers grouped by agent_url
- Show connection status per host (green/red dot)
- "Test All" button to ping each agent
- Quick link to each server's detail page

**Section 2: Host Setup** (existing, enhanced)
- Keep current script generator
- Add "Connect to Existing Agent" flow — enter agent URL, test it, then link to a server
- Add localhost preset button: fills in `127.0.0.1` and port `8080`
- Add Docker Compose snippet option alongside bash script

**Section 3: Agent API Reference** (moved from Settings)
- Full agent API spec with all endpoints including new `/files` and `/launch`
- Move the API spec from SettingsPage into AgentWizard

**Section 4: Binary Management**
- Keep existing binary test buttons
- Add upload binary button (upload to `binaries` storage bucket from the panel)

### 4. Server Creation Triggers Launch

**File: `supabase/functions/server-control/index.ts`**
- Add new action: `launch` — tells agent to create and start a brand new server instance
- Payload: `{ action: 'launch', serverId, config: { executable_path, data_dir, config_dir, port, max_players } }`
- Agent creates directories, writes initial config, starts the process

**File: `src/components/server/CreateServerModal.tsx`**
- After creating the DB record, if `agent_url` is set, automatically call `serverAction(id, 'launch')` to tell the agent to spin up the dedicated server
- Show progress indicator during launch
- If launch fails, show error but keep the DB record (can retry from Overview)

**File: `src/lib/supabaseApi.ts`**
- Add `launchServer(serverId)` — calls server-control with action `launch`
- Add file manager functions:
  - `listFiles(serverId, path)`
  - `readFile(serverId, path)`
  - `writeFile(serverId, path, content)`
  - `renameFile(serverId, oldPath, newPath)`
  - `deleteFile(serverId, path)`
  - `uploadFile(serverId, path, file)`
  - `createDirectory(serverId, path)`

### 5. SSRF: Allow localhost

**Files: `server-control/index.ts`, `server-status/index.ts`, `server-files/index.ts`**
- Current `validateAgentUrl` blocks only `169.254.169.254` — localhost and private IPs are already allowed
- No change needed, localhost works

### 6. Route & Navigation Updates

**File: `src/App.tsx`**
- No new routes needed — FilesTab lives inside ServerDetailPage

**File: `src/pages/ServerDetailPage.tsx`**
- Add "Files" tab between "Maps" and existing tabs

**File: `src/pages/SettingsPage.tsx`**
- Remove the "Agent API Spec" section (moved to Agent Wizard)
- Keep the "Open Agent Setup Wizard" button

### 7. Server-Control: Add `launch` Action

**File: `supabase/functions/server-control/index.ts`**
- Add `'launch'` to `validActions` array
- In `proxyToAgent`: forward `launch` with server config payload
- In `simulateAction`: for `launch`, set status to `starting` then `online` (same as `start` but includes config payload)

## File Summary

| File | Action |
|------|--------|
| `supabase/functions/server-files/index.ts` | Create — file operations proxy |
| `supabase/functions/server-control/index.ts` | Edit — add `launch` action |
| `src/components/tabs/FilesTab.tsx` | Create — remote file browser |
| `src/pages/ServerDetailPage.tsx` | Edit — add Files tab |
| `src/pages/AgentWizardPage.tsx` | Rewrite — multi-section host hub |
| `src/pages/SettingsPage.tsx` | Edit — remove API spec section |
| `src/components/server/CreateServerModal.tsx` | Edit — auto-launch on create |
| `src/lib/supabaseApi.ts` | Edit — add file + launch functions |

No database migrations needed. No new tables. The file manager operates entirely through the agent proxy — no VPS files touch the database.

