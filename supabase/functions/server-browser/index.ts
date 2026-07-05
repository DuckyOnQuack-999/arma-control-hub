import { corsHeaders, corsResponse, corsError } from "../_shared/cors.ts";
import { parseJsonSafe } from "../_shared/db.ts";
import { validateAgentUrl } from "../_shared/validation.ts";

interface BrowserServer {
  id: number;
  name: string;
  ip: string;
  port: number;
  players: number;
  maxPlayers: number;
  map: string;
  version: string;
  gameType: string;
  host: string;
}

const MASTER_SERVERS = [
  { host: 'master1.armagetronad.net', port: 4533 },
  { host: 'master2.armagetronad.net', port: 4533 },
  { host: 'master3.armagetronad.net', port: 4533 },
];

const QUERY_TIMEOUT = 5000;
const CACHE_TTL = 30000; // 30 seconds

// In-memory cache for server list
let cachedServers: BrowserServer[] = [];
let cacheTimestamp = 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { agentUrl: agentUrlParam, ip, port } = body;

    // Check cache first
    const now = Date.now();
    if (cachedServers.length > 0 && (now - cacheTimestamp) < CACHE_TTL) {
      return corsResponse({ servers: cachedServers, source: 'cache' });
    }

    // Try agent first if provided
    if (agentUrlParam && validateAgentUrl(agentUrlParam)) {
      try {
        const agentUrl = agentUrlParam.replace(/\/$/, '');
        const agentToken = 'default-agent-token';

        if (ip && port) {
          // Query specific server
          const agentResp = await fetch(`${agentUrl}/api/browser/query?ip=${encodeURIComponent(ip)}&port=${port}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${agentToken}` },
            signal: AbortSignal.timeout(QUERY_TIMEOUT),
          });
          const agentData = await parseJsonSafe(agentResp);
          return corsResponse({ ...agentData, source: 'agent' });
        } else {
          // List all servers
          const agentResp = await fetch(`${agentUrl}/api/browser`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${agentToken}` },
            signal: AbortSignal.timeout(10000),
          });
          const agentData = await parseJsonSafe(agentResp);
          if (Array.isArray(agentData) && agentData.length > 0) {
            cachedServers = agentData;
            cacheTimestamp = now;
            return corsResponse({ servers: agentData, source: 'agent' });
          }
        }
      } catch (fetchErr) {
        console.error('Agent browser fetch error:', fetchErr);
      }
    }

    // Try UDP query to master servers (Deno supports UDP)
    if (!ip && !port) {
      const servers = await queryMasterServers();
      if (servers.length > 0) {
        cachedServers = servers;
        cacheTimestamp = now;
        return corsResponse({ servers, source: 'master' });
      }
    }

    // Fallback: scrape from stats sites
    const scrapeUrls = [
      'https://stats.retrocycles.net/server-list',
      'https://www.armagetronad.net/server-list',
    ];

    for (const url of scrapeUrls) {
      try {
        const resp = await fetch(url, {
          signal: AbortSignal.timeout(10000),
        });
        if (resp.ok) {
          const html = await resp.text();
          const servers = parseStatsHtml(html);
          if (servers.length > 0) {
            cachedServers = servers;
            cacheTimestamp = now;
            return corsResponse({ servers, source: 'scrape' });
          }
        }
      } catch (scrapeErr) {
        console.error(`Scrape error for ${url}:`, scrapeErr);
      }
    }

    // Return cached data even if stale, or empty
    if (cachedServers.length > 0) {
      return corsResponse({ servers: cachedServers, source: 'stale_cache' });
    }

    return corsResponse({ servers: [], source: 'empty' });

  } catch (error) {
    console.error('Server browser error:', error);
    return corsError('Internal server error', 500);
  }
});

async function queryMasterServers(): Promise<BrowserServer[]> {
  const allServers: BrowserServer[] = [];
  let serverId = 1;

  for (const master of MASTER_SERVERS) {
    try {
      const servers = await queryMasterServer(master.host, master.port);
      for (const s of servers) {
        allServers.push({
          ...s,
          id: serverId++,
          host: s.ip,
          gameType: 'Unknown',
        });
      }
      if (allServers.length > 0) break; // Got servers from this master
    } catch (e) {
      console.error(`Master ${master.host} query failed:`, e);
    }
  }

  // Query each server for detailed info (limit concurrent queries)
  const detailedServers = await Promise.all(
    allServers.slice(0, 50).map(async (s) => {
      try {
        const details = await queryIndividualServer(s.ip, s.port);
        return { ...s, ...details };
      } catch {
        return s;
      }
    })
  );

  return detailedServers;
}

async function queryMasterServer(host: string, port: number): Promise<Partial<BrowserServer>[]> {
  return new Promise((resolve) => {
    const socket = Deno.listenDatagram({ port: 0, transport: 'udp' });
    const timeout = setTimeout(() => {
      socket.close();
      resolve([]);
    }, QUERY_TIMEOUT);

    // Master server list request packet
    const query = new Uint8Array([0x00, 0x00, 0x00, 0x01]);

    socket.send(query, { transport: 'udp', hostname: host, port }).catch(() => {
      clearTimeout(timeout);
      socket.close();
      resolve([]);
    });

    socket.receive().then(([msg, _addr]) => {
      clearTimeout(timeout);
      socket.close();
      try {
        const servers = parseMasterResponse(msg);
        resolve(servers);
      } catch (e) {
        console.error('Parse master response error:', e);
        resolve([]);
      }
    }).catch(() => {
      clearTimeout(timeout);
      socket.close();
      resolve([]);
    });
  });
}

function parseMasterResponse(buf: Uint8Array): Partial<BrowserServer>[] {
  const servers: Partial<BrowserServer>[] = [];
  let offset = 4; // Skip 4-byte header

  while (offset + 6 <= buf.length) {
    const ip = `${buf[offset]}.${buf[offset + 1]}.${buf[offset + 2]}.${buf[offset + 3]}`;
    const port = (buf[offset + 4] << 8) | buf[offset + 5];
    offset += 6;

    servers.push({
      name: 'Unknown',
      ip,
      port,
      players: 0,
      maxPlayers: 0,
      map: 'Unknown',
      version: 'Unknown',
    });
  }

  return servers;
}

async function queryIndividualServer(ip: string, port: number): Promise<Partial<BrowserServer>> {
  return new Promise((resolve) => {
    const socket = Deno.listenDatagram({ port: 0, transport: 'udp' });
    const timeout = setTimeout(() => {
      socket.close();
      resolve({});
    }, QUERY_TIMEOUT);

    // Server status query packet
    const query = new Uint8Array([0x00, 0x00, 0x00, 0x00]);

    socket.send(query, { transport: 'udp', hostname: ip, port }).catch(() => {
      clearTimeout(timeout);
      socket.close();
      resolve({});
    });

    socket.receive().then(([msg, _addr]) => {
      clearTimeout(timeout);
      socket.close();
      try {
        const response = parseServerResponse(msg);
        resolve(response);
      } catch (e) {
        resolve({});
      }
    }).catch(() => {
      clearTimeout(timeout);
      socket.close();
      resolve({});
    });
  });
}

function parseServerResponse(buf: Uint8Array): Partial<BrowserServer> {
  // Armagetron response format - skip 4-byte header
  if (buf.length <= 4) return {};

  const str = new TextDecoder().decode(buf.slice(4));
  const lines = str.split('\n');
  const result: Partial<BrowserServer> = {};

  for (const line of lines) {
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx < 0) continue;
    const key = line.substring(0, spaceIdx);
    const value = line.substring(spaceIdx + 1);

    switch (key) {
      case 'SERVER_NAME':
        result.name = value.trim();
        break;
      case 'MAP_NAME':
        result.map = value.trim();
        break;
      case 'NUM_PLAYERS':
        result.players = parseInt(value, 10) || 0;
        break;
      case 'MAX_PLAYERS':
        result.maxPlayers = parseInt(value, 10) || 0;
        break;
      case 'VERSION':
        result.version = value.trim();
        break;
    }
  }

  return result;
}

function parseStatsHtml(html: string): BrowserServer[] {
  const servers: BrowserServer[] = [];
  let id = 1;

  // Pattern 1: Standard table rows
  const serverPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;

  while ((match = serverPattern.exec(html)) !== null) {
    const row = match[1];
    const cells: string[] = [];
    let cellMatch;
    const cellPattern = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

    while ((cellMatch = cellPattern.exec(row)) !== null) {
      // Strip HTML tags from cell content
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
    }

    if (cells.length >= 4) {
      const name = cells[0] || 'Unknown';
      const address = cells[1] || '';
      const players = parseInt(cells[2], 10) || 0;
      const maxPlayers = parseInt(cells[3], 10) || 0;

      const [ip, portStr] = address.split(':');
      const port = parseInt(portStr, 10) || 4534;

      // Skip header rows
      if (name && name !== 'Server Name' && name !== 'Name' && name !== 'Server') {
        servers.push({
          id: id++,
          name,
          ip: ip || 'Unknown',
          host: ip || 'Unknown',
          port,
          players,
          maxPlayers,
          map: 'Unknown',
          version: 'Unknown',
          gameType: 'Unknown',
        });
      }
    }
  }

  // Pattern 2: JSON embedded in page
  if (servers.length === 0) {
    try {
      const jsonPattern = /\[\s*\{[^[\]]*\}\s*\]/g;
      let jsonMatch;
      while ((jsonMatch = jsonPattern.exec(html)) !== null) {
        try {
          const data = JSON.parse(jsonMatch[0]);
          if (Array.isArray(data)) {
            for (const s of data) {
              if (s.name || s.server_name) {
                servers.push({
                  id: id++,
                  name: s.name || s.server_name || 'Unknown',
                  ip: s.ip || s.address?.split(':')[0] || 'Unknown',
                  host: s.ip || s.address?.split(':')[0] || 'Unknown',
                  port: s.port || parseInt(s.address?.split(':')[1], 10) || 4534,
                  players: s.players || s.player_count || 0,
                  maxPlayers: s.max_players || s.maxPlayers || 16,
                  map: s.map || 'Unknown',
                  version: s.version || 'Unknown',
                  gameType: s.game_type || s.gameType || 'Unknown',
                });
              }
            }
          }
        } catch {
          // Not valid JSON, continue
        }
      }
    } catch {
      // No JSON found
    }
  }

  return servers;
}
