/**
 * HelixLoop - Continuous helical refinement execution engine
 * Runs analyze → plan → execute → verify → review → rewrite cycles until convergence
 */

import {
  HelixConfig,
  HelixPhase,
  HelixPhaseResult,
  HelixIteration,
  HelixResult,
  createDefaultHelixConfig,
} from '../types';
import { MessageBus } from '../message-bus';
import { DaspController } from '../dasp';
import { GatekeeperCoordinator, MasterAgent } from '../agents/base-agents';
import { ToolBridge } from '../tool-bridge';
import {
  generateSessionId,
  checkConvergence,
  createKanbanBoard,
  addKanbanCard,
  updateCardStatus,
  exportKanbanToMarkdown,
  averageConvergenceScore,
} from '../utils';

export { runHelixLoop };

/**
 * Simple execution function that doesn't require a full MasterAgent
 */
async function runHelixLoop(
  goal: string,
  config?: Partial<HelixConfig>
): Promise<HelixResult> {
  const helix = new HelixLoop(config);
  return helix.run(goal);
}

/**
 * Phase executor function type
 */
type PhaseExecutor = (
  phase: HelixPhase,
  prompt: string,
  context: { goal: string; iteration: number; previousOutput?: string }
) => Promise<string>;

export class HelixLoop {
  private config: HelixConfig;
  private daspController: DaspController | null = null;
  private gatekeeper: GatekeeperCoordinator | null = null;
  private toolBridge: ToolBridge | null = null;
  private messageBus: MessageBus;
  private kanbanBoard: ReturnType<typeof createKanbanBoard> | null = null;
  private sessionId: string = '';
  private phaseOutputs: string[] = [];
  private gatekeeperSummary: Array<{
    iteration: number;
    phase: HelixPhase;
    approved: boolean;
  }> = [];

  constructor(
    config?: Partial<HelixConfig>,
    daspController?: DaspController,
    gatekeeper?: GatekeeperCoordinator
  ) {
    this.config = createDefaultHelixConfig(config);
    this.messageBus = new MessageBus();
    this.daspController = daspController || null;

    if (gatekeeper) {
      this.gatekeeper = gatekeeper;
    } else if (this.config.enabledGatekeeper) {
      this.toolBridge = new ToolBridge(this.messageBus);
      this.gatekeeper = new GatekeeperCoordinator(this.messageBus, this.toolBridge!, {
        strictMode: this.config.strictGatekeeper,
        maxRetries: this.config.maxGatekeeperRetries,
      });
    }

    if (this.config.enabledKanban) {
      this.kanbanBoard = createKanbanBoard(this.config.phases);
    }
  }

  /**
   * Run the helix loop for a given goal
   */
  async run(goal: string, executor?: PhaseExecutor): Promise<HelixResult> {
    this.sessionId = generateSessionId();
    this.phaseOutputs = [];
    this.gatekeeperSummary = [];

    const iterations: HelixIteration[] = [];
    let converged = false;

    // Use provided executor or default
    const phaseExecutor: PhaseExecutor =
      executor || this.defaultExecutor.bind(this);

    await this.messageBus.emit(
      'helix_start',
      { goal, sessionId: this.sessionId, config: this.config },
      'helix-loop'
    );

    for (let i = 0; i < this.config.maxIterations; i++) {
      const iteration = await this.runIteration(goal, i + 1, phaseExecutor);
      iterations.push(iteration);

      // Check convergence
      const rewritePhase = iteration.phases.find(
        (p) => p.phase === 'rewrite'
      );
      if (rewritePhase) {
        this.phaseOutputs.push(rewritePhase.output);
      }

      const convergenceResult = checkConvergence(
        this.phaseOutputs,
        this.config.convergenceThreshold
      );

      iteration.similarityScore = convergenceResult.score;
      iteration.converged = convergenceResult.converged;
      iteration.endTime = new Date();

      if (convergenceResult.converged) {
        converged = true;
        await this.messageBus.emit(
          'convergence',
          {
            iteration: i + 1,
            score: convergenceResult.score,
          },
          'helix-loop'
        );
        break;
      }
    }

    const result: HelixResult = {
      goal,
      iterations,
      converged,
      totalIterations: iterations.length,
      sessionId: this.sessionId,
      gatekeeperSummary: this.gatekeeperSummary,
      daspActive: this.config.enabledDasp,
      kanbanSnapshot: this.kanbanBoard
        ? exportKanbanToMarkdown(this.kanbanBoard)
        : '',
    };

    await this.messageBus.emit('helix_complete', result, 'helix-loop');

    return result;
  }

