import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Send, X, Maximize2, Minimize2, Copy, Trash2 } from 'lucide-react';

interface TerminalProps {
  serverId: string;
  onClose: () => void;
  onMinimize?: () => void;
}

export function TerminalComponent({ serverId, onClose, onMinimize }: TerminalProps) {
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [currentCommand, setCurrentCommand] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!terminalContainerRef.current) return;

    // Initialize xterm
    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        selection: '#264f78',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ff9779',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#ffffff',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      letterSpacing: 0,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalContainerRef.current);
    fitAddon.fit();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    // Connect to WebSocket for this server
    connectToServerTerminal();

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [serverId]);

  const connectToServerTerminal = () => {
    const token = localStorage.getItem('rx-nexus-auth')
      ? JSON.parse(localStorage.getItem('rx-nexus-auth')!).state.token
      : null;

    if (!token) return;

    const wsUrl = `ws://localhost:3001/ws/terminal/${serverId}?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      if (terminalRef.current) {
        terminalRef.current.write('\r\n\x1b[1;32mConnected to server terminal\x1b[0m\r\n');
        terminalRef.current.write('\x1b[1;33mType commands to send to the Armagetron server console\x1b[0m\r\n\r\n');
        terminalRef.current.write('$ ');
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'output' && terminalRef.current) {
          terminalRef.current.write(data.data);
        } else if (data.type === 'prompt' && terminalRef.current) {
          terminalRef.current.write('\r\n$ ');
        }
      } catch {
        // Raw output
        if (terminalRef.current) {
          terminalRef.current.write(event.data);
        }
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (terminalRef.current) {
        terminalRef.current.write('\r\n\x1b[1;31mDisconnected from server terminal\x1b[0m\r\n');
      }
    };

    ws.onerror = (error) => {
      console.error('Terminal WebSocket error:', error);
      if (terminalRef.current) {
        terminalRef.current.write('\r\n\x1b[1;31mConnection error\x1b[0m\r\n');
      }
    };
  };

  const sendCommand = (command: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'command', command }));
      setCommandHistory(prev => [...prev.slice(-49), command]);
      setHistoryIndex(-1);
      setCurrentCommand('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (currentCommand.trim()) {
        sendCommand(currentCommand);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCurrentCommand('');
      }
    }
  };

  return (
    <div className={`fixed bottom-4 right-4 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl transition-all duration-300 ${isMaximized ? 'inset-4 max-w-none max-h-none' : 'w-96 h-96'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-800/50 rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm font-medium text-white">Terminal - Server {serverId.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title={isMaximized ? 'Minimize' : 'Maximize'}
          >
            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Container */}
      <div
        ref={terminalContainerRef}
        className={`h-full ${isMaximized ? 'h-[calc(100%-40px)]' : 'h-[calc(100%-40px)]'}`}
      />

      {/* Input Bar */}
      <div className="px-3 py-2 border-t border-gray-700 bg-gray-800/50 rounded-b-lg">
        <div className="flex items-center gap-2">
          <span className="text-green-400 font-mono text-sm">$</span>
          <input
            type="text"
            value={currentCommand}
            onChange={(e) => setCurrentCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none outline-none text-white font-mono text-sm"
            placeholder="Type command..."
            autoFocus
          />
          <button
            onClick={() => sendCommand(currentCommand)}
            disabled={!currentCommand.trim() || !isConnected}
            className="p-1.5 text-gray-400 hover:text-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Send command"
          >
            <Send className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (terminalRef.current) {
                terminalRef.current.clear();
              }
            }}
            className="p-1.5 text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 rounded transition-colors"
            title="Clear terminal"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}