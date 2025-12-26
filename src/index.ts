/**
 * IteratoP - Iteration Processor
 *
 * A library for convergent iteration loops with LLMs.
 * Inspired by Scrum iterations and OODA loops.
 *
 * @example
 * ```typescript
 * import { createIterator, createEvaluation, createActionResult } from '@aid-on/iteratop';
 *
 * const processor = createIterator({
 *   initialize: async (input) => ({ query: input, results: [] }),
 *   act: async (state) => createActionResult(await search(state.query)),
 *   evaluate: async (state, actionResult) => {
 *     const score = calculateConfidence(state, actionResult);
 *     return createEvaluation(score, { shouldContinue: score < 70 });
 *   },
 *   transition: async (state, actionResult, evaluation) => ({
 *     ...state,
 *     results: [...state.results, ...actionResult.data],
 *     query: refineQuery(state.query, evaluation.missingInfo),
 *   }),
 *   finalize: async (state) => ({ answer: synthesize(state.results) }),
 * });
 *
 * const result = await processor.run("What is the capital of France?");
 * ```
 */

// Core
export { IterationProcessor, createIterator } from './core';

// Builder
export { 
  IterationBuilder, 
  iterationBuilder,
  DEFAULT_PRESETS,
  type PresetName 
} from './builder';

// Types
export type {
  Evaluation,
  ActionResult,
  IterationConfig,
  ResolvedConfig,
  IterationContext,
  IterationHistory,
  IterationResult,
  IterationOptions,
  IterationEvent,
  IterationEventListener,
} from './types';

// Utilities
export {
  createEvaluation,
  createActionResult,
  calculateTotalCost,
  calculateAverageScore,
  getScoreProgression,
  isImproving,
  mergeActionResults,
  mergeArrayActionResults,
  mergeObjectActionResults,
  deduplicateBy,
  withRetry,
  sleep,
  withTimeout,
  combineEvaluations,
  calculateScore,
} from './utils';

// Nagare streaming exports
export { 
  StreamingIteratoP, 
  StreamingIteratoPBuilder,
  createStreamingIterator,
  type StreamingState
} from './stream';
