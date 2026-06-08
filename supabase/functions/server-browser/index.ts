import { corsHeaders, corsResponse, corsError } from "../_shared/cors.ts";
import { authenticateUser } from "../_shared/db.ts";

interface BrowserServer {
  id: number;
  name: string;
  host: string;
  port: number;
  players: number;
  maxPlayers: number;
  gameType: string;
  version: string;
  playerNames: string[];
  url: string;
}

let cachedServers: BrowserServer[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 minute cache

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&nbsp;/g, ' ')
    .replace(/\\_/g, '_');
}

function getGameTypeFromVersion(version: string): string {
  if (!version) return 'Armagetron';
  const v = version.toLowerCase();
  if (v.includes('sty+ct+ap')) return 'sty+ct+ap';
  if (v.includes('sty+ct')) return 'sty+ct';
  if (v.includes('sty')) return 'sty';
  if (v.includes('ct+ap')) return 'ct+ap';
  if (v.includes('0.4')) return '0.4';
  if (v.includes('0.2.9')) return '0.2.9';
  return version.substring(0, 15);
}

function getBrowserUrls(): string[] {
  const envUrl = Deno.env.get('BROWSER_URL');
  if (envUrl) return [envUrl];
  return [
    'https://browser.armanelgtron.tk/legacy/?info=_',
    'https://armagetronad.org/browser/legacy/?info=_',
  ];
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// Parse the actual format from browser.armanelgtron.tk
// Format: [server_name](?info=...) - (X/Y) players
// Followed by: Players: name1, name2, ...
// Sometimes: armagetronad://host:port, Version: ..., URL: ...
function parseServersFromText(text: string): BrowserServer[] {
  const servers: BrowserServer[] = [];
  let id = 1;

  // The text uses square brackets for server names with links
  // Pattern: [server_name](?info=...) - (players/max)
  // Also handle: [server_name](?info=...)_(stuff) - (players/max) format
  const serverPattern = /\[([^\]]+)\]\([^)]+\)\s*[-–]\s*\((\d+)\/(\d+)\)/g;

  let match;
  const usedHosts = new Set<string>();

  while ((match = serverPattern.exec(text)) !== null) {
    try {
      const name = decodeHtmlEntities(match[1].trim());
      const players = parseInt(match[2]);
      const maxPlayers = parseInt(match[3]);

      // Find the content between this match and the next server entry
      const startPos = match.index + match[0].length;
      const nextMatchPos = text.indexOf('[', startPos);
      const endPos = nextMatchPos > startPos ? nextMatchPos : Math.min(text.length, startPos + 1000);

      const blockContent = text.substring(startPos, endPos);

      // Extract player names
      let playerNames: string[] = [];
      const playersMatch = blockContent.match(/Players:\s*([^\n\r]+?)(?=\n|\r|Armagetron|Version|URL|$)/i);
      if (playersMatch) {
        const playersText = playersMatch[1].trim();
        if (playersText && playersText.toLowerCase() !== 'empty') {
          playerNames = playersText
            .split(',')
            .map(p => decodeHtmlEntities(p.trim()))
            .filter(p => p && p.length > 0 && p.length < 50);
        }
      }

      // Extract host and port from armagetronad:// URI in the block
      let host = '';
      let port = 4534;
      const uriMatch = blockContent.match(/armagetronad:\/\/([^:\s\)\]]+):(\d+)/i);
      if (uriMatch) {
        host = uriMatch[1].trim();
        port = parseInt(uriMatch[2]);
      }

      // Extract version
      let version = '';
      const versionMatch = blockContent.match(/Version:\s*([^\n\r]+?)(?=\n|\r|URL|Players|Armagetron|$)/i);
      if (versionMatch) {
        version = versionMatch[1].trim();
      }

      // Extract URL
      let serverUrl = '';
      const urlMatch = blockContent.match(/URL:\s*(https?:\/\/[^\s\r\n]+)/i);
      if (urlMatch) {
        serverUrl = urlMatch[1].trim();
      }

      // Skip if we already have a server for this host:port with more players
      const hostKey = host ? `${host}:${port}` : name;
      if (host && usedHosts.has(hostKey)) continue;
      if (host) usedHosts.add(hostKey);

      const gameType = getGameTypeFromVersion(version);

      servers.push({
        id: id++,
        name,
        host,
        port,
        players,
        maxPlayers,
        gameType,
        version,
        playerNames,
        url: serverUrl,
      });
    } catch (e) {
      console.error('Error parsing server block:', e);
    }
  }

  // Also parse servers that appear in armagetronad:// format without the bracket syntax
  // These appear as: "Armagetron Advanced: [Click here to enter the server](armagetronad://host:port)"
  const linkOnlyPattern = /armagetronad:\/\/([^:\s\)\]]+):(\d+)/g;
  let linkMatch;

  while ((linkMatch = linkOnlyPattern.exec(text)) !== null) {
    const linkHost = linkMatch[1].trim();
    const linkPort = parseInt(linkMatch[2]);
    const hostKey = `${linkHost}:${linkPort}`;

    if (usedHosts.has(hostKey)) continue;

    // Find surrounding context for this link to get server name and version
    const contextStart = Math.max(0, linkMatch.index - 300);
    const contextEnd = Math.min(text.length, linkMatch.index + linkMatch[0].length + 300);
    const context = text.substring(contextStart, contextEnd);

    // Try to find server name in context (look for bracket pattern nearby)
    let name = `Server @ ${linkHost}:${linkPort}`;
    const nameMatch = context.match(/\[([^\]]+)\]\([^)]+\)/);
    if (nameMatch && !nameMatch[1].toLowerCase().includes('click here')) {
      name = decodeHtmlEntities(nameMatch[1].trim());
    }

    // Extract version from context
    let version = '';
    const versionMatch = context.match(/Version:\s*([^\n\r]+?)(?=\n|\r|URL|Players|Armagetron|$)/i);
    if (versionMatch) {
      version = versionMatch[1].trim();
    }

    // Extract URL from context
    let serverUrl = '';
    const urlMatch = context.match(/URL:\s*(https?:\/\/[^\s\r\n]+)/i);
    if (urlMatch) {
      serverUrl = urlMatch[1].trim();
    }

    usedHosts.add(hostKey);

    servers.push({
      id: id++,
      name,
      host: linkHost,
      port: linkPort,
      players: 0,
      maxPlayers: 16,
      gameType: getGameTypeFromVersion(version),
      version,
      playerNames: [],
      url: serverUrl,
    });
  }

  return servers;
}

