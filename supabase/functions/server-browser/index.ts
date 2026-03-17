const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

// Simple in-memory cache
let cachedServers: BrowserServer[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

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

async function fetchServerList(): Promise<BrowserServer[]> {
  // Fetch the legacy page — using ?info=_ to trigger the detail view which includes armagetronad:// links
  const url = 'https://browser.armanelgtron.tk/legacy/?info=_';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`Legacy browser returned ${response.status}`);
      return [];
    }

    const html = await response.text();
    return parseServers(html);
  } catch (e) {
    clearTimeout(timeout);
    console.error('Failed to fetch legacy browser:', e);
    return [];
  }
}

function parseServers(html: string): BrowserServer[] {
  const servers: BrowserServer[] = [];

  // The HTML is a single long line. Each server block starts with <a name="ServerName"
  // Split by the anchor tag pattern
  const serverBlocks = html.split(/<a name="/);

  let id = 1;
  for (let i = 1; i < serverBlocks.length; i++) {
    const block = serverBlocks[i];

    try {
      // Extract server name from the anchor text (between > and </a>)
      // The anchor text contains colored spans, strip them to get plain name
      const anchorMatch = block.match(/^[^"]*"[^>]*>(.*?)<\/a>/s);
      if (!anchorMatch) continue;

      const rawName = stripHtmlTags(anchorMatch[1]).trim();
      const name = decodeHtmlEntities(rawName);
      if (!name) continue;

      // Extract players/maxPlayers from the (N/M) pattern after the anchor
      // HTML looks like: <span style="color:#ffffff">- (</span><span style="color:#00dd00">4</span><span style="color:#ffffff">/</span><span style="color:#44dd44">16</span>
      // After stripping tags: - (4/16)
      const afterAnchor = block.substring(anchorMatch[0].length);
      const plainAfter = stripHtmlTags(afterAnchor);
      const countMatch = plainAfter.match(/\(\s*(\d+)\s*\/\s*(\d+)\s*\)/);
      const playerCount = countMatch ? parseInt(countMatch[1]) : 0;
      const maxPlayers = countMatch ? parseInt(countMatch[2]) : 16;

      // Extract player names from "Players: name1, name2"
      let playerNames: string[] = [];
      const playersMatch = afterAnchor.match(/Players:\s*(.*?)(?:<br|<a\s|$)/i);
      if (playersMatch) {
        const playersText = stripHtmlTags(playersMatch[1]).trim();
        if (playersText) {
          playerNames = playersText.split(',').map(p => decodeHtmlEntities(p.trim())).filter(Boolean);
        }
      }

      // Extract host:port from armagetronad:// link (if present in this block)
      let host = '';
      let port = 4534;
      const uriMatch = block.match(/armagetronad:\/\/([^:"\s]+):(\d+)/);
      if (uriMatch) {
        host = uriMatch[1];
        port = parseInt(uriMatch[2]);
      }

      // Extract version
      let version = '';
      const versionMatch = afterAnchor.match(/Version:\s*([^\s<]+)/i);
      if (versionMatch) {
        version = versionMatch[1].trim();
      }

      // Extract URL
      let serverUrl = '';
      const urlMatch = afterAnchor.match(/URL:\s*(https?:\/\/[^\s<]+)/i);
      if (urlMatch) {
        serverUrl = urlMatch[1].trim();
      }

      // Determine game type from version string
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
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const now = Date.now();
    if (cachedServers && (now - cacheTime) < CACHE_TTL) {
      return new Response(JSON.stringify({ servers: cachedServers, cached: true, count: cachedServers.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const servers = await fetchServerList();
    cachedServers = servers;
    cacheTime = now;

    console.log(`Fetched ${servers.length} servers from legacy browser`);

    return new Response(JSON.stringify({ servers, cached: false, count: servers.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Server browser error:', error);
    return new Response(JSON.stringify({
      servers: cachedServers || [],
      error: error instanceof Error ? error.message : 'Failed to fetch server list',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
