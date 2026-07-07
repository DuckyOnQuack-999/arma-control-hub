import { useEffect, useRef, useState } from 'react';
import { 
  Play, Stop, RotateCcw, Terminal, Users, MapPin, Trophy, Settings, 
  ChevronDown, ChevronUp, X, Copy, Download, Trash2, AlertTriangle
} from 'lucide-react';
import { useServerStore } from '../stores/serverStore';
import { ServerInstance, Player, Match, LogEvent, ResourceUsage } from '../types';
import { formatDate, formatUptime, getStateColor } from '../lib/utils';

interface ServerDetailProps {
  server: ServerInstance;
  onClose: () => void;
}

export function ServerDetail({ server, onClose }: ServerDetailProps) {
  const { 
    logs, 
    players, 
    matches, 
    resources,
    startServer, 
    stopServer, 
    restartServer, 
    deleteServer,
    updateServer 
  } = useServerStore();

  const [activeTab, setActiveTab] = useState<'console' | 'players' | 'matches' | 'config' | 'resources'>('console');
  const [logFilter, setLogFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    players: true,
    matches: true,
    resources: true,
  });
  const logsEndRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  const serverLogs = logs.get(server.id) || [];
  const serverPlayers = players.get(server.id) || [];
  const serverMatches = matches.get(server.id) || [];
  const serverResources = resources.get(server.id);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [serverLogs, autoScroll]);

  const filteredLogs = serverLogs.filter(log => 
    log.line.toLowerCase().includes(logFilter.toLowerCase())
  );

  const handleStart = async () => {
    try {
      await startServer(server.id);
      updateServer(server.id, { state: 'running' });
    } catch (error) {
      console.error('Failed to start server:', error);
    }
  };

  const handleStop = async () => {
    try {
      await stopServer(server.id);
      updateServer(server.id, { state: 'stopped' });
    } catch (error) {
      console.error('Failed to stop server:', error);
    }
  };

  const handleRestart = async () => {
    try {
      await restartServer(server.id);
      updateServer(server.id, { state: 'starting' });
    } catch (error) {
      console.error('Failed to restart server:', error);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${server.name}"? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteServer(server.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete server:', error);
    }
  };

  const copyLogs = () => {
    navigator.clipboard.writeText(filteredLogs.map(l => l.line).join('\n'));
  };

  const downloadLogs = () => {
    const blob = new Blob([filteredLogs.map(l => l.line).join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${server.name}-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-6xl h-full bg-gray-900 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-white">{server.name}</h2>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <span className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${getStateColor(server.state)}`} />
                  {server.state.charAt(0).toUpperCase() + server.state.slice(1)}
                </span>
                <span>Port: {server.port}</span>
                <span>ID: {server.id.slice(0, 8)}...</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {server.state !== 'running' && server.state !== 'starting' && (
              <button
                onClick={handleStart}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <Play className="w-4 h-4" />
                Start
              </button>
            )}
            {server.state === 'running' && (
              <>
                <button
                  onClick={handleStop}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Stop className="w-4 h-4" />
                  Stop
                </button>
                <button
                  onClick={handleRestart}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Restart
                </button>
              </>
            )}
            <button
              onClick={handleDelete}
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Delete server"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-700 flex gap-1 px-4">
          {[
            { id: 'console', label: 'Console', icon: Terminal },
            { id: 'players', label: 'Players', icon: Users },
            { id: 'matches', label: 'Matches', icon: Trophy },
            { id: 'resources', label: 'Resources', icon: Settings },
            { id: 'config', label: 'Config', icon: Settings },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === id
                  ? 'bg-gray-800 text-primary border-b-2 border-primary'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === 'console' && (
            <div className="flex-1 flex flex-col">
              <div className="p-3 border-b border-gray-700 flex items-center gap-3">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder="Filter logs..."
                    value={logFilter}
                    onChange={(e) => setLogFilter(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 pr-10"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="rounded border-gray-600 text-primary focus:ring-primary"
                  />
                  Auto-scroll
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyLogs}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    title="Copy logs"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={downloadLogs}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    title="Download logs"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div 
                className="flex-1 overflow-y-auto p-4 font-mono text-sm bg-black"
                ref={consoleRef}
              >
                {filteredLogs.map((log, index) => (
                  <div key={index} className="text-gray-300 whitespace-pre-wrap break-all">
                    {log.line}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}

          {activeTab === 'players' && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <details
                  defaultOpen={expandedSections.players}
                  onToggle={(e) => setExpandedSections({ ...expandedSections, players: e.target.open })}
                  className="group"
                >
                  <summary className="flex items-center justify-between cursor-pointer">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Players ({serverPlayers.length})
                    </h3>
                    <ChevronDown className="w-5 h-5 text-gray-400 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mt-4 space-y-2">
                    {serverPlayers.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">No players connected</p>
                    ) : (
                      serverPlayers.map((player, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                              <span className="text-sm font-medium text-primary">
                                {player.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-white">{player.name}</p>
                              <p className="text-xs text-gray-400">
                                Joined: {formatDate(player.joinedAt)} {player.clanTag && `• ${player.clanTag}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Kick">
                              <X className="w-4 h-4" />
                            </button>
                            <button className="p-2 text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 rounded-lg transition-colors" title="Ban">
                              <AlertTriangle className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </details>
              </div>
            </div>
          )}

          {activeTab === 'matches' && (
            <div className="flex-1 overflow-y-auto p-4">
              <details
                defaultOpen={expandedSections.matches}
                onToggle={(e) => setExpandedSections({ ...expandedSections, matches: e.target.open })}
                className="group"
              >
                <summary className="flex items-center justify-between cursor-pointer">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Trophy className="w-5 h-5" />
                    Matches ({serverMatches.length})
                  </h3>
                  <ChevronDown className="w-5 h-5 text-gray-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-4 space-y-3">
                  {serverMatches.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No matches recorded</p>
                  ) : (
                    serverMatches.map((match) => (
                      <div key={match.id} className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-500/20 text-blue-400">
                            {match.mode}
                          </span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            match.status === 'running' ? 'bg-green-500/20 text-green-400' :
                            match.status === 'lobby' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {match.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-400">Started</p>
                            <p className="text-white">{formatDate(match.startedAt)}</p>
                          </div>
                          <div>
                            <p className="text-gray-400">Ended</p>
                            <p className="text-white">{match.endedAt ? formatDate(match.endedAt) : '—'}</p>
                          </div>
                        </div>
                        {match.players && match.players.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs text-gray-400 mb-1">Players</p>
                            <div className="flex flex-wrap gap-1">
                              {match.players.map((p: any) => (
                                <span key={p.name} className="px-2 py-0.5 text-xs bg-gray-700 rounded text-gray-300">
                                  {p.name} ({p.score})
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </details>
            </div>
          )}

          {activeTab === 'resources' && (
            <div className="flex-1 overflow-y-auto p-4">
              <details
                defaultOpen={expandedSections.resources}
                onToggle={(e) => setExpandedSections({ ...expandedSections, resources: e.target.open })}
                className="group"
              >
                <summary className="flex items-center justify-between cursor-pointer">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Resource Usage
                  </h3>
                  <ChevronDown className="w-5 h-5 text-gray-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-800/50 rounded-lg">
                    <h4 className="text-sm text-gray-400 mb-2">CPU Usage</h4>
                    <div className="h-32 flex items-end justify-center">
                      <div className="w-24 bg-green-500/20 rounded-t" style={{ height: `${serverResources?.cpu || 0}%` }} />
                    </div>
                    <p className="text-2xl font-bold text-green-400 text-center mt-2">
                      {serverResources?.cpu?.toFixed(1) || 0}%
                    </p>
                  </div>
                  <div className="p-4 bg-gray-800/50 rounded-lg">
                    <h4 className="text-sm text-gray-400 mb-2">Memory Usage</h4>
                    <div className="h-32 flex items-end justify-center">
                      <div className="w-24 bg-blue-500/20 rounded-t" style={{ height: `${((serverResources?.memory || 0) / (512 * 1024 * 1024)) * 100}%` }} />
                    </div>
                    <p className="text-2xl font-bold text-blue-400 text-center mt-2">
                      {(serverResources?.memory || 0) / 1024 / 1024} MB
                    </p>
                  </div>
                  <div className="p-4 bg-gray-800/50 rounded-lg">
                    <h4 className="text-sm text-gray-400 mb-2">Network In</h4>
                    <p className="text-2xl font-bold text-white text-center">
                      {serverResources?.networkIn ? `${(serverResources.networkIn / 1024 / 1024).toFixed(2)} MB` : '0 MB'}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-800/50 rounded-lg">
                    <h4 className="text-sm text-gray-400 mb-2">Network Out</h4>
                    <p className="text-2xl font-bold text-white text-center">
                      {serverResources?.networkOut ? `${(serverResources.networkOut / 1024 / 1024).toFixed(2)} MB` : '0 MB'}
                    </p>
                  </div>
                </div>
              </details>
            </div>
          )}

          {activeTab === 'config' && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="p-4 bg-gray-800/50 rounded-lg">
                <h3 className="font-semibold text-white mb-4">Configuration Editor</h3>
                <textarea
                  className="w-full h-96 font-mono text-sm bg-black border border-gray-700 rounded-lg p-4 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Configuration editor coming soon..."
                  readOnly
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Need to import icons
import { Server, Copy, Download, AlertTriangle, ChevronDown, Settings } from 'lucide-react';