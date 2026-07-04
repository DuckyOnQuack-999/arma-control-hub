/**
 * SynapeXHelix Utility Functions
 */

import {
  HelixPhase,
  KanbanBoard,
  KanbanCard,
  HelixPhaseResult,
  HelixIteration,
} from './types';

/**
 * Calculate Jaccard similarity between two strings using word sets
 * Jaccard Index = |A ∩ B| / |A ∪ B|
 */
export function jaccardSimilarity(text1: string, text2: string): number {
  const words1 = new Set(
    text1
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  const words2 = new Set(
    text2
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );

  if (words1.size === 0 && words2.size === 0) {
    return 1.0;
  }

  if (words1.size === 0 || words2.size === 0) {
    return 0.0;
  }

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Calculate cosine similarity between two text strings
 */
export function cosineSimilarity(text1: string, text2: string): number {
  const tf1 = getTermFrequency(text1);
  const tf2 = getTermFrequency(text2);

  const allTerms = new Set([...tf1.keys(), ...tf2.keys()]);
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (const term of allTerms) {
    const v1 = tf1.get(term) || 0;
    const v2 = tf2.get(term) || 0;
    dotProduct += v1 * v2;
    magnitude1 += v1 * v1;
    magnitude2 += v2 * v2;
  }

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
}

function getTermFrequency(text: string): Map<string, number> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const tf = new Map<string, number>();
  for (const word of words) {
    tf.set(word, (tf.get(word) || 0) + 1);
  }

  for (const [word, count] of tf) {
    tf.set(word, count / words.length);
  }

  return tf;
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `helix_${timestamp}_${random}`;
}

/**
 * Generate a unique ID for cards, messages, etc.
 */
export function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Check if convergence has been reached based on recent outputs
 */
export function checkConvergence(
  outputs: string[],
  threshold: number
): { converged: boolean; score: number } {
  if (outputs.length < 2) {
    return { converged: false, score: 0 };
  }

  const recent = outputs[outputs.length - 1];
  const previous = outputs[outputs.length - 2];

  const score = jaccardSimilarity(recent, previous);

  return {
    converged: score >= threshold,
    score,
  };
}

/**
 * Calculate average convergence over multiple iterations
 */
export function averageConvergenceScore(
  iterationHistory: HelixIteration[]
): number {
  if (iterationHistory.length < 2) {
    return 0;
  }

  const scores = iterationHistory
    .filter((iter) => iter.similarityScore !== undefined)
    .map((iter) => iter.similarityScore!);

  if (scores.length === 0) {
    return 0;
  }

  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Create a new Kanban board with empty columns
 */
export function createKanbanBoard(phases: HelixPhase[]): KanbanBoard {
  const columns: Record<string, KanbanCard[]> = {};
  for (const phase of phases) {
    columns[phase] = [];
  }
  return {
    columns: columns as Record<HelixPhase, KanbanCard[]>,
    lastUpdated: new Date(),
  };
}

/**
 * Add a card to the Kanban board
 */
export function addKanbanCard(
  board: KanbanBoard,
  phase: HelixPhase,
  title: string,
  description: string
): KanbanCard {
  const card: KanbanCard = {
    id: generateId('card'),
    phase,
    status: 'pending',
    title,
    description,
  };

  board.columns[phase].push(card);
  board.lastUpdated = new Date();

  return card;
}

/**
 * Update a Kanban card status
 */
export function updateCardStatus(
  board: KanbanBoard,
  cardId: string,
  status: KanbanCard['status'],
  blockedReason?: string
): KanbanCard | null {
  for (const phase of Object.keys(board.columns) as HelixPhase[]) {
    const card = board.columns[phase].find((c) => c.id === cardId);
    if (card) {
      card.status = status;
      if (status === 'in_progress') {
        card.startedAt = new Date();
      } else if (status === 'completed') {
        card.completedAt = new Date();
      }
      if (status === 'blocked' && blockedReason) {
        card.blockedReason = blockedReason;
      }
      board.lastUpdated = new Date();
      return card;
    }
  }
  return null;
}

/**
 * Export Kanban board to Markdown format
 */
export function exportKanbanToMarkdown(board: KanbanBoard): string {
  const lines: string[] = ['# SynapeXHelix Kanban Board', ''];
  lines.push(`_Last Updated: ${board.lastUpdated.toISOString()}_`);
  lines.push('');

  const statusIcons: Record<string, string> = {
    pending: '⏳',
    in_progress: '🔄',
    completed: '✅',
    blocked: '🚫',
  };

  for (const [, phase] of Object.entries(board.columns)) {
    lines.push(`## ${phase.toUpperCase()}`);
    lines.push('');

    if (phase.length === 0) {
      lines.push('_No cards_');
      lines.push('');
      continue;
    }

    for (const card of phase) {
      const icon = statusIcons[card.status] || '❓';
      lines.push(`### ${icon} ${card.title}`);
      lines.push('');
      lines.push(`**Status:** ${card.status}`);
      lines.push(`**Description:** ${card.description}`);
      if (card.startedAt) {
        lines.push(`**Started:** ${card.startedAt.toISOString()}`);
      }
      if (card.completedAt) {
        lines.push(`**Completed:** ${card.completedAt.toISOString()}`);
      }
      if (card.blockedReason) {
        lines.push(`**Blocked Reason:** ${card.blockedReason}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Serialize phase result for logging
 */
export function serializePhaseResult(result: HelixPhaseResult): string {
  return JSON.stringify({
    phase: result.phase,
    outputLength: result.output.length,
    gatekeeperApproved: result.gatekeeperApproved,
    daspEnhanced: result.daspEnhanced,
    durationMs: result.durationMs,
    timestamp: result.timestamp.toISOString(),
  });
}
