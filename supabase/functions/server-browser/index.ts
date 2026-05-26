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

const BROWSER_URLS = [
  'https://browser.armanelgtron.tk/legacy/?info=_',
  'https://armagetronad.org/browser/legacy/?info=_',
];

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

async function fetchServerList(): Promise<BrowserServer[]> {
  for (const url of BROWSER_URLS) {
    try {
      const response = await fetchWithTimeout(url, 10000);
      if (!response.ok) {
        console.error(`Browser at ${url} returned ${response.status}`);
        continue;
      }
      const html = await response.text();
      const servers = parseServers(html);
      if (servers.length > 0) {
        console.log(`Fetched ${servers.length} servers from ${url}`);
        return servers;
      }
      console.log(`No servers parsed from ${url}, trying next source`);
    } catch (e) {
      console.error(`Failed to fetch from ${url}:`, e);
    }
  }
  console.error('All browser sources failed');
  return [];
}

function parseServers(html: string): BrowserServer[] {
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
      if (versionMatch) {
        version = versionMatch[1].trim();
      }

      let serverUrl = '';
      const urlMatch = afterAnchor.match(/URL:\s*(https?:\/\/[^\s<]+)/i);
      if (urlMatch) {
        serverUrl = urlMatch[1].trim();
      }

      let gameType = 'Armagetron';
      if (version) {
        if (version.includes('sty+ct')) gameType = 'sty+ct';
        else if (version.includes('sty')) gameType = 'sty';
        else if (version.includes('ct+ap')) gameType = 'ct+ap';
        else gameType = version;
      }

      servers.push({
        id: id++,
        name,
        host,
        port,
        players: playerCount,
        maxPlayers,
        gameType,
        version,
        playerNames,
        url: serverUrl,
      });
    } catch (e) {
      console.error('Error parsing server block:', e);
      continue;
    }
  }
  return servers;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
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
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const servers = await fetchServerList();
    cachedServers = servers;
    cacheTime = now;

    return new Response(JSON.stringify({ servers, cached: false, count: servers.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Server browser error:', error);
    return new Response(JSON.stringify({
      servers: cachedServers || [],
      error: 'Failed to fetch server list',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
