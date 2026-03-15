

# RetroCycles Panel — Supabase Backend Integration Plan

## Reality Check

Lovable is a **frontend-only** platform. It cannot run Node.js, Docker, WebSocket servers, spawn processes, or access filesystems. However, it **does** support Supabase for real backend functionality. Your spec references "Bolt Database" and Node.js backends — none of that works here. Here's what we **can** build with Supabase:

## What Becomes Real (Mock → Supabase)

| Feature | Current (Mock) | With Supabase |
|---|---|---|
| Auth (login/register/roles) | In-memory mock | Supabase Auth + user_roles table with RLS |
| Server CRUD | Array in mockData | `servers` table with real persistence |
| Server events/logs | Generated fake data | `server_events` table with real-time subscriptions |
| Player tracking | Static arrays | `players` table updated via edge functions |
| Bans | In-memory array | `bans` table with expiry queries |
| Metrics (CPU/mem/players) | Math.random() curves | `metrics` table with time-series queries |
| Config management | In-memory key-value | `server_configs` table storing key-value pairs |
| User management | Mock users array | Real users via Supabase Auth + roles table |
| Maps/files | Mock file list | `map_files` table (metadata; actual files in Supabase Storage) |
| Real-time updates | Polling mock API | Supabase Realtime subscriptions on tables |

## What Cannot Be Built in Lovable

These require a separate deployed backend (Node.js server running alongside your game servers):
- Process spawning (`armagetronad-dedicated`)
- PTY/console I/O via `node-pty`
- UDP master server queries
- Filesystem access for .cfg files
- Docker orchestration
- `pidusage` CPU/memory collection

**Recommendation**: Build an edge function or external agent that runs on your game server machine to push data into Supabase. The panel reads from Supabase.

## Implementation Plan

### Phase 1: Database Setup
- Connect Supabase to this project
- Create tables: `servers`, `server_events`, `bans`, `metrics`, `server_configs`, `map_files`, `user_roles`
- Set up RLS policies using `has_role()` security definer function
- Seed initial data matching current mock data

### Phase 2: Auth System
- Replace `authStore` mock login with `supabase.auth.signInWithPassword()`
- Replace mock register with `supabase.auth.signUp()`
- Create `user_roles` table with trigger to assign default role on signup
- First-run detection: if no roles exist, first signup gets admin
- Update `ProtectedRoute` to use real session

### Phase 3: Replace Mock API with Supabase Client
- Create `src/lib/supabase.ts` client
- Replace every `api.*` call across all pages/components with Supabase queries:
  - `api.getServers()` → `supabase.from('servers').select('*')`
  - `api.createServer()` → `supabase.from('servers').insert()`
  - `api.getEvents()` → `supabase.from('server_events').select()` with filters
  - `api.getMetrics()` → `supabase.from('metrics').select()` with time range
  - etc.
- Delete `mockData.ts` and `mockApi.ts`

### Phase 4: Real-Time Subscriptions
- Subscribe to `server_events` table for live log streaming in ConsoleTab
- Subscribe to `metrics` table for live chart updates in MetricsTab
- Subscribe to `servers` table for live status updates on Dashboard
- Replace polling intervals with Supabase Realtime channels

### Phase 5: Edge Functions
- Create edge function for server control actions (start/stop/restart) that could call out to an agent API running on the game server host
- Create edge function for config read/write that proxies to the game server agent
- Create edge function for player kick/ban commands

### Phase 6: File Storage
- Use Supabase Storage for map file uploads
- Create `maps` bucket with appropriate policies
- Wire MapsTab upload/delete to real storage operations

---

## Technical Details

### Database Schema (Supabase SQL)

```text
Tables:
- servers (id, name, executable_path, data_dir, config_dir, port, auto_restart, max_players, status, current_map, player_count, cpu_percent, memory_mb, uptime, created_at)
- server_events (id, server_id FK, event_type, payload jsonb, occurred_at)
- bans (id, server_id FK, player_name, ip_address, reason, banned_by, expires_at, created_at)
- metrics (id, server_id FK, cpu_percent, memory_mb, player_count, recorded_at)
- server_configs (id, server_id FK, filename, key, value)
- map_files (id, server_id FK, filename, size_bytes, storage_path, created_at)
- user_roles (id, user_id FK auth.users, role app_role)

Indexes on metrics(server_id, recorded_at) and server_events(server_id, occurred_at)
RLS on all tables using has_role() security definer function
```

### Files Changed
- Delete: `src/data/mockData.ts`, `src/data/mockApi.ts`
- New: `src/lib/supabase.ts`, `src/integrations/supabase/` (auto-generated types)
- Modified: Every page and component that imports from `mockApi` (all pages, all tabs, stores)
- New edge functions for server control proxy

### Estimated Scope
This is a large migration (~20 files modified). The first step is connecting Supabase to this project.

