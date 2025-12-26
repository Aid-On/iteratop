/**
 * IteratoP - Utils Tests
 */

import {
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
  combineEvaluations,
  calculateScore,
  withRetry,
  withTimeout,
  sleep,
} from './utils';
import { IterationHistory, ActionResult } from './types';

describe('createEvaluation', () => {
  it('should create evaluation with score', () => {
    const eval1 = createEvaluation(75);

    expect(eval1.score).toBe(75);
    expect(eval1.shouldContinue).toBe(false); // 75 >= 70
  });

  it('should clamp score to 0-100', () => {
    expect(createEvaluation(-10).score).toBe(0);
    expect(createEvaluation(150).score).toBe(100);
  });

  it('should accept custom options', () => {
    const eval1 = createEvaluation(50, {
      shouldContinue: false,
      feedback: 'Custom feedback',
      missingInfo: ['item1', 'item2'],
    });

    expect(eval1.shouldContinue).toBe(false);
    expect(eval1.feedback).toBe('Custom feedback');
    expect(eval1.missingInfo).toEqual(['item1', 'item2']);
  });

  it('should default shouldContinue based on score', () => {
    expect(createEvaluation(50).shouldContinue).toBe(true); // < 70
    expect(createEvaluation(70).shouldContinue).toBe(false); // >= 70
    expect(createEvaluation(90).shouldContinue).toBe(false); // >= 70
  });
});

describe('createActionResult', () => {
  it('should create action result with data', () => {
    const result = createActionResult({ foo: 'bar' });

    expect(result.data).toEqual({ foo: 'bar' });
    expect(result.metadata).toEqual({});
  });

  it('should include metadata', () => {
    const result = createActionResult([1, 2, 3], {
      cost: 0.05,
      latency: 100,
      sources: ['https://example.com'],
    });

    expect(result.data).toEqual([1, 2, 3]);
    expect(result.metadata?.cost).toBe(0.05);
    expect(result.metadata?.latency).toBe(100);
    expect(result.metadata?.sources).toEqual(['https://example.com']);
  });
});

describe('calculateTotalCost', () => {
  it('should sum costs from history', () => {
    const history: IterationHistory<unknown>[] = [
      {
        iteration: 0,
        actionResult: { data: null, metadata: { cost: 0.01 } },
        evaluation: createEvaluation(50),
        timestamp: Date.now(),
        duration: 100,
      },
      {
        iteration: 1,
        actionResult: { data: null, metadata: { cost: 0.02 } },
        evaluation: createEvaluation(70),
        timestamp: Date.now(),
        duration: 100,
      },
    ];

    expect(calculateTotalCost(history)).toBe(0.03);
  });

  it('should handle missing costs', () => {
    const history: IterationHistory<unknown>[] = [
      {
        iteration: 0,
        actionResult: { data: null },
        evaluation: createEvaluation(50),
        timestamp: Date.now(),
        duration: 100,
      },
    ];

    expect(calculateTotalCost(history)).toBe(0);
  });
});

describe('calculateAverageScore', () => {
  it('should calculate average score', () => {
    const history: IterationHistory<unknown>[] = [
      {
        iteration: 0,
        actionResult: { data: null },
        evaluation: createEvaluation(40),
        timestamp: Date.now(),
        duration: 100,
      },
      {
        iteration: 1,
        actionResult: { data: null },
        evaluation: createEvaluation(60),
        timestamp: Date.now(),
        duration: 100,
      },
      {
        iteration: 2,
        actionResult: { data: null },
        evaluation: createEvaluation(80),
        timestamp: Date.now(),
        duration: 100,
      },
    ];

    expect(calculateAverageScore(history)).toBe(60);
  });

  it('should return 0 for empty history', () => {
    expect(calculateAverageScore([])).toBe(0);
  });
});

describe('getScoreProgression', () => {
  it('should return array of scores', () => {
    const history: IterationHistory<unknown>[] = [
      {
        iteration: 0,
        actionResult: { data: null },
        evaluation: createEvaluation(30),
        timestamp: Date.now(),
        duration: 100,
      },
      {
        iteration: 1,
        actionResult: { data: null },
        evaluation: createEvaluation(50),
        timestamp: Date.now(),
        duration: 100,
      },
      {
        iteration: 2,
        actionResult: { data: null },
        evaluation: createEvaluation(70),
        timestamp: Date.now(),
        duration: 100,
      },
    ];

    expect(getScoreProgression(history)).toEqual([30, 50, 70]);
  });
});

