import { 
  Trophy, RotateCcw, Play, Stop, Flag, Clock, 
  Users, TrendingUp, Download, Filter, ChevronDown, ChevronUp
} from 'lucide-react';
import { Match, MatchMode, MatchStatus } from '../types';
import { formatDate, formatUptime } from '../lib/utils';

interface MatchUIProps {
  matches: Match[];
  serverId: string;
  onStartMatch: (mode: MatchMode) => void;
  onEndMatch: (matchId: string) => void;
  isLoading?: boolean;
}

const modeColors: Record<MatchMode, string> = {
  SUMO: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  CTF: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  RACE: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const statusColors: Record<MatchStatus, string> = {
  lobby: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  running: 'bg-green-500/20 text-green-400 border-green-500/30',
  ended: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const modeIcons: Record<MatchMode, React.ReactNode> = {
  SUMO: <Trophy className="w-4 h-4" />,
  CTF: <Flag className="w-4 h-4" />,
  RACE: <TrendingUp className="w-4 h-4" />,
};

export function MatchUI({ 
  matches, 
  serverId, 
  onStartMatch, 
  onEndMatch,
  isLoading = false 
}: MatchUIProps) {
  const [sortBy, setSortBy] = useState<'startedAt' | 'mode' | 'status'>('startedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterStatus, setFilterStatus] = useState<MatchStatus | 'all'>('all');
  const [filterMode, setFilterMode] = useState<MatchMode | 'all'>('all');

  const filteredMatches = matches
    .filter(m => filterStatus === 'all' || m.status === filterStatus)
    .filter(m => filterMode === 'all' || m.mode === filterMode)
    .sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      if (sortBy === 'startedAt') {
        aVal = new Date(a.startedAt).getTime();
        bVal = new Date(b.startedAt).getTime();
      }
      return sortOrder === 'asc' 
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });

  const runningMatch = matches.find(m => m.status === 'running');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 bg-gray-800/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-white">
              Matches ({matches.length})
            </h3>
            {runningMatch && (
              <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded-full flex items-center gap-1 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Live: {runningMatch.mode}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-700 border border-gray-600 rounded-lg p-1">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                className="bg-transparent border-none text-white text-sm focus:outline-none"
              >
                <option value="all">All Status</option>
                <option value="running">Running</option>
                <option value="lobby">Lobby</option>
                <option value="ended">Ended</option>
              </select>
              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value as typeof filterMode)}
                className="bg-transparent border-none text-white text-sm focus:outline-none ml-1"
              >
                <option value="all">All Modes</option>
                <option value="SUMO">SUMO</option>
                <option value="CTF">CTF</option>
                <option value="RACE">RACE</option>
              </select>
            </div>
            <button
              onClick={() => {
                const blob = new Blob([filteredMatches.map(m => 
                  `${m.id},${m.mode},${m.status},${formatDate(m.startedAt)},${m.endedAt ? formatDate(m.endedAt) : ''},${m.players?.length || 0}`
                ).join('\n')], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `matches-${serverId.slice(0,8)}-${new Date().toISOString().split('T')[0]}.csv`;
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

        {/* Quick Start Match */}
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Start New Match:</span>
            {(['SUMO', 'CTF', 'RACE'] as MatchMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => onStartMatch(mode)}
                disabled={runningMatch !== null}
                className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                  runningMatch 
                    ? 'opacity-50 cursor-not-allowed bg-gray-700 text-gray-500' 
                    : `bg-${mode === 'SUMO' ? 'purple' : mode === 'CTF' ? 'blue' : 'green'}-600 hover:bg-${mode === 'SUMO' ? 'purple' : mode === 'CTF' ? 'blue' : 'green'}-700 text-white`
                }`}
              >
                {modeIcons[mode]}
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Match List */}
      <div className="flex-1 overflow-y-auto">
        {filteredMatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Trophy className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg">No matches found</p>
            <p className="text-sm">Start a new match or adjust filters</p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {filteredMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                isRunning={match.status === 'running'}
                onEndMatch={onEndMatch}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface MatchCardProps {
  match: Match;
  isRunning: boolean;
  onEndMatch: (matchId: string) => void;
}

function MatchCard({ match, isRunning, onEndMatch }: MatchCardProps) {
  const duration = match.endedAt 
    ? new Date(match.endedAt).getTime() - new Date(match.startedAt).getTime()
    : Date.now() - new Date(match.startedAt).getTime();

  return (
    <div className={`p-4 rounded-lg border transition-colors ${
      isRunning 
        ? 'bg-green-500/5 border-green-500/30' 
        : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-lg ${modeColors[match.mode]}`}>
            {modeIcons[match.mode]}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h4 className="font-semibold text-white">{match.mode} Match</h4>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors[match.status]}`}>
                {match.status.charAt(0).toUpperCase() + match.status.slice(1)}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              ID: {match.id.slice(0, 8)}... • Started: {formatDate(match.startedAt)}
              {match.endedAt && ` • Ended: ${formatDate(match.endedAt)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-lg font-mono font-semibold text-white">
              {formatUptime(Math.floor(duration / 1000))}
            </p>
            <p className="text-xs text-gray-500">{isRunning ? 'Elapsed' : 'Duration'}</p>
          </div>
          <div className="flex items-center gap-2">
            {match.players && match.players.length > 0 && (
              <div className="text-right hidden md:block">
                <p className="text-lg font-semibold text-white">{match.players.length}</p>
                <p className="text-xs text-gray-500">Players</p>
              </div>
            )}
            {isRunning && (
              <button
                onClick={() => {
                  if (confirm('End this match?')) {
                    onEndMatch(match.id);
                  }
                }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Stop className="w-4 h-4" />
                End Match
              </button>
            )}
          </div>
        </div>
      </div>

      {match.players && match.players.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <p className="text-xs font-medium text-gray-400 mb-2">Players & Scores</p>
          <div className="flex flex-wrap gap-2">
            {match.players
              .sort((a, b) => (b.score || 0) - (a.score || 0))
              .map((player, index) => (
                <div key={index} className="px-3 py-1.5 bg-gray-700/50 rounded-lg flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    index === 0 ? 'bg-yellow-500 text-black' :
                    index === 1 ? 'bg-gray-400 text-black' :
                    index === 2 ? 'bg-amber-700 text-white' :
                    'bg-gray-600 text-white'
                  }`}>
                    {index + 1}
                  </span>
                  <span className="font-medium text-white">{player.name}</span>
                  <span className="text-gray-400 font-mono">
                    {player.score !== undefined ? player.score : 0}
                  </span>
                  {player.clanTag && (
                    <span className="px-1.5 py-0.5 text-xs bg-gray-600 text-gray-300 rounded">
                      [{player.clanTag}]
                    </span>
                  )}
</div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Need to import useState
import { useState } from 'react';