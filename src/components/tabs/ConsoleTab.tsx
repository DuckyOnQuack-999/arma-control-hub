import { useEffect, useRef, useState, useCallback } from 'react';
import { useConsoleStore } from '@/stores/consoleStore';
import { api } from '@/data/mockApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Download, Wifi, WifiOff } from 'lucide-react';
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

const simulatedLines: Array<{ type: ConsoleLineType; text: string }> = [
  { type: 'kill', text: '[KILL] CyberViper core-dumped NeonRider' },
  { type: 'chat', text: '[CHAT] GridMaster: gg!' },
  { type: 'system', text: '[ROUND] New round starting — players alive' },
  { type: 'join', text: '[JOIN] NewPlayer entered the grid from 10.0.0.99' },
  { type: 'kill', text: '[KILL] NeonRider core-dumped ByteRunner' },
  { type: 'chat', text: '[CHAT] LightCycle_X: nice wall!' },
  { type: 'warning', text: '[WARN] Player lag detected: ByteRunner 200ms' },
  { type: 'leave', text: '[LEAVE] NewPlayer left the grid' },
  { type: 'system', text: '[ROUND] CyberViper wins! Score: 5' },
  { type: 'info', text: '[SERVER] Heartbeat sent to master server' },
];

let lineIdCounter = 100;

export default function ConsoleTab({ serverId }: { serverId: number }) {
  const { lines, addLine, addLines, clearLines } = useConsoleStore();
  const [command, setCommand] = useState('');
  const [connected, setConnected] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const outputRef = useRef<HTMLDivElement>(null);
  const { commandHistory, historyIndex, addCommand, setHistoryIndex } = useConsoleStore();

  // Load history on mount
  useEffect(() => {
    clearLines();
    const history = api.getConsoleHistory();
    addLines(history);
  }, [serverId]);

  // Simulate live output
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      const sim = simulatedLines[Math.floor(Math.random() * simulatedLines.length)];
      const line: ConsoleLine = {
        id: lineIdCounter++,
        timestamp: Math.floor(Date.now() / 1000),
        type: sim.type,
        text: sim.text,
      };
      addLine(line);
    }, 2000 + Math.random() * 3000);
    return () => clearInterval(interval);
  }, [connected, addLine]);

  // Auto-scroll
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
      timestamp: Math.floor(Date.now() / 1000),
      type: 'system',
      text: `> ${command}`,
    };
    addLine(line);
    await api.sendCommand(serverId, command);
    setCommand('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { handleSend(); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newIdx = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
      setHistoryIndex(newIdx);
      if (commandHistory.length > 0) setCommand(commandHistory[commandHistory.length - 1 - newIdx] || '');
    }
    if (e.key === 'ArrowDown') {
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

  const formatTime = (ts: number) => new Date(ts * 1000).toLocaleTimeString();

  return (
    <div className="flex flex-col h-[600px] rounded-lg border border-border bg-card overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          {connected ? (
            <span className="flex items-center gap-1.5 text-neon-green"><Wifi className="h-3.5 w-3.5" /> Connected</span>
          ) : (
            <span className="flex items-center gap-1.5 text-neon-red"><WifiOff className="h-3.5 w-3.5" /> Disconnected</span>
          )}
          <span className="text-muted-foreground">· {lines.length} lines</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { clearLines(); toast({ title: 'Console cleared' }); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Output */}
      <div ref={outputRef} onScroll={handleScroll} className="flex-1 overflow-auto p-3 font-mono text-xs leading-5">
        {lines.map(line => (
          <div key={line.id} className="flex gap-2">
            <span className="text-muted-foreground shrink-0 select-none">{formatTime(line.timestamp)}</span>
            <span className={cn(lineColors[line.type] || 'text-foreground')}>{line.text}</span>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-border p-2">
        <div className="flex gap-2">
          <span className="flex items-center text-primary font-mono text-sm">{'>'}</span>
          <Input
            value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter command..."
            className="flex-1 border-none bg-transparent font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0 h-8"
          />
          <Button size="sm" onClick={handleSend} className="h-8">Send</Button>
        </div>
      </div>
    </div>
  );
}
