/**
 * SynapeXHelix - Continuous Helical Refinement Loop System
 *
 * A quality-driven execution system that runs analyze → plan → execute → verify → review → rewrite
 * cycles until convergence is detected.
 *
 * @module synapsexcoder
 */

// Core Types
export {
  type HelixPhase,
  type HelixConfig,
  type HelixPhaseResult,
  type HelixIteration,
  type HelixResult,
  type GatekeeperReview,
  type DaspContext,
  type DaspEnhancedPrompt,
  type Message,
  type MessageHandler,
  type KanbanCard,
  type KanbanBoard,
  type AgentType,
  type ProcessingMode,
  DEFAULT_HELIX_CONFIG,
  createDefaultHelixConfig,
} from './types';

// Message Bus
export {
  MessageBus,
  getMessageBus,
  resetMessageBus,
} from './message-bus';

// Utilities
export {
  jaccardSimilarity,
  cosineSimilarity,
  generateSessionId,
  generateId,
  checkConvergence,
  averageConvergenceScore,
  createKanbanBoard,
  addKanbanCard,
  updateCardStatus,
  exportKanbanToMarkdown,
  formatDuration,
  serializePhaseResult,
} from './utils';

// DASP Controller
export {
  DaspController,
  createDaspController,
  type DaspConfig,
  type VaultEntry,
} from './dasp';

// Agents
export {
  GatekeeperCoordinator,
  MasterAgent,
  createMasterAgent,
  createGatekeeper,
  type AgentConfig,
  type BaseAgent,
} from './agents/base-agents';

// Tool Bridge
export {
  ToolBridge,
  createToolBridge,
  type Tool,
  type ToolResult,
  type ToolBridgeConfig,
} from './tool-bridge';

// Helix Loop
export {
  HelixLoop,
  runHelixLoop,
} from './execution-loops/helix-loop';

/**
 * Quick start function for running a helix loop
 *
 * @example
 * ```typescript
 * import { helix } from './synapsexcoder';
 *
 * const result = await helix('Refactor authentication module');
 * console.log(result.converged, result.totalIterations);
 * ```
 */
export async function helix(
  goal: string,
  options?: Partial<import('./types').HelixConfig>
): Promise<import('./types').HelixResult> {
  const { runHelixLoop } = await import('./execution-loops/helix-loop');
  return runHelixLoop(goal, options);
}
