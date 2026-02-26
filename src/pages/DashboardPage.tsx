import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ServerCard } from '@/components/server/ServerCard';
import { CreateServerModal } from '@/components/server/CreateServerModal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useServerStore } from '@/stores/serverStore';
import { api } from '@/data/mockApi';
import { useQuery } from '@tanstack/react-query';

const DashboardPage = () => {
  const [showCreate, setShowCreate] = useState(false);
  const { servers, setServers } = useServerStore();

  const { isLoading, refetch } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const data = await api.getServers();
      setServers(data);
      return data;
    },
    refetchInterval: 10000,
  });

  const onlineCount = servers.filter(s => s.status === 'online').length;
  const totalPlayers = servers.reduce((sum, s) => sum + s.playerCount, 0);

  if (isLoading && servers.length === 0) return <LoadingSpinner />;

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {servers.map(server => (
          <ServerCard key={server.id} server={server} />
        ))}
      </div>

      {servers.length === 0 && (
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
