/**
 * IteratoP - Core Helper Functions
 *
 * Extracted from core.ts to keep module sizes manageable.
 * Contains iteration execution logic and result building.
 */

import type {
  IterationContext,
  IterationHistory,
  IterationResult,
  IterationOptions,
  IterationEvent,
  Evaluation,
  ResolvedConfig,
} from './types.js';

/**
 * Run a single iteration (Act -> Evaluate -> Record -> Transition)
 *
 * Returns the updated state and whether the loop should terminate.
 */
export async function runSingleIteration<Input, State, ActionData, Result>(params: {
  index: number;
  state: State;
  startTime: number;
  config: ResolvedConfig;
  options: IterationOptions<Input, State, ActionData, Result>;
  history: IterationHistory<ActionData>[];
  previousEvaluation: Evaluation | undefined;
  emit: (event: IterationEvent<Input, State, ActionData, Result>) => void;
  log: (message: string, ...args: unknown[]) => void;
  checkTermination: (
    state: State,
    evaluation: Evaluation,
    context: IterationContext,
    iteration: number
  ) => { terminate: boolean; reason: IterationResult<Result, ActionData>['terminationReason'] };
}): Promise<{
  state: State;
  evaluation: Evaluation;
  terminationReason: IterationResult<Result, ActionData>['terminationReason'] | null;
}> {
  const { index, config, options, history, previousEvaluation, emit, log, checkTermination } = params;
  let { state } = params;
  const iterationStart = Date.now();

  const context: IterationContext = {
    iteration: index,
    maxIterations: config.maxIterations,
    elapsedTime: Date.now() - params.startTime,
    previousEvaluation: index > 0 ? previousEvaluation : undefined,
  };

  emit({ type: 'iteration_start', iteration: index });
  log(`Iteration ${index + 1}/${config.maxIterations} started`);

  // Act (Sprint Execution)
  const actionResult = await options.act(state, context);
  emit({ type: 'action_complete', iteration: index, result: actionResult });
  log(`Action complete`, { dataSize: JSON.stringify(actionResult.data).length });

  // Evaluate (Sprint Review)
  const evaluation = await options.evaluate(state, actionResult, context);
  emit({ type: 'evaluation_complete', iteration: index, evaluation });
  log(`Evaluation complete`, { score: evaluation.score, shouldContinue: evaluation.shouldContinue });

  // Record history
  const iterationHistory: IterationHistory<ActionData> = {
    iteration: index,
    actionResult,
    evaluation,
    timestamp: Date.now(),
    duration: Date.now() - iterationStart,
  };
  history.push(iterationHistory);
  emit({ type: 'iteration_complete', iteration: index, history: iterationHistory });

  // Transition (Retrospective -> next Sprint Planning)
  const isLastIteration = index === config.maxIterations - 1;
  const shouldTerminate = checkTermination(state, evaluation, context, index);
  const shouldRunTransition = (!isLastIteration || config.alwaysRunTransition) && !shouldTerminate.terminate;

  if (shouldRunTransition || (config.alwaysRunTransition && shouldTerminate.terminate)) {
    state = await options.transition(state, actionResult, evaluation, context);
    emit({ type: 'transition_complete', iteration: index, state });
    log(`Transition complete, preparing next iteration`);
  }

  if (shouldTerminate.terminate) {
    log(`Terminating: ${shouldTerminate.reason}`, { score: evaluation.score });
    emit({ type: 'converged', iteration: index, score: evaluation.score });
    return { state, evaluation, terminationReason: shouldTerminate.reason };
  }

  return { state, evaluation, terminationReason: null };
}

/**
 * Build the final IterationResult after a successful run.
 */
export function buildResult<Result, ActionData>(params: {
  result: Result;
  history: IterationHistory<ActionData>[];
  finalEvaluation: Evaluation;
  terminationReason: IterationResult<Result, ActionData>['terminationReason'];
  targetScore: number;
  startTime: number;
}): IterationResult<Result, ActionData> {
  const totalCost = params.history.reduce(
    (sum, h) => sum + (h.actionResult.metadata?.cost ?? 0),
    0
  );

  return {
    result: params.result,
    iterations: params.history.length,
    finalScore: params.finalEvaluation.score,
    converged: params.finalEvaluation.score >= params.targetScore,
    terminationReason: params.terminationReason,
    totalCost,
    totalLatency: Date.now() - params.startTime,
    history: params.history,
  };
}

/**
 * Build an error fallback IterationResult.
 */
export function buildErrorResult<Result, ActionData>(params: {
  result: Result;
  history: IterationHistory<ActionData>[];
  finalEvaluation: Evaluation;
  startTime: number;
}): IterationResult<Result, ActionData> {
  return {
    result: params.result,
    iterations: params.history.length,
    finalScore: params.finalEvaluation.score,
    converged: false,
    terminationReason: 'manual_stop',
    totalCost: params.history.reduce((sum, h) => sum + (h.actionResult.metadata?.cost ?? 0), 0),
    totalLatency: Date.now() - params.startTime,
    history: params.history,
  };
}
