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
const CACHE_TTL = 30000;

function stripHtmlTags(html: string): string { return html.replace(/<[^>]*>/g, ''); }

function decodeHtmlEntities(text: string): string {
  return text.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
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
  } catch (e) { clearTimeout(timeout); throw e; }
}

function parseServersHTML(html: string): BrowserServer[] {
  const servers: BrowserServer[] = [];
  const serverBlocks = html.split(/<a name="/);
  let id = 1;
  for (let i = 1; i < serverBlocks.length; i++) {
    const block = serverBlocks[i];
    try {
      const anchorMatch = block.match(/^[^"]*"[^>]*>(.*?)<\/a>/s);
      if (!anchorMatch) continue;
      const rawName = stripHtmlTags(anchorMatch[1]).trim();
      const name = decodeHtmlEntities(rawName);
      if (!name) continue;
      const afterAnchor = block.substring(anchorMatch[0].length);
      const plainAfter = stripHtmlTags(afterAnchor);
      const countMatch = plainAfter.match(/\(\s*(\d+)\s*\/\s*(\d+)\s*\)/);
      const playerCount = countMatch ? parseInt(countMatch[1]) : 0;
      const maxPlayers = countMatch ? parseInt(countMatch[2]) : 16;
      let playerNames: string[] = [];
      const playersMatch = afterAnchor.match(/Players:\s*(.*?)(?:<br|<a\s|$)/i);
      if (playersMatch) {
        const playersText = stripHtmlTags(playersMatch[1]).trim();
        if (playersText) playerNames = playersText.split(',').map(p => decodeHtmlEntities(p.trim())).filter(Boolean);
      }
      let host = '', port = 4534;
      const uriMatch = block.match(/armagetronad:\/\/([^:"\s]+):(\d+)/);
      if (uriMatch) { host = uriMatch[1]; port = parseInt(uriMatch[2]); }
      let version = '';
      const versionMatch = afterAnchor.match(/Version:\s*([^\s<]+)/i);
      if (versionMatch) version = versionMatch[1].trim();
      let serverUrl = '';
      const urlMatch = afterAnchor.match(/URL:\s*(https?:\/\/[^\s<]+)/i);
      if (urlMatch) serverUrl = urlMatch[1].trim();
      let gameType = 'Armagetron';
      if (version) {
        if (version.includes('sty+ct')) gameType = 'sty+ct';
        else if (version.includes('sty')) gameType = 'sty';
        else if (version.includes('ct+ap')) gameType = 'ct+ap';
        else gameType = version;
      }
      servers.push({ id: id++, name, host, port, players: playerCount, maxPlayers, gameType, version, playerNames, url: serverUrl });
    } catch (e) { console.error('Error parsing server block:', e); }
  }
  return servers;
}

async function fetchServerListHTML(): Promise<BrowserServer[]> {
  const urls = getBrowserUrls();
  for (const url of urls) {
    try {
      console.log(`Fetching server list from ${url}`);
      const response = await fetchWithTimeout(url, 10000);
      if (!response.ok) { console.error(`Browser at ${url} returned ${response.status}`); continue; }
      const html = await response.text();
      const servers = parseServersHTML(html);
      if (servers.length > 0) { console.log(`HTML parser returned ${servers.length} servers from ${url}`); return servers; }
    } catch (e) { console.error(`Failed to fetch from ${url}:`, e); }
  }
  return [];
}

// Try fetching from the Armagetron stats API (JSON) as a primary source
async function fetchServerListAPI(): Promise<BrowserServer[]> {
  // The community maintains a JSON API at stats.armagetronad.org
  const apiUrls = [
    'https://stats.armagetronad.org/api/servers',
    'https://api.armagetronad.org/servers',
  ];

  for (const url of apiUrls) {
    try {
      console.log(`Trying JSON API at ${url}`);
      const response = await fetchWithTimeout(url, 8000);
      if (!response.ok) continue;
      const data = await response.json();

      if (Array.isArray(data) && data.length > 0) {
        return data.map((s: any, idx: number) => {
          let gameType = 'Armagetron';
          const v = s.version || '';
          if (v.includes('sty+ct')) gameType = 'sty+ct';
          else if (v.includes('sty')) gameType = 'sty';
          else if (v.includes('ct+ap')) gameType = 'ct+ap';
          else if (v) gameType = v;

          return {
            id: idx + 1,
            name: s.name || s.serverName || `Server @ ${s.host || s.ip}:${s.port || 4534}`,
            host: s.host || s.ip || s.address || '',
            port: s.port || 4534,
            players: s.players || s.numPlayers || s.playerCount || 0,
            maxPlayers: s.maxPlayers || s.max_players || s.numHumans || 16,
            gameType,
            version: v,
            playerNames: s.playerNames || s.players_list || [],
            url: s.url || s.website || '',
          } as BrowserServer;
        });
      }
    } catch (e) {
      console.log(`JSON API at ${url} not available:`, (e as Error).message);
    }
  }
  return [];
}

async function fetchServerList(): Promise<BrowserServer[]> {
  // Strategy: JSON API first (most reliable on Deno Deploy), then HTML fallback
  const apiServers = await fetchServerListAPI();
  if (apiServers.length > 0) return apiServers;

  console.log('JSON API unavailable, using HTML fallback');
  return await fetchServerListHTML();
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
      return corsResponse({ servers: cachedServers, cached: true, count: cachedServers.length, source: 'cache' });
    }

    const servers = await fetchServerList();
    if (servers.length > 0) { cachedServers = servers; cacheTime = now; }

    return corsResponse({ servers, cached: false, count: servers.length, source: 'live' });
  } catch (error) {
    console.error('Server browser error:', error);
    return corsResponse({ servers: cachedServers || [], error: 'Failed to fetch server list' });
  }
});
