import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

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

// Master servers for UDP query
const MASTER_SERVERS = [
  { host: 'master1.armagetronad.org', port: 4533 },
  { host: 'master2.armagetronad.org', port: 4533 },
  { host: 'master3.armagetronad.org', port: 4533 },
];

/**
 * Armagetron UDP Protocol Implementation
 *
 * The protocol uses a simple request-response model:
 * - Connect to master server and request server list
 * - Master responds with list of server addresses
 * - Query each server individually for status
 */

// Create UDP socket and query master for server list
async function queryMasterForServers(masterHost: string, masterPort: number): Promise<{ host: string; port: number }[]> {
  const servers: { host: string; port: number }[] = [];

  let conn: Deno.DatagramConn | null = null;
  try {
    conn = Deno.listenDatagram({
      hostname: '0.0.0.0',
      port: 0,
      transport: 'udp',
    });

    // Armagetron master server request format
    // Send "serverlist" followed by signature
    // The protocol expects certain bytes - we use a minimal handshake
    const encoder = new TextEncoder();

    // Send a simple query - master accepts various formats
    // Some masters accept "serverlist\0" or just connecting triggers response
    const query = encoder.encode('serverlist\n');
    await conn.send(query, { hostname: masterHost, port: masterPort, transport: 'udp' });

    // Wait for response with timeout
    const buf = new Uint8Array(4096);
    const timeoutId = setTimeout(() => {
      try { conn?.close(); } catch {}
    }, 5000);

    try {
      const [data, addr] = await conn.receive(buf);
      clearTimeout(timeoutId);

      if (data && data.length > 0) {
        const text = new TextDecoder().decode(data);

        // Parse server addresses - format is typically IP:PORT per line
        const lines = text.split(/[\n\r\0]+/);

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // Try various formats
          // Format 1: host:port
          let match = trimmed.match(/^([^:\s]+):(\d+)$/);
          if (match) {
            const host = match[1];
            const port = parseInt(match[2]) || 4534;
            if (!servers.some(s => s.host === host && s.port === port)) {
              servers.push({ host, port });
            }
            continue;
          }

          // Format 2: armagetronad://host:port
          match = trimmed.match(/armagetronad:\/\/([^:]+):(\d+)/);
          if (match) {
            const host = match[1];
            const port = parseInt(match[2]) || 4534;
            if (!servers.some(s => s.host === host && s.port === port)) {
              servers.push({ host, port });
            }
          }
        }

        console.log(`Master ${masterHost}:${masterPort} returned ${servers.length} servers`);
      }
    } catch (recvErr) {
      clearTimeout(timeoutId);
      // Timeout or error - continue to next master
    }
  } catch (connErr) {
    console.error(`Failed to connect to master ${masterHost}:${masterPort}:`, connErr);
  } finally {
    if (conn) {
      try { conn.close(); } catch {}
    }
  }

  return servers;
}

// Query individual game server for status using direct UDP
async function queryServerStatusUDP(host: string, port: number): Promise<Partial<BrowserServer> | null> {
  let conn: Deno.DatagramConn | null = null;

  try {
    conn = Deno.listenDatagram({
      hostname: '0.0.0.0',
      port: 0,
      transport: 'udp',
    });

    // Send status query to the game server
    // Armagetron servers respond to certain queries
    const encoder = new TextEncoder();
    const query = encoder.encode('status\n');
    await conn.send(query, { hostname: host, port, transport: 'udp' });

    const buf = new Uint8Array(4096);
    const timeoutId = setTimeout(() => {
      try { conn?.close(); } catch {}
    }, 3000);

    try {
      const [data] = await conn.receive(buf);
      clearTimeout(timeoutId);

      if (data && data.length > 0) {
        const text = new TextDecoder().decode(data);
        return parseServerStatus(text, host, port);
      }
    } catch {
      clearTimeout(timeoutId);
    }
  } catch (e) {
    // Connection failed
  } finally {
    if (conn) {
      try { conn.close(); } catch {}
    }
  }

  return null;
}

// Parse server status response
function parseServerStatus(text: string, host: string, port: number): Partial<BrowserServer> | null {
  try {
    const lines = text.split('\n');
    let name = `Server @ ${host}:${port}`;
    let players = 0;
    let maxPlayers = 16;
    let version = '';
    const playerNames: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Various formats encountered:
      // "server_name My Server"
      // "Server Name: My Server"
      // "name My Server"

      const nameMatch = trimmed.match(/^(?:server_?name|name)\s*:?\s*(.+)$/i);
      if (nameMatch) {
        name = nameMatch[1].trim();
        continue;
      }

      // "players 5/16" or "Players: 5/16"
      const playersMatch = trimmed.match(/^players?\s*:?\s*(\d+)\s*[\/\s]\s*(\d+)$/i);
      if (playersMatch) {
        players = parseInt(playersMatch[1]) || 0;
        maxPlayers = parseInt(playersMatch[2]) || 16;
        continue;
      }

      // "version 0.2.9" or "Version: 0.2.9"
      const versionMatch = trimmed.match(/^version\s*:?\s*(.+)$/i);
      if (versionMatch) {
        version = versionMatch[1].trim();
        continue;
      }

      // Player lines: "PlayerName score ping"
      // Skip common keywords
      const playerLineMatch = trimmed.match(/^([A-Za-z0-9_]+)\s+\d+\s+\d+$/);
      if (playerLineMatch) {
        const playerName = playerLineMatch[1];
        if (!['server', 'name', 'players', 'version', 'map', 'host', 'port'].includes(playerName.toLowerCase())) {
          playerNames.push(playerName);
        }
      }
    }

    return { name, host, port, players, maxPlayers, version, playerNames };
  } catch {
    return null;
  }
}

