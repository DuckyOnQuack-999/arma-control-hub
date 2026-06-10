import { PlayerEvent, PlayerState, ConsoleLine } from './types';
import { insertPlayerEvent } from './db';

const PLAYER_ENTERED_PATTERNS = [
  /Player\s+(.+?)\s+entered\s+the\s+game/i,
  /(.+?)\s+has\s+joined\s+the\s+game/i,
  /New\s+player:\s*(.+)/i,
];

const PLAYER_LEFT_PATTERNS = [
  /Player\s+(.+?)\s+left\s+the\s+game/i,
  /(.+?)\s+has\s+left\s+the\s+game/i,
  /(.+?)\s+disconnected/i,
];

const CHAT_PATTERNS = [
  /(.+?):\s*(.+)/,
  /\[(.+?)\]\s*(.+)/,
];

const KILL_PATTERNS = [
  /(.+?)\s+killed\s+(.+?)(?:\s+with\s+(.+))?/i,
  /(.+?)\s+destroyed\s+(.+)/i,
];

const KICK_PATTERNS = [
  /(.+?)\s+was\s+kicked\s+(?:by\s+(.+?))?(?:\s*\((.*)\))?/i,
  /KICK\s+(.+)/i,
];

const BAN_PATTERNS = [
  /(.+?)\s+was\s+banned\s+(?:by\s+(.+?))?(?:\s*\((.*)\))?/i,
  /BAN\s+(.+)/i,
];

const ROUND_START_PATTERNS = [
  /New\s+round\s+started/i,
  /Round\s+begin/i,
  /Game\s+reset/i,
];

export function parseConsoleLine(text: string, serverId: string): ConsoleLine {
  const lower = text.toLowerCase();
  let type: ConsoleLine['type'] = 'info';

  if (lower.includes('error') || lower.includes('failed') || lower.includes('fatal') || lower.includes('exception')) {
    type = 'error';
  } else if (lower.includes('warning') || lower.includes('warn')) {
    type = 'warning';
  } else if (lower.includes('player') && (lower.includes('joined') || lower.includes('entered'))) {
    type = 'player';
  } else if (lower.includes('player') && (lower.includes('left') || lower.includes('disconnected'))) {
    type = 'player';
  } else if (lower.includes('killed') || lower.includes('destroyed')) {
    type = 'kill';
  } else if (lower.includes('chat') || /\w+:\s+/.test(text)) {
    type = 'chat';
  } else if (lower.includes('server') && lower.includes('started')) {
    type = 'system';
  } else if (lower.includes('shutdown') || lower.includes('quit')) {
    type = 'system';
  } else if (lower.startsWith('>') || lower.startsWith('command') || lower.includes('admin')) {
    type = 'command';
  }

  return {
    id: `${serverId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    text,
    timestamp: Date.now(),
    serverId,
  };
}

export function parsePlayerEvents(text: string, serverId: string): PlayerEvent[] {
  const events: PlayerEvent[] = [];
  const now = Date.now();

  for (const pattern of PLAYER_ENTERED_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      events.push({
        id: `${serverId}-${now}-join`,
        serverId,
        type: 'join',
        playerName: match[1].trim(),
        timestamp: now,
      });
      insertPlayerEvent(serverId, 'join', match[1].trim());
      break;
    }
  }

  for (const pattern of PLAYER_LEFT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      events.push({
        id: `${serverId}-${now}-leave`,
        serverId,
        type: 'leave',
        playerName: match[1].trim(),
        timestamp: now,
      });
      insertPlayerEvent(serverId, 'leave', match[1].trim());
      break;
    }
  }

  for (const pattern of KILL_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      events.push({
        id: `${serverId}-${now}-kill`,
        serverId,
        type: 'kill',
        playerName: match[1].trim(),
        targetName: match[2].trim(),
        timestamp: now,
        details: { weapon: match[3]?.trim() },
      });
      insertPlayerEvent(serverId, 'kill', match[1].trim(), match[2].trim());
      break;
    }
  }

  for (const pattern of KICK_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      events.push({
        id: `${serverId}-${now}-kick`,
        serverId,
        type: 'kick',
        playerName: match[1].trim(),
        timestamp: now,
        details: { by: match[2]?.trim(), reason: match[3]?.trim() },
      });
      insertPlayerEvent(serverId, 'kick', match[1].trim(), undefined, undefined, JSON.stringify({ by: match[2]?.trim(), reason: match[3]?.trim() }));
      break;
    }
  }

  for (const pattern of BAN_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      events.push({
        id: `${serverId}-${now}-ban`,
        serverId,
        type: 'ban',
        playerName: match[1].trim(),
        timestamp: now,
        details: { by: match[2]?.trim(), reason: match[3]?.trim() },
      });
      insertPlayerEvent(serverId, 'ban', match[1].trim(), undefined, undefined, JSON.stringify({ by: match[2]?.trim(), reason: match[3]?.trim() }));
      break;
    }
  }

  // Chat detection - be careful not to match everything
  if (text.includes(':') && !text.includes('http') && text.length < 200) {
    const chatMatch = text.match(/^\s*(.+?)\s*:\s*(.+)$/);
    if (chatMatch && !text.includes('error') && !text.includes('warning')) {
      events.push({
        id: `${serverId}-${now}-chat`,
        serverId,
        type: 'chat',
        playerName: chatMatch[1].trim(),
        message: chatMatch[2].trim(),
        timestamp: now,
      });
      insertPlayerEvent(serverId, 'chat', chatMatch[1].trim(), undefined, chatMatch[2].trim());
    }
  }

  return events;
}

export function updatePlayerState(players: Map<string, PlayerState>, events: PlayerEvent[]): void {
  for (const event of events) {
    switch (event.type) {
      case 'join':
        if (event.playerName) {
          players.set(event.playerName, {
            name: event.playerName,
            joinedAt: event.timestamp,
            isSilenced: false,
            isBanned: false,
          });
        }
        break;
      case 'leave':
      case 'kick':
        if (event.playerName) {
          players.delete(event.playerName);
        }
        break;
      case 'ban':
        if (event.playerName) {
          const player = players.get(event.playerName);
          if (player) {
            player.isBanned = true;
          }
          players.delete(event.playerName);
        }
        break;
      case 'silence':
        if (event.playerName) {
          const player = players.get(event.playerName);
          if (player) {
            player.isSilenced = true;
          }
        }
        break;
    }
  }
}