describe('isImproving', () => {
  it('should return true when scores are increasing', () => {
    const history: IterationHistory<unknown>[] = [
      {
        iteration: 0,
        actionResult: { data: null },
        evaluation: createEvaluation(30),
        timestamp: Date.now(),
        duration: 100,
      },
      {
        iteration: 1,
        actionResult: { data: null },
        evaluation: createEvaluation(50),
        timestamp: Date.now(),
        duration: 100,
      },
    ];

    expect(isImproving(history)).toBe(true);
  });

  it('should return false when scores are decreasing', () => {
    const history: IterationHistory<unknown>[] = [
      {
        iteration: 0,
        actionResult: { data: null },
        evaluation: createEvaluation(60),
        timestamp: Date.now(),
        duration: 100,
      },
      {
        iteration: 1,
        actionResult: { data: null },
        evaluation: createEvaluation(40),
        timestamp: Date.now(),
        duration: 100,
      },
    ];

    expect(isImproving(history)).toBe(false);
  });

  it('should return true for insufficient history', () => {
    expect(isImproving([])).toBe(true);
    expect(isImproving([{} as any])).toBe(true);
  });
});

describe('mergeActionResults', () => {
  describe('generic mergeActionResults', () => {
    it('should merge using custom strategy', () => {
      const results: ActionResult<number>[] = [
        createActionResult(10, { cost: 0.01 }),
        createActionResult(20, { cost: 0.02 }),
        createActionResult(30, { cost: 0.03 }),
      ];

      const merged = mergeActionResults(
        results,
        (numbers) => numbers.reduce((sum, n) => sum + n, 0)
      );

      expect(merged.data).toBe(60);
      expect(merged.metadata?.cost).toBe(0.06);
    });
  });

  describe('mergeArrayActionResults', () => {
    it('should merge arrays from multiple results', () => {
      const results: ActionResult<number[]>[] = [
        createActionResult([1, 2], { cost: 0.01, sources: ['a'] }),
        createActionResult([3, 4], { cost: 0.02, sources: ['b'] }),
      ];

      const merged = mergeArrayActionResults(results);

      expect(merged.data).toEqual([1, 2, 3, 4]);
      expect(merged.metadata?.cost).toBe(0.03);
      expect(merged.metadata?.sources).toEqual(['a', 'b']);
    });

    it('should deduplicate when dedupe function provided', () => {
      const results: ActionResult<{ id: number; name: string }[]>[] = [
        createActionResult([
          { id: 1, name: 'a' },
          { id: 2, name: 'b' },
        ]),
        createActionResult([
          { id: 2, name: 'b' },
          { id: 3, name: 'c' },
        ]),
      ];

      const merged = mergeArrayActionResults(results, (item) => String(item.id));

      expect(merged.data.length).toBe(3);
      expect(merged.data.map((d) => d.id)).toEqual([1, 2, 3]);
    });
  });

  describe('mergeObjectActionResults', () => {
    it('should shallow merge objects by default', () => {
      const results: ActionResult<{ a?: number; b?: number }>[] = [
        createActionResult({ a: 1 }, { cost: 0.01 }),
        createActionResult({ b: 2 }, { cost: 0.02 }),
      ];

      const merged = mergeObjectActionResults(results);

      expect(merged.data).toEqual({ a: 1, b: 2 });
      expect(merged.metadata?.cost).toBe(0.03);
    });

    it('should deep merge when specified', () => {
      const results: ActionResult<{ nested: { x?: number; y?: number } }>[] = [
        createActionResult({ nested: { x: 1 } }),
        createActionResult({ nested: { y: 2 } }),
      ];

      const merged = mergeObjectActionResults(results, 'deep');

      expect(merged.data).toEqual({ nested: { x: 1, y: 2 } });
    });

    it('should use custom merge strategy', () => {
      type Data = { values: number[] };
      const results: ActionResult<Data>[] = [
        createActionResult({ values: [1, 2] }),
        createActionResult({ values: [3, 4] }),
      ];

      const merged = mergeObjectActionResults(results, (objects) => ({
        values: objects.flatMap(o => o.values),
      }));

      expect(merged.data).toEqual({ values: [1, 2, 3, 4] });
    });

    it('should handle deeply nested objects with deep merge', () => {
      const results: ActionResult<any>[] = [
        createActionResult({
          level1: {
            level2: {
              level3: {
                a: 1,
                shared: { x: 1 }
              }
            },
            arr: [1, 2]
          }
        }),
        createActionResult({
          level1: {
            level2: {
              level3: {
                b: 2,
                shared: { y: 2 }
              },
              newProp: 'test'
            },
            arr: [3, 4] // Arrays are replaced
          }
        }),
      ];

      const merged = mergeObjectActionResults(results, 'deep');

      expect(merged.data).toEqual({
        level1: {
          level2: {
            level3: {
              a: 1,
              b: 2,
              shared: { x: 1, y: 2 }
            },
            newProp: 'test'
          },
          arr: [3, 4] // Replaced, not concatenated
        }
      });
    });

    it('should handle null and undefined values in deep merge', () => {
      const results: ActionResult<any>[] = [
        createActionResult({ a: null, b: { x: 1 }, c: undefined }),
        createActionResult({ a: { y: 2 }, b: null, d: 3 }),
      ];

      const merged = mergeObjectActionResults(results, 'deep');

      expect(merged.data).toEqual({
        a: { y: 2 },
        b: null,
        c: undefined,
        d: 3
      });
    });
  });
});

