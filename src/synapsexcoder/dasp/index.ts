/**
 * DaspController - Directive Augmentation and Strategy Prompt Controller
 * Enhances prompts with context from vault RAG and gatekeeper feedback
 */

import {
  HelixPhase,
  DaspContext,
  DaspEnhancedPrompt,
  GatekeeperReview,
} from './types';
import { MessageBus } from './message-bus';

export interface DaspConfig {
  enabled: boolean;
  vaultEnabled: boolean;
  historicalFeedbackLimit: number;
  maxEnhancementSources: number;
}

export interface VaultEntry {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  relevance: number;
}

const DEFAULT_DASP_CONFIG: DaspConfig = {
  enabled: true,
  vaultEnabled: true,
  historicalFeedbackLimit: 5,
  maxEnhancementSources: 3,
};

export class DaspController {
  private config: DaspConfig;
  private messageBus: MessageBus;
  private feedbackHistory: Map<HelixPhase, GatekeeperReview[]> = new Map();
  private vault: Map<string, VaultEntry> = new Map();

  constructor(
    config: Partial<DaspConfig> = {},
    messageBus?: MessageBus
  ) {
    this.config = { ...DEFAULT_DASP_CONFIG, ...config };
    this.messageBus = messageBus || new MessageBus();
    this.initializeVault();
  }

  /**
   * Enhance a prompt for a specific phase
   */
  async enhancePrompt(
    originalPrompt: string,
    phase: HelixPhase,
    goalContext: string
  ): Promise<DaspEnhancedPrompt> {
    if (!this.config.enabled) {
      return {
        originalPrompt,
        enhancedPrompt: originalPrompt,
        context: {
          currentPhase: phase,
          goalContext,
          historicalFeedback: [],
        },
        enhancementSources: [],
      };
    }

    const context = this.buildContext(phase, goalContext);
    const vaultResults = this.config.vaultEnabled
      ? await this.queryVault(goalContext)
      : [];

    const enhancements: string[] = [];

    // Add phase-specific directives
    const phaseDirective = this.getPhaseDirective(phase);
    if (phaseDirective) {
      enhancements.push(`[PHASE DIRECTIVE]: ${phaseDirective}`);
    }

    // Add relevant vault context
    for (const entry of vaultResults.slice(0, this.config.maxEnhancementSources)) {
      enhancements.push(`[VAULT CONTEXT]: ${entry.content}`);
    }

    // Add historical feedback
    const feedback = context.historicalFeedback;
    if (feedback.length > 0) {
      const feedbackSummary = feedback
        .map((f) => `- ${f}`)
        .join('\n');
      enhancements.push(`[HISTORICAL FEEDBACK]:\n${feedbackSummary}`);
    }

    // Build enhanced prompt
    const enhancedPrompt = this.buildEnhancedPrompt(
      originalPrompt,
      enhancements,
      phase,
      goalContext
    );

    return {
      originalPrompt,
      enhancedPrompt,
      context,
      enhancementSources: vaultResults.map((v) => v.id),
    };
  }

  /**
   * Record gatekeeper feedback for a phase
   */
  recordFeedback(phase: HelixPhase, review: GatekeeperReview): void {
    if (!this.feedbackHistory.has(phase)) {
      this.feedbackHistory.set(phase, []);
    }

    const history = this.feedbackHistory.get(phase)!;
    history.push(review);

    // Limit history size
    if (history.length > this.config.historicalFeedbackLimit) {
      history.shift();
    }

    this.feedbackHistory.set(phase, history);
  }

  /**
   * Get feedback history for a phase
   */
  getFeedbackHistory(phase: HelixPhase): GatekeeperReview[] {
    return this.feedbackHistory.get(phase) || [];
  }

  /**
   * Add entry to vault
   */
  addToVault(id: string, content: string, metadata?: Record<string, unknown>): void {
    this.vault.set(id, {
      id,
      content,
      metadata: metadata || {},
      relevance: 1,
    });
  }

