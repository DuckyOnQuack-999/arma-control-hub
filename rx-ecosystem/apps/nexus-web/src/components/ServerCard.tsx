import { ServerInstance } from '../types';
import { getStateColor, getStateIcon, formatUptime } from '../lib/utils';
import { Play, Square, RotateCcw, Trash2, Server, Users, Cpu, HardDrive } from 'lucide-react';

interface ServerCardProps {
  server: ServerInstance;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onDelete: (id: string) => void;
  onSelect: (server: ServerInstance) => void;
  isSelected: boolean;
}

export function ServerCard({ 
  server, 
  onStart, 
  onStop, 
  onRestart, 
  onDelete, 
  onSelect, 
  isSelected 
}: ServerCardProps) {
  const stateColor = getStateColor(server.state);
  const stateIcon = getStateIcon(server.state);
  const stateColors = {
    running: 'bg-green-500',
    starting: 'bg-yellow-500',
    stopping: 'bg-yellow-500',
    stopped: 'bg-gray-500',
    crashed: 'bg-red-500',
    error: 'bg-red-500',
    idle: 'bg-gray-500',
  };

  return (
    <div
      className={`relative rounded-xl border p-4 transition-all duration-200 ${
        isSelected 
          ? 'border-primary/50 bg-primary/5 shadow-lg shadow-primary/10' 
          : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
      }`}
      onClick={() => onSelect(server)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-lg ${stateColors[server.state] || 'bg-gray-500'}`}>
            {stateIcon}
          </div>
          <div>
            <h3 className="font-semibold text-white">{server.name}</h3>
            <p className="text-sm text-gray-400">Port: {server.port}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className={`relative px-2 py-1 text-xs font-medium rounded-full ${
            server.state === 'running' ? 'bg-green-500/20 text-green-400' :
            server.state === 'starting' || server.state === 'stopping' ? 'bg-yellow-500/20 text-yellow-400' :
            server.state === 'crashed' || server.state === 'error' ? 'bg-red-500/20 text-red-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {server.state.charAt(0).toUpperCase() + server.state.slice(1)}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4 text-center">
        <div className="p-2 rounded-lg bg-gray-800/50">
          <Users className="w-4 h-4 text-gray-400 mx-auto mb-1" />
          <p className="text-lg font-semibold text-white">{server.players?.length || 0}</p>
          <p className="text-xs text-gray-400">Players</p>
        </div>
        <div className="p-2 rounded-lg bg-gray-800/50">
          <Cpu className="w-4 h-4 text-gray-400 mx-auto mb-1" />
          <p className="text-lg font-semibold text-white">
            {server.resources?.cpu?.toFixed(1) || '0.0'}%
          </p>
          <p className="text-xs text-gray-400">CPU</p>
        </div>
        <div className="p-2 rounded-lg bg-gray-800/50">
          <HardDrive className="w-4 h-4 text-gray-400 mx-auto mb-1" />
          <p className="text-lg font-semibold text-white">
            {server.resources?.memory ? `${(server.resources.memory / 1024 / 1024).toFixed(1)} MB` : '0 MB'}
          </p>
          <p className="text-xs text-gray-400">Memory</p>
        </div>
      </div>

      {server.uptime && (
        <div className="mt-3 pt-3 border-t border-gray-700 flex items-center gap-2 text-sm text-gray-400">
          <Server className="w-4 h-4" />
          <span>Uptime: {formatUptime(server.uptime)}</span>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {server.state !== 'running' && server.state !== 'starting' && (
          <button
            onClick={(e) => { e.stopPropagation(); onStart(server.id); }}
            className="flex-1 py-2 px-3 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" />
            Start
          </button>
        )}
        {server.state === 'running' && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onStop(server.id); }}
              className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRestart(server.id); }}
              className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Restart
            </button>
          </>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(server.id); }}
          className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          title="Delete server"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}