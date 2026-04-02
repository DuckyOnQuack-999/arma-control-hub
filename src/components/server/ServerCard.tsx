import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { ServerStatusBadge } from './ServerStatusBadge';
import { Progress } from '@/components/ui/progress';
import { Play, Square, RotateCcw, Users, Cpu, HardDrive, Wifi, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Server, ServerStatus } from '@/data/types';
import { serverAction } from '@/lib/supabaseApi';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

export function ServerCard({ server }: { server: Server }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleAction = async (e: React.MouseEvent, action: 'start' | 'stop' | 'restart') => {
    e.stopPropagation();
    try {
      const result = await serverAction(server.id, action);
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      toast({ title: `Server ${action}`, description: result.message });
    } catch (err: any) {
      toast({ title: 'Action failed', description: err?.message, variant: 'destructive' });
    }
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
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
              Port {server.port}
              {server.agent_url ? <Wifi className="h-3 w-3 text-neon-green" /> : <Monitor className="h-3 w-3 text-muted-foreground" />}
            </p>
          </div>
          <ServerStatusBadge status={server.status as ServerStatus} />
        </div>

        {isRunning && (
          <>
            <div className="text-xs text-muted-foreground mb-1 truncate">{server.current_map || 'N/A'}</div>
            <div className="grid grid-cols-3 gap-3 my-3">
              <div className="flex items-center gap-1.5 text-xs">
                <Users className="h-3.5 w-3.5 text-primary" />
                <span className="text-foreground font-semibold">{server.player_count}</span>
                <span className="text-muted-foreground">/ {server.max_players}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <Cpu className="h-3.5 w-3.5 text-neon-red" />
                <span className="text-foreground font-semibold">{server.cpu_percent.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <HardDrive className="h-3.5 w-3.5 text-neon-blue" />
                <span className="text-foreground font-semibold">{server.memory_mb.toFixed(0)}MB</span>
              </div>
            </div>
            <Progress value={server.cpu_percent} className="h-1" />
          </>
        )}

        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border">
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!isStopped} onClick={e => handleAction(e, 'start')}>
            <Play className="h-3.5 w-3.5 text-neon-green" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!isRunning} onClick={e => handleAction(e, 'stop')}>
            <Square className="h-3.5 w-3.5 text-neon-red" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!isRunning} onClick={e => handleAction(e, 'restart')}>
            <RotateCcw className="h-3.5 w-3.5 text-neon-yellow" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
