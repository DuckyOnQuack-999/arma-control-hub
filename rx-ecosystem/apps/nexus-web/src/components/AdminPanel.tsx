import { useState } from 'react';
import { 
  Users, Ban, MessageSquare, MapPin, RotateCcw, Play, Stop, 
  Zap, Shield, AlertTriangle, Send, X, Loader2
} from 'lucide-react';
import { useServerStore } from '../stores/serverStore';

interface AdminPanelProps {
  serverId: string;
  onClose: () => void;
}

export function AdminPanel({ serverId, onClose }: AdminPanelProps) {
  const { servers, executeCommand } = useServerStore();
  const server = servers.find(s => s.id === serverId);
  
  const [activeTab, setActiveTab] = useState<'players' | 'commands' | 'console'>('players');
  const [commandInput, setCommandInput] = useState('');
  const [commandOutput, setCommandOutput] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [banReason, setBanReason] = useState('');
  const [kickReason, setKickReason] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [mapName, setMapName] = useState('');

  const serverPlayers = server?.players || [];

  const handleExecuteCommand = async (command: string) => {
    setIsExecuting(true);
    try {
      const result = await executeCommand(serverId, command);
      setCommandOutput(prev => [...prev, `$ ${command}`, result.output || 'Command executed', '']);
      setCommandInput('');
    } catch (error) {
      setCommandOutput(prev => [...prev, `$ ${command}`, `Error: ${error}`, '']);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleKick = async () => {
    if (!selectedPlayer) return;
    await handleExecuteCommand(`KICK ${selectedPlayer} ${kickReason ? `: ${kickReason}` : ''}`);
    setSelectedPlayer(null);
    setKickReason('');
  };

  const handleBan = async () => {
    if (!selectedPlayer) return;
    await handleExecuteCommand(`BAN ${selectedPlayer} ${banReason ? `: ${banReason}` : ''}`);
    setSelectedPlayer(null);
    setBanReason('');
  };

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    await handleExecuteCommand(`MSG ${broadcastMessage}`);
    setBroadcastMessage('');
  };

  const handleMapChange = async () => {
    if (!mapName.trim()) return;
    await handleExecuteCommand(`MAP ${mapName}`);
    setMapName('');
  };

  const handleRestartMatch = async () => {
    await handleExecuteCommand('RESTART_MATCH');
  };

  const quickCommands = [
    { label: 'Status', command: 'STATUS', icon: Shield },
    { label: 'Players', command: 'PLAYERS', icon: Users },
    { label: 'Logs', command: 'LOGS', icon: AlertTriangle },
    { label: 'Config', command: 'CONFIG', icon: Shield },
  ];

  if (!server) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4">
          <h2 className="text-xl font-bold text-white mb-4">Server not found</h2>
          <button onClick={onClose} className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-4xl h-[80vh] max-h-[80vh] bg-gray-900 flex flex-col overflow-hidden mx-auto my-4 rounded-xl border border-gray-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-white">Admin Panel - {server.name}</h2>
              <p className="text-sm text-gray-400">Port: {server.port} • {server.state}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-700 flex px-4">
          {[
            { id: 'players', label: 'Players', icon: Users },
            { id: 'commands', label: 'Commands', icon: Zap },
            { id: 'console', label: 'Raw Console', icon: AlertTriangle },
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
          {/* Players Tab */}
          {activeTab === 'players' && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
                <h3 className="font-semibold text-white mb-4">Connected Players ({serverPlayers.length})</h3>
                {serverPlayers.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No players connected</p>
                ) : (
                  serverPlayers.map((player, index) => (
                    <div 
                      key={index} 
                      className={`flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border ${
                        selectedPlayer === player.name ? 'border-primary/50' : 'border-gray-700'
                      }`}
                      onClick={() => setSelectedPlayer(selectedPlayer === player.name ? null : player.name)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                          <span className="text-sm font-medium text-primary">
                            {player.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-white">{player.name}</p>
                          <p className="text-xs text-gray-400">
                            Joined: {new Date(player.joinedAt).toLocaleTimeString()} 
                            {player.clanTag && `• ${player.clanTag}`}
                          </p>
                        </div>
                      </div>
                      {selectedPlayer === player.name && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setKickReason(''); }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 transition-colors"
                          >
                            <Users className="w-4 h-4" />
                            Kick
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setBanReason(''); }}
                            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 transition-colors"
                          >
                            <Ban className="w-4 h-4" />
                            Ban
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}

                {selectedPlayer && (
                  <div className="mt-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                    <h4 className="font-medium text-white mb-4">Actions for {selectedPlayer}</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Kick Reason</label>
                        <input
                          type="text"
                          value={kickReason}
                          onChange={(e) => setKickReason(e.target.value)}
                          placeholder="Optional reason..."
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Ban Reason</label>
                        <input
                          type="text"
                          value={banReason}
                          onChange={(e) => setBanReason(e.target.value)}
                          placeholder="Optional reason..."
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleKick}
                          className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
                        >
                          Kick Player
                        </button>
                        <button
                          onClick={handleBan}
                          className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors"
                        >
                          Ban Player
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Commands Tab */}
          {activeTab === 'commands' && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-6">
                {/* Quick Commands */}
                <div>
                  <h3 className="font-semibold text-white mb-3">Quick Commands</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {quickCommands.map(({ label, command, icon: Icon }) => (
                      <button
                        key={command}
                        onClick={() => handleExecuteCommand(command)}
                        disabled={isExecuting}
                        className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-colors text-left disabled:opacity-50"
                      >
                        <Icon className="w-5 h-5 text-primary mb-1" />
                        <p className="font-medium text-white">{label}</p>
                        <p className="text-xs text-gray-400 font-mono">{command}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Broadcast */}
                <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                  <h4 className="font-medium text-white mb-3 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-primary" />
                    Broadcast Message
                  </h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                      placeholder="Message to broadcast to all players..."
                      className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                      onKeyDown={(e) => e.key === 'Enter' && handleBroadcast()}
                    />
                    <button
                      onClick={handleBroadcast}
                      disabled={!broadcastMessage.trim() || isExecuting}
                      className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </div>

                {/* Map Change */}
                <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                  <h4 className="font-medium text-white mb-3 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-primary" />
                    Change Map
                  </h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={mapName}
                      onChange={(e) => setMapName(e.target.value)}
                      placeholder="Map name (e.g., fortress, sumo, race)..."
                      className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                      onKeyDown={(e) => e.key === 'Enter' && handleMapChange()}
                    />
                    <button
                      onClick={handleMapChange}
                      disabled={!mapName.trim() || isExecuting}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      Change Map
                    </button>
                  </div>
                </div>

                {/* Match Controls */}
                <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                  <h4 className="font-medium text-white mb-3 flex items-center gap-2">
                    <RotateCcw className="w-5 h-5 text-primary" />
                    Match Controls
                  </h4>
                  <div className="flex gap-2">
                    <button
                      onClick={handleRestartMatch}
                      disabled={isExecuting}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Restart Match
                    </button>
                    <button
                      onClick={() => handleExecuteCommand('PAUSE_MATCH')}
                      disabled={isExecuting}
                      className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      Pause Match
                    </button>
                    <button
                      onClick={() => handleExecuteCommand('RESUME_MATCH')}
                      disabled={isExecuting}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      Resume Match
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Raw Console Tab */}
          {activeTab === 'console' && (
            <div className="flex-1 flex flex-col">
              <div className="p-3 border-b border-gray-700 bg-gray-800/50">
                <h3 className="font-semibold text-white">Raw Console</h3>
                <p className="text-sm text-gray-400">Execute raw console commands on the server</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 font-mono text-sm bg-black">
                {commandOutput.map((line, index) => (
                  <div key={index} className={`whitespace-pre-wrap break-all ${
                    line.startsWith('$') ? 'text-green-400' :
                    line.startsWith('Error') ? 'text-red-400' :
                    'text-gray-300'
                  }`}>
                    {line}
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-gray-700 bg-gray-800/50">
                <div className="flex items-center gap-2">
                  <span className="text-green-400">$</span>
                  <input
                    type="text"
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && commandInput.trim() && handleExecuteCommand(commandInput)}
                    className="flex-1 bg-transparent border-none outline-none text-white font-mono text-sm"
                    placeholder="Enter command..."
                    autoFocus
                  />
                  <button
                    onClick={() => commandInput.trim() && handleExecuteCommand(commandInput)}
                    disabled={!commandInput.trim() || isExecuting}
                    className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setCommandOutput([])}
                    className="px-3 py-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors text-sm"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}