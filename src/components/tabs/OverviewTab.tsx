import type { Server } from '@/data/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ServerStatusBadge } from '@/components/server/ServerStatusBadge';
import { Map, Clock, Users, Cpu, HardDrive, Wifi } from 'lucide-react';

export default function OverviewTab({ server }: { server: Server }) {
  const formatUptime = (s: number) => {
    const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60);
    return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="font-display text-sm">Server Info</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Status</span><ServerStatusBadge status={server.status} /></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Port</span><span className="font-mono">{server.port}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Auto Restart</span><span>{server.autoRestart ? 'Enabled' : 'Disabled'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Executable</span><span className="font-mono text-xs truncate max-w-48">{server.executablePath}</span></div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="font-display text-sm">Runtime</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-muted-foreground"><Map className="h-3.5 w-3.5" /> Map</span>
            <span className="font-mono text-xs">{server.currentMap || 'N/A'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Uptime</span>
            <span>{server.uptime > 0 ? formatUptime(server.uptime) : 'N/A'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-muted-foreground"><Users className="h-3.5 w-3.5" /> Players</span>
            <span>{server.playerCount} / {server.maxPlayers}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-muted-foreground"><Cpu className="h-3.5 w-3.5" /> CPU</span>
            <span>{server.cpuPercent.toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-muted-foreground"><HardDrive className="h-3.5 w-3.5" /> Memory</span>
            <span>{server.memoryMb.toFixed(0)} MB</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
