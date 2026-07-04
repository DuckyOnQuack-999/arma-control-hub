/**
 * Base Agents - MasterAgent and GatekeeperCoordinator
 * Foundation agents for the SynapeXHelix system
 */

import {
  HelixPhase,
  GatekeeperReview,
  AgentType,
  HelixPhaseResult,
} from './types';
import { MessageBus, Message } from './message-bus';
import { ToolBridge } from './tool-bridge';

export interface AgentConfig {
  id: string;
  type: AgentType;
  name: string;
  capabilities: string[];
}

export interface BaseAgent {
  config: AgentConfig;
  messageBus: MessageBus;
  process(input: unknown): Promise<unknown>;
}

/**
 * GatekeeperCoordinator - Reviews phase outputs for quality
 */
export class GatekeeperCoordinator {
  private messageBus: MessageBus;
  private toolBridge: ToolBridge | null;
  private reviewHistory: Map<string, GatekeeperReview[]> = new Map();
  private strictMode: boolean = false;
  private maxRetries: number = 2;

  constructor(
    messageBus: MessageBus,
    toolBridge?: ToolBridge,
    config?: { strictMode?: boolean; maxRetries?: number }
  ) {
    this.messageBus = messageBus;
    this.toolBridge = toolBridge || null;
    if (config) {
      this.strictMode = config.strictMode || false;
      this.maxRetries = config.maxRetries || 2;
    }

    this.subscribeToMessages();
  }

  /**
   * Review a phase output
   */
  async review(
    phase: HelixPhase,
    output: string,
    context: {
      goal: string;
      previousOutput?: string;
      iteration: number;
    }
  ): Promise<GatekeeperReview> {
    const review = await this.performReview(phase, output, context);

    // Record in history
    const key = `${phase}-${context.iteration}`;
    if (!this.reviewHistory.has(key)) {
      this.reviewHistory.set(key, []);
    }
    this.reviewHistory.get(key)!.push(review);

    // Emit review message
    await this.messageBus.emit('gatekeeper_review', review, 'gatekeeper');

    return review;
  }

  /**
   * Review with retry logic
   */
  async reviewWithRetry(
    phase: HelixPhase,
    output: string,
    context: {
      goal: string;
      previousOutput?: string;
      iteration: number;
    },
    onRetry?: (attempt: number, feedback: string) => Promise<string>
  ): Promise<{ approved: boolean; output: string; reviews: GatekeeperReview[] }> {
    const reviews: GatekeeperReview[] = [];
    let currentOutput = output;
    let approved = false;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const review = await this.review(phase, currentOutput, context);
      reviews.push(review);

      if (review.approved) {
        approved = true;
        break;
      }

      // Try to get a revised output
      if (attempt < this.maxRetries && onRetry) {
        currentOutput = await onRetry(attempt + 1, review.feedback);
      } else if (this.strictMode) {
        // In strict mode, rejections stop the process
        break;
      }
    }

