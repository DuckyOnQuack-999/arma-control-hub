import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { ServerStatusBadge } from './ServerStatusBadge';
import { Progress } from '@/components/ui/progress';
import { Play, Square, RotateCcw, Users, Cpu, HardDrive, Wifi, Monitor, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import type { Server, ServerStatus } from '@/data/types';
import { serverAction, deleteServer } from '@/lib/supabaseApi';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/hooks/use-toast';

const formatUptime = (s: number) => {
  const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export function ServerCard({ server }: { server: Server }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    try {
      await deleteServer(server.id);
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      toast({ title: 'Server deleted', description: `${server.name} has been removed` });
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' });
    }
    setDeleteOpen(false);
  };

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
  const hasAgent = !!server.agent_url;

  return (
    <Card
      className="group cursor-pointer border-border bg-card transition-all hover:border-primary/50"
      onClick={() => navigate(`/servers/${server.id}`)}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-foreground tracking-wide">{server.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
              Port {server.port}
              {hasAgent ? (
                <span className="inline-flex items-center gap-0.5 text-success"><Wifi className="h-3 w-3" /> Agent</span>
              ) : (
                <span className="inline-flex items-center gap-0.5"><Monitor className="h-3 w-3" /> Panel</span>
              )}
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
                <Cpu className="h-3.5 w-3.5 text-destructive" />
                <span className="text-foreground font-semibold">{server.cpu_percent.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <HardDrive className="h-3.5 w-3.5 text-info" />
                <span className="text-foreground font-semibold">{server.memory_mb.toFixed(0)}MB</span>
              </div>
            </div>
            <Progress value={server.cpu_percent} className="h-1" />
            {server.uptime > 0 && (
              <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" /> Uptime: {formatUptime(server.uptime)}
              </div>
            )}
          </>
        )}

        {isStopped && server.updated_at && (
          <div className="text-[10px] text-muted-foreground mt-1">
            Last seen: {new Date(server.updated_at).toLocaleString()}
          </div>
        )}

        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border">
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!isStopped} onClick={e => handleAction(e, 'start')}>
            <Play className="h-3.5 w-3.5 text-success" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!isRunning} onClick={e => handleAction(e, 'stop')}>
            <Square className="h-3.5 w-3.5 text-destructive" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!isRunning} onClick={e => handleAction(e, 'restart')}>
            <RotateCcw className="h-3.5 w-3.5 text-warning" />
          </Button>
          {user?.role === 'admin' && (
            <>
              <div className="flex-1" />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleDelete}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </>
          )}
        </div>

        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete Server"
          description={`Are you sure you want to delete "${server.name}"? This cannot be undone.`}
          destructive
          onConfirm={confirmDelete}
        />
      </CardContent>
    </Card>
  );
}
