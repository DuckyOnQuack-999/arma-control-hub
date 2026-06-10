import { corsHeaders, corsResponse, corsError } from "../_shared/cors.ts";
import { authenticateUser, parseJsonSafe } from "../_shared/db.ts";
import { validateAgentUrl } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authResult = await authenticateUser(req.headers.get('Authorization'));
    if (authResult instanceof Response) return authResult;
    const { user, supabase } = authResult;

    const body = await req.json().catch(() => ({}));
    const { agentUrl: agentUrlParam, ip, port } = body;

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
            signal: AbortSignal.timeout(5000),
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
          if (Array.isArray(agentData)) {
            return corsResponse({ servers: agentData, source: 'agent' });
          }
        }
      } catch (fetchErr) {
        console.error('Agent browser fetch error:', fetchErr);
      }
    }

    // Fallback: scrape from stats site
    try {
      const resp = await fetch('https://stats.retrocycles.net/server-list', {
        signal: AbortSignal.timeout(10000),
      });
      const html = await resp.text();
      const servers = parseStatsHtml(html);
      return corsResponse({ servers, source: 'scrape' });
    } catch (scrapeErr) {
      console.error('Scrape error:', scrapeErr);
    }

    // Final fallback: return empty
    return corsResponse({ servers: [], source: 'empty' });

  } catch (error) {
    console.error('Server browser error:', error);
    return corsError('Internal server error', 500);
  }
});

function parseStatsHtml(html: string): any[] {
  const servers: any[] = [];
  // Very basic parsing - look for common patterns
  const rowRegex = /<tr[^>]*>.*?<td[^>]*>(.*?)<\/td>.*?<td[^>]*>(.*?)<\/td>.*?<td[^>]*>(\d+)<\/td>.*?<td[^>]*>(\d+)<\/td>.*?<\/tr>/gs;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    servers.push({
      name: match[1].trim(),
      ip: match[2].split(':')[0],
      port: parseInt(match[2].split(':')[1]) || 4534,
      players: parseInt(match[3]) || 0,
      maxPlayers: parseInt(match[4]) || 0,
      map: 'Unknown',
      version: 'Unknown',
    });
  }
  return servers;
}
