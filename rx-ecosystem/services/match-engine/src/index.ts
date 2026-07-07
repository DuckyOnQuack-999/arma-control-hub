import { EventEmitter } from 'events';
import { Match, MatchStatus, MatchPlayer, AppEvent, MatchEvent } from '@rx/shared-types';
import { eventBus, EventBus } from '@rx/event-bus';

export class MatchEngine extends EventEmitter {
  private matches: Map<string, Match> = new Map();
  private eventBus: EventBus;

  constructor(eventBusInstance?: EventBus) {
    super();
    this.eventBus = eventBusInstance || eventBus;
  }

  startMatch(serverId: string, mode: string): Match {
    const existingMatch = this.getCurrentMatch(serverId);
    if (existingMatch && existingMatch.status === 'running') {
      return existingMatch;
    }

    const match: Match = {
      id: crypto.randomUUID(),
      serverId,
      mode: mode as Match['mode'],
      status: 'running',
      startedAt: Date.now(),
      players: [],
      score: {},
    };

    this.matches.set(serverId, match);
    this.emitMatchEvent('match:start', match);

    return match;
  }

  endMatch(serverId: string): void {
    const match = this.matches.get(serverId);
    if (!match) return;

    match.status = 'ended';
    match.endedAt = Date.now();

    this.emitMatchEvent('match:end', match);
    this.matches.delete(serverId);
  }

  getCurrentMatch(serverId: string): Match | null {
    return this.matches.get(serverId) || null;
  }

  getMatch(matchId: string): Match | null {
    for (const match of this.matches.values()) {
      if (match.id === matchId) {
        return match;
      }
    }
    return null;
  }

  addPlayerToMatch(serverId: string, playerName: string, team?: string): void {
    const match = this.matches.get(serverId);
    if (!match || match.status !== 'running') return;

    const existingPlayer = match.players.find(p => p.name === playerName);
    if (existingPlayer) return;

    const player: MatchPlayer = {
      name: playerName,
      team,
      score: 0,
    };

    match.players.push(player);
  }

  removePlayerFromMatch(serverId: string, playerName: string): void {
    const match = this.matches.get(serverId);
    if (!match) return;

    match.players = match.players.filter(p => p.name !== playerName);
  }

  updatePlayerScore(serverId: string, playerName: string, score: number): void {
    const match = this.matches.get(serverId);
    if (!match) return;

    const player = match.players.find(p => p.name === playerName);
    if (player) {
      player.score = score;
      if (match.score) {
        match.score[playerName] = score;
      }
    }
  }

  private emitMatchEvent(type: 'match:start' | 'match:end', match: Match): void {
    const event: MatchEvent = {
      type,
      timestamp: new Date(),
      serverId: match.serverId,
      data: { matchId: match.id, mode: match.mode },
    };
    this.eventBus.emit(event);
  }
}

export const matchEngine = new MatchEngine();