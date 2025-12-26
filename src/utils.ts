/**
 * IteratoP - Utility Functions
 */

import type { Evaluation, ActionResult, IterationHistory } from './types';

/**
 * Create a simple evaluation result
 */
export function createEvaluation(
  score: number,
  options: Partial<Omit<Evaluation, 'score'>> = {}
): Evaluation {
  return {
    score: Math.max(0, Math.min(100, score)),
    shouldContinue: options.shouldContinue ?? score < 70,
    feedback: options.feedback ?? '',
    missingInfo: options.missingInfo,
    metadata: options.metadata,
  };
}

/**
 * Create an action result
 */
export function createActionResult<T>(
  data: T,
  options: ActionResult<T>['metadata'] = {}
): ActionResult<T> {
  return {
    data,
    metadata: options,
  };
}

/**
 * Calculate total cost from history
 */
export function calculateTotalCost<T>(history: IterationHistory<T>[]): number {
  return history.reduce((sum, h) => sum + (h.actionResult.metadata?.cost ?? 0), 0);
}

/**
 * Calculate average score from history
 */
export function calculateAverageScore<T>(history: IterationHistory<T>[]): number {
  if (history.length === 0) return 0;
  const total = history.reduce((sum, h) => sum + h.evaluation.score, 0);
  return total / history.length;
}

/**
 * Get score progression from history
 */
export function getScoreProgression<T>(history: IterationHistory<T>[]): number[] {
  return history.map((h) => h.evaluation.score);
}

/**
 * Check if scores are improving
 */
export function isImproving<T>(history: IterationHistory<T>[], windowSize = 2): boolean {
  if (history.length < windowSize) return true;
  const recent = history.slice(-windowSize);
  const scores = recent.map((h) => h.evaluation.score);
  // Check if last score is better than first in window
  return scores[scores.length - 1] > scores[0];
}

/**
 * Merge multiple action results (generic version)
 */
export function mergeActionResults<T>(
  results: ActionResult<T>[],
  mergeStrategy: (items: T[]) => T
): ActionResult<T> {
  const mergedData = mergeStrategy(results.map(r => r.data));
  
  const totalCost = results.reduce((sum, r) => sum + (r.metadata?.cost ?? 0), 0);
  const totalLatency = results.reduce((sum, r) => sum + (r.metadata?.latency ?? 0), 0);
  const allSources = results.flatMap((r) => r.metadata?.sources ?? []);
  const allWarnings = results.flatMap((r) => r.metadata?.warnings ?? []);

  return {
    data: mergedData,
    metadata: {
      cost: totalCost,
      latency: totalLatency,
      sources: [...new Set(allSources)],
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
    },
  };
}

/**
 * Merge multiple action results with array data
 */
export function mergeArrayActionResults<T>(
  results: ActionResult<T[]>[],
  dedupe?: (item: T) => string
): ActionResult<T[]> {
  return mergeActionResults(
    results,
    (arrays) => {
      const flattened = arrays.flat();
      return dedupe ? deduplicateBy(flattened, dedupe) : flattened;
    }
  );
}

/**
 * Merge multiple action results with object data
 * 
 * @param results - Array of action results to merge
 * @param mergeStrategy - Strategy for merging objects:
 *   - 'shallow': Object.assign style merge (default)
 *   - 'deep': Deep merge (arrays are replaced, not concatenated)
 *   - Function: Custom merge strategy
 * 
 * Note: When using 'deep' merge, arrays are replaced entirely, not concatenated.
 * For array concatenation, use a custom merge function.
 */
export function mergeObjectActionResults<T extends Record<string, unknown>>(
  results: ActionResult<T>[],
  mergeStrategy?: 'shallow' | 'deep' | ((objects: T[]) => T)
): ActionResult<T> {
  const strategy = typeof mergeStrategy === 'function' 
    ? mergeStrategy
    : mergeStrategy === 'deep'
    ? (objects: T[]) => deepMerge<T>(...objects)
    : (objects: T[]) => Object.assign({}, ...objects) as T;

  return mergeActionResults(results, strategy);
}

/**
 * Deduplicate array by key function
 */
export function deduplicateBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    const key = getKey(item);
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values());
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        await sleep(delay);
        delay = Math.min(delay * backoffFactor, maxDelay);
      }
    }
  }

  throw lastError;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a timeout promise
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), timeoutMs)
    ),
  ]);
}

/**
 * Combine multiple evaluations into one
 * (useful when evaluating multiple aspects)
 */
export function combineEvaluations(
  evaluations: Evaluation[],
  weights?: number[]
): Evaluation {
  if (evaluations.length === 0) {
    return createEvaluation(0, { shouldContinue: false, feedback: 'No evaluations provided' });
  }

  const normalizedWeights = weights ?? evaluations.map(() => 1 / evaluations.length);
  const totalWeight = normalizedWeights.reduce((sum, w) => sum + w, 0);

  const weightedScore = evaluations.reduce(
    (sum, eval_, i) => sum + eval_.score * (normalizedWeights[i] / totalWeight),
    0
  );

  const allMissingInfo = evaluations.flatMap((e) => e.missingInfo ?? []);
  const shouldContinue = evaluations.some((e) => e.shouldContinue);
  const feedbacks = evaluations.map((e) => e.feedback).filter(Boolean);

  return createEvaluation(weightedScore, {
    shouldContinue,
    feedback: feedbacks.join('; '),
    missingInfo: allMissingInfo.length > 0 ? [...new Set(allMissingInfo)] : undefined,
  });
}

/**
 * Simple score calculator based on criteria matching
 */
export function calculateScore(
  criteria: { met: boolean; weight?: number }[]
): number {
  if (criteria.length === 0) return 0;

  const totalWeight = criteria.reduce((sum, c) => sum + (c.weight ?? 1), 0);
  const metWeight = criteria
    .filter((c) => c.met)
    .reduce((sum, c) => sum + (c.weight ?? 1), 0);

  return Math.round((metWeight / totalWeight) * 100);
}

/**
 * Deep merge objects
 * 
 * Arrays are replaced entirely, not concatenated.
 * Nested objects are recursively merged.
 * 
 * @example
 * deepMerge({ a: [1], b: { x: 1 } }, { a: [2], b: { y: 2 } })
 * // Returns: { a: [2], b: { x: 1, y: 2 } }
 */
function deepMerge<T extends Record<string, unknown>>(...objects: T[]): T {
  const result: Record<string, unknown> = {};
  
  for (const obj of objects) {
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively merge nested objects
        result[key] = deepMerge(
          (result[key] as Record<string, unknown>) ?? {},
          value as Record<string, unknown>
        );
      } else {
        // Replace arrays and primitives entirely
        result[key] = value;
      }
    }
  }
  
  return result as T;
}
