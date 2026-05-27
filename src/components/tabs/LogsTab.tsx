import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getEvents, getRawConfig } from '@/lib/supabaseApi';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { cn } from '@/lib/utils';
import { Calendar as CalendarIcon, FileText } from 'lucide-react';
import { format } from 'date-fns';
import type { EventType } from '@/data/types';

const eventColors: Record<string, string> = {
  player_join: 'bg-success/10 text-success border-success/30',
  player_leave: 'bg-muted text-muted-foreground border-border',
  kill: 'bg-purple-500/10 text-purple-500 border-purple-500/30',
  chat: 'bg-info/10 text-info border-info/30',
  ban: 'bg-destructive/10 text-destructive border-destructive/30',
  kick: 'bg-warning/10 text-warning border-warning/30',
  round_end: 'bg-primary/10 text-primary border-primary/30',
  start: 'bg-success/10 text-success border-success/30',
  stop: 'bg-destructive/10 text-destructive border-destructive/30',
  crash: 'bg-destructive/10 text-destructive border-destructive/30',
  restart: 'bg-warning/10 text-warning border-warning/30',
  command: 'bg-primary/10 text-primary border-primary/30',
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
    queryFn: () => getEvents(serverId, { type: filterType || undefined, search: search || undefined }),
  });

  const { data: rawLog = '' } = useQuery({
    queryKey: ['raw-log', serverId],
    queryFn: () => getRawConfig(serverId, 'log'),
    enabled: rawMode,
  });

  const filteredEvents = useMemo(() => {
    let filtered = events.slice().reverse();
    if (dateFrom) {
      filtered = filtered.filter(e => new Date(e.occurred_at) >= dateFrom);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setDate(to.getDate() + 1);
      filtered = filtered.filter(e => new Date(e.occurred_at) <= to);
    }
    return filtered;
  }, [events, dateFrom, dateTo]);

  if (isLoading) return <LoadingSpinner />;

  const allTypes: EventType[] = ['player_join', 'player_leave', 'kill', 'chat', 'ban', 'kick', 'round_end', 'start', 'stop'];
  const visibleEvents = filteredEvents.slice(0, visibleCount);
  const hasMore = visibleCount < filteredEvents.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events..." className="w-60 h-8 text-sm" />
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

      {!rawMode && (
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={filterType === '' ? 'default' : 'outline'} className="cursor-pointer text-xs" onClick={() => setFilterType('')}>All</Badge>
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
                      {new Date(event.occurred_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs', eventColors[event.event_type] || 'border-border')}>
                        {event.event_type.replace('_', ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) &&
                        Object.entries(event.payload as Record<string, string>).map(([k, v]) => (
                          <span key={k} className="mr-3">
                            <span className="text-muted-foreground">{k}:</span> {v}
                          </span>
                        ))
                      }
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
