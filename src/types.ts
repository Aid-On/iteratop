/**
 * IteratoP - Type Definitions
 *
 * Iteration Processor for convergent loops.
 * Inspired by Scrum iterations and OODA loops.
 */

/**
 * Evaluation result from assessing current state
 * (Similar to Sprint Review in Scrum)
 */
export interface Evaluation {
  /** Convergence score 0-100 */
  score: number;
  /** Whether to continue iterating */
  shouldContinue: boolean;
  /** Feedback for next iteration (like Sprint Retrospective insights) */
  feedback: string;
  /** Missing information to gather in next iteration */
  missingInfo?: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result from executing an action
 * (Similar to Sprint deliverables)
 */
export interface ActionResult<T> {
  /** Data obtained from the action */
  data: T;
  /** Optional metadata about the action */
  metadata?: {
    /** Information sources used */
    sources?: string[];
    /** Cost incurred (API calls, tokens, etc.) */
    cost?: number;
    /** Time taken in milliseconds */
    latency?: number;
    /** Any warnings or notes */
    warnings?: string[];
  };
}

/**
 * Configuration for the iteration loop
 */
export interface IterationConfig {
  /** Maximum number of iterations (default: 5) */
  maxIterations?: number;
  /** Target score to consider converged (default: 70) */
  targetScore?: number;
  /** Score threshold for early termination (default: 95) */
  earlyStopScore?: number;
  /** 
   * Minimum iterations before allowing convergence (default: 1)
   * 
   * NOTE: When set, the processor will continue iterating even if 
   * the target score is reached, potentially incurring additional
   * API costs. Use `skipMinIterations: true` to prioritize cost
   * savings over minimum iterations.
   */
  minIterations?: number;
  /** Overall timeout in milliseconds */
  timeout?: number;
  /** Whether to run in verbose mode */
  verbose?: boolean;
  /** 
   * Always run transition even on last iteration (default: false)
   * 
   * When true, ensures the final state includes changes from the
   * last action before finalize is called.
   */
  alwaysRunTransition?: boolean;
  /** 
   * Skip minIterations requirement when target score is reached (default: false)
   * 
   * When true, allows early termination even before minIterations,
   * prioritizing cost savings over iteration count.
   */
  skipMinIterations?: boolean;
  /** Custom logger for errors and events */
  logger?: {
    error: (message: string, error: unknown) => void;
    log?: (message: string, ...args: unknown[]) => void;
  };
}

/**
 * Required configuration with defaults applied
 */
export type ResolvedConfig = Required<Omit<IterationConfig, 'timeout' | 'logger'>> & {
  timeout?: number;
  logger?: IterationConfig['logger'];
};

/**
 * Context passed to each phase
 */
export interface IterationContext {
  /** Current iteration number (0-based) */
  iteration: number;
  /** Total max iterations */
  maxIterations: number;
  /** Time elapsed since start in milliseconds */
  elapsedTime: number;
  /** Previous evaluation (undefined for first iteration) */
  previousEvaluation?: Evaluation;
}

/**
 * History entry for a single iteration
 */
export interface IterationHistory<ActionData> {
  /** Iteration number (0-based) */
  iteration: number;
  /** Result from the action phase */
  actionResult: ActionResult<ActionData>;
  /** Evaluation after this iteration */
  evaluation: Evaluation;
  /** Timestamp when this iteration completed */
  timestamp: number;
  /** Duration of this iteration in milliseconds */
  duration: number;
}

/**
 * Final result from the iteration loop
 */
export interface IterationResult<Result, ActionData> {
  /** The final computed result */
  result: Result;
  /** Number of iterations executed */
  iterations: number;
  /** Final convergence score */
  finalScore: number;
  /** Whether the loop converged (vs hit max iterations) */
  converged: boolean;
  /** Reason for termination */
  terminationReason: 'converged' | 'early_stop' | 'max_iterations' | 'timeout' | 'manual_stop';
  /** Total cost across all iterations */
  totalCost: number;
  /** Total time in milliseconds */
  totalLatency: number;
  /** History of all iterations */
  history: IterationHistory<ActionData>[];
}

/**
 * Options defining the iteration loop behavior
 * (The "Sprint" definition)
 *
 * @template Input - Type of the initial input
 * @template State - Type of the mutable state
 * @template ActionData - Type of data returned by actions
 * @template Result - Type of the final result
 */
export interface IterationOptions<Input, State, ActionData, Result> {
  /**
   * Initialize state from input
   * (Sprint Planning)
   */
  initialize: (input: Input) => Promise<State>;

  /**
   * Execute an action based on current state
   * (Sprint Execution)
   */
  act: (state: State, context: IterationContext) => Promise<ActionResult<ActionData>>;

  /**
   * Evaluate the current state after action
   * (Sprint Review)
   */
  evaluate: (
    state: State,
    actionResult: ActionResult<ActionData>,
    context: IterationContext
  ) => Promise<Evaluation>;

  /**
   * Update state for next iteration
   * (Sprint Retrospective -> next Sprint Planning)
   */
  transition: (
    state: State,
    actionResult: ActionResult<ActionData>,
    evaluation: Evaluation,
    context: IterationContext
  ) => Promise<State>;

  /**
   * Generate final result from state
   * (Release)
   * 
   * IMPORTANT: If `alwaysRunTransition` is false (default), the `state`
   * parameter may not include changes from the last iteration's action.
   * The final action result is available in the last element of `history`.
   * 
   * @param state - The state after all transitions (may be one iteration behind)
   * @param history - Complete history including the final iteration's results
   * 
   * @example
   * ```typescript
   * finalize: async (state, history) => {
   *   // If you need the last action's data:
   *   const lastAction = history[history.length - 1]?.actionResult;
   *   // Combine state with last action if needed
   *   return synthesize(state, lastAction);
   * }
   * ```
   */
  finalize: (
    state: State,
    history: IterationHistory<ActionData>[]
  ) => Promise<Result>;

  /**
   * Optional: Custom termination check
   * Return true to stop iteration early
   */
  shouldTerminate?: (
    state: State,
    evaluation: Evaluation,
    context: IterationContext
  ) => boolean;

  /**
   * Optional: Called when an error occurs
   * Return a fallback result or re-throw
   */
  onError?: (
    error: Error,
    state: State | undefined,
    context: IterationContext
  ) => Promise<Result>;
}

/**
 * Event types for iteration lifecycle (with type safety)
 */
export type IterationEvent<Input = unknown, State = unknown, ActionData = unknown, Result = unknown> =
  | { type: 'start'; input: Input }
  | { type: 'iteration_start'; iteration: number }
  | { type: 'action_complete'; iteration: number; result: ActionResult<ActionData> }
  | { type: 'evaluation_complete'; iteration: number; evaluation: Evaluation }
  | { type: 'transition_complete'; iteration: number; state: State }
  | { type: 'iteration_complete'; iteration: number; history: IterationHistory<ActionData> }
  | { type: 'converged'; iteration: number; score: number }
  | { type: 'complete'; result: IterationResult<Result, ActionData> }
  | { type: 'error'; error: Error; iteration: number; state?: State };

/**
 * Event listener for iteration events
 */
export type IterationEventListener<Input = unknown, State = unknown, ActionData = unknown, Result = unknown> = 
  (event: IterationEvent<Input, State, ActionData, Result>) => void;