  /**
   * Run a single iteration through all phases
   */
  private async runIteration(
    goal: string,
    iterationNumber: number,
    executor: PhaseExecutor
  ): Promise<HelixIteration> {
    const iteration: HelixIteration = {
      iterationNumber,
      phases: [],
      converged: false,
      startTime: new Date(),
    };

    let previousOutput: string | undefined;

    for (const phase of this.config.phases) {
      const phaseResult = await this.runPhase(
        phase,
        goal,
        iterationNumber,
        previousOutput,
        executor
      );

      iteration.phases.push(phaseResult);
      previousOutput = phaseResult.output;

      // Track in kanban if enabled
      if (this.config.enabledKanban && this.kanbanBoard) {
        updateCardStatus(
          this.kanbanBoard,
          `card-${phase}-${iterationNumber}`,
          phaseResult.gatekeeperApproved ? 'completed' : 'blocked'
        );
      }

      // If strict gatekeeper and phase was rejected, stop iteration
      if (this.config.strictGatekeeper && !phaseResult.gatekeeperApproved) {
        break;
      }
    }

    return iteration;
  }

  /**
   * Run a single phase
   */
  private async runPhase(
    phase: HelixPhase,
    goal: string,
    iteration: number,
    previousOutput?: string,
    executor?: PhaseExecutor
  ): Promise<HelixPhaseResult> {
    const startTime = Date.now();

    // Add kanban card if enabled
    if (this.config.enabledKanban && this.kanbanBoard) {
      addKanbanCard(
        this.kanbanBoard,
        phase,
        `${phase.charAt(0).toUpperCase() + phase.slice(1)} - Iteration ${iteration}`,
        `Executing ${phase} phase for: ${goal}`
      );
    }

    // Build base prompt
    let prompt = this.buildPhasePrompt(phase, goal, previousOutput);

    // Enhance with DASP if enabled
    let daspEnhanced = false;
    if (this.config.enabledDasp && this.daspController) {
      const enhanced = await this.daspController.enhancePrompt(
        prompt,
        phase,
        goal
      );
      prompt = enhanced.enhancedPrompt;
      daspEnhanced = true;
    }

    // Execute the phase
    const output = executor
      ? await executor(phase, prompt, { goal, iteration, previousOutput })
      : await this.defaultExecutor(phase, prompt, { goal, iteration, previousOutput });

    // Gatekeeper review if enabled
    let gatekeeperApproved = true;
    let gatekeeperFeedback: string | undefined;

    if (this.config.enabledGatekeeper && this.gatekeeper) {
      const review = await this.gatekeeper.review(phase, output, {
        goal,
        previousOutput,
        iteration,
      });
      gatekeeperApproved = review.approved;
      gatekeeperFeedback = review.feedback;

      // Record feedback for DASP
      if (this.config.enabledDasp && this.daspController) {
        this.daspController.recordFeedback(phase, review);
      }

      this.gatekeeperSummary.push({
        iteration,
        phase,
        approved: gatekeeperApproved,
      });
    }

    const durationMs = Date.now() - startTime;

    // Send swarm mailbox notification if enabled
    if (this.config.enabledSwarmMailbox) {
      await this.messageBus.emit('mailbox', {
        type: 'phase_complete',
        phase,
        iteration,
        approved: gatekeeperApproved,
      }, 'helix-loop');
    }

    await this.messageBus.emit(
      'phase_complete',
      {
        phase,
        iteration,
        output: output.substring(0, 200) + (output.length > 200 ? '...' : ''),
        gatekeeperApproved,
        durationMs,
      },
      'helix-loop'
    );

    return {
      phase,
      output,
      timestamp: new Date(),
      gatekeeperApproved,
      gatekeeperFeedback,
      daspEnhanced,
      durationMs,
    };
  }

  /**
   * Default phase executor (simulation)
   */
  private async defaultExecutor(
    phase: HelixPhase,
    prompt: string,
    context: { goal: string; iteration: number; previousOutput?: string }
  ): Promise<string> {
    // If tool bridge is available, try to use simulators
    if (this.toolBridge) {
      const toolId = `simulate-${phase}`;
      if (this.toolBridge.hasTool(toolId)) {
        const result = await this.toolBridge.execute(toolId, {
          goal: context.goal,
          iteration: context.iteration,
          previousOutput: context.previousOutput,
        });
        if (result.success && result.result) {
          const output = (result.result as { output?: string }).output;
          if (output) return output;
        }
      }
    }

    // Return a simulation output based on phase
    const outputs: Record<HelixPhase, string> = {
      analyze: this.simulateAnalyze(context),
      plan: this.simulatePlan(context),
      execute: this.simulateExecute(context),
      verify: this.simulateVerify(context),
      review: this.simulateReview(context),
      rewrite: this.simulateRewrite(context),
    };

    return outputs[phase];
  }

  private simulateAnalyze(context: {
    goal: string;
    iteration: number;
  }): string {
    return `## Analysis Report (Iteration ${context.iteration})

### Problem Analysis
Goal: ${context.goal}

### Key Findings
1. Examined the core requirements and constraints
2. Identified critical dependencies
3. Mapped the solution space
4. Assessed potential risks and mitigations

### Constraints Identified
- Technical constraints evaluated
- Resource limitations considered
- Timeline requirements assessed

### Risk Assessment
- Low complexity areas identified
- Medium risk zones mapped
- High priority areas highlighted

### Recommendations
${context.iteration > 1 ? 'Building on previous analysis iteration.' : 'Initial analysis complete. Proceed to planning phase.'}`;
  }

