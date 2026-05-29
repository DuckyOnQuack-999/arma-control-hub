export function validateAgentUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    if (u.hostname === '169.254.169.254') return false; // Block AWS metadata endpoint
    return true;
  } catch {
    return false;
  }
}

export function sanitizeCommand(cmd: string): string {
  return cmd.replace(/[\r\n\0]/g, '').slice(0, 500);
}

export function validatePath(p: string): boolean {
  if (!p || typeof p !== 'string') return false;
  if (p.includes('\0')) return false;
  if (p.includes('..')) return false;
  if (p.length > 1024) return false;
  if (!p.startsWith('/')) return false;
  return true;
}

export function normalizePath(p: string): string {
  let normalized = p.replace(/\/+/g, '/');
  if (!normalized.startsWith('/')) normalized = '/' + normalized;
  return normalized;
}