describe('deduplicateBy', () => {
  it('should remove duplicates based on key function', () => {
    const items = [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
      { id: 1, name: 'c' }, // Duplicate id
    ];

    const result = deduplicateBy(items, (item) => String(item.id));

    expect(result.length).toBe(2);
    expect(result[0].name).toBe('a'); // First occurrence kept
    expect(result[1].name).toBe('b');
  });
});

describe('combineEvaluations', () => {
  it('should combine evaluations with equal weights', () => {
    const evals = [
      createEvaluation(60, { feedback: 'A' }),
      createEvaluation(80, { feedback: 'B' }),
    ];

    const combined = combineEvaluations(evals);

    expect(combined.score).toBe(70);
    expect(combined.feedback).toBe('A; B');
  });

  it('should combine with custom weights', () => {
    const evals = [
      createEvaluation(100, { feedback: 'Important' }),
      createEvaluation(0, { feedback: 'Less important' }),
    ];

    const combined = combineEvaluations(evals, [0.8, 0.2]);

    expect(combined.score).toBe(80);
  });

  it('should merge missingInfo', () => {
    const evals = [
      createEvaluation(50, { missingInfo: ['a', 'b'] }),
      createEvaluation(60, { missingInfo: ['b', 'c'] }),
    ];

    const combined = combineEvaluations(evals);

    expect(combined.missingInfo).toEqual(['a', 'b', 'c']); // Deduplicated
  });

  it('should set shouldContinue if any evaluation says continue', () => {
    const evals = [
      createEvaluation(80, { shouldContinue: false }),
      createEvaluation(40, { shouldContinue: true }),
    ];

    const combined = combineEvaluations(evals);

    expect(combined.shouldContinue).toBe(true);
  });
});

describe('calculateScore', () => {
  it('should calculate score from criteria', () => {
    const score = calculateScore([
      { met: true },
      { met: true },
      { met: false },
    ]);

    expect(score).toBe(67); // 2/3 = 0.666...
  });

  it('should handle weighted criteria', () => {
    const score = calculateScore([
      { met: true, weight: 3 },
      { met: false, weight: 1 },
    ]);

    expect(score).toBe(75); // 3/4
  });

  it('should return 0 for empty criteria', () => {
    expect(calculateScore([])).toBe(0);
  });
});

describe('withRetry', () => {
  it('should return result on success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, { initialDelay: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'));

    await expect(
      withRetry(fn, { maxRetries: 2, initialDelay: 10 })
    ).rejects.toThrow('always fail');

    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});

describe('withTimeout', () => {
  it('should return result if within timeout', async () => {
    const promise = Promise.resolve('fast');

    const result = await withTimeout(promise, 1000);

    expect(result).toBe('fast');
  });

  it('should throw on timeout', async () => {
    const slowPromise = new Promise((resolve) => setTimeout(resolve, 1000));

    await expect(withTimeout(slowPromise, 10)).rejects.toThrow('timed out');
  });

  it('should use custom timeout message', async () => {
    const slowPromise = new Promise((resolve) => setTimeout(resolve, 1000));

    await expect(
      withTimeout(slowPromise, 10, 'Custom timeout')
    ).rejects.toThrow('Custom timeout');
  });
});

describe('sleep', () => {
  it('should delay execution', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some tolerance
  });
});
