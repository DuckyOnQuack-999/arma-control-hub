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

// UDP query class for Armagetron protocol
class ArmagetronUDP {
  private conn: Deno.DatagramConn | null = null;
  private buf = new Uint8Array(1024);

  async connect(host: string, port: number, timeout = 3000): Promise<boolean> {
    try {
      this.conn = Deno.listenDatagram({
        hostname: '0.0.0.0',
        port: 0,
        transport: 'udp',
      });

      // Set timeout on the connection
      const addr = { hostname: host, port, transport: 'udp' as const };
      this.conn.addr;
      return true;
    } catch (e) {
      console.error(`UDP connect failed for ${host}:${port}:`, e);
      return false;
    }
  }

  async send(host: string, port: number, data: Uint8Array): Promise<void> {
    if (!this.conn) throw new Error('Not connected');
    await this.conn.send(data, { hostname: host, port, transport: 'udp' });
  }

  async receive(timeout = 3000): Promise<{ data: Uint8Array; addr: Deno.Addr } | null> {
    if (!this.conn) return null;

    // Race between receive and timeout
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), timeout);
    });

    try {
      const result = await Promise.race([
        this.conn.receive(this.buf),
        timeoutPromise,
      ]);
      return result as { data: Uint8Array; addr: Deno.Addr };
    } catch {
      return null;
    }
  }

  close() {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
  }
}

// Query master server for server list
async function queryMasterServers(): Promise<{ host: string; port: number }[]> {
  const servers: { host: string; port: number }[] = [];

  for (const master of MASTER_SERVERS) {
    const udp = new ArmagetronUDP();
    try {
      const connected = await udp.connect(master.host, master.port);
      if (!connected) continue;

      // Send "serverlist" request (Armagetron protocol)
      // The protocol sends a null-terminated "serverlist" string
      const request = new TextEncoder().encode('serverlist\0');
      await udp.send(master.host, master.port, request);

      // The response format is typically: each server as "host:port\n"
      const response = await udp.receive(5000);
      if (response && response.data.length > 0) {
        // Parse the response - format varies by master
        const text = new TextDecoder().decode(response.data);
        const lines = text.split(/[\n\r\0]+/).filter(Boolean);

        for (const line of lines) {
          // Match host:port format
          const match = line.match(/^([^:]+):(\d+)$/);
          if (match) {
            const host = match[1].trim();
            const port = parseInt(match[2]) || 4534;
            // Deduplicate
            if (!servers.some(s => s.host === host && s.port === port)) {
              servers.push({ host, port });
            }
          }
        }

        if (servers.length > 0) {
          console.log(`UDP query to ${master.host}:${master.port} returned ${servers.length} servers`);
          break; // Use first successful master
        }
      }
    } catch (e) {
      console.error(`Master query failed for ${master.host}:${master.port}:`, e);
    } finally {
      udp.close();
    }
  }

  return servers;
}

// Query individual server for status
async function queryServerStatus(host: string, port: number): Promise<Partial<BrowserServer> | null> {
  const udp = new ArmagetronUDP();
  try {
    const connected = await udp.connect(host, port);
    if (!connected) return null;

    // Send status query - "status" command
    const request = new TextEncoder().encode('status\0');
    await udp.send(host, port, request);

    const response = await udp.receive(3000);
    if (response && response.data.length > 0) {
      const text = new TextDecoder().decode(response.data);
      return parseServerStatus(text, host, port);
    }
  } catch (e) {
    // Server not responding
  } finally {
    udp.close();
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
      // Try to parse various formats
      // Format 1: "Server Name: X"
      const nameMatch = trimmed.match(/^server\s*name\s*:?\s*(.+)$/i);
      if (nameMatch) name = nameMatch[1].trim();

      // Format 2: "Players: N/M" or "players N/M"
      const playersMatch = trimmed.match(/^players\s*:?\s*(\d+)\s*\/\s*(\d+)$/i);
      if (playersMatch) {
        players = parseInt(playersMatch[1]);
        maxPlayers = parseInt(playersMatch[2]);
      }

      // Format 3: "Version: X"
      const versionMatch = trimmed.match(/^version\s*:?\s*(.+)$/i);
      if (versionMatch) version = versionMatch[1].trim();

      // Format 4: Player names (various formats)
      const playerMatch = trimmed.match(/^\s*([^\s]+)\s+\d+\s+\d+/);
      if (playerMatch && !['name', 'ip', 'ping', 'score'].includes(playerMatch[1].toLowerCase())) {
        playerNames.push(playerMatch[1]);
      }
    }

    return { name, host, port, players, maxPlayers, version, playerNames };
  } catch {
    return null;
  }
}

// Full UDP browser flow
async function fetchServersViaUDP(): Promise<BrowserServer[]> {
  console.log('Starting UDP master query...');

  // Get server list from master
  const serverList = await queryMasterServers();
  if (serverList.length === 0) {
    console.log('UDP master query returned no servers');
    return [];
  }

  console.log(`Querying ${serverList.length} servers via UDP...`);

  // Query each server for status (with concurrency limit)
  const results: BrowserServer[] = [];
  const chunkSize = 10;

  for (let i = 0; i < serverList.length; i += chunkSize) {
    const chunk = serverList.slice(i, i + chunkSize);
    const responses = await Promise.all(
      chunk.map(async (s, idx) => {
        const status = await queryServerStatus(s.host, s.port);
        return status ? { id: i + idx + 1, ...status } as BrowserServer : null;
      })
    );

    for (const r of responses) {
      if (r && r.name) {
        // Ensure all fields have defaults
        results.push({
          id: r.id,
          name: r.name,
          host: r.host,
          port: r.port,
          players: r.players ?? 0,
          maxPlayers: r.maxPlayers ?? 16,
          gameType: r.version?.includes('sty') ? 'sty' : r.version?.includes('ct') ? 'ct' : 'Armagetron',
          version: r.version ?? '',
          playerNames: r.playerNames ?? [],
          url: '',
        });
      }
    }
  }

  console.log(`UDP query returned ${results.length} live servers`);
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
        console.log(`Fetched ${servers.length} servers from ${url}`);
        return servers;
      }
      console.log(`No servers parsed from ${url}, trying next source`);
    } catch (e) {
      console.error(`Failed to fetch from ${url}:`, e);
    }
  }
  console.error('All HTML browser sources failed');
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
      continue;
    }
  }
  return servers;
}

// Main fetch function - tries UDP first, falls back to HTML
async function fetchServerList(): Promise<BrowserServer[]> {
  // Try UDP master query first
  let servers = await fetchServersViaUDP();

  // If UDP failed or returned few results, use HTML fallback
  if (servers.length < 5) {
    console.log('UDP returned few results, trying HTML fallback...');
    const htmlServers = await fetchServerListHTML();
    if (htmlServers.length > servers.length) {
      servers = htmlServers;
    }
  }

  // Return stale cache if both failed
  if (servers.length === 0 && cachedServers && cachedServers.length > 0) {
    console.log(`Returning stale cache with ${cachedServers.length} servers`);
    return cachedServers;
  }

  return servers;
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
      return new Response(JSON.stringify({ servers: cachedServers, cached: true, count: cachedServers.length }), {
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
      stale: servers === cachedServers && (now - cacheTime) >= CACHE_TTL,
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
