/**
 * Tool Bridge - Integration layer between agents and execution tools
 * Provides a unified interface for tool invocation
 */

import { MessageBus } from './message-bus';

export interface Tool {
  id: string;
  name: string;
  description: string;
  execute: (params: unknown) => Promise<unknown>;
}

export interface ToolResult {
  toolId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
}

export interface ToolBridgeConfig {
  maxConcurrentExecutions: number;
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
}

const DEFAULT_CONFIG: ToolBridgeConfig = {
  maxConcurrentExecutions: 5,
  timeoutMs: 30000,
  retryCount: 2,
  retryDelayMs: 1000,
};

/**
 * OpenCode Tool Bridge - Implementation for code execution tools
 */
export class ToolBridge {
  private tools: Map<string, Tool> = new Map();
  private messageBus: MessageBus;
  private config: ToolBridgeConfig;
  private executionCount: number = 0;
  private activeExecutions: Set<string> = new Set();

  constructor(messageBus: MessageBus, config?: Partial<ToolBridgeConfig>) {
    this.messageBus = messageBus;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeDefaultTools();
  }

  /**
   * Register a tool
   */
  registerTool(tool: Tool): void {
    this.tools.set(tool.id, tool);
    this.messageBus.emit(
      'tool_registered',
      { toolId: tool.id, name: tool.name },
      'tool-bridge'
    );
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolId: string): boolean {
    const removed = this.tools.delete(toolId);
    if (removed) {
      this.messageBus.emit(
        'tool_unregistered',
        { toolId },
        'tool-bridge'
      );
    }
    return removed;
  }

  /**
   * Get all registered tools
   */
  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Check if a tool exists
   */
  hasTool(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  /**
   * Execute a tool with parameters
   */
  async execute(
    toolId: string,
    params: unknown,
    context?: { requestId?: string }
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return {
        toolId,
        success: false,
        error: `Tool not found: ${toolId}`,
        durationMs: 0,
      };
    }

    // Check concurrency limit
    if (this.activeExecutions.size >= this.config.maxConcurrentExecutions) {
      return {
        toolId,
        success: false,
        error: 'Maximum concurrent executions reached',
        durationMs: 0,
      };
    }

    const executionId = context?.requestId || `exec-${Date.now()}`;
    this.activeExecutions.add(executionId);
    this.executionCount++;

    const startTime = Date.now();
    let lastError: string | undefined;

    // Retry loop
    for (let attempt = 0; attempt <= this.config.retryCount; attempt++) {
      try {
        const result = await this.executeWithTimeout(
          tool,
          params,
          this.config.timeoutMs
        );

        const durationMs = Date.now() - startTime;
        this.activeExecutions.delete(executionId);

        await this.messageBus.emit(
          'tool_executed',
          { toolId, success: true, durationMs },
          'tool-bridge'
        );

        return {
          toolId,
          success: true,
          result,
          durationMs,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);

        if (attempt < this.config.retryCount) {
          await this.delay(this.config.retryDelayMs);
        }
      }
    }

    const durationMs = Date.now() - startTime;
    this.activeExecutions.delete(executionId);

    await this.messageBus.emit(
      'tool_failed',
      { toolId, error: lastError, durationMs },
      'tool-bridge'
    );

    return {
      toolId,
      success: false,
      error: lastError,
      durationMs,
    };
  }

  /**
   * Execute multiple tools in parallel
   */
  async executeParallel(
    requests: Array<{ toolId: string; params: unknown }>
  ): Promise<ToolResult[]> {
    const promises = requests.map((req) => this.execute(req.toolId, req.params));
    return Promise.all(promises);
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    totalExecutions: number;
    toolsRegistered: number;
    activeExecutions: number;
  } {
    return {
      totalExecutions: this.executionCount,
      toolsRegistered: this.tools.size,
      activeExecutions: this.activeExecutions.size,
    };
  }

  // Private methods

  private async executeWithTimeout(
    tool: Tool,
    params: unknown,
    timeoutMs: number
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Tool execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      tool.execute(params)
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private initializeDefaultTools(): void {
    // Register basic analysis tools
    this.registerTool({
      id: 'analyze-code',
      name: 'Code Analyzer',
      description: 'Analyzes code structure and patterns',
      execute: async (params: unknown) => {
        const { content } = params as { content: string };
        return {
          lines: content?.split('\n').length || 0,
          characters: content?.length || 0,
          analyzed: true,
        };
      },
    });

    this.registerTool({
      id: 'validate-output',
      name: 'Output Validator',
      description: 'Validates output against criteria',
      execute: async (params: unknown) => {
        const { output, criteria } = params as {
          output: string;
          criteria: string[];
        };
        const results = criteria.map((c) => ({
          criterion: c,
          passed: output.toLowerCase().includes(c.toLowerCase()),
        }));
        return {
          valid: results.every((r) => r.passed),
          results,
        };
      },
    });

    this.registerTool({
      id: 'transform-text',
      name: 'Text Transformer',
      description: 'Transforms text with various operations',
      execute: async (params: unknown) => {
        const { operation, text } = params as {
          operation: string;
          text: string;
        };
        switch (operation) {
          case 'uppercase':
            return { result: text.toUpperCase() };
          case 'lowercase':
            return { result: text.toLowerCase() };
          case 'trim':
            return { result: text.trim() };
          default:
            return { result: text };
        }
      },
    });

    this.registerTool({
      id: 'simulate-analyze',
      name: 'Analysis Simulator',
      description: 'Simulates the analyze phase',
      execute: async (params: unknown) => {
        const { goal } = params as { goal: string };
        return {
          phase: 'analyze',
          output: `Analysis of "${goal}":\n\nKey findings:\n1. Identified core components\n2. Mapped dependencies\n3. Assessed constraints\n\nNext steps: Proceed to planning phase.`,
          confidence: 0.85,
        };
      },
    });

    this.registerTool({
      id: 'simulate-plan',
      name: 'Planning Simulator',
      description: 'Simulates the plan phase',
      execute: async (params: unknown) => {
        const { goal, analysis } = params as {
          goal: string;
          analysis?: string;
        };
        return {
          phase: 'plan',
          output: `Implementation Plan for: "${goal}"\n\nStep 1: Setup and initialization\nStep 2: Core implementation\nStep 3: Integration\nStep 4: Testing and validation\nStep 5: Documentation\n\nSuccess criteria defined. Ready for execution.`,
        };
      },
    });
  }
}

/**
 * Create a tool bridge instance
 */
export function createToolBridge(
  messageBus: MessageBus,
  config?: Partial<ToolBridgeConfig>
): ToolBridge {
  return new ToolBridge(messageBus, config);
}
