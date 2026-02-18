/**
 * IteratoP - Core Iteration Processor
 *
 * A convergent loop processor inspired by Scrum iterations and OODA loops.
 * Executes iterative refinement until a target score is reached or max iterations hit.
 *
 * Flow:
 * 1. Initialize (Sprint Planning)
 * 2. Loop:
 *    a. Act (Sprint Execution)
 *    b. Evaluate (Sprint Review)
 *    c. Transition (Retrospective -> next Planning)
 * 3. Finalize (Release)
 */

import type {
  IterationConfig,
  ResolvedConfig,
  IterationContext,
  IterationHistory,
  IterationResult,
  IterationOptions,
  IterationEvent,
  IterationEventListener,
  Evaluation,
} from './types.js';
import { runSingleIteration, buildResult, buildErrorResult } from './core-helpers.js';

export class IterationProcessor<Input, State, ActionData, Result> {
  private config: ResolvedConfig;
  private listeners: IterationEventListener<Input, State, ActionData, Result>[] = [];

  constructor(
    private _options: IterationOptions<Input, State, ActionData, Result>,
    config: IterationConfig = {}
  ) {
    const maxIterations = config.maxIterations ?? 5;
    const minIterations = config.minIterations ?? 1;

    if (minIterations > maxIterations) {
      throw new Error(
        `Invalid configuration: minIterations (${minIterations}) cannot be greater than maxIterations (${maxIterations})`
      );
    }

    this.config = {
      maxIterations,
      targetScore: config.targetScore ?? 70,
      earlyStopScore: config.earlyStopScore ?? 95,
      minIterations,
      timeout: config.timeout,
      verbose: config.verbose ?? false,
      alwaysRunTransition: config.alwaysRunTransition ?? false,
      skipMinIterations: config.skipMinIterations ?? false,
      logger: config.logger,
    };
  }

  /**
   * Add an event listener
   */
  on(listener: IterationEventListener<Input, State, ActionData, Result>): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: IterationEvent<Input, State, ActionData, Result>): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        this.config.logger?.error('[IteratoP] Event listener error:', e);
      }
    }
  }

  /**
   * Log message if verbose mode is enabled
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.config.verbose) {
      this.config.logger?.log?.(`[IteratoP] ${message}`, ...args);
    }
  }

  /**
   * Run the iteration loop
   */
  async run(input: Input): Promise<IterationResult<Result, ActionData>> {
    const startTime = Date.now();
    const history: IterationHistory<ActionData>[] = [];
    let state: State | undefined;
    let finalEvaluation: Evaluation = { score: 0, shouldContinue: true, feedback: '' };
    let terminationReason: IterationResult<Result, ActionData>['terminationReason'] = 'max_iterations';

    this.emit({ type: 'start', input });
    this.log('Starting iteration loop', { maxIterations: this.config.maxIterations });

    try {
      let currentState: State = await this._options.initialize(input);
      state = currentState;
      this.log('Initialized state');

      for (let i = 0; i < this.config.maxIterations; i++) {
        if (this.config.timeout && Date.now() - startTime > this.config.timeout) {
          this.log('Timeout reached');
          terminationReason = 'timeout';
          break;
        }

        const iterResult = await runSingleIteration<Input, State, ActionData, Result>({
          index: i,
          state: currentState,
          startTime,
          config: this.config,
          options: this._options,
          history,
          previousEvaluation: finalEvaluation,
          emit: (event) => this.emit(event),
          log: (msg, ...a) => this.log(msg, ...a),
          checkTermination: (s, e, c, it) => this.checkTermination(s, e, c, it),
        });

        currentState = iterResult.state;
        state = currentState;
        finalEvaluation = iterResult.evaluation;

        if (iterResult.terminationReason !== null) {
          terminationReason = iterResult.terminationReason;
          break;
        }
      }

      const result = await this._options.finalize(currentState, history);
      const iterationResult = buildResult<Result, ActionData>({
        result,
        history,
        finalEvaluation,
        terminationReason,
        targetScore: this.config.targetScore,
        startTime,
      });

      this.emit({ type: 'complete', result: iterationResult });
      this.log('Loop complete', {
        iterations: iterationResult.iterations,
        finalScore: iterationResult.finalScore,
        converged: iterationResult.converged,
        terminationReason: iterationResult.terminationReason,
      });

      return iterationResult;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit({ type: 'error', error: err, iteration: history.length, state });
      this.log('Error occurred', { error: err.message });

      if (this._options.onError) {
        const context: IterationContext = {
          iteration: history.length,
          maxIterations: this.config.maxIterations,
          elapsedTime: Date.now() - startTime,
          previousEvaluation: finalEvaluation,
        };
        const fallbackResult = await this._options.onError(err, state, context);
        return buildErrorResult<Result, ActionData>({
          result: fallbackResult,
          history,
          finalEvaluation,
          startTime,
        });
      }

      throw error;
    }
  }

  /**
   * Check if the loop should terminate
   */
  private checkTermination(
    state: State,
    evaluation: Evaluation,
    context: IterationContext,
    iteration: number
  ): { terminate: boolean; reason: IterationResult<Result, ActionData>['terminationReason'] } {
    if (this._options.shouldTerminate?.(state, evaluation, context)) {
      return { terminate: true, reason: 'manual_stop' };
    }
    if (evaluation.score >= this.config.earlyStopScore) {
      return { terminate: true, reason: 'early_stop' };
    }
    if (!evaluation.shouldContinue) {
      return { terminate: true, reason: 'converged' };
    }
    if (evaluation.score >= this.config.targetScore) {
      const minIterationsMet = iteration >= this.config.minIterations - 1;
      if (minIterationsMet || this.config.skipMinIterations) {
        return { terminate: true, reason: 'converged' };
      }
    }
    return { terminate: false, reason: 'max_iterations' };
  }

  /** Get current configuration */
  getConfig(): ResolvedConfig {
    return { ...this.config };
  }

  /** Create a new processor with updated config */
  withConfig(config: Partial<IterationConfig>): IterationProcessor<Input, State, ActionData, Result> {
    return new IterationProcessor(this._options, { ...this.config, ...config });
  }

  /** Update configuration dynamically (returns this for chaining) */
  updateConfig(config: Partial<IterationConfig>): this {
    const newMaxIterations = config.maxIterations ?? this.config.maxIterations;
    const newMinIterations = config.minIterations ?? this.config.minIterations;

    if (newMinIterations > newMaxIterations) {
      throw new Error(
        `Invalid configuration: minIterations (${newMinIterations}) cannot be greater than maxIterations (${newMaxIterations})`
      );
    }

    Object.assign(this.config, config);
    return this;
  }

  /** Reset configuration to defaults */
  resetConfig(): this {
    this.config = {
      maxIterations: 5,
      targetScore: 70,
      earlyStopScore: 95,
      minIterations: 1,
      timeout: undefined,
      verbose: false,
      alwaysRunTransition: false,
      skipMinIterations: false,
      logger: undefined,
    };
    return this;
  }
}

/**
 * Factory function for creating an IterationProcessor
 */
export function createIterator<Input, State, ActionData, Result>(
  options: IterationOptions<Input, State, ActionData, Result>,
  config?: IterationConfig
): IterationProcessor<Input, State, ActionData, Result> {
  return new IterationProcessor(options, config);
}
