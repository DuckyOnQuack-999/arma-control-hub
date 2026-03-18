

# RetroCycles Panel — Gap Analysis & Enhancement Plan

The current codebase is already well-built with the cyberpunk theme, mock API, all major pages, and core functionality. Here's what needs improvement to match the full spec:

## Missing Features

### 1. Error Boundary Component
- Create `src/components/shared/ErrorBoundary.tsx` — React error boundary with retry button
- Wrap main app content with it

### 2. Maps Tab (missing entirely)
- Create `src/components/tabs/MapsTab.tsx` — list, upload, delete map/resource files
- Add Maps tab to ServerDetailPage

### 3. Login Page — Registration Mode
- The spec says first-run (no users) should show registration form
- Current login page only has login; add a toggle for registration mode

### 4. Settings Page Enhancements
- Add ability to change user roles (admin only)
- Add delete user action
- Add "Add User" form for admin
- Add app settings section (theme toggle, notification preferences)

### 5. Console Tab — Missing Features
- Command suggestions for known Armagetron commands (autocomplete dropdown)
- Reconnect button when disconnected
- Toggle for connect/disconnect simulation

### 6. Server Browser — Missing "Query/Inspect" Action
- Add an "Inspect" button per server row that opens a modal with detailed server info

### 7. Logs Tab — Missing Features  
- Date range picker filter
- Toggle to raw file view with tail mode
- Infinite scroll / load more pagination

### 8. Config Tab — Raw Editor File Switching
- Currently raw editor doesn't reload content when switching files; fix to fetch per-file content

## UI/UX Polish

### 9. Page Transitions
- Add CSS transitions on route changes for smooth navigation feel

### 10. Sidebar Active State Enhancement
- Add animated glow indicator on active nav item

### 11. Server Card — Current Map Display Fix
- Offline servers show empty map string; should show "N/A" or hide

### 12. TopBar Enhancement
- Add notification bell icon (mock unread count)
- Add server selector dropdown in the top bar

## Implementation Steps

1. **Create ErrorBoundary** — standard React class component with fallback UI
2. **Create MapsTab** — mock data for maps, list with delete/upload UI, add to ServerDetailPage tabs
3. **Enhance LoginPage** — add registration mode toggle, wire to `api.register()`
4. **Enhance SettingsPage** — add user CRUD actions, add app settings section with theme toggle
5. **Enhance ConsoleTab** — add command autocomplete suggestions, reconnect button
6. **Enhance ServerBrowserPage** — add inspect modal per server
7. **Enhance LogsTab** — add date range filter, raw file toggle, load-more pagination
8. **Fix ConfigTab** — raw editor file switching loads correct content
9. **Add MapsTab mock data** — add map file list to mockData and mockApi
10. **TopBar notification bell** — add to AppShell header
11. **Minor UI polish** — page transitions, server card offline state, glow effects

