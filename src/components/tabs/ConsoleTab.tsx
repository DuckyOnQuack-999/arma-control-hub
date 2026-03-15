import { useEffect, useRef, useState, useMemo } from 'react';
import { useConsoleStore } from '@/stores/consoleStore';
import { sendCommand } from '@/lib/supabaseApi';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Download, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConsoleLine, ConsoleLineType } from '@/data/types';
import { toast } from '@/hooks/use-toast';

const lineColors: Record<ConsoleLineType, string> = {
  error: 'text-neon-red',
  warning: 'text-neon-yellow',
  join: 'text-neon-green',
  leave: 'text-muted-foreground',
  chat: 'text-neon-blue',
  system: 'text-foreground',
  kill: 'text-neon-purple',
  info: 'text-primary',
};

const ARMA_COMMANDS = [
  'KICK', 'BAN', 'UNBAN_IP', 'SILENCE', 'VOICE',
  'SAY', 'CENTER_MESSAGE', 'CONSOLE_MESSAGE',
  'QUIT', 'EXIT', 'SHUTDOWN',
  'INCLUDE', 'RINCLUDE',
  'CYCLE_SPEED', 'CYCLE_RUBBER', 'CYCLE_ACCEL', 'CYCLE_BRAKE',
  'ARENA_SIZE', 'WALLS_LENGTH', 'WALLS_STAY_UP_DELAY',
  'ROUND_TIME', 'LIMIT_ROUNDS', 'LIMIT_SCORE', 'LIMIT_TIME',
  'MAX_CLIENTS', 'MIN_PLAYERS', 'NUM_AIS',
  'TEAM_MAX_PLAYERS', 'TEAM_MIN_PLAYERS', 'TEAM_MAX_IMBALANCE',
  'SERVER_NAME', 'TALK_TO_MASTER', 'DEDICATED_FPS',
  'SCORE_KILL', 'SCORE_WIN', 'SCORE_SURVIVE', 'SCORE_HOLE',
  'SPAM_PROTECTION', 'ADMIN_PASS',
  'WIN_ZONE_DEATHS', 'WIN_ZONE_EXPAND', 'WIN_ZONE_RANDOMNESS',
];

// Map event types from server_events to console line types
function eventToLineType(eventType: string): ConsoleLineType {
  const map: Record<string, ConsoleLineType> = {
    player_join: 'join', player_leave: 'leave', kill: 'kill',
    chat: 'chat', ban: 'warning', kick: 'warning',
    crash: 'error', start: 'info', stop: 'info',
    restart: 'info', round_end: 'system', command: 'system',
  };
  return map[eventType] || 'system';
}

let lineIdCounter = 100;