  private simulatePlan(context: {
    goal: string;
    iteration: number;
    previousOutput?: string;
  }): string {
    return `## Implementation Plan (Iteration ${context.iteration})

### Goal
${context.goal}

### Implementation Steps
1. **Setup Phase** - Initialize environment and dependencies
2. **Core Implementation** - Develop main functionality
3. **Integration** - Connect components and systems
4. **Testing** - Validate implementation against requirements
5. **Documentation** - Record decisions and usage

### Success Criteria
- All requirements addressed
- Test coverage above threshold
- Documentation complete
- Performance metrics met

### Rollback Strategy
- Version control checkpoints at each phase
- Automated test suite for regression detection
- Manual verification gates

${context.iteration > 1 ? 'Plan refined based on previous iteration feedback.' : 'Initial plan generated.'}`;
  }

  private simulateExecute(context: {
    goal: string;
    iteration: number;
  }): string {
    return `## Execution Report (Iteration ${context.iteration})

### Goal Executed
${context.goal}

### Actions Taken
1. Initialized required components
2. Implemented core logic according to plan
3. Integrated with existing systems
4. Applied optimizations where identified
5. Handled edge cases appropriately

### Implementation Details
- Code structured for maintainability
- Error handling implemented
- Logging and monitoring integrated
- Configuration externalized

### Status
Execution phase completed successfully. Ready for verification.`;
  }

  private simulateVerify(context: {
    goal: string;
    iteration: number;
  }): string {
    return `## Verification Report (Iteration ${context.iteration})

### Verification Scope
${context.goal}

### Tests Executed
1. Unit tests: PASSED
2. Integration tests: PASSED
3. Edge case tests: PASSED
4. Performance tests: PASSED
5. Security validation: PASSED

### Validation Results
- All functional requirements verified
- Performance benchmarks met
- No critical issues found
- Documentation coverage adequate

### Gaps Identified
${context.iteration < 3 ? 'Minor improvements possible in error messaging.' : 'Implementation stable and meets requirements.'}

### Recommendation
Verification passed. Proceed to review phase.`;
  }

  private simulateReview(context: {
    goal: string;
    iteration: number;
    previousOutput?: string;
  }): string {
    const improvements =
      context.iteration > 1
        ? `\n### Improvements from Previous Iteration
- Applied gatekeeper feedback
- Refined implementation
- Enhanced documentation`
        : '';

    return `## Review Report (Iteration ${context.iteration})

### Overall Assessment
${context.goal}

### Strengths
1. Well-structured implementation
2. Comprehensive test coverage
3. Clear documentation
4. Appropriate error handling

### Areas for Improvement
${context.iteration < 3 ? '1. Consider additional optimization\n2. Expand edge case handling\n3. Enhance logging detail' : 'Implementation mature and production-ready'}
${improvements}

### Lessons Learned
- Importance of phased approach verified
- Gatekeeper feedback valuable for quality
- Convergence detection ensures completeness

### Final Recommendation
${context.iteration < 3 ? 'Consider rewrite phase for refinement.' : 'Ready for final delivery.'}`;
  }

  private simulateRewrite(context: {
    goal: string;
    iteration: number;
    previousOutput?: string;
  }): string {
    return `## Rewrite Report (Iteration ${context.iteration})

### Refinement Target
${context.goal}

### Changes Applied
1. Incorporated review feedback
2. Optimized identified inefficiencies
3. Enhanced error messages
4. Improved documentation clarity
5. Refined code structure

### Refinement Impact
${context.iteration < 3 ? 'Notable improvements achieved. May benefit from another iteration.' : 'Convergence achieved. Output stabilized.'}

### Convergence Indicators
${context.iteration < 3 ? '- Changes from previous iteration: significant\n- Quality improvement: measurable' : '- Changes from previous iteration: minimal\n- Output quality: stable'}

### Final Output
The rewritten implementation addresses all identified issues and represents ${context.iteration < 3 ? 'continued improvement' : 'converged quality'} from the helix refinement process.`;
  }

  private buildPhasePrompt(
    phase: HelixPhase,
    goal: string,
    previousOutput?: string
  ): string {
    const phaseDescriptions: Record<HelixPhase, string> = {
      analyze: 'Analyze the problem, identify constraints, dependencies, and risks.',
      plan: 'Create a structured implementation plan with clear steps.',
      execute: 'Implement the plan and document any deviations.',
      verify: 'Validate implementation against requirements.',
      review: 'Critically evaluate the execution and identify improvements.',
      rewrite: 'Refine the output based on review findings.',
    };

    let prompt = `Phase: ${phase.toUpperCase()}\n\nTask: ${phaseDescriptions[phase]}\n\nGoal: ${goal}`;

    if (previousOutput) {
      prompt += `\n\nPrevious Phase Output:\n${previousOutput.substring(0, 500)}...`;
    }

    return prompt;
  }

  /**
   * Get converged score
   */
  getConvergenceScore(): number {
    return averageConvergenceScore(
      this.phaseOutputs.map((_, i) => ({
        iterationNumber: i + 1,
        phases: [],
        converged: false,
        startTime: new Date(),
        similarityScore: i > 0 ? undefined : 0,
      })) as any
    );
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}
