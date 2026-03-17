import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBrowserServers } from '@/lib/supabaseApi';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RefreshCw, Copy, ArrowUpDown, Search, Users, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import type { BrowserServer } from '@/data/types';

type SortKey = 'name' | 'players' | 'gameType';

const ServerBrowserPage = () => {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('players');
  const [sortAsc, setSortAsc] = useState(false);
  const [inspectServer, setInspectServer] = useState<BrowserServer | null>(null);

  const { data: servers = [], isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['browser-servers'],
    queryFn: getBrowserServers,
    refetchInterval: 60000,
  });

  const totalPlayers = useMemo(() => servers.reduce((sum, s) => sum + s.players, 0), [servers]);

  const filtered = useMemo(() => {
    let list = servers;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(sv =>
        sv.name.toLowerCase().includes(s) ||
        sv.gameType.toLowerCase().includes(s) ||
        sv.playerNames?.some(p => p.toLowerCase().includes(s))
      );
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

  const lastRefreshed = dataUpdatedAt ? `${Math.floor((Date.now() - dataUpdatedAt) / 1000)}s ago` : 'never';

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-wide">Server Browser</h1>
          <p className="text-sm text-muted-foreground">
            {servers.length} servers · {totalPlayers} players online · Updated {lastRefreshed}
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>

      <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search servers, types, players..." className="max-w-sm" />

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {([
                { key: 'name' as SortKey, label: 'Server' },
                { key: 'players' as SortKey, label: 'Players' },
                { key: 'gameType' as SortKey, label: 'Type' },
              ]).map(col => (
                <TableHead key={col.key} className="cursor-pointer select-none" onClick={() => toggleSort(col.key)}>
                  <div className="flex items-center gap-1">
                    {col.label}
                    <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                  </div>
                </TableHead>
              ))}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No servers found</TableCell></TableRow>
            )}
            {filtered.map(sv => (
              <TableRow key={sv.id} className="border-border">
                <TableCell>
                  <div className="font-semibold max-w-72 truncate">{sv.name}</div>
                  {sv.playerNames && sv.playerNames.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-0.5 max-w-72 truncate">
                      <Users className="h-3 w-3 inline mr-1" />
                      {sv.playerNames.join(', ')}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <span className={cn(
                    'font-mono font-bold',
                    sv.players >= sv.maxPlayers ? 'text-destructive' : sv.players > 0 ? 'text-primary' : 'text-muted-foreground'
                  )}>
                    {sv.players}
                  </span>
                  <span className="text-muted-foreground font-mono"> / {sv.maxPlayers}</span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{sv.gameType}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setInspectServer(sv)} title="Inspect">
                    <Search className="h-3.5 w-3.5" />
                  </Button>
                  {sv.host && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyUri(sv.host, sv.port)} title="Copy URI">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
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
                  ...(inspectServer.host ? [['Host', `${inspectServer.host}:${inspectServer.port}`]] : []),
                  ['Players', `${inspectServer.players} / ${inspectServer.maxPlayers}`],
                  ['Type', inspectServer.gameType],
                  ...(inspectServer.version ? [['Version', inspectServer.version]] : []),
                ].map(([label, value]) => (
                  <div key={label}>
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <p className="font-mono text-xs break-all">{value}</p>
                  </div>
                ))}
              </div>
              {inspectServer.playerNames && inspectServer.playerNames.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">Online Players ({inspectServer.playerNames.length})</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {inspectServer.playerNames.map((name, i) => (
                      <span key={i} className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs">{name}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                {inspectServer.host && (
                  <Button size="sm" className="flex-1" onClick={() => copyUri(inspectServer.host, inspectServer.port)}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy URI
                  </Button>
                )}
                {inspectServer.url && (
                  <Button size="sm" variant="outline" className="flex-1" asChild>
                    <a href={inspectServer.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Website
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ServerBrowserPage;
