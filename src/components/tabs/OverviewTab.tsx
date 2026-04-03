import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Server, ServerStatus } from '@/data/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ServerStatusBadge } from '@/components/server/ServerStatusBadge';
import { Map, Clock, Users, Cpu, HardDrive, Wifi, WifiOff, Save, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { updateServer } from '@/lib/supabaseApi';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/hooks/use-toast';

export default function OverviewTab({ server }: { server: Server }) {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';
  const [agentUrl, setAgentUrl] = useState(server.agent_url || '');
  const [saving, setSaving] = useState(false);

  const formatUptime = (s: number) => {
    const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60);
    return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const handleSaveAgent = async () => {
    setSaving(true);
    try {
      await updateServer(server.id, { agent_url: agentUrl });
      toast({ title: 'Agent URL updated' });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="font-display text-sm">Server Info</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Status</span><ServerStatusBadge status={server.status as ServerStatus} /></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Port</span><span className="font-mono">{server.port}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Auto Restart</span><span>{server.auto_restart ? 'Enabled' : 'Disabled'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Executable</span><span className="font-mono text-xs truncate max-w-48">{server.executable_path}</span></div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {server.agent_url ? <Wifi className="h-3.5 w-3.5 text-neon-green" /> : <WifiOff className="h-3.5 w-3.5" />}
              Agent
            </span>
            <span className="font-mono text-xs truncate max-w-48">
              {server.agent_url || 'Not configured (simulation)'}
            </span>
          </div>
          {isAdmin && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <Input
                  value={agentUrl}
                  onChange={e => setAgentUrl(e.target.value)}
                  placeholder="http://192.168.1.10:8080"
                  className="font-mono text-xs h-7"
                />
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleSaveAgent} disabled={saving}>
                  <Save className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button size="sm" variant="link" className="h-auto p-0 text-xs text-primary" onClick={() => navigate('/agent-wizard')}>
                <ExternalLink className="h-3 w-3 mr-1" /> Agent Setup Wizard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="font-display text-sm">Runtime</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-muted-foreground"><Map className="h-3.5 w-3.5" /> Map</span>
            <span className="font-mono text-xs">{server.current_map || 'N/A'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Uptime</span>
            <span>{server.uptime > 0 ? formatUptime(server.uptime) : 'N/A'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-muted-foreground"><Users className="h-3.5 w-3.5" /> Players</span>
            <span>{server.player_count} / {server.max_players}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-muted-foreground"><Cpu className="h-3.5 w-3.5" /> CPU</span>
            <span>{server.cpu_percent.toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-muted-foreground"><HardDrive className="h-3.5 w-3.5" /> Memory</span>
            <span>{server.memory_mb.toFixed(0)} MB</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
