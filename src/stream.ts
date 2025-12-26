import type { Stream } from '@aid-on/nagare';
import { fromArray } from '@aid-on/nagare';
import { createIterator } from './core';
import type {
  IterationConfig,
  IterationContext,
  IterationHistory,
  ActionResult,
  Evaluation,
  IterationResult,
  IterationOptions,
} from './types';

/**
 * Streaming iteration state for nagare
 */
export interface StreamingState<State, ActionData> {
  iteration: number;
  state: State;
  evaluation?: Evaluation;
  actionResult?: ActionResult<ActionData>;
  converged: boolean;
  timedOut?: boolean;
  context: IterationContext;
}

/**
 * Stream adapter for IteratoP with nagare
 * Provides streaming iteration results compatible with nagare's Stream<T> interface
 */
export class StreamingIteratoP<Input, State, ActionData, Result> {
  constructor(
    private config: IterationOptions<Input, State, ActionData, Result>,
    private options?: IterationConfig
  ) {}

  /**
   * Execute iterations and return a nagare Stream of iteration states
   * 
   * Since nagare streams are synchronous at creation time, we need to collect
   * all states first and then stream them
   */
  async executeStream(input: Input): Promise<Stream<StreamingState<State, ActionData>>> {
    const states: StreamingState<State, ActionData>[] = [];
    
    try {
      // Initialize
      const initialState = await this.config.initialize(input);
      let currentState = initialState;
      let iteration = 0;
      let converged = false;
      const history: IterationHistory<ActionData>[] = [];
      
      const maxIterations = this.options?.maxIterations ?? 5;
      const minIterations = this.options?.minIterations ?? 1;
      const targetScore = this.options?.targetScore ?? 70;
      const skipMinIterations = this.options?.skipMinIterations ?? false;
      const startTime = Date.now();
      const timeout = this.options?.timeout;
      
      // Emit initial state
      const initialContext: IterationContext = {
        iteration: 0,
        maxIterations,
        elapsedTime: 0,
      };
      
      states.push({
        iteration: 0,
        state: currentState,
        converged: false,
        context: initialContext,
      });

      while (iteration < maxIterations && !converged) {
        const iterationStartTime = Date.now();

        // Check timeout BEFORE incrementing iteration
        if (timeout && Date.now() - startTime > timeout) {
          const context: IterationContext = {
            iteration: iteration + 1,
            maxIterations,
            elapsedTime: Date.now() - startTime,
            previousEvaluation: history[history.length - 1]?.evaluation,
          };
          
          states.push({
            iteration: iteration + 1,
            state: currentState,
            converged: false,
            timedOut: true,
            context,
          });
          break;
        }
        
        iteration++;

        const context: IterationContext = {
          iteration,
          maxIterations,
          elapsedTime: Date.now() - startTime,
          previousEvaluation: history[history.length - 1]?.evaluation,
        };

        // Act phase
        const actionResult = await this.config.act(currentState, context);

        // Evaluate phase
        const evaluation = await this.config.evaluate(currentState, actionResult, context);

        // Record history
        history.push({
          iteration,
          actionResult,
          evaluation,
          timestamp: Date.now(),
          duration: Date.now() - iterationStartTime,
        });

        // Check convergence
        if (skipMinIterations && evaluation.score >= targetScore) {
          converged = true;
        } else if (evaluation.score >= targetScore && iteration >= minIterations) {
          converged = true;
        } else if (!evaluation.shouldContinue && iteration >= minIterations) {
          converged = true;
        }

        // Transition phase
        if (!converged && this.config.transition) {
          currentState = await this.config.transition(currentState, actionResult, evaluation, context);
        }

        // Emit state after transition
        states.push({
          iteration,
          state: currentState,
          actionResult,
          evaluation,
          converged,
          context,
        });
        
        // If just converged, break out of loop
        if (converged) {
          break;
        }
      }

      // Finalize if configured
      if (this.config.finalize) {
        await this.config.finalize(currentState, history);
      }
    } catch (error) {
      throw error;
    }
    
    // Return as a nagare stream
    return fromArray(states);
  }

  /**
   * Execute iterations and return a nagare Stream of evaluations only
   */
  async evaluationStream(input: Input): Promise<Stream<Evaluation>> {
    const stateStream = await this.executeStream(input);
    return stateStream
      .map(state => state.evaluation)
      .filter((evaluation): evaluation is Evaluation => evaluation !== undefined) as Stream<Evaluation>;
  }

  /**
   * Execute iterations and return a nagare Stream of action results only
   */
  async actionStream(input: Input): Promise<Stream<ActionResult<ActionData>>> {
    const stateStream = await this.executeStream(input);
    return stateStream
      .map(state => state.actionResult)
      .filter((actionResult): actionResult is ActionResult<ActionData> => actionResult !== undefined) as Stream<ActionResult<ActionData>>;
  }

  /**
   * Execute and return final result (non-streaming)
   */
  async execute(input: Input): Promise<IterationResult<Result, ActionData>> {
    const processor = createIterator(this.config, this.options);
    return processor.run(input);
  }
}

/**
 * Builder for StreamingIteratoP
 */
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

    // Ensure transition is defined
    if (!this.config.transition) {
      this.config.transition = async (state) => state;
    }

    return new StreamingIteratoP(
      this.config as IterationOptions<Input, State, ActionData, Result>,
      this.options
    );
  }
}

/**
 * Create a streaming iteration processor
 */
export function createStreamingIterator<Input, State, ActionData, Result = State>(
  config: IterationOptions<Input, State, ActionData, Result>,
  options?: IterationConfig
): StreamingIteratoP<Input, State, ActionData, Result> {
  return new StreamingIteratoP(config, options);
}