import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { ServerStatusBadge } from './ServerStatusBadge';
import { Progress } from '@/components/ui/progress';
import { Play, Square, RotateCcw, Users, Cpu, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Server } from '@/data/types';
import { api } from '@/data/mockApi';
import { useServerStore } from '@/stores/serverStore';
import { toast } from '@/hooks/use-toast';

export function ServerCard({ server }: { server: Server }) {
  const navigate = useNavigate();
  const updateServer = useServerStore(s => s.updateServer);

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    updateServer(server.id, { status: 'starting' });
    await api.startServer(server.id);
    updateServer(server.id, { status: 'online', cpuPercent: 15, memoryMb: 95 });
    toast({ title: 'Server started', description: `${server.name} is now online` });
  };

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation();
    updateServer(server.id, { status: 'stopping' });
    await api.stopServer(server.id);
    updateServer(server.id, { status: 'offline', cpuPercent: 0, memoryMb: 0, playerCount: 0 });
    toast({ title: 'Server stopped', description: `${server.name} is now offline` });
  };

  const handleRestart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    updateServer(server.id, { status: 'starting' });
    await api.restartServer(server.id);
    updateServer(server.id, { status: 'online' });
    toast({ title: 'Server restarted', description: `${server.name} has been restarted` });
  };

  const isRunning = server.status === 'online';
  const isStopped = server.status === 'offline';

  return (
    <Card
      className="group cursor-pointer border-border bg-card transition-all hover:border-primary/50 hover:glow-cyan"
      onClick={() => navigate(`/servers/${server.id}`)}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-foreground tracking-wide">{server.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Port {server.port}</p>
          </div>
          <ServerStatusBadge status={server.status} />
        </div>

        {isRunning && (
          <>
            <div className="text-xs text-muted-foreground mb-1 truncate">{server.currentMap || 'N/A'}</div>
            <div className="grid grid-cols-3 gap-3 my-3">
              <div className="flex items-center gap-1.5 text-xs">
                <Users className="h-3.5 w-3.5 text-primary" />
                <span className="text-foreground font-semibold">{server.playerCount}</span>
                <span className="text-muted-foreground">/ {server.maxPlayers}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <Cpu className="h-3.5 w-3.5 text-neon-red" />
                <span className="text-foreground font-semibold">{server.cpuPercent.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <HardDrive className="h-3.5 w-3.5 text-neon-blue" />
                <span className="text-foreground font-semibold">{server.memoryMb.toFixed(0)}MB</span>
              </div>
            </div>
            <Progress value={server.cpuPercent} className="h-1" />
          </>
        )}

        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border">
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!isStopped} onClick={handleStart}>
            <Play className="h-3.5 w-3.5 text-neon-green" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!isRunning} onClick={handleStop}>
            <Square className="h-3.5 w-3.5 text-neon-red" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!isRunning} onClick={handleRestart}>
            <RotateCcw className="h-3.5 w-3.5 text-neon-yellow" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
