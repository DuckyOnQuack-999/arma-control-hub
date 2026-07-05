import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function safeDbWrite(op: Promise<{ error: any }>, label: string): Promise<void> {
  const { error } = await op;
  if (error) console.error(`DB write error (${label}):`, error.message);
}

export async function parseJsonSafe(resp: Response): Promise<any> {
  try {
    return await resp.json();
  } catch {
    console.error('Failed to parse agent response as JSON');
    return { error: 'Agent returned invalid JSON' };
  }
}

export function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export async function authenticateUser(authHeader: string | null): Promise<{ user: any; supabase: SupabaseClient } | Response> {
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
        'Content-Type': 'application/json',
      },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
        'Content-Type': 'application/json',
      },
    });
  }

  return { user, supabase };
}

export async function requireRole(supabase: SupabaseClient, userId: string, roles: string[]): Promise<boolean> {
  for (const role of roles) {
    const { data } = await supabase.rpc('has_role', { _user_id: userId, _role: role });
    if (data) return true;
  }
  return false;
}

export async function writeConsoleLine(supabase: SupabaseClient, serverId: number, lineType: string, text: string, source: string = 'panel'): Promise<void> {
  await safeDbWrite(
    supabase.from('console_lines').insert({
      server_id: serverId,
      line_type: lineType,
      text,
      source,
    }),
    `console_lines insert for server ${serverId}`,
  );
}

export async function logAudit(supabase: SupabaseClient, userId: string, action: string, targetType: string, targetId: string, details: Record<string, unknown>): Promise<void> {
  await safeDbWrite(
    supabase.from('audit_log').insert({
      user_id: userId,
      action,
      target_type: targetType,
      target_id: targetId,
      details,
    }),
    `audit_log insert for ${action}`,
  );
}

export async function logServerEvent(supabase: SupabaseClient, serverId: number, eventType: string, payload: Record<string, unknown>): Promise<void> {
  await safeDbWrite(
    supabase.from('server_events').insert({
      server_id: serverId,
      event_type: eventType,
      payload,
    }),
    `server_events insert for ${eventType}`,
  );
}
