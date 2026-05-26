import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Server, ServerStatus } from '@/data/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ServerStatusBadge } from '@/components/server/ServerStatusBadge';
import { Map, Clock, Users, Cpu, HardDrive, Wifi, WifiOff, Save, ExternalLink, FolderOpen, Terminal, Settings, Shield, Zap, CreditCard as Edit2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { updateServer, pollServerStatus } from '@/lib/supabaseApi';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/hooks/use-toast';

export default function OverviewTab({ server, onTabChange }: { server: Server; onTabChange?: (tab: string) => void }) {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';
  const [agentUrl, setAgentUrl] = useState(server.agent_url || '');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Inline path editing
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

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

  const handleTestAgent = async () => {
    setTesting(true);
    try {
      if (!server.agent_url) {
        toast({ title: 'Panel Managed', description: `Server status: ${server.status}. No agent configured — server is managed directly through the panel database.` });
        return;
      }
      const result = await pollServerStatus(server.id);
      if (result?.agent_error) {
        toast({ title: 'Agent unreachable', description: result.agent_error, variant: 'destructive' });
      } else {
        toast({ title: 'Agent connected', description: `Status: ${result?.status || 'ok'}` });
      }
    } catch (err: any) {
      toast({ title: 'Test failed', description: err?.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const startEditField = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const saveField = async () => {
    if (!editingField || !editValue.trim()) return;
    setSaving(true);
    try {
      await updateServer(server.id, { [editingField]: editValue });
      toast({ title: `${editingField.replace(/_/g, ' ')} updated` });
      setEditingField(null);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const editablePathRow = (label: string, field: string, value: string, icon: React.ReactNode) => (
    <div className="flex justify-between items-center">
      <span className="flex items-center gap-1.5 text-muted-foreground">{icon} {label}</span>
      {editingField === field ? (
        <div className="flex items-center gap-1 max-w-64">
          <Input
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            className="h-6 text-xs font-mono"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') setEditingField(null); }}
          />
          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={saveField} disabled={saving}>
            <Save className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setEditingField(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs truncate max-w-48">{value}</span>
          {isAdmin && (
            <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity" onClick={() => startEditField(field, value)}>
              <Edit2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="font-display text-sm">Server Info</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Status</span><ServerStatusBadge status={server.status as ServerStatus} /></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Port</span><span className="font-mono">{server.port}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Auto Restart</span><span>{server.auto_restart ? 'Enabled' : 'Disabled'}</span></div>
          <div className="group/row">
            {editablePathRow('Executable', 'executable_path', server.executable_path, null)}
          </div>
          <div className="group/row">
            {editablePathRow('Data Dir', 'data_dir', server.data_dir, <FolderOpen className="h-3.5 w-3.5" />)}
          </div>
          <div className="group/row">
            {editablePathRow('Config Dir', 'config_dir', server.config_dir, <FolderOpen className="h-3.5 w-3.5" />)}
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {server.agent_url ? <Wifi className="h-3.5 w-3.5 text-neon-green" /> : <WifiOff className="h-3.5 w-3.5" />}
              Agent
            </span>
            <span className="font-mono text-xs truncate max-w-48">
              {server.agent_url || 'Not configured (panel managed)'}
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
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleTestAgent} disabled={testing}>
                  <Zap className="h-3 w-3 mr-1" /> {testing ? 'Testing…' : 'Test Connection'}
                </Button>
                <Button size="sm" variant="link" className="h-auto p-0 text-xs text-primary" onClick={() => navigate('/host-settings')}>
                  <ExternalLink className="h-3 w-3 mr-1" /> Host Settings
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="border-border bg-card">
          <CardHeader><CardTitle className="font-display text-sm">Runtime</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground"><Map className="h-3.5 w-3.5" /> Map</span>
              <span className="font-mono text-xs">{server.current_map || 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Uptime</span>
              <span>{(server.uptime ?? 0) > 0 ? formatUptime(server.uptime ?? 0) : 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground"><Users className="h-3.5 w-3.5" /> Players</span>
              <span>{server.player_count ?? 0} / {server.max_players}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground"><Cpu className="h-3.5 w-3.5" /> CPU</span>
              <span>{(server.cpu_percent ?? 0).toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground"><HardDrive className="h-3.5 w-3.5" /> Memory</span>
              <span>{(server.memory_mb ?? 0).toFixed(0)} MB</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader><CardTitle className="font-display text-sm">Quick Actions</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onTabChange?.('console')}>
              <Terminal className="h-3 w-3 mr-1" /> Console
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onTabChange?.('config')}>
              <Settings className="h-3 w-3 mr-1" /> Config
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onTabChange?.('players')}>
              <Users className="h-3 w-3 mr-1" /> Players
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onTabChange?.('logs')}>
              <Shield className="h-3 w-3 mr-1" /> Logs
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
