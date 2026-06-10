import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useConsoleStore } from '@/stores/consoleStore';
import { sendCommand } from '@/lib/supabaseApi';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Download, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConsoleLine, ConsoleLineType } from '@/data/types';
import { toast } from '@/hooks/use-toast';
import { configKeys } from '@/data/configKeys';

const lineColors: Record<ConsoleLineType, string> = {
  error: 'text-destructive',
  warning: 'text-warning',
  join: 'text-success',
  leave: 'text-muted-foreground',
  chat: 'text-info',
  system: 'text-foreground',
  kill: 'text-purple-500',
  info: 'text-primary',
};

const ARMA_COMMANDS = [
  'PLAYERS', 'KICK', 'BAN', 'BAN_IP', 'UNBAN', 'UNBAN_IP',
  'SILENCE', 'VOICE',
  'LOGIN', 'LOGOUT',
  'QUIT', 'EXIT', 'SHUTDOWN', 'RESTART',
  'SAY', 'CENTER_MESSAGE', 'CONSOLE_MESSAGE',
  'INCLUDE', 'RINCLUDE',
  ...configKeys.map(k => k.key),
];

const UNIQUE_COMMANDS = [...new Set(ARMA_COMMANDS)].sort();

let lineIdCounter = 100;

export default function ConsoleTab({ serverId, agentUrl }: { serverId: number; agentUrl?: string | null }) {
  const { lines, addLine, addLines, clearLines } = useConsoleStore();
  const [command, setCommand] = useState('');
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { commandHistory, historyIndex, addCommand, setHistoryIndex } = useConsoleStore();

  const suggestions = useMemo(() => {
    if (!command.trim()) return [];
    const upper = command.toUpperCase();
    return UNIQUE_COMMANDS.filter(cmd => cmd.startsWith(upper)).slice(0, 8);
  }, [command]);

  // WebSocket connection
  useEffect(() => {
    if (!agentUrl) return;

    const wsUrl = agentUrl.replace(/^http/, 'ws') + '/ws';
    const token = localStorage.getItem('agent_token') || 'default-agent-token';
    const ws = new WebSocket(`${wsUrl}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Subscribe to console channel
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'console',
        serverId: String(serverId),
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'console_line') {
          addLine({
            id: msg.line.id || `ws-${++lineIdCounter}`,
            server_id: serverId,
            type: msg.line.type || 'info',
            text: msg.line.text,
            timestamp: msg.line.timestamp || Date.now(),
          });
        } else if (msg.type === 'console_history') {
          const historyLines = msg.lines.map((l: any) => ({
            id: l.id || `ws-hist-${++lineIdCounter}`,
            server_id: serverId,
            type: l.type || 'info',
            text: l.text,
            timestamp: l.timestamp || Date.now(),
          }));
          addLines(historyLines);
        }
      } catch (e) {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = () => {
      setConnected(false);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [agentUrl, serverId, addLine, addLines]);

  // Supabase Realtime fallback
  useEffect(() => {
    if (connected) return; // Don't use Supabase if WS is connected

    const channel = supabase.channel(`console:${serverId}`)
      .on('broadcast', { event: 'console_line' }, (payload) => {
        const line = payload.payload as ConsoleLine;
        addLine(line);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [serverId, addLine, connected]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async () => {
    if (!command.trim()) return;

    addCommand(command);
    setHistoryIndex(-1);

    // Send via WebSocket if connected
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'command',
        serverId: String(serverId),
        command: command.trim(),
      }));
    } else {
      // Fallback to HTTP
      const { error } = await sendCommand(serverId, command.trim());
      if (error) {
        toast({ title: 'Command Failed', description: error, variant: 'destructive' });
      }
    }

    setCommand('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, [command, serverId, addCommand, setHistoryIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newIndex = historyIndex + 1;
      if (newIndex < commandHistory.length) {
        setHistoryIndex(newIndex);
        setCommand(commandHistory[commandHistory.length - 1 - newIndex] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newIndex = historyIndex - 1;
      if (newIndex >= 0) {
        setHistoryIndex(newIndex);
        setCommand(commandHistory[commandHistory.length - 1 - newIndex] || '');
      } else {
        setHistoryIndex(-1);
        setCommand('');
      }
    } else if (e.key === 'Tab' && suggestions.length > 0) {
      e.preventDefault();
      setCommand(suggestions[0] + ' ');
      setShowSuggestions(false);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleDownload = () => {
    const text = lines.map(l => `[${new Date(l.timestamp).toISOString()}] ${l.text}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `console-${serverId}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    clearLines();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b bg-card">
        <div className="flex items-center gap-2">
          {connected ? (
            <Wifi className="h-4 w-4 text-success" />
          ) : (
            <WifiOff className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground">
            {connected ? 'Live (WebSocket)' : 'Polling'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleDownload} title="Download">
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClear} title="Clear">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(autoScroll && 'text-primary')}
            title="Auto-scroll"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Output */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs space-y-0.5 bg-black"
        onScroll={(e) => {
          const el = e.currentTarget;
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
          setAutoScroll(nearBottom);
        }}
      >
        {lines.map((line) => (
          <div key={line.id} className={cn('break-all', lineColors[line.type as ConsoleLineType] || 'text-foreground')}>
            <span className="text-muted-foreground opacity-50 mr-2">
              {new Date(line.timestamp).toLocaleTimeString()}
            </span>
            {line.text}
          </div>
        ))}
        {lines.length === 0 && (
          <div className="text-muted-foreground text-center py-8">No console output yet</div>
        )}
      </div>

      {/* Input */}
      <div className="p-2 border-t bg-card relative">
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 mb-1 bg-popover border rounded-md shadow-lg max-h-40 overflow-y-auto z-10">
            {suggestions.map((s) => (
              <button
                key={s}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                onClick={() => {
                  setCommand(s + ' ');
                  setShowSuggestions(false);
                  inputRef.current?.focus();
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={command}
            onChange={(e) => {
              setCommand(e.target.value);
              setShowSuggestions(e.target.value.length > 0);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(command.length > 0)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Enter console command..."
            className="flex-1 font-mono text-sm"
            autoComplete="off"
          />
          <Button onClick={handleSend} size="sm">Send</Button>
        </div>
      </div>
    </div>
  );
}
