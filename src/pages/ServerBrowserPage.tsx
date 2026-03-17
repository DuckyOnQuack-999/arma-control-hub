import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBrowserServers } from '@/lib/supabaseApi';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RefreshCw, Copy, ArrowUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import type { BrowserServer } from '@/data/types';

type SortKey = 'name' | 'map' | 'players' | 'ping' | 'gameType';

const ServerBrowserPage = () => {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('players');
  const [sortAsc, setSortAsc] = useState(false);
  const [inspectServer, setInspectServer] = useState<BrowserServer | null>(null);

  const { data: servers = [], isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['browser-servers'],
    queryFn: getBrowserServers,
  });

  const filtered = useMemo(() => {
    let list = servers;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(sv => sv.name.toLowerCase().includes(s) || sv.map.toLowerCase().includes(s) || sv.gameType.toLowerCase().includes(s));
    }
    list.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      const cmp = typeof av === 'number' ? av - (bv as number) : String(av).localeCompare(String(bv));
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [servers, search, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const copyUri = (host: string, port: number) => {
    navigator.clipboard.writeText(`armagetronad://${host}:${port}`);
    toast({ title: 'Copied!', description: `armagetronad://${host}:${port}` });
  };

  const pingBadge = (ping: number) => {
    if (ping < 50) return 'bg-neon-green/20 text-neon-green';
    if (ping <= 150) return 'bg-neon-yellow/20 text-neon-yellow';
    return 'bg-neon-red/20 text-neon-red';
  };

  const lastRefreshed = dataUpdatedAt ? `${Math.floor((Date.now() - dataUpdatedAt) / 1000)}s ago` : 'never';

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-wide">Server Browser</h1>
          <p className="text-sm text-muted-foreground">
            {servers.length} servers · Last refreshed {lastRefreshed}
            {servers.length === 0 && ' · No servers currently online'}
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>

      <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search servers, maps, game types..." className="max-w-sm" />

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {(['name', 'map', 'players', 'ping', 'gameType'] as SortKey[]).map(key => (
                <TableHead key={key} className="cursor-pointer select-none" onClick={() => toggleSort(key)}>
                  <div className="flex items-center gap-1">
                    {key === 'gameType' ? 'Type' : key.charAt(0).toUpperCase() + key.slice(1)}
                    <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                  </div>
                </TableHead>
              ))}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No servers found</TableCell></TableRow>
            )}
            {filtered.map(sv => (
              <TableRow key={sv.id} className="border-border">
                <TableCell className="font-semibold max-w-64 truncate">{sv.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{sv.map}</TableCell>
                <TableCell>
                  <span className={sv.players >= sv.maxPlayers ? 'text-neon-red' : 'text-foreground'}>
                    {sv.players}
                  </span>
                  <span className="text-muted-foreground"> / {sv.maxPlayers}</span>
                </TableCell>
                <TableCell>
                  <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs', pingBadge(sv.ping))}>
                    {sv.ping}ms
                  </span>
                </TableCell>
                <TableCell className="text-sm">{sv.gameType}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setInspectServer(sv)}>
                    <Search className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyUri(sv.host, sv.port)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!inspectServer} onOpenChange={() => setInspectServer(null)}>
        <DialogContent className="border-border bg-card max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-sm tracking-wide">{inspectServer?.name}</DialogTitle>
          </DialogHeader>
          {inspectServer && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Host', `${inspectServer.host}:${inspectServer.port}`],
                  ['Map', inspectServer.map],
                  ['Players', `${inspectServer.players} / ${inspectServer.maxPlayers}`],
                  ['Ping', `${inspectServer.ping}ms`],
                  ['Game Type', inspectServer.gameType],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <p className="font-mono text-xs">{value}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" className="flex-1" onClick={() => { copyUri(inspectServer.host, inspectServer.port); }}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy URI
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ServerBrowserPage;
