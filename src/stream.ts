import type { Stream } from '@aid-on/nagare';
import { fromArray } from '@aid-on/nagare';
import { createIterator } from './core.js';
import type {
  IterationConfig,
  IterationContext,
  IterationHistory,
  ActionResult,
  Evaluation,
  IterationResult,
  IterationOptions,
} from './types.js';

/** Streaming iteration state for nagare */
export interface StreamingState<State, ActionData> {
  iteration: number;
  state: State;
  evaluation?: Evaluation;
  actionResult?: ActionResult<ActionData>;
  converged: boolean;
  timedOut?: boolean;
  context: IterationContext;
}

/** Resolved streaming config values */
interface ResolvedStreamConfig {
  maxIterations: number;
  minIterations: number;
  targetScore: number;
  skipMinIterations: boolean;
  timeout: number | undefined;
}

/** Shared iteration context passed to helper methods */
interface StreamLoopContext<State, ActionData> {
  states: StreamingState<State, ActionData>[];
  cfg: ResolvedStreamConfig;
  startTime: number;
  history: IterationHistory<ActionData>[];
}

/**
 * Stream adapter for IteratoP with nagare.
 * Provides streaming iteration results compatible with nagare's Stream<T> interface.
 */
export class StreamingIteratoP<Input, State, ActionData, Result> {
  constructor(
    private _config: IterationOptions<Input, State, ActionData, Result>,
    private _options?: IterationConfig
  ) { /* no-op */ }

  private resolveConfig(): ResolvedStreamConfig {
    return {
      maxIterations: this._options?.maxIterations ?? 5,
      minIterations: this._options?.minIterations ?? 1,
      targetScore: this._options?.targetScore ?? 70,
      skipMinIterations: this._options?.skipMinIterations ?? false,
      timeout: this._options?.timeout,
    };
  }

  private extractInitialPhase(ctx: StreamLoopContext<State, ActionData>, currentState: State): void {
    ctx.states.push({
      iteration: 0,
      state: currentState,
      converged: false,
      context: { iteration: 0, maxIterations: ctx.cfg.maxIterations, elapsedTime: 0 },
    });
  }

  private extractTimeoutCheck(
    ctx: StreamLoopContext<State, ActionData>,
    currentState: State,
    iteration: number
  ): boolean {
    if (!ctx.cfg.timeout || Date.now() - ctx.startTime <= ctx.cfg.timeout) {
      return false;
    }
    ctx.states.push({
      iteration: iteration + 1,
      state: currentState,
      converged: false,
      timedOut: true,
      context: {
        iteration: iteration + 1,
        maxIterations: ctx.cfg.maxIterations,
        elapsedTime: Date.now() - ctx.startTime,
        previousEvaluation: ctx.history[ctx.history.length - 1]?.evaluation,
      },
    });
    return true;
  }

  private async extractIterationPhase(
    ctx: StreamLoopContext<State, ActionData>,
    currentState: State,
    iteration: number
  ): Promise<{ state: State; converged: boolean }> {
    const iterationStartTime = Date.now();
    const context: IterationContext = {
      iteration,
      maxIterations: ctx.cfg.maxIterations,
      elapsedTime: Date.now() - ctx.startTime,
      previousEvaluation: ctx.history[ctx.history.length - 1]?.evaluation,
    };
    const actionResult = await this._config.act(currentState, context);
    const evaluation = await this._config.evaluate(currentState, actionResult, context);
    ctx.history.push({ iteration, actionResult, evaluation, timestamp: Date.now(), duration: Date.now() - iterationStartTime });

    const converged = this.extractConvergenceCheck(evaluation, iteration, ctx.cfg);
    let state = currentState;
    if (!converged && this._config.transition) {
      state = await this._config.transition(state, actionResult, evaluation, context);
    }
    ctx.states.push({ iteration, state, actionResult, evaluation, converged, context });
    return { state, converged };
  }

  private extractConvergenceCheck(evaluation: Evaluation, iteration: number, cfg: ResolvedStreamConfig): boolean {
    if (cfg.skipMinIterations && evaluation.score >= cfg.targetScore) return true;
    if (evaluation.score >= cfg.targetScore && iteration >= cfg.minIterations) return true;
    if (!evaluation.shouldContinue && iteration >= cfg.minIterations) return true;
    return false;
  }

