

# Fix Build Errors + Add Agent Wizard & Console Streaming

## 1. Fix Build Errors (all 3 edge functions)

The error: each function has both `import { corsHeaders } from '@supabase/supabase-js/cors'` AND a local `const corsHeaders = {...}` declaration, causing a conflict.

**Fix**: Remove the import line (line 2) from all three files. The local `const corsHeaders` definition is already correct and complete. For `server-browser/index.ts`, it only has the import — replace it with the local definition.

### `supabase/functions/server-browser/index.ts`
- Line 2: replace `import { corsHeaders } from '@supabase/supabase-js/cors'` with the local corsHeaders const

### `supabase/functions/server-control/index.ts`
- Line 2: remove `import { corsHeaders } from '@supabase/supabase-js/cors'`

### `supabase/functions/server-status/index.ts`
- Line 2: remove `import { corsHeaders } from '@supabase/supabase-js/cors'`

## 2. Host Agent Setup Wizard Page

New page at `/settings/agent-wizard` (or a section within Settings) that generates a ready-to-run install script.

### New file: `src/pages/AgentWizardPage.tsx`
- Form fields: Host IP/hostname, Agent port (default 8080), Game server binary path, Data dir, Config dir
- "Generate Script" button produces a bash install script that:
  - Downloads binaries from the storage bucket
  - Sets up a systemd service for the agent
  - Configures firewall rules
  - Outputs the agent URL to paste into the panel
- Copy-to-clipboard button for the generated script
- Add route `/agent-wizard` to `App.tsx`

## 3. Real-Time Console Streaming for Agent-Connected Servers

Currently the console tab reads `server_events` from the database. For agent-connected servers, add a polling mechanism that fetches live console output from the agent.

### `supabase/functions/server-control/index.ts`
- The `command` action already proxies to the agent. Add support for a `console_stream` action that fetches recent output lines from `GET /console` on the agent.

### New edge function: `supabase/functions/server-console/index.ts`
- Accepts `{ serverId }`, looks up server's `agent_url`
- Calls `GET {agent_url}/console?since={timestamp}` to fetch new lines
- Returns the lines to the client

### `src/components/tabs/ConsoleTab.tsx`
- When server has `agent_url`, poll `server-console` every 2 seconds for new lines
- Merge agent console lines with existing realtime event stream
- Show "Live (Agent)" indicator instead of just "Connected"

### `src/lib/supabaseApi.ts`
- Add `getConsoleLines(serverId: number, since?: number)` function

## Summary

- 3 edge function fixes (remove duplicate corsHeaders import)
- 1 new page (Agent Wizard)
- 1 new edge function (server-console)
- Updates to ConsoleTab for agent streaming
- Route addition in App.tsx