// Full UDP browser flow
async function fetchServersViaUDP(): Promise<BrowserServer[]> {
  console.log('Starting UDP master server query...');

  // Get server list from masters
  let serverList: { host: string; port: number }[] = [];

  for (const master of MASTER_SERVERS) {
    try {
      const servers = await queryMasterForServers(master.host, master.port);
      if (servers.length > 0) {
        serverList = servers;
        console.log(`Got ${servers.length} server addresses from ${master.host}`);
        break;
      }
    } catch (e) {
      console.error(`Master ${master.host} query failed:`, e);
    }
  }

  if (serverList.length === 0) {
    console.log('UDP master query returned no servers, falling back to HTML');
    return [];
  }

  console.log(`Querying ${serverList.length} individual servers...`);

  // Query each server for status with concurrency limit
  const results: BrowserServer[] = [];
  const chunkSize = 5; // Reduce concurrency to avoid overwhelming

  for (let i = 0; i < serverList.length; i += chunkSize) {
    const chunk = serverList.slice(i, i + chunkSize);

    const responses = await Promise.allSettled(
      chunk.map(async (s, idx) => {
        try {
          const status = await queryServerStatusUDP(s.host, s.port);
          if (status && status.name) {
            const serverId = i + idx + 1;
            const version = status.version || '';
            let gameType = 'Armagetron';
            if (version.includes('sty+ct')) gameType = 'sty+ct';
            else if (version.includes('sty')) gameType = 'sty';
            else if (version.includes('ct')) gameType = 'ct';
            else if (version) gameType = version;

            return {
              id: serverId,
              name: status.name || `Server @ ${s.host}:${s.port}`,
              host: s.host,
              port: s.port,
              players: status.players || 0,
              maxPlayers: status.maxPlayers || 16,
              gameType,
              version,
              playerNames: status.playerNames || [],
              url: '',
            } as BrowserServer;
          }
        } catch {}
        return null;
      })
    );

    for (const result of responses) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    }
  }

  console.log(`UDP query completed: ${results.length} live servers`);
  return results;
}

// HTML fallback parsing
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
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

async function fetchServerListHTML(): Promise<BrowserServer[]> {
  const urls = getBrowserUrls();
  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(url, 10000);
      if (!response.ok) {
        console.error(`Browser at ${url} returned ${response.status}`);
        continue;
      }
      const html = await response.text();
      const servers = parseServersHTML(html);
      if (servers.length > 0) {
        console.log(`HTML parser returned ${servers.length} servers from ${url}`);
        return servers;
      }
    } catch (e) {
      console.error(`Failed to fetch from ${url}:`, e);
    }
  }
  return [];
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
        if (playersText) {
          playerNames = playersText.split(',').map(p => decodeHtmlEntities(p.trim())).filter(Boolean);
        }
      }

      let host = '';
      let port = 4534;
      const uriMatch = block.match(/armagetronad:\/\/([^:"\s]+):(\d+)/);
      if (uriMatch) {
        host = uriMatch[1];
        port = parseInt(uriMatch[2]);
      }

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
    } catch (e) {
      console.error('Error parsing server block:', e);
    }
  }
  return servers;
}

// Main fetch function
async function fetchServerList(): Promise<BrowserServer[]> {
  // Try UDP first, then HTML fallback
  const udpServers = await fetchServersViaUDP();

  if (udpServers.length >= 5) {
    return udpServers;
  }

  // Fall back to HTML if UDP returned few/no results
  console.log('Using HTML fallback for server list...');
  const htmlServers = await fetchServerListHTML();

  // Merge results, preferring UDP data for overlapping servers
  if (htmlServers.length > udpServers.length) {
    return htmlServers;
  }

  return udpServers.length > 0 ? udpServers : htmlServers;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = Date.now();
    if (cachedServers && (now - cacheTime) < CACHE_TTL) {
      return new Response(JSON.stringify({
        servers: cachedServers,
        cached: true,
        count: cachedServers.length,
        source: 'cache'
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const servers = await fetchServerList();
    if (servers.length > 0) {
      cachedServers = servers;
      cacheTime = now;
    }

    return new Response(JSON.stringify({
      servers,
      cached: false,
      count: servers.length,
      source: 'live',
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Server browser error:', error);
    return new Response(JSON.stringify({
      servers: cachedServers || [],
      error: 'Failed to fetch server list',
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
