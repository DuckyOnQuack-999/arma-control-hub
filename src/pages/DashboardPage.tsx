import { useState, useEffect } from 'react';
import { Plus, Server, Users, Cpu, HardDrive, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ServerCard } from '@/components/server/ServerCard';
import { CreateServerModal } from '@/components/server/CreateServerModal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useServerStore } from '@/stores/serverStore';
import { getServers } from '@/lib/supabaseApi';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

const DashboardPage = () => {
  const [showCreate, setShowCreate] = useState(false);
  const { servers, setServers } = useServerStore();

  const { isLoading, refetch } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const data = await getServers();
      setServers(data);
      return data;
    },
  });

  // Real-time subscription for server status updates
  useEffect(() => {
    const channel = supabase
      .channel('servers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, () => {
        refetch();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  const onlineCount = servers.filter(s => s.status === 'online').length;
  const totalPlayers = servers.reduce((sum, s) => sum + s.player_count, 0);
  const avgCpu = servers.length > 0 ? servers.reduce((sum, s) => sum + s.cpu_percent, 0) / servers.length : 0;
  const totalMemory = servers.reduce((sum, s) => sum + s.memory_mb, 0);
  const agentCount = servers.filter(s => s.agent_url).length;

  if (isLoading && servers.length === 0) return <LoadingSpinner />;

  const stats = [
    { icon: Server, label: 'Servers Online', value: `${onlineCount} / ${servers.length}`, color: 'text-neon-green' },
    { icon: Users, label: 'Total Players', value: String(totalPlayers), color: 'text-primary' },
    { icon: Cpu, label: 'Avg CPU', value: `${avgCpu.toFixed(1)}%`, color: 'text-neon-red' },
    { icon: HardDrive, label: 'Total Memory', value: `${totalMemory.toFixed(0)} MB`, color: 'text-neon-blue' },
    { icon: Wifi, label: 'Agent Connected', value: `${agentCount} / ${servers.length}`, color: 'text-neon-yellow' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-wide text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground font-body">
            {onlineCount} servers online · {totalPlayers} players connected
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Server
        </Button>
      </div>

      {/* Stats Widgets */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(stat => (
          <Card key={stat.label} className="border-border bg-card">
            <CardContent className="flex items-center gap-3 p-4">
              <stat.icon className={`h-6 w-6 ${stat.color} shrink-0`} />
              <div>
                <div className="text-lg font-display font-bold">{stat.value}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {servers.map(server => (
          <ServerCard key={server.id} server={server} />
        ))}
      </div>

      {servers.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-muted-foreground mb-4">No servers configured yet</p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Your First Server
          </Button>
        </div>
      )}

      <CreateServerModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => refetch()} />
    </div>
  );
};

export default DashboardPage;
