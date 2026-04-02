import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getServer, serverAction, pollServerStatus } from '@/lib/supabaseApi';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ServerStatusBadge } from '@/components/server/ServerStatusBadge';
import { ServerControlBar } from '@/components/server/ServerControlBar';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { toast } from '@/hooks/use-toast';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import ConsoleTab from '@/components/tabs/ConsoleTab';
import PlayersTab from '@/components/tabs/PlayersTab';
import LogsTab from '@/components/tabs/LogsTab';
import MetricsTab from '@/components/tabs/MetricsTab';
import ConfigTab from '@/components/tabs/ConfigTab';
import OverviewTab from '@/components/tabs/OverviewTab';
import MapsTab from '@/components/tabs/MapsTab';
import { Users, Cpu, HardDrive, Clock, Wifi, Monitor } from 'lucide-react';
import type { ServerStatus } from '@/data/types';

const ServerDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const serverId = Number(id);
  const [loading, setLoading] = useState(false);

  const { data: server, isLoading, refetch } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => getServer(serverId),
  });

  useEffect(() => {
    const channel = supabase
      .channel(`server-${serverId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'servers', filter: `id=eq.${serverId}` }, () => {
        refetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [serverId, refetch]);

  // Poll agent for live status every 15s when agent_url is configured
  useEffect(() => {
    if (!server?.agent_url) return;
    const interval = setInterval(async () => {
      try {
        await pollServerStatus(serverId);
        refetch();
      } catch {}
    }, 15000);
    return () => clearInterval(interval);
  }, [serverId, server?.agent_url, refetch]);

  if (isLoading || !server) return <LoadingSpinner />;

  const handleAction = async (action: 'start' | 'stop' | 'restart' | 'kill') => {
    setLoading(true);
    try {
      const result = await serverAction(serverId, action);
      toast({ title: `Server ${action}`, description: result.message });
      refetch();
    } catch (err: any) {
      toast({ title: 'Action failed', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const formatUptime = (s: number) => {
    const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60);
    return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-xl font-bold tracking-wide">{server.name}</h1>
          <ServerStatusBadge status={server.status as ServerStatus} />
          {server.agent_url ? (
            <span className="flex items-center gap-1 text-[10px] text-neon-green"><Wifi className="h-3 w-3" /> Agent</span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Monitor className="h-3 w-3" /> Simulation</span>
          )}
        </div>
        <ServerControlBar
          status={server.status as ServerStatus}
          onStart={() => handleAction('start')}
          onStop={() => handleAction('stop')}
          onRestart={() => handleAction('restart')}
          onKill={() => handleAction('kill')}
          loading={loading}
        />
      </div>

      {server.status === 'online' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: Users, label: 'Players', value: `${server.player_count} / ${server.max_players}`, color: 'text-primary' },
            { icon: Cpu, label: 'CPU', value: `${server.cpu_percent.toFixed(1)}%`, color: 'text-neon-red' },
            { icon: HardDrive, label: 'Memory', value: `${server.memory_mb.toFixed(0)} MB`, color: 'text-neon-blue' },
            { icon: Clock, label: 'Uptime', value: formatUptime(server.uptime), color: 'text-neon-green' },
          ].map(stat => (
            <div key={stat.label} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
                {stat.label}
              </div>
              <div className="text-lg font-display font-bold">{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="bg-muted border border-border">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="console">Console</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="players">Players</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="maps">Maps</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewTab server={server} /></TabsContent>
        <TabsContent value="console"><ConsoleTab serverId={serverId} /></TabsContent>
        <TabsContent value="config"><ConfigTab serverId={serverId} serverStatus={server.status as ServerStatus} /></TabsContent>
        <TabsContent value="players"><PlayersTab serverId={serverId} /></TabsContent>
        <TabsContent value="logs"><LogsTab serverId={serverId} /></TabsContent>
        <TabsContent value="metrics"><MetricsTab serverId={serverId} /></TabsContent>
        <TabsContent value="maps"><MapsTab serverId={serverId} /></TabsContent>
      </Tabs>
    </div>
  );
};

export default ServerDetailPage;
