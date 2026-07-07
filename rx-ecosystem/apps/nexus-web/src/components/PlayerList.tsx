import { 
  Users, Crown, Shield, AlertTriangle, Trash2, Ban, 
  MessageSquare, MapPin, RotateCcw, Play, Stop, 
  Loader2, Search, Filter, Download
} from 'lucide-react';
import { Player, Clan } from '../types';
import { formatDate } from '../lib/utils';

interface PlayerListProps {
  players: Player[];
  serverId: string;
  onKick: (playerName: string, reason?: string) => void;
  onBan: (playerName: string, reason?: string) => void;
  onMessage: (playerName: string, message: string) => void;
  isLoading?: boolean;
}

export function PlayerList({ 
  players, 
  serverId, 
  onKick, 
  onBan, 
  onMessage,
  isLoading = false 
}: PlayerListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'joinedAt' | 'clanTag'>('joinedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);

  const filteredPlayers = players
    .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      if (sortBy === 'joinedAt') {
        aVal = new Date(a.joinedAt).getTime();
        bVal = new Date(b.joinedAt).getTime();
      }
      return sortOrder === 'asc' 
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });

  const toggleSelect = (name: string) => {
    const newSet = new Set(selectedPlayers);
    if (newSet.has(name)) newSet.delete(name);
    else newSet.add(name);
    setSelectedPlayers(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedPlayers.size === filteredPlayers.length) {
      setSelectedPlayers(new Set());
    } else {
      setSelectedPlayers(new Set(filteredPlayers.map(p => p.name)));
    }
  };

  const handleBulkKick = () => {
    if (!confirm(`Kick ${selectedPlayers.size} players?`)) return;
    selectedPlayers.forEach(name => onKick(name, 'Bulk action'));
    setSelectedPlayers(new Set());
  };

  const handleBulkBan = () => {
    if (!confirm(`Ban ${selectedPlayers.size} players?`)) return;
    selectedPlayers.forEach(name => onBan(name, 'Bulk action'));
    setSelectedPlayers(new Set());
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="p-4 border-b border-gray-700 bg-gray-800/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-white">
              Players ({players.length})
            </h3>
            {selectedPlayers.size > 0 && (
              <span className="px-2 py-1 text-xs bg-primary/20 text-primary rounded-full">
                {selectedPlayers.size} selected
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search players..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64 px-9 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="name">Name</option>
              <option value="joinedAt">Joined</option>
              <option value="clanTag">Clan</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="p-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-400 hover:text-white transition-colors"
              title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
            >
              {sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button
              onClick={() => {
                const blob = new Blob([filteredPlayers.map(p => 
                  `${p.name},${p.clanTag || ''},${formatDate(p.joinedAt)}`
                ).join('\n')], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `players-${serverId.slice(0,8)}-${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="p-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Export CSV"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {selectedPlayers.size > 0 && (
          <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-3">
            <span className="text-yellow-400 text-sm font-medium">
              {selectedPlayers.size} player(s) selected
            </span>
            <button
              onClick={handleBulkKick}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Users className="w-4 h-4" />
              Kick All
            </button>
            <button
              onClick={handleBulkBan}
              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Ban className="w-4 h-4" />
              Ban All
            </button>
            <button
              onClick={() => setSelectedPlayers(new Set())}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Player List */}
      <div className="flex-1 overflow-y-auto">
        {filteredPlayers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Users className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg">No players found</p>
            <p className="text-sm">Try adjusting your search or filters</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-800/50 backdrop-blur-sm z-10">
              <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3 w-12">
                  <input
                    type="checkbox"
                    checked={selectedPlayers.size === filteredPlayers.length && filteredPlayers.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-600 text-primary focus:ring-primary"
                  />
                </th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3 hidden md:table-cell">Clan</th>
                <th className="px-4 py-3 hidden lg:table-cell">Joined</th>
                <th className="px-4 py-3 w-40">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredPlayers.map((player, index) => (
                <tr 
                  key={index}
                  className={`hover:bg-gray-800/50 transition-colors ${
                    selectedPlayers.has(player.name) ? 'bg-primary/5' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedPlayers.has(player.name)}
                      onChange={() => toggleSelect(player.name)}
                      className="rounded border-gray-600 text-primary focus:ring-primary"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          {player.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-white">{player.name}</p>
                        {player.ip && (
                          <p className="text-xs text-gray-500 font-mono">{player.ip}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {player.clanTag ? (
                      <span className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded">
                        [{player.clanTag}]
                      </span>
                    ) : (
                      <span className="text-gray-500 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-sm text-gray-400">
                    {formatDate(player.joinedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onMessage(player.name, prompt(`Message to ${player.name}:`) || '')}
                        className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                        title="Send private message"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          const reason = prompt(`Kick reason for ${player.name}:`);
                          if (reason !== null) onKick(player.name, reason);
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Kick player"
                      >
                        <Users className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          const reason = prompt(`Ban reason for ${player.name}:`);
                          if (reason !== null) onBan(player.name, reason);
                        }}
                        className="p-1.5 text-gray-400 hover:text-orange-400 hover:bg-orange-500/10 rounded transition-colors"
                        title="Ban player"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Need to import useState
import { useState } from 'react';