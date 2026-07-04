# SynapeXHelix Skill

> Continuous helical refinement: analyze → plan → execute → verify → review → rewrite until convergence.

## Usage

```
/SynapeXHelix <goal description>
```

## Description

The SynapeXHelix skill executes a quality-driven iterative process that refines outputs through multiple phases until convergence is detected. Each phase is enhanced by DASP (Directive Augmentation and Strategy Prompt) and reviewed by a Gatekeeper for quality assurance.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  HelixLoop (maxIterations=5)                        │
│                                                     │
│  Iteration N:                                       │
│    [Analyze] ──DASP──> [Plan] ──DASP──> [Execute]  │
│       │                    │            │           │
│       └── GK review ───────┴── GK rev. ─┘           │
│                         │                           │
│                    [Verify] ──DASP──> [Review]      │
│                         │               │          │
│                    [Rewrite] ◄── GK rev. ┘          │
│                         │                           │
│                   Converged? ──no──> Iteration N+1  │
│                         │                           │
│                       yes                           │
│                         │                           │
│                      Done ──────> HelixResult       │
└─────────────────────────────────────────────────────┘
```

## Phase Descriptions

| Phase | Purpose |
|-------|---------|
| **Analyze** | Examine problem space, identify constraints, dependencies, and risks |
| **Plan** | Create structured implementation plan with steps and success criteria |
| **Execute** | Implement the plan, handle edge cases, document deviations |
| **Verify** | Validate against requirements, check correctness and completeness |
| **Review** | Critically evaluate execution, identify improvements and lessons learned |
| **Rewrite** | Refine output based on review findings, ensure convergence toward quality |

## Configuration Options

```typescript
interface HelixConfig {
  maxIterations: number;          // default: 5
  convergenceThreshold: number;   // default: 0.9 (Jaccard similarity)
  phases: HelixPhase[];           // default: [analyze, plan, execute, verify, review, rewrite]
  enabledDasp: boolean;           // default: true
  enabledGatekeeper: boolean;     // default: true
  enabledKanban: boolean;         // default: false
  enabledSwarmMailbox: boolean;   // default: false
  agentType: AgentType;           // default: "master"
  processingMode: ProcessingMode; // default: "full_pipeline"
  maxGatekeeperRetries: number;   // default: 2
  strictGatekeeper: boolean;      // default: false (break on rejection)
}
```

## Implementation Files

- `src/synapsexcoder/types.ts` - Core TypeScript interfaces and types
- `src/synapsexcoder/message-bus.ts` - Inter-agent communication system
- `src/synapsexcoder/utils.ts` - Jaccard similarity, Kanban utilities
- `src/synapsexcoder/dasp/index.ts` - DASP prompt enhancement controller
- `src/synapsexcoder/agents/base-agents.ts` - MasterAgent, GatekeeperCoordinator
- `src/synapsexcoder/tool-bridge.ts` - Tool integration layer
- `src/synapsexcoder/execution-loops/helix-loop.ts` - Main execution engine
- `src/synapsexcoder/index.ts` - Public exports

## Programmatic Usage

```typescript
import { runHelixLoop, HelixLoop, DaspController, GatekeeperCoordinator, MessageBus, ToolBridge } from './synapsexcoder';

// Simple usage
const result = await runHelixLoop('Refactor auth module');
console.log(result.converged, result.totalIterations);

// With custom configuration
const result = await runHelixLoop('Add rate limiting middleware', {
  maxIterations: 3,
  convergenceThreshold: 0.85,
  enabledKanban: true,
  strictGatekeeper: true,
});

// With custom integrations
const bus = new MessageBus();
const bridge = new ToolBridge(bus);
const dasp = new DaspController({ enabled: true }, bus);
const gatekeeper = new GatekeeperCoordinator(bus, bridge, { strictMode: true });

const helix = new HelixLoop(
  { maxIterations: 3, enabledKanban: true },
  dasp,
  gatekeeper
);

const result = await helix.run('Implement caching layer');
```

## Output Structure

```typescript
interface HelixResult {
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
```

## Key Features

1. **DASP Enhancement** - Each phase prompt is enhanced via DaspController (vault RAG + gatekeeper feedback)
2. **Gatekeeper Review** - Optional GatekeeperCoordinator reviews each phase output; retries up to `maxGatekeeperRetries` times
3. **Convergence Detection** - Jaccard word-set similarity between consecutive outputs; configurable threshold
4. **Kanban Tracking** - Optional visual Kanban board cards for phase tracking
5. **Swarm Mailbox** - Optional inter-agent mailbox notifications on phase completions

## Behavior

1. When invoked with a goal, the skill starts the helix loop
2. Each iteration runs through all configured phases in sequence
3. Phase outputs are reviewed by the gatekeeper (if enabled)
4. Convergence is checked after each rewrite phase
5. Process continues until converged or max iterations reached
6. Returns complete result with all iteration history

## Examples

```bash
/SynapeXHelix Refactor the authentication module for better security
/SynapeXHelix Optimize database query performance
/SynapeXHelix Add comprehensive error handling to the API layer
```

## Planned Enhancements

1. Parallel phase execution across iterations
2. Adaptive convergence threshold based on historical similarity trends
3. External callback hooks for custom validation
4. Persistent Kanban board export to Markdown
5. Integration with real LLM providers for live execution