    return { approved, output: currentOutput, reviews };
  }

  /**
   * Get review statistics
   */
  getStats(): {
    totalReviews: number;
    approvalRate: number;
    phaseBreakdown: Record<HelixPhase, { total: number; approved: number }>;
  } {
    let totalReviews = 0;
    let approvedCount = 0;
    const phaseBreakdown: Record<string, { total: number; approved: number }> = {};

    for (const [key, reviews] of this.reviewHistory) {
      const phase = key.split('-')[0] as HelixPhase;
      if (!phaseBreakdown[phase]) {
        phaseBreakdown[phase] = { total: 0, approved: 0 };
      }

      for (const review of reviews) {
        totalReviews++;
        phaseBreakdown[phase].total++;
        if (review.approved) {
          approvedCount++;
          phaseBreakdown[phase].approved++;
        }
      }
    }

    return {
      totalReviews,
      approvalRate: totalReviews > 0 ? approvedCount / totalReviews : 0,
      phaseBreakdown: phaseBreakdown as Record<HelixPhase, { total: number; approved: number }>,
    };
  }

  /**
   * Clear review history
   */
  clearHistory(): void {
    this.reviewHistory.clear();
  }

  // Private methods

  private async performReview(
    phase: HelixPhase,
    output: string,
    context: {
      goal: string;
      previousOutput?: string;
      iteration: number;
    }
  ): Promise<GatekeeperReview> {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    // Phase-specific criteria
    const criteria = this.getPhaseCriteria(phase);

    // Check minimum output length
    const minOutputLength = criteria.minOutputLength || 50;
    if (output.length < minOutputLength) {
      issues.push(`Output too short (${output.length} chars, minimum ${minOutputLength})`);
      score -= 20;
    }

    // Check for required keywords
    for (const keyword of criteria.requiredKeywords || []) {
      if (!output.toLowerCase().includes(keyword.toLowerCase())) {
        issues.push(`Missing required keyword: "${keyword}"`);
        score -= 10;
      }
    }

    // Check for forbidden patterns
    for (const pattern of criteria.forbiddenPatterns || []) {
      if (new RegExp(pattern, 'i').test(output)) {
        issues.push(`Contains forbidden pattern: ${pattern}`);
        score -= 15;
      }
    }

    // Check goal alignment
    const goalWords = context.goal.toLowerCase().split(/\s+/);
    const outputLower = output.toLowerCase();
    const goalWordMatches = goalWords.filter(
      (w) => w.length > 3 && outputLower.includes(w)
    ).length;
    const goalAlignment = goalWords.length > 0 ? goalWordMatches / goalWords.length : 0;

    if (goalAlignment < 0.3) {
      issues.push('Output does not align well with the stated goal');
      score -= 10;
    }

    // Add positive score for quality indicators
    if (criteria.qualityIndicators) {
      for (const indicator of criteria.qualityIndicators) {
        if (outputLower.includes(indicator.toLowerCase())) {
          score += 5;
        }
      }
    }

    // Cap score
    score = Math.max(0, Math.min(100, score));

    // Generate suggestions
    if (issues.length > 0) {
      suggestions.push('Address the identified issues before proceeding.');
    }
    if (score < 70) {
      suggestions.push('Consider revising the output with more detail and structure.');
    }
    if (context.iteration > 1 && context.previousOutput) {
      suggestions.push('Ensure this iteration represents improvement over the previous.');
    }

    const approved = score >= 70 && issues.length === 0;

    const feedback = approved
      ? `Output approved for ${phase} phase. Score: ${score}/100. ${
          suggestions.length > 0 ? 'Suggestions: ' + suggestions.join(' ') : ''
        }`
      : `Output not approved for ${phase} phase. Score: ${score}/100. Issues: ${issues.join(
          '; '
        )}. ${suggestions.length > 0 ? 'Suggestions: ' + suggestions.join(' ') : ''}`;

    return {
      approved,
      feedback,
      score,
      issues,
      suggestions,
    };
  }

  private getPhaseCriteria(phase: HelixPhase): {
    minOutputLength?: number;
    requiredKeywords?: string[];
    forbiddenPatterns?: string[];
    qualityIndicators?: string[];
  } {
    const criteria: Record<HelixPhase, {
      minOutputLength?: number;
      requiredKeywords?: string[];
      forbiddenPatterns?: string[];
      qualityIndicators?: string[];
    }> = {
      analyze: {
        minOutputLength: 100,
        requiredKeywords: ['analysis', 'findings', 'constraints'],
        qualityIndicators: ['identified', 'examined', 'determined'],
      },
      plan: {
        minOutputLength: 150,
        requiredKeywords: ['step', 'implementation', 'success'],
        qualityIndicators: ['structured', 'sequenced', 'planned'],
      },
      execute: {
        minOutputLength: 50,
        requiredKeywords: ['implemented', 'completed'],
        forbiddenPatterns: ['TODO', 'FIXME', 'placeholder'],
        qualityIndicators: ['executed', 'applied', 'created'],
      },
      verify: {
        minOutputLength: 100,
        requiredKeywords: ['verified', 'validation', 'passed'],
        qualityIndicators: ['tested', 'confirmed', 'validated'],
      },
      review: {
        minOutputLength: 100,
        requiredKeywords: ['review', 'evaluation', 'findings'],
        qualityIndicators: ['assessed', 'evaluated', 'reviewed'],
      },
      rewrite: {
        minOutputLength: 50,
        qualityIndicators: ['improved', 'refined', 'updated'],
      },
    };

    return criteria[phase];
  }

  private subscribeToMessages(): void {
    this.messageBus.subscribe('phase_complete', async (message: Message) => {
      const payload = message.payload as {
        phase: HelixPhase;
        output: string;
        goal?: string;
        iteration?: number;
      };

      if (payload) {
        await this.review(payload.phase, payload.output, {
          goal: payload.goal || 'Unknown goal',
          iteration: payload.iteration || 1,
        });
      }
    });
  }
}

/**
 * MasterAgent - Orchestrates the helix loop execution
 */
export class MasterAgent {
  public config: AgentConfig;
  public messageBus: MessageBus;
  private capabilities: Set<string>;

  constructor(
    config?: Partial<AgentConfig>,
    messageBus?: MessageBus
  ) {
    this.config = {
      id: config?.id || `master-${Date.now()}`,
      type: 'master',
      name: config?.name || 'Master Agent',
      capabilities: config?.capabilities || ['coordinate', 'analyze', 'execute'],
    };
    this.messageBus = messageBus || new MessageBus();
    this.capabilities = new Set(this.config.capabilities);
  }

  hasCapability(capability: string): boolean {
    return this.capabilities.has(capability);
  }

  async process(input: unknown): Promise<unknown> {
    await this.messageBus.emit(
      'agent_process',
      { agentId: this.config.id, input },
      this.config.id
    );

    return {
      agentId: this.config.id,
      result: 'processed',
      timestamp: new Date(),
    };
  }

  async delegate(
    task: string,
    targetAgentType: AgentType
  ): Promise<{ delegated: boolean; taskId: string }> {
    const taskId = `task-${Date.now()}`;

    await this.messageBus.emit('delegate', {
      taskId,
      task,
      from: this.config.id,
      to: targetAgentType,
    }, this.config.id);

    return { delegated: true, taskId };
  }

  async report(
    phase: HelixPhase,
    status: 'started' | 'completed' | 'failed',
    details?: unknown
  ): Promise<void> {
    await this.messageBus.emit('agent_report', {
      agentId: this.config.id,
      phase,
      status,
      details,
      timestamp: new Date(),
    }, this.config.id);
  }
}

/**
 * Create a master agent instance
 */
export function createMasterAgent(
  config?: Partial<AgentConfig>,
  messageBus?: MessageBus
): MasterAgent {
  return new MasterAgent(config, messageBus);
}

/**
 * Create a gatekeeper coordinator instance
 */
export function createGatekeeper(
  messageBus: MessageBus,
  toolBridge?: ToolBridge,
  config?: { strictMode?: boolean; maxRetries?: number }
): GatekeeperCoordinator {
  return new GatekeeperCoordinator(messageBus, toolBridge, config);
}