async function fetchServerListHTML(): Promise<BrowserServer[]> {
  const urls = getBrowserUrls();
  for (const url of urls) {
    try {
      console.log(`Fetching server list from ${url}`);
      const response = await fetchWithTimeout(url, 10000);
      if (!response.ok) {
        console.error(`Browser at ${url} returned ${response.status}`);
        continue;
      }
      const text = await response.text();
      const servers = parseServersFromText(text);
      if (servers.length > 0) {
        console.log(`Parser returned ${servers.length} servers from ${url}`);
        // Sort by player count (active servers first)
        return servers.sort((a, b) => b.players - a.players);
      }
    } catch (e) {
      console.error(`Failed to fetch from ${url}:`, e);
    }
  }
  return [];
}

// Try fetching from alternative JSON APIs
async function fetchServerListAPI(): Promise<BrowserServer[]> {
  const apiUrls = [
    'https://retrocyclesleague.com/api/servers',
    'https://lightron.org/api/servers',
  ];

  for (const url of apiUrls) {
    try {
      console.log(`Trying JSON API at ${url}`);
      const response = await fetchWithTimeout(url, 8000);
      if (!response.ok) continue;
      const data = await response.json();

      if (Array.isArray(data) && data.length > 0) {
        return data.map((s: any, idx: number) => ({
          id: idx + 1,
          name: s.name || s.serverName || `Server @ ${s.host || s.ip}:${s.port || 4534}`,
          host: s.host || s.ip || s.address || '',
          port: s.port || 4534,
          players: s.players || s.numPlayers || s.playerCount || 0,
          maxPlayers: s.maxPlayers || s.max_players || 16,
          gameType: getGameTypeFromVersion(s.version || ''),
          version: s.version || '',
          playerNames: s.playerNames || s.players_list || [],
          url: s.url || s.website || '',
        } as BrowserServer));
      }
    } catch (e) {
      console.log(`JSON API at ${url} not available:`, (e as Error).message);
    }
  }
  return [];
}

async function fetchServerList(): Promise<BrowserServer[]> {
  // Strategy: HTML first (known working source), then API fallback
  const htmlServers = await fetchServerListHTML();
  if (htmlServers.length > 0) return htmlServers;

  console.log('HTML parser returned no servers, trying JSON API');
  return await fetchServerListAPI();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authResult = await authenticateUser(req.headers.get('Authorization'));
    if (authResult instanceof Response) return authResult;

    const now = Date.now();
    if (cachedServers && (now - cacheTime) < CACHE_TTL) {
      return corsResponse({
        servers: cachedServers,
        cached: true,
        count: cachedServers.length,
        source: 'cache',
        lastUpdate: new Date(cacheTime).toISOString()
      });
    }

    const servers = await fetchServerList();
    if (servers.length > 0) {
      cachedServers = servers;
      cacheTime = now;
    }

    return corsResponse({
      servers,
      cached: false,
      count: servers.length,
      source: 'live',
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Server browser error:', error);
    // Return cached data on error if available
    if (cachedServers) {
      return corsResponse({
        servers: cachedServers,
        cached: true,
        count: cachedServers.length,
        source: 'cache_fallback',
        error: 'Live fetch failed, using cached data'
      });
    }
    return corsResponse({ servers: [], error: 'Failed to fetch server list' });
  }
});
