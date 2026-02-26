

# RetroCycles Server Control Panel — Implementation Plan

## Overview
A cyberpunk-themed, dark-mode web dashboard for managing Armagetron Advanced / RetroCycles dedicated game servers. Built with React, TypeScript, Tailwind CSS, and shadcn/ui. Includes a mock API layer simulating the full backend contract so the UI is fully interactive out of the box.

---

## Design Theme
- **Dark cyberpunk aesthetic**: Background `#0f0f13`, cards `#1a1a24`, neon cyan `#00d4ff` accent, neon green `#39ff14` secondary
- Subtle grid/scanline background patterns, glowing borders on active elements
- Retro/tron-inspired typography and iconography
- Mobile responsive with collapsible sidebar

---

## Pages & Features

### 1. Login Page
- Username/password form with retro styling
- First-run mode: if no users exist, shows registration form instead
- JWT token storage in localStorage via Zustand persist
- Role-based access: admin, operator, viewer

### 2. Dashboard (Home)
- Grid of **Server Cards** showing all managed servers
- Each card: server name, status badge (Online/Offline/Starting/Stopping), player count (X/max), CPU mini-bar, port, quick action buttons (Start/Stop/Restart)
- "Add Server" button → modal with form (name, executable path, data dir, config dir, port, max players, auto-restart toggle)
- Auto-refresh every 10 seconds

### 3. Server Detail Page (`/servers/:id`)
- Top bar: server name, status badge, control buttons (Start/Stop/Restart/Kill with confirmation dialogs)
- Tabbed interface:
  - **Overview** — status summary, current map, uptime, player count
  - **Console** — live PTY output viewer + command input
  - **Config** — visual & raw config editor
  - **Players** — live player list with actions
  - **Logs** — structured event log viewer
  - **Metrics** — CPU/memory/player charts
  - **Maps** — map file management

### 4. Console Tab
- Virtual-scrolled output area (auto-scroll, pause on scroll-up)
- Color-coded lines: errors (red), warnings (yellow), joins (green), leaves (gray), chat (blue), system (white)
- Command input with history (up/down arrows), enter-to-send
- Connection status indicator
- Clear & download buttons
- Mock WebSocket simulation with realistic Armagetron log output

### 5. Config Editor Tab
- **Visual Editor**: Sections as collapsible accordions (Gameplay, Network, Physics, Scoring, Admin, Misc)
  - Each setting: key name, type-aware input (number/toggle/text), description tooltip, default value hint
  - Save Changes button, Reset to Defaults per section
  - Unsaved changes indicator
- **Raw Editor**: Textarea showing raw `KEY VALUE` format
  - File tabs: `settings_custom.cfg`, `server_info.cfg`, `everytime.cfg`
  - Save with warning if server is running

### 6. Players Tab
- Table: Name, IP (masked for viewers), Score, Ping, Join Time, Actions
- Actions: Kick (with reason modal), Ban (duration + reason modal), Silence
- Ban List sub-tab with unban action
- Real-time polling updates

### 7. Logs Tab
- Structured event log from mock DB data
- Filter bar: event type checkboxes, date range, search
- Color-coded rows by event type (join/leave/kill/chat/ban/kick/round)
- Toggle to raw file view with tail mode

### 8. Metrics Tab
- Time range selector: 1h | 6h | 24h | 7d
- Three Recharts charts:
  - CPU % line chart (red)
  - Memory MB area chart (blue)
  - Player count bar chart (green)
- Live stat cards above charts showing current values
- Mock time-series data with realistic patterns

### 9. Server Browser Page
- Table of public servers (mock data simulating master server query results)
- Columns: Server Name, Map, Players (X/max), Ping (color-coded badge), Game Type
- Sortable by any column, searchable/filterable
- "Connect" button copies `armagetronad://host:port` URI
- "Refresh" with cooldown, "Last refreshed" timestamp

### 10. Settings Page
- User management (admin only): list users, change roles, delete users
- App settings: API URL, theme toggle, notification preferences

---

## Layout Components
- **AppShell**: Sidebar + top bar wrapper
- **Sidebar**: Navigation links with icons for each section, collapsible on mobile (hamburger menu)
- **TopBar**: Server selector dropdown, user menu (profile, logout), notification bell

---

## Shared Components
- **ConfirmDialog**: Reusable destructive action confirmation modal
- **ServerStatusBadge**: Colored badge (green=online, red=offline, yellow=starting/stopping)
- **ServerControlBar**: Start/Stop/Restart/Kill buttons with state-aware disabling
- **LoadingSpinner**: Centered spinner for loading states
- **ErrorBoundary**: Catches React errors with retry button
- **Toast notifications**: Server events (started, stopped, crashed), config saved, player kicked/banned

---

## State Management
- **Zustand stores**: authStore (user, tokens, login/logout), serverStore (selected server, status cache), consoleStore (console line buffer)
- **React Query**: All API data fetching with caching, refetching, loading/error states
- **Mock API layer**: In-memory data store simulating the full backend API contract, ready to swap for real `axios` calls

---

## Mock Data
- 3 pre-configured servers (various states: running, stopped, starting)
- Realistic player names, IPs, scores
- Generated metrics time-series data (CPU/memory/player count)
- Sample Armagetron config with all documented keys
- Simulated console output with color-coded events
- Mock server browser with ~20 public servers

