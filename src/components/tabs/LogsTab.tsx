import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/data/mockApi';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { cn } from '@/lib/utils';
import type { EventType } from '@/data/types';

const eventColors: Record<EventType, string> = {
  player_join: 'bg-neon-green/20 text-neon-green border-neon-green/50',
  player_leave: 'bg-muted text-muted-foreground border-border',
  kill: 'bg-neon-purple/20 text-neon-purple border-neon-purple/50',
  chat: 'bg-neon-blue/20 text-neon-blue border-neon-blue/50',
  ban: 'bg-neon-red/20 text-neon-red border-neon-red/50',
  kick: 'bg-neon-yellow/20 text-neon-yellow border-neon-yellow/50',
  round_end: 'bg-primary/20 text-primary border-primary/50',
  start: 'bg-neon-green/20 text-neon-green border-neon-green/50',
  stop: 'bg-neon-red/20 text-neon-red border-neon-red/50',
  crash: 'bg-neon-red/20 text-neon-red border-neon-red/50',
  restart: 'bg-neon-yellow/20 text-neon-yellow border-neon-yellow/50',
};

export default function LogsTab({ serverId }: { serverId: number }) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('');

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', serverId, filterType, search],
    queryFn: () => api.getEvents(serverId, { type: filterType || undefined, search: search || undefined }),
  });

  if (isLoading) return <LoadingSpinner />;

  const allTypes: EventType[] = ['player_join', 'player_leave', 'kill', 'chat', 'ban', 'kick', 'round_end', 'start', 'stop'];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events..." className="w-60 h-8 text-sm" />
        <Badge
          variant={filterType === '' ? 'default' : 'outline'}
          className="cursor-pointer text-xs"
          onClick={() => setFilterType('')}
        >
          All
        </Badge>
        {allTypes.map(t => (
          <Badge
            key={t}
            variant={filterType === t ? 'default' : 'outline'}
            className={cn('cursor-pointer text-xs', filterType === t ? '' : 'border-border')}
            onClick={() => setFilterType(t === filterType ? '' : t)}
          >
            {t.replace('_', ' ')}
          </Badge>
        ))}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-40">Time</TableHead>
              <TableHead className="w-32">Type</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.slice().reverse().map(event => (
              <TableRow key={event.id} className="border-border">
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {new Date(event.occurredAt * 1000).toLocaleString()}
                </TableCell>
                <TableCell>
                  <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs', eventColors[event.eventType] || 'border-border')}>
                    {event.eventType.replace('_', ' ')}
                  </span>
                </TableCell>
                <TableCell className="text-sm">
                  {Object.entries(event.payload).map(([k, v]) => (
                    <span key={k} className="mr-3">
                      <span className="text-muted-foreground">{k}:</span> {v}
                    </span>
                  ))}
                </TableCell>
              </TableRow>
            ))}
            {events.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No events found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
