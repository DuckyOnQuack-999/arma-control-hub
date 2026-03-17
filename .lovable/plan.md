

# Fix Server Browser — Scrape Real Server Data

## Problem
The `server-browser` edge function tries to fetch from `master1.armagetronad.net` and `master2.armagetronad.net` which are unreachable (connection refused / timeout). The server browser shows 0 servers.

## Solution
Rewrite the edge function to scrape `https://browser.armanelgtron.tk/legacy/` which is a working, server-side rendered page containing all active Armagetron servers with names, player counts, and player lists.

The legacy page HTML contains entries like:
```text
<a name="ServerName" href="...">ServerName</a> - (4/16)
Players: player1, player2
```

And when queried with `?info=ServerName`, it additionally includes:
```text
<a href="armagetronad://52.144.47.87:4536">Click here to enter</a>
Version: 0.2.9-sty+ct+ap
URL: https://retrocycles.net
```

## Approach
1. **Fetch the legacy page** — single HTTP GET to `https://browser.armanelgtron.tk/legacy/`
2. **Parse the HTML** using regex to extract: server name (from anchor text), players/maxPlayers (from the `(N/M)` pattern), player list, and host:port (from `armagetronad://` links if present on the page)
3. **For host:port data** — the main legacy listing doesn't include host:port. We have two options:
   - Option A: Fetch each server's `?info=` page (too slow for 40+ servers)
   - Option B: Scrape the main page only, return name/players/maxPlayers without host:port (still useful for browsing)
   - **Best option**: Fetch a single `?info=` page with all servers — actually the `?info=` page still shows the full list, just with extra detail for the queried server. So we can fetch `?info=` for one server and parse ALL `armagetronad://` links on the page for every server.

Actually, looking at the HTML more carefully, the `?info=` page includes `armagetronad://` links for ALL listed servers that have them, not just the one queried. So fetching any single `?info=` URL will give us host:port for all servers.

## Changes

### `supabase/functions/server-browser/index.ts`
- Replace `fetchMasterServerList()` to fetch `https://browser.armanelgtron.tk/legacy/?info=_` (dummy info param to get the full page with armagetronad:// links)
- Parse HTML to extract for each server: name, players, maxPlayers, player names, host, port, version
- Keep the 30-second cache
- Add `version`, `playerNames`, and `url` fields to the response

### `src/data/types.ts`
- Add optional `version`, `playerNames`, `url` fields to `BrowserServer`

### `src/pages/ServerBrowserPage.tsx`
- Show player names in the inspect dialog
- Show version and URL if available
- Remove the "requires external master server query agent" message