export default function ConsoleTab({ serverId }: { serverId: number }) {
  const { lines, addLine, clearLines } = useConsoleStore();
  const [command, setCommand] = useState('');
  const [connected, setConnected] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { commandHistory, historyIndex, addCommand, setHistoryIndex } = useConsoleStore();

  const suggestions = useMemo(() => {
    if (!command.trim()) return [];
    const upper = command.toUpperCase();
    return ARMA_COMMANDS.filter(c => c.startsWith(upper)).slice(0, 8);
  }, [command]);

  // Subscribe to real-time server events for this server
  useEffect(() => {
    clearLines();

    // Load recent events as console history
    const loadHistory = async () => {
      const { data } = await supabase
        .from('server_events')
        .select('*')
        .eq('server_id', serverId)
        .order('occurred_at', { ascending: false })
        .limit(50);

      if (data) {
        const consolelines: ConsoleLine[] = data.reverse().map(e => ({
          id: lineIdCounter++,
          timestamp: new Date(e.occurred_at).getTime() / 1000,
          type: eventToLineType(e.event_type),
          text: `[${e.event_type.toUpperCase()}] ${JSON.stringify(e.payload)}`,
        }));
        consolelines.forEach(l => addLine(l));
      }
    };
    loadHistory();

    // Real-time subscription
    const channel = supabase
      .channel(`console-${serverId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'server_events',
        filter: `server_id=eq.${serverId}`,
      }, (payload) => {
        const e = payload.new as any;
        const line: ConsoleLine = {
          id: lineIdCounter++,
          timestamp: new Date(e.occurred_at).getTime() / 1000,
          type: eventToLineType(e.event_type),
          text: `[${e.event_type.toUpperCase()}] ${JSON.stringify(e.payload)}`,
        };
        addLine(line);
        setConnected(true);
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => { supabase.removeChannel(channel); };
  }, [serverId]);

  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const handleScroll = () => {
    if (!outputRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  const handleSend = async () => {
    if (!command.trim()) return;
    addCommand(command);
    const line: ConsoleLine = {
      id: lineIdCounter++,
      timestamp: Date.now() / 1000,
      type: 'system',
      text: `> ${command}`,
    };
    addLine(line);
    await sendCommand(serverId, command);
    setCommand('');
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { handleSend(); return; }
    if (e.key === 'Tab' && suggestions.length > 0) {
      e.preventDefault();
      setCommand(suggestions[0] + ' ');
      setShowSuggestions(false);
      return;
    }
    if (e.key === 'Escape') { setShowSuggestions(false); return; }
    if (e.key === 'ArrowUp' && !showSuggestions) {
      e.preventDefault();
      const newIdx = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
      setHistoryIndex(newIdx);
      if (commandHistory.length > 0) setCommand(commandHistory[commandHistory.length - 1 - newIdx] || '');
    }
    if (e.key === 'ArrowDown' && !showSuggestions) {
      e.preventDefault();
      const newIdx = historyIndex > 0 ? historyIndex - 1 : -1;
      setHistoryIndex(newIdx);
      setCommand(newIdx >= 0 ? commandHistory[commandHistory.length - 1 - newIdx] || '' : '');
    }
  };

  const handleDownload = () => {
    const content = lines.map(l => `[${new Date(l.timestamp * 1000).toISOString()}] ${l.text}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `console-server-${serverId}.log`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleReconnect = () => {
    setConnected(true);
    toast({ title: 'Reconnecting...', description: 'Re-subscribing to console stream' });
  };

  const formatTime = (ts: number) => new Date(ts * 1000).toLocaleTimeString();

  return (
    <div className="flex flex-col h-[600px] rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          {connected ? (
            <span className="flex items-center gap-1.5 text-neon-green">
              <Wifi className="h-3.5 w-3.5" /> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-neon-red"><WifiOff className="h-3.5 w-3.5" /> Disconnected</span>
          )}
          <span className="text-muted-foreground">· {lines.length} lines</span>
        </div>
        <div className="flex items-center gap-1">
          {!connected && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleReconnect}>
              <RefreshCw className="h-3 w-3 mr-1" /> Reconnect
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { clearLines(); toast({ title: 'Console cleared' }); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div ref={outputRef} onScroll={handleScroll} className="flex-1 overflow-auto p-3 font-mono text-xs leading-5">
        {lines.map(line => (
          <div key={line.id} className="flex gap-2">
            <span className="text-muted-foreground shrink-0 select-none">{formatTime(line.timestamp)}</span>
            <span className={cn(lineColors[line.type] || 'text-foreground')}>{line.text}</span>
          </div>
        ))}
      </div>

      <div className="relative border-t border-border p-2">
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mx-2 mb-1 rounded-md border border-border bg-popover shadow-md overflow-hidden z-10">
            {suggestions.map(s => (
              <button
                key={s}
                className="block w-full px-3 py-1.5 text-xs font-mono text-left hover:bg-muted transition-colors"
                onMouseDown={(e) => { e.preventDefault(); setCommand(s + ' '); setShowSuggestions(false); inputRef.current?.focus(); }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <span className="flex items-center text-primary font-mono text-sm">{'>'}</span>
          <Input
            ref={inputRef}
            value={command}
            onChange={e => { setCommand(e.target.value); setShowSuggestions(e.target.value.trim().length > 0); }}
            onKeyDown={handleKeyDown}
            onFocus={() => command.trim() && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Enter command... (Tab to autocomplete)"
            className="flex-1 border-none bg-transparent font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0 h-8"
            disabled={!connected}
          />
          <Button size="sm" onClick={handleSend} className="h-8" disabled={!connected}>Send</Button>
        </div>
      </div>
    </div>
  );
}