  /**
   * Execute iterations and return a nagare Stream of iteration states.
   * Collects all states first then streams them (nagare streams are synchronous at creation).
   */
  async executeStream(input: Input): Promise<Stream<StreamingState<State, ActionData>>> {
    const ctx: StreamLoopContext<State, ActionData> = {
      states: [],
      cfg: this.resolveConfig(),
      startTime: Date.now(),
      history: [],
    };

    let currentState = await this._config.initialize(input);
    this.extractInitialPhase(ctx, currentState);

    let iteration = 0;
    let converged = false;
    while (iteration < ctx.cfg.maxIterations && !converged) {
      if (this.extractTimeoutCheck(ctx, currentState, iteration)) break;
      iteration++;
      const result = await this.extractIterationPhase(ctx, currentState, iteration);
      currentState = result.state;
      converged = result.converged;
      if (converged) break;
    }

    if (this._config.finalize) {
      await this._config.finalize(currentState, ctx.history);
    }
    return fromArray(ctx.states);
  }

  /** Execute iterations and return a nagare Stream of evaluations only */
  async evaluationStream(input: Input): Promise<Stream<Evaluation>> {
    const stateStream = await this.executeStream(input);
    return stateStream
      .map(state => state.evaluation)
      .filter((evaluation): evaluation is Evaluation => evaluation !== undefined) as Stream<Evaluation>;
  }

  /** Execute iterations and return a nagare Stream of action results only */
  async actionStream(input: Input): Promise<Stream<ActionResult<ActionData>>> {
    const stateStream = await this.executeStream(input);
    return stateStream
      .map(state => state.actionResult)
      .filter((actionResult): actionResult is ActionResult<ActionData> => actionResult !== undefined) as Stream<ActionResult<ActionData>>;
  }

  /** Execute and return final result (non-streaming) */
  async execute(input: Input): Promise<IterationResult<Result, ActionData>> {
    const processor = createIterator(this._config, this._options);
    return processor.run(input);
  }
}

/** Builder for StreamingIteratoP */
export class StreamingIteratoPBuilder<Input, State, ActionData, Result = State> {
  private config: Partial<IterationOptions<Input, State, ActionData, Result>> = {};
  private options: IterationConfig = {};

  withInitialize(fn: (input: Input) => Promise<State>): this {
    this.config.initialize = fn;
    return this;
  }

  withAct(fn: (state: State, context: IterationContext) => Promise<ActionResult<ActionData>>): this {
    this.config.act = fn;
    return this;
  }

  withEvaluate(fn: (state: State, actionResult: ActionResult<ActionData>, context: IterationContext) => Promise<Evaluation>): this {
    this.config.evaluate = fn;
    return this;
  }

  withTransition(fn: (state: State, actionResult: ActionResult<ActionData>, evaluation: Evaluation, context: IterationContext) => Promise<State>): this {
    this.config.transition = fn;
    return this;
  }

  withFinalize(fn: (state: State, history: IterationHistory<ActionData>[]) => Promise<Result>): this {
    this.config.finalize = fn;
    return this;
  }

  withOptions(options: IterationConfig): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  withMaxIterations(max: number): this {
    this.options.maxIterations = max;
    return this;
  }

  withTargetScore(score: number): this {
    this.options.targetScore = score;
    return this;
  }

  withTimeout(ms: number): this {
    this.options.timeout = ms;
    return this;
  }

  build(): StreamingIteratoP<Input, State, ActionData, Result> {
    if (!this.config.initialize || !this.config.act || !this.config.evaluate) {
      throw new Error('initialize, act, and evaluate functions are required');
    }
    if (!this.config.transition) {
      this.config.transition = async (state) => state;
    }
    return new StreamingIteratoP(
      this.config as IterationOptions<Input, State, ActionData, Result>,
      this.options
    );
  }
}

/** Create a streaming iteration processor */
export function createStreamingIterator<Input, State, ActionData, Result = State>(
  config: IterationOptions<Input, State, ActionData, Result>,
  options?: IterationConfig
): StreamingIteratoP<Input, State, ActionData, Result> {
  return new StreamingIteratoP(config, options);
}
