import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/data/mockApi';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ServerStatusBadge } from '@/components/server/ServerStatusBadge';
import { ServerControlBar } from '@/components/server/ServerControlBar';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useServerStore } from '@/stores/serverStore';
import { toast } from '@/hooks/use-toast';
import { useState } from 'react';
import ConsoleTab from '@/components/tabs/ConsoleTab';
import PlayersTab from '@/components/tabs/PlayersTab';
import LogsTab from '@/components/tabs/LogsTab';
import MetricsTab from '@/components/tabs/MetricsTab';
import ConfigTab from '@/components/tabs/ConfigTab';
import OverviewTab from '@/components/tabs/OverviewTab';
import { Users, Cpu, HardDrive, Clock } from 'lucide-react';

const ServerDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const serverId = Number(id);
  const [loading, setLoading] = useState(false);
  const updateServer = useServerStore(s => s.updateServer);

  const { data: server, isLoading } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => api.getServer(serverId),
    refetchInterval: 5000,
  });

  if (isLoading || !server) return <LoadingSpinner />;

  const handleAction = async (action: 'start' | 'stop' | 'restart' | 'kill') => {
    setLoading(true);
    try {
      if (action === 'start') { await api.startServer(serverId); updateServer(serverId, { status: 'online' }); }
      else if (action === 'stop') { await api.stopServer(serverId); updateServer(serverId, { status: 'offline' }); }
      else if (action === 'restart') { await api.restartServer(serverId); updateServer(serverId, { status: 'online' }); }
      else { await api.stopServer(serverId); updateServer(serverId, { status: 'offline' }); }
      toast({ title: `Server ${action}ed`, description: `${server.name} action completed` });
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
          <ServerStatusBadge status={server.status} />
        </div>
        <ServerControlBar
          status={server.status}
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
            { icon: Users, label: 'Players', value: `${server.playerCount} / ${server.maxPlayers}`, color: 'text-primary' },
            { icon: Cpu, label: 'CPU', value: `${server.cpuPercent.toFixed(1)}%`, color: 'text-neon-red' },
            { icon: HardDrive, label: 'Memory', value: `${server.memoryMb.toFixed(0)} MB`, color: 'text-neon-blue' },
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
        </TabsList>
        <TabsContent value="overview"><OverviewTab server={server} /></TabsContent>
        <TabsContent value="console"><ConsoleTab serverId={serverId} /></TabsContent>
        <TabsContent value="config"><ConfigTab serverId={serverId} serverStatus={server.status} /></TabsContent>
        <TabsContent value="players"><PlayersTab serverId={serverId} /></TabsContent>
        <TabsContent value="logs"><LogsTab serverId={serverId} /></TabsContent>
        <TabsContent value="metrics"><MetricsTab serverId={serverId} /></TabsContent>
      </Tabs>
    </div>
  );
};

export default ServerDetailPage;
