

# Full Enhancement: Notifications, Health Chart, Binary Integration & Hardwiring

## Overview

This plan covers all requested enhancements: crash/offline notifications, a dashboard health chart, ensuring all binaries and edge functions are fully wired, and expanding existing features.

## 1. Server Crash/Offline In-App Notifications

**No email setup needed** — use browser toast notifications triggered by real-time Supabase subscriptions.

**File: `src/components/layout/AppShell.tsx`**
- Add a `useEffect` that subscribes to `postgres_changes` on the `servers` table for `UPDATE` events
- When a server's status changes to `crashed` or `offline`, show a toast notification with the server name and a link to the server detail page
- Play a browser notification sound (optional) via `new Audio().play()`
- Add a `useEffect` for `Notification.requestPermission()` to enable browser push notifications when the Settings toggle is on
- When status changes to `crashed`/`offline`, also fire `new Notification(...)` for browser-native push if permission granted

**File: `src/pages/SettingsPage.tsx`**
- Wire the existing `notificationsEnabled` switch to `localStorage` so it persists
- When toggled on, request browser notification permission
- Show current permission state (granted/denied/default)

## 2. Dashboard Health Summary Chart

**File: `src/pages/DashboardPage.tsx`**
- Add a new card section below stats: "Server Health" with a `PieChart` (from Recharts, already installed) showing online/offline/crashed/starting distribution
- Add a `BarChart` showing per-server player count comparison
- Add a recent events feed (last 10 events across all servers) using `getEvents` or a new `getRecentEvents` query from `server_events` table
- Subscribe to real-time changes on `servers` table (already done) to keep charts live

**File: `src/lib/supabaseApi.ts`**
- Add `getRecentEventsAll(limit: number)` — queries `server_events` ordered by `occurred_at DESC` with limit, joining server name

## 3. Ensure All Binaries Are Hardwired

The uploaded binaries (`armagetronad-dedicated`, `armagetronad-serverquery`) were uploaded to `/mnt/documents/` during a previous step. They need to be pushed to the `binaries` storage bucket.

**Action: Upload binaries to storage bucket**
- Read files from `/mnt/documents/user-uploads/` (or wherever they landed)
- Upload to Supabase `binaries` bucket via a script using the service role key
- Verify the download URLs in Settings page work by checking `getBinaryDownloadUrl` output

**File: `src/pages/AgentWizardPage.tsx`**
- Add a "Test Download" button that fetches the binary URL and confirms it's accessible (HEAD request)
- Add a "Download Script" button that downloads the generated script as a `.sh` file

## 4. Hardwire Everything Together — Integration Audit

Ensure all components reference each other correctly:

**Navigation links — add missing cross-links:**
- `AppShell.tsx`: Add "Agent Wizard" nav item for admin users
- `DashboardPage.tsx`: Add a "Quick Actions" section with links to Agent Wizard, Settings, Server Browser

**Server creation flow:**
- `CreateServerModal.tsx`: After creating a server, show a toast with a link to set up the agent if no `agent_url` was provided
- Verify default port is 4534 (already done)

**Edge function consistency:**
- All 4 edge functions (`server-control`, `server-status`, `server-console`, `server-browser`) already have consistent CORS headers, auth checks, and SSRF validation
- No changes needed — they're clean

**Server status polling chain:**
- `ServerDetailPage.tsx` polls `server-status` every 15s ✓
- `server-status` edge function updates `servers` table ✓
- Realtime subscription on `servers` table triggers `refetch` ✓
- `DashboardPage.tsx` has realtime subscription on `servers` table ✓
- Full loop is wired

## 5. Expand Existing Features

**File: `src/components/server/ServerCard.tsx`**
- Add uptime display for online servers
- Add last-seen timestamp for offline servers
- Show "Agent" or "Simulation" text label next to the icon (currently icon-only)

**File: `src/components/tabs/OverviewTab.tsx`**
- Add a "Quick Actions" section: direct links to Console, Config, Players tabs
- Show data directory and config directory paths
- Add "Test Agent Connection" button that calls `pollServerStatus` and shows result

**File: `src/pages/DashboardPage.tsx`**
- Add total uptime across all servers
- Add a "Recent Activity" feed showing the last 5 server events

## Summary of Changes

| File | Change |
|------|--------|
| `src/components/layout/AppShell.tsx` | Real-time crash/offline notifications, browser push, Agent Wizard nav link |
| `src/pages/DashboardPage.tsx` | Health pie chart, player bar chart, recent activity feed, total uptime stat |
| `src/pages/SettingsPage.tsx` | Wire notification toggle to localStorage + browser permission |
| `src/lib/supabaseApi.ts` | Add `getRecentEventsAll()` |
| `src/components/server/ServerCard.tsx` | Uptime display, agent label text |
| `src/components/tabs/OverviewTab.tsx` | Test agent button, quick action links, show paths |
| `src/pages/AgentWizardPage.tsx` | Test download button, download script as file |
| Upload script | Push binaries to storage bucket |

**Database migrations: None required.** All tables and columns already exist.

