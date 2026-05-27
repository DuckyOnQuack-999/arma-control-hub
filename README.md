# RetroCycles / Armagetron Advanced Control Panel

A modern web-based control panel for managing Armagetron Advanced (RetroCycles) dedicated servers.

## Features

- **Multi-server management** - Control multiple game servers from a single panel
- **Real-time console** - Live PTY output streaming
- **Configuration editor** - Visual and raw config file editors
- **Player management** - View, kick, ban, and silence players
- **Server browser** - UDP master server querying with HTML fallback
- **File management** - Browse and edit server files
- **Metrics dashboard** - CPU, memory, and player count graphs
- **Dark theme with red accent** - Clean, modern gaming UI

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│  (React + Vite + TypeScript + Tailwind + shadcn/ui)         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Backend                          │
│  • PostgreSQL database (servers, configs, players, etc.)    │
│  • Edge Functions (server-control, server-files, etc.)      │
│  • Real-time subscriptions                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Host Agent                              │
│  • Node.js + Express + node-pty                             │
│  • Process management (spawn/kill PTY)                       │
│  • File system operations                                    │
│  • Metrics collection (pidusage)                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Armagetron Dedicated Server                   │
│  (armagetronad-dedicated binary)                             │
└─────────────────────────────────────────────────────────────┘
```

### Two Modes

1. **Panel-Managed Mode** (default)
   - Configs stored in database
   - File operations via database storage
   - Simulated process control
   - Works without external agent

2. **Agent-Managed Mode** (optional)
   - Real PTY spawning on host machine
   - Direct filesystem access
   - Real process metrics
   - Requires host agent

## Quick Start

### Option 1: Development Mode (Panel-Managed)

No agent required - everything runs in the browser with Supabase backend.

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Option 2: With Host Agent (Full Process Control)

For real process management, run the agent on the host machine:

```bash
# Terminal 1: Start the panel
npm run dev

# Terminal 2: Build and start the agent
cd agent
npm install
npm run build
npm start
```

### Option 3: Docker Compose (Production)

```bash
# Start everything with Docker
docker-compose up -d

# Panel: http://localhost:3000
# Agent: http://localhost:8080
```

## Configuration

### Environment Variables

Create a `.env` file:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Agent Configuration

The agent accepts these environment variables:

- `AGENT_PORT` - Port to listen on (default: 8080)

### Creating a Server

1. Click "Add Server" on the dashboard
2. Select a config template (Racing, Fortress, Sumo, etc.)
3. Configure port and max players
4. Optionally set an Agent URL for real process control
5. Click "Create Server"

### Setting Up the Agent

1. Navigate to Host Settings in the panel
2. Follow the Agent Setup Wizard
3. Configure the agent URL (e.g., `http://192.168.1.10:8080`)
4. Test connection

## Server Browser

The server browser uses two methods:

1. **UDP Master Query** (primary)
   - Queries Armagetron master servers directly
   - Gets live server list
   - Queries each server for status

2. **HTML Parsing** (fallback)
   - Scrapes public server browser websites
   - Used when UDP fails

## Binary Installation

The panel expects the Armagetron dedicated server binary at:

- Linux: `/usr/bin/armagetronad-dedicated`
- Windows: `C:\Program Files\Armagetron\armagetronad-dedicated.exe`

Install from:
- https://armagetronad.org/downloads.php
- Or use your package manager: `apt install armagetronad-dedicated`

## Development

```bash
# Run tests
npm run test

# Build for production
npm run build

# Lint code
npm run lint
```

## License

MIT License