  /**
   * Clear all vault entries
   */
  clearVault(): void {
    this.vault.clear();
  }

  /**
   * Get vault statistics
   */
  getVaultStats(): { totalEntries: number; categories: Set<string> } {
    const categories = new Set<string>();
    for (const entry of this.vault.values()) {
      if (entry.metadata.category) {
        categories.add(entry.metadata.category as string);
      }
    }
    return {
      totalEntries: this.vault.size,
      categories,
    };
  }

  // Private methods

  private buildContext(phase: HelixPhase, goalContext: string): DaspContext {
    const history = this.feedbackHistory.get(phase) || [];
    const recentFeedback = history
      .slice(-this.config.historicalFeedbackLimit)
      .map((r) => r.feedback);

    return {
      currentPhase: phase,
      goalContext,
      historicalFeedback: recentFeedback,
    };
  }

  private async queryVault(query: string): Promise<VaultEntry[]> {
    const results: VaultEntry[] = [];

    for (const entry of this.vault.values()) {
      const relevance = this.calculateRelevance(query, entry.content);
      if (relevance > 0.3) {
        results.push({ ...entry, relevance });
      }
    }

    results.sort((a, b) => b.relevance - a.relevance);

    return results;
  }

  private calculateRelevance(query: string, content: string): number {
    const queryWords = new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );

    const contentWords = new Set(
      content
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );

    if (queryWords.size === 0 || contentWords.size === 0) {
      return 0;
    }

    const intersection = new Set([...queryWords].filter((w) => contentWords.has(w)));
    return intersection.size / Math.sqrt(queryWords.size * contentWords.size);
  }

  private getPhaseDirective(phase: HelixPhase): string {
    const directives: Record<HelixPhase, string> = {
      analyze:
        'Thoroughly examine the problem space. Identify constraints, dependencies, and potential risks. Document assumptions explicitly.',
      plan:
        'Create a structured implementation plan with clear steps. Include rollback strategies and success criteria.',
      execute:
        'Implement the plan with precision. Handle edge cases and error conditions appropriately. Document any deviations from the plan.',
      verify:
        'Validate the implementation against requirements. Check for correctness, completeness, and performance. Identify any gaps.',
      review:
        'Critically evaluate the entire execution. Identify what went well and what could be improved. Document lessons learned.',
      rewrite:
        'Refine the output based on review findings. Apply improvements systematically. Ensure convergence toward quality.',
    };

    return directives[phase];
  }

  private buildEnhancedPrompt(
    original: string,
    enhancements: string[],
    phase: HelixPhase,
    goalContext: string
  ): string {
    const lines: string[] = [
      `# SynapeXHelix ${phase.toUpperCase()} Phase`,
      '',
      `## Goal`,
      goalContext,
      '',
      `## Primary Task`,
      original,
    ];

    if (enhancements.length > 0) {
      lines.push('');
      lines.push('## Contextual Enhancements');
      lines.push('');
      lines.push(...enhancements.map((e) => `${e}\n`));
    }

    lines.push('');
    lines.push('---');
    lines.push(`_Phase: ${phase} | Enhanced by DASP Controller_`);

    return lines.join('\n');
  }

  private initializeVault(): void {
    // Initialize with some default helpful patterns
    this.addToVault('pattern-convergence', 'Convergence is detected when outputs stabilize above the similarity threshold. Focus on incremental improvements.', {
      category: 'patterns',
      type: 'convergence',
    });

    this.addToVault('pattern-gatekeeper', 'Gatekeeper reviews ensure quality by checking outputs against criteria. Address feedback promptly.', {
      category: 'patterns',
      type: 'quality',
    });

    this.addToVault('pattern-iteration', 'Each iteration should build upon previous findings. Avoid repeating the same mistakes.', {
      category: 'patterns',
      type: 'iteration',
    });
  }
}

// Export a factory function
export function createDaspController(
  config?: Partial<DaspConfig>,
  messageBus?: MessageBus
): DaspController {
  return new DaspController(config, messageBus);
}
