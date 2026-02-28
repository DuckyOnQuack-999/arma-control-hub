import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/data/mockApi';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { cn } from '@/lib/utils';
import { CalendarIcon, FileText } from 'lucide-react';
import { format } from 'date-fns';
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

const PAGE_SIZE = 20;

export default function LogsTab({ serverId }: { serverId: number }) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [rawMode, setRawMode] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', serverId, filterType, search],
    queryFn: () => api.getEvents(serverId, { type: filterType || undefined, search: search || undefined }),
  });

  const { data: rawLog = '' } = useQuery({
    queryKey: ['raw-log', serverId],
    queryFn: () => api.getRawConfig(serverId, 'log'),
    enabled: rawMode,
  });

  const filteredEvents = useMemo(() => {
    let filtered = events.slice().reverse();
    if (dateFrom) {
      const fromTs = Math.floor(dateFrom.getTime() / 1000);
      filtered = filtered.filter(e => e.occurredAt >= fromTs);
    }
    if (dateTo) {
      const toTs = Math.floor(dateTo.getTime() / 1000) + 86400;
      filtered = filtered.filter(e => e.occurredAt <= toTs);
    }
    return filtered;
  }, [events, dateFrom, dateTo]);

  if (isLoading) return <LoadingSpinner />;

  const allTypes: EventType[] = ['player_join', 'player_leave', 'kill', 'chat', 'ban', 'kick', 'round_end', 'start', 'stop'];
  const visibleEvents = filteredEvents.slice(0, visibleCount);
  const hasMore = visibleCount < filteredEvents.length;

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events..." className="w-60 h-8 text-sm" />

        {/* Date range */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <CalendarIcon className="h-3 w-3 mr-1" />
              {dateFrom ? format(dateFrom, 'MMM d') : 'From'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <CalendarIcon className="h-3 w-3 mr-1" />
              {dateTo ? format(dateTo, 'MMM d') : 'To'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
            Clear dates
          </Button>
        )}

        <div className="ml-auto">
          <Button variant={rawMode ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setRawMode(!rawMode)}>
            <FileText className="h-3 w-3 mr-1" /> {rawMode ? 'Structured' : 'Raw File'}
          </Button>
        </div>
      </div>

      {/* Type filters */}
      {!rawMode && (
        <div className="flex flex-wrap gap-1.5">
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
      )}

      {rawMode ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <pre className="p-4 font-mono text-xs leading-5 max-h-[500px] overflow-auto bg-muted whitespace-pre-wrap">
            {rawLog || 'No log data available'}
          </pre>
        </div>
      ) : (
        <>
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
                {visibleEvents.map(event => (
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
                {visibleEvents.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No events found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {hasMore && (
            <div className="text-center">
              <Button variant="outline" size="sm" onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>
                Load more ({filteredEvents.length - visibleCount} remaining)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
