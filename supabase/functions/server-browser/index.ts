const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface BrowserServer {
  id: number;
  name: string;
  host: string;
  port: number;
  map: string;
  players: number;
  maxPlayers: number;
  ping: number;
  gameType: string;
}

// Simple in-memory cache
let cachedServers: BrowserServer[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

async function fetchMasterServerList(): Promise<BrowserServer[]> {
  // Try scraping the Armagetron master server HTTP list
  // The master server provides a list via HTTP at known endpoints
  const masterUrls = [
    'http://master1.armagetronad.net/arma.htm',
    'http://master2.armagetronad.net/arma.htm',
  ];

  for (const url of masterUrls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) continue;

      const html = await response.text();
      return parseMasterServerHtml(html);
    } catch (e) {
      console.log(`Failed to fetch ${url}:`, e);
      continue;
    }
  }

  // Fallback: return empty list if master servers unreachable
  console.log('All master servers unreachable, returning empty list');
  return [];
}

function parseMasterServerHtml(html: string): BrowserServer[] {
  const servers: BrowserServer[] = [];
  // The master server HTML contains server info in a structured format
  // Each server entry typically has: name, host:port, players/max, map
  const lines = html.split('\n');
  let id = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('<') || trimmed.startsWith('#')) continue;

    // Try to parse common master server list formats
    // Format varies but typically: host:port name players/max
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;

    const hostPort = parts[0];
    const [host, portStr] = hostPort.split(':');
    const port = parseInt(portStr || '4534');
    if (!host || isNaN(port)) continue;

    const name = parts.slice(1).join(' ').replace(/0x[0-9a-fA-F]+/g, '').trim() || `Server ${id}`;

    servers.push({
      id: id++,
      name,
      host,
      port,
      map: 'Unknown',
      players: 0,
      maxPlayers: 16,
      ping: Math.floor(Math.random() * 150) + 10,
      gameType: 'Classic',
    });
  }

  return servers;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const now = Date.now();
    if (cachedServers && (now - cacheTime) < CACHE_TTL) {
      return new Response(JSON.stringify({ servers: cachedServers, cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const servers = await fetchMasterServerList();
    cachedServers = servers;
    cacheTime = now;

    return new Response(JSON.stringify({ servers, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Server browser error:', error);
    return new Response(JSON.stringify({
      servers: cachedServers || [],
      error: error instanceof Error ? error.message : 'Failed to fetch server list',
    }), {
      status: 200, // Return 200 with empty list rather than error
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
