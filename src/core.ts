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
} from './types';

export class IterationProcessor<Input, State, ActionData, Result> {
  private config: ResolvedConfig;
  private listeners: IterationEventListener<Input, State, ActionData, Result>[] = [];

  constructor(
    private options: IterationOptions<Input, State, ActionData, Result>,
    config: IterationConfig = {}
  ) {
    // Validate config
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
        const logger = this.config.logger;
        if (logger?.error) {
          logger.error('[IteratoP] Event listener error:', e);
        } else {
          console.error('[IteratoP] Event listener error:', e);
        }
      }
    }
  }

  /**
   * Log message if verbose mode is enabled
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.config.verbose) {
      const logger = this.config.logger;
      if (logger?.log) {
        logger.log(`[IteratoP] ${message}`, ...args);
      } else {
        console.log(`[IteratoP] ${message}`, ...args);
      }
    }
  }

  /**
   * Run the iteration loop
   */
  async run(input: Input): Promise<IterationResult<Result, ActionData>> {
    const startTime = Date.now();
    const history: IterationHistory<ActionData>[] = [];
    let state: State | undefined;
    let finalEvaluation: Evaluation = {
      score: 0,
      shouldContinue: true,
      feedback: '',
    };
    let terminationReason: IterationResult<Result, ActionData>['terminationReason'] =
      'max_iterations';

    this.emit({ type: 'start', input });
    this.log('Starting iteration loop', { maxIterations: this.config.maxIterations });

    try {
      // 1. Initialize (Sprint Planning)
      state = await this.options.initialize(input);
      this.log('Initialized state');

      // 2. Loop
      for (let i = 0; i < this.config.maxIterations; i++) {
        const iterationStart = Date.now();

        // Check timeout
        if (this.config.timeout && Date.now() - startTime > this.config.timeout) {
          this.log('Timeout reached');
          terminationReason = 'timeout';
          break;
        }

        const context: IterationContext = {
          iteration: i,
          maxIterations: this.config.maxIterations,
          elapsedTime: Date.now() - startTime,
          previousEvaluation: i > 0 ? finalEvaluation : undefined,
        };

        this.emit({ type: 'iteration_start', iteration: i });
        this.log(`Iteration ${i + 1}/${this.config.maxIterations} started`);

        // 2a. Act (Sprint Execution)
        const actionResult = await this.options.act(state, context);
        this.emit({ type: 'action_complete', iteration: i, result: actionResult });
        this.log(`Action complete`, { dataSize: JSON.stringify(actionResult.data).length });

        // 2b. Evaluate (Sprint Review)
        const evaluation = await this.options.evaluate(state, actionResult, context);
        finalEvaluation = evaluation;
        this.emit({ type: 'evaluation_complete', iteration: i, evaluation });
        this.log(`Evaluation complete`, { score: evaluation.score, shouldContinue: evaluation.shouldContinue });

        // Record history
        const iterationHistory: IterationHistory<ActionData> = {
          iteration: i,
          actionResult,
          evaluation,
          timestamp: Date.now(),
          duration: Date.now() - iterationStart,
        };
        history.push(iterationHistory);
        this.emit({ type: 'iteration_complete', iteration: i, history: iterationHistory });

        // 2c. Transition (Retrospective -> next Sprint Planning)
        // Run transition if not the last iteration OR if alwaysRunTransition is true
        const isLastIteration = i === this.config.maxIterations - 1;
        const shouldTerminate = this.checkTermination(state, evaluation, context, i);
        const shouldRunTransition = (!isLastIteration || this.config.alwaysRunTransition) && !shouldTerminate.terminate;
        
        if (shouldRunTransition || (this.config.alwaysRunTransition && shouldTerminate.terminate)) {
          state = await this.options.transition(state, actionResult, evaluation, context);
          this.emit({ type: 'transition_complete', iteration: i, state });
          this.log(`Transition complete, preparing next iteration`);
        }

        // Check termination conditions
        if (shouldTerminate.terminate) {
          terminationReason = shouldTerminate.reason;
          this.log(`Terminating: ${terminationReason}`, { score: evaluation.score });
          this.emit({ type: 'converged', iteration: i, score: evaluation.score });
          break;
        }
      }

      // 3. Finalize (Release)
      const result = await this.options.finalize(state, history);
      const totalCost = history.reduce(
        (sum, h) => sum + (h.actionResult.metadata?.cost ?? 0),
        0
      );

      const iterationResult: IterationResult<Result, ActionData> = {
        result,
        iterations: history.length,
        finalScore: finalEvaluation.score,
        converged: finalEvaluation.score >= this.config.targetScore,
        terminationReason,
        totalCost,
        totalLatency: Date.now() - startTime,
        history,
      };

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

      // Try error handler if provided
      if (this.options.onError) {
        const context: IterationContext = {
          iteration: history.length,
          maxIterations: this.config.maxIterations,
          elapsedTime: Date.now() - startTime,
          previousEvaluation: finalEvaluation,
        };
        const fallbackResult = await this.options.onError(err, state, context);
        return {
          result: fallbackResult,
          iterations: history.length,
          finalScore: finalEvaluation.score,
          converged: false,
          terminationReason: 'manual_stop',
          totalCost: history.reduce((sum, h) => sum + (h.actionResult.metadata?.cost ?? 0), 0),
          totalLatency: Date.now() - startTime,
          history,
        };
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
    // Custom termination check
    if (this.options.shouldTerminate?.(state, evaluation, context)) {
      return { terminate: true, reason: 'manual_stop' };
    }

    // Early stop: very high score
    if (evaluation.score >= this.config.earlyStopScore) {
      return { terminate: true, reason: 'early_stop' };
    }

    // Evaluation says to stop
    if (!evaluation.shouldContinue) {
      return { terminate: true, reason: 'converged' };
    }

    // Target reached after minimum iterations (or skipMinIterations is enabled)
    if (evaluation.score >= this.config.targetScore) {
      const minIterationsMet = iteration >= this.config.minIterations - 1;
      if (minIterationsMet || this.config.skipMinIterations) {
        return { terminate: true, reason: 'converged' };
      }
    }

    return { terminate: false, reason: 'max_iterations' };
  }

  /**
   * Get current configuration
   */
  getConfig(): ResolvedConfig {
    return { ...this.config };
  }

  /**
   * Create a new processor with updated config
   */
  withConfig(config: Partial<IterationConfig>): IterationProcessor<Input, State, ActionData, Result> {
    return new IterationProcessor(this.options, { ...this.config, ...config });
  }

  /**
   * Update configuration dynamically (returns this for chaining)
   */
  updateConfig(config: Partial<IterationConfig>): this {
    // Validate if minIterations > maxIterations after update
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

  /**
   * Reset configuration to defaults
   */
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
