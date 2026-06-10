import { useEffect, useRef, useState, useCallback } from 'react';

interface WSMessage {
  type: string;
  [key: string]: any;
}

export function useAgentWebSocket(agentUrl: string | null | undefined, serverId: number) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [consoleLines, setConsoleLines] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);

  useEffect(() => {
    if (!agentUrl) return;

    const wsUrl = agentUrl.replace(/^http/, 'ws') + '/ws';
    const token = localStorage.getItem('agent_token') || 'default-agent-token';

    const ws = new WebSocket(`${wsUrl}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'console',
        serverId: String(serverId),
      }));
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'metrics',
        serverId: String(serverId),
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        if (msg.type === 'console_line') {
          setConsoleLines(prev => [...prev.slice(-499), msg.line]);
        } else if (msg.type === 'console_history') {
          setConsoleLines(msg.lines || []);
        } else if (msg.type === 'metric') {
          setMetrics(prev => [...prev.slice(-499), msg.metric]);
        } else if (msg.type === 'metrics_history') {
          setMetrics(msg.metrics || []);
        }
      } catch (e) {
        // ignore
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
  }, [agentUrl, serverId]);

  const sendCommand = useCallback((command: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'command',
        serverId: String(serverId),
        command: command.trim(),
      }));
      return true;
    }
    return false;
  }, [serverId]);

  return {
    connected,
    consoleLines,
    metrics,
    sendCommand,
    ws: wsRef.current,
  };
}
