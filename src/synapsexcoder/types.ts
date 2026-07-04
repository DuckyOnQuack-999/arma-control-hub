/**
 * SynapeXHelix Core Types
 * Helical refinement loop system for continuous improvement
 */

export type HelixPhase =
  | 'analyze'
  | 'plan'
  | 'execute'
  | 'verify'
  | 'review'
  | 'rewrite';

export type AgentType = 'master' | 'worker' | 'reviewer' | 'gatekeeper';

export type ProcessingMode =
  | 'full_pipeline'
  | 'analyze_only'
  | 'plan_execute'
  | 'verify_review';

export interface HelixConfig {
  maxIterations: number;
  convergenceThreshold: number;
  phases: HelixPhase[];
  enabledDasp: boolean;
  enabledGatekeeper: boolean;
  enabledKanban: boolean;
  enabledSwarmMailbox: boolean;
  agentType: AgentType;
  processingMode: ProcessingMode;
  maxGatekeeperRetries: number;
  strictGatekeeper: boolean;
}

export interface HelixPhaseResult {
  phase: HelixPhase;
  output: string;
  timestamp: Date;
  gatekeeperApproved: boolean;
  gatekeeperFeedback?: string;
  daspEnhanced: boolean;
  durationMs: number;
}

export interface HelixIteration {
  iterationNumber: number;
  phases: HelixPhaseResult[];
  converged: boolean;
  similarityScore?: number;
  startTime: Date;
  endTime?: Date;
}

export interface HelixResult {
  goal: string;
  iterations: HelixIteration[];
  converged: boolean;
  totalIterations: number;
  sessionId: string;
  gatekeeperSummary: Array<{
    iteration: number;
    phase: HelixPhase;
    approved: boolean;
  }>;
  daspActive: boolean;
  kanbanSnapshot: string;
}

export interface GatekeeperReview {
  approved: boolean;
  feedback: string;
  score: number;
  issues: string[];
  suggestions: string[];
}

export interface DaspContext {
  vaultQuery?: string;
  historicalFeedback: string[];
  currentPhase: HelixPhase;
  goalContext: string;
}

export interface DaspEnhancedPrompt {
  originalPrompt: string;
  enhancedPrompt: string;
  context: DaspContext;
  enhancementSources: string[];
}

export interface Message {
  id: string;
  type: 'phase_complete' | 'gatekeeper_review' | 'convergence' | 'error' | 'mailbox';
  payload: unknown;
  timestamp: Date;
  source: string;
  target?: string;
}

export interface MessageHandler {
  (message: Message): void | Promise<void>;
}

export interface KanbanCard {
  id: string;
  phase: HelixPhase;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  title: string;
  description: string;
  assignee?: AgentType;
  startedAt?: Date;
  completedAt?: Date;
  blockedReason?: string;
}

export interface KanbanBoard {
  columns: Record<HelixPhase, KanbanCard[]>;
  lastUpdated: Date;
}

export const DEFAULT_HELIX_CONFIG: HelixConfig = {
  maxIterations: 5,
  convergenceThreshold: 0.9,
  phases: ['analyze', 'plan', 'execute', 'verify', 'review', 'rewrite'],
  enabledDasp: true,
  enabledGatekeeper: true,
  enabledKanban: false,
  enabledSwarmMailbox: false,
  agentType: 'master',
  processingMode: 'full_pipeline',
  maxGatekeeperRetries: 2,
  strictGatekeeper: false,
};

export function createDefaultHelixConfig(
  overrides?: Partial<HelixConfig>
): HelixConfig {
  return { ...DEFAULT_HELIX_CONFIG, ...overrides };
}
