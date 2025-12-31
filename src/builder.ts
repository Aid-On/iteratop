/**
 * IteratoP - Builder Pattern for Flexible Configuration
 */

import { IterationProcessor, createIterator } from './core.js';
import type {
  IterationOptions,
  IterationConfig,
  ActionResult,
  Evaluation,
  IterationContext,
  IterationHistory,
  IterationEventListener,
} from './types.js';

/**
 * Default preset configurations for common use cases
 * 
 * - `fast`: Minimal iterations, quick convergence (good for simple queries)
 * - `thorough`: More iterations, higher quality (good for complex problems)
 * - `balanced`: Default balanced approach
 * - `cost-optimized`: Minimize API calls and costs
 */
export const DEFAULT_PRESETS = {
  fast: {
    maxIterations: 3,
    targetScore: 60,
    earlyStopScore: 80,
    minIterations: 1,
    skipMinIterations: true,
  },
  thorough: {
    maxIterations: 10,
    targetScore: 90,
    earlyStopScore: 98,
    minIterations: 3,
    skipMinIterations: false,
  },
  balanced: {
    maxIterations: 5,
    targetScore: 70,
    earlyStopScore: 95,
    minIterations: 1,
    skipMinIterations: false,
  },
  'cost-optimized': {
    maxIterations: 3,
    targetScore: 65,
    earlyStopScore: 75,
    minIterations: 1,
    skipMinIterations: true,
    alwaysRunTransition: false,
  },
} as const satisfies Record<string, IterationConfig>;

/**
 * Type for preset names
 */
export type PresetName = keyof typeof DEFAULT_PRESETS;

/**
 * Builder for creating IterationProcessor with fluent API
 */
export class IterationBuilder<Input, State, ActionData, Result> {
  private config: IterationConfig = {};
  private options: Partial<IterationOptions<Input, State, ActionData, Result>> = {};
  private listeners: IterationEventListener<Input, State, ActionData, Result>[] = [];

  /**
   * Set initialization function
   */
  initialize(fn: (input: Input) => Promise<State>): this {
    this.options.initialize = fn;
    return this;
  }

  /**
   * Set action function
   */
  act(fn: (state: State, context: IterationContext) => Promise<ActionResult<ActionData>>): this {
    this.options.act = fn;
    return this;
  }

  /**
   * Set evaluation function
   */
  evaluate(
    fn: (
      state: State,
      actionResult: ActionResult<ActionData>,
      context: IterationContext
    ) => Promise<Evaluation>
  ): this {
    this.options.evaluate = fn;
    return this;
  }

  /**
   * Set transition function
   */
  transition(
    fn: (
      state: State,
      actionResult: ActionResult<ActionData>,
      evaluation: Evaluation,
      context: IterationContext
    ) => Promise<State>
  ): this {
    this.options.transition = fn;
    return this;
  }

  /**
   * Set finalize function
   */
  finalize(
    fn: (state: State, history: IterationHistory<ActionData>[]) => Promise<Result>
  ): this {
    this.options.finalize = fn;
    return this;
  }

  /**
   * Set custom termination check
   */
  shouldTerminate(
    fn: (state: State, evaluation: Evaluation, context: IterationContext) => boolean
  ): this {
    this.options.shouldTerminate = fn;
    return this;
  }

  /**
   * Set error handler
   */
  onError(
    fn: (
      error: Error,
      state: State | undefined,
      context: IterationContext
    ) => Promise<Result>
  ): this {
    this.options.onError = fn;
    return this;
  }

  /**
   * Set maximum iterations
   */
  maxIterations(value: number): this {
    this.config.maxIterations = value;
    return this;
  }

  /**
   * Set target score
   */
  targetScore(value: number): this {
    this.config.targetScore = value;
    return this;
  }

  /**
   * Set early stop score
   */
  earlyStopScore(value: number): this {
    this.config.earlyStopScore = value;
    return this;
  }

  /**
   * Set minimum iterations
   */
  minIterations(value: number): this {
    this.config.minIterations = value;
    return this;
  }

  /**
   * Set timeout in milliseconds
   */
  timeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  /**
   * Enable verbose mode
   */
  verbose(enabled = true): this {
    this.config.verbose = enabled;
    return this;
  }

  /**
   * Enable alwaysRunTransition
   */
  alwaysRunTransition(enabled = true): this {
    this.config.alwaysRunTransition = enabled;
    return this;
  }

  /**
   * Enable skipMinIterations
   */
  skipMinIterations(enabled = true): this {
    this.config.skipMinIterations = enabled;
    return this;
  }

  /**
   * Set custom logger
   */
  logger(logger: {
    error: (message: string, error: unknown) => void;
    log?: (message: string, ...args: unknown[]) => void;
  }): this {
    this.config.logger = logger;
    return this;
  }

  /**
   * Add event listener
   */
  on(listener: IterationEventListener<Input, State, ActionData, Result>): this {
    this.listeners.push(listener);
    return this;
  }

  /**
   * Use a preset configuration
   * 
   * @param preset - Name of the preset to apply
   * @see {@link DEFAULT_PRESETS} for available presets and their values
   */
  preset(preset: PresetName): this {
    const presetConfig = DEFAULT_PRESETS[preset];
    if (presetConfig) {
      Object.assign(this.config, presetConfig);
    }
    return this;
  }

  /**
   * Apply a custom preset configuration
   * 
   * @param customPreset - Custom configuration to apply as a preset
   * @example
   * ```typescript
   * const myPreset: IterationConfig = {
   *   maxIterations: 7,
   *   targetScore: 85,
   *   // ...
   * };
   * builder.customPreset(myPreset);
   * ```
   */
  customPreset(customPreset: IterationConfig): this {
    Object.assign(this.config, customPreset);
    return this;
  }

  /**
   * Apply partial configuration
   */
  configure(config: Partial<IterationConfig>): this {
    Object.assign(this.config, config);
    return this;
  }

  /**
   * Build the IterationProcessor
   */
  build(): IterationProcessor<Input, State, ActionData, Result> {
    // Validate all required options are set
    if (!this.options.initialize) {
      throw new Error('initialize function is required');
    }
    if (!this.options.act) {
      throw new Error('act function is required');
    }
    if (!this.options.evaluate) {
      throw new Error('evaluate function is required');
    }
    if (!this.options.transition) {
      throw new Error('transition function is required');
    }
    if (!this.options.finalize) {
      throw new Error('finalize function is required');
    }

    const processor = createIterator(
      this.options as IterationOptions<Input, State, ActionData, Result>,
      this.config
    );

    // Add event listeners
    for (const listener of this.listeners) {
      processor.on(listener);
    }

    return processor;
  }

  /**
   * Build and run immediately
   */
  async run(input: Input) {
    return this.build().run(input);
  }
}

/**
 * Create a new iteration builder
 */
export function iterationBuilder<Input, State, ActionData, Result>() {
  return new IterationBuilder<Input, State, ActionData, Result>();
}