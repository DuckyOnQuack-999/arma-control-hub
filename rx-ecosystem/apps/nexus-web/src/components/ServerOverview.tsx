import { useEffect } from 'react';
import { Plus, RefreshCw, LayoutGrid, List, Loader2 } from 'lucide-react';
import { useServerStore } from '../stores/serverStore';
import { ServerCard } from './ServerCard';

export function ServerOverview() {
  const { 
    servers, 
    isLoading, 
    fetchServers, 
    createServer, 
    startServer, 
    stopServer, 
    restartServer, 
    deleteServer,
    selectedServer,
    selectServer 
  } = useServerStore();

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const handleCreateServer = async () => {
    const name = prompt('Enter server name:', `RX Server ${servers.length + 1}`);
    if (!name) return;

    const port = 4534 + Math.floor(Math.random() * 466);
    
    try {
      await createServer({
        name,
        port,
        maxPlayers: 16,
        gameMode: 'SUMO',
        mapRotation: [],
        autoRestart: true,
      });
    } catch (error) {
      alert(`Failed to create server: ${error}`);
    }
  };

  if (isLoading && servers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Servers</h1>
          <p className="text-gray-400 mt-1">
            Manage your Armagetron Advanced server instances
          </p>
        </div>
        <button
          onClick={handleCreateServer}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Server
        </button>
      </div>

      {servers.length === 0 ? (
        <div className="text-center py-16">
          <div className="mx-auto w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-4">
            <Server className="w-8 h-8 text-gray-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No servers yet</h3>
          <p className="text-gray-400 mb-6">Create your first Armagetron server to get started</p>
          <button
            onClick={handleCreateServer}
            className="px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors"
          >
            Create Server
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              onStart={startServer}
              onStop={stopServer}
              onRestart={restartServer}
              onDelete={deleteServer}
              onSelect={selectServer}
              isSelected={selectedServer?.id === server.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Need to import Server icon
import { Server } from 'lucide-react';