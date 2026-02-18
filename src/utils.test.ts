/** IteratoP - Utils Tests (basic utilities) */
import {
  createEvaluation,
  createActionResult,
  calculateTotalCost,
  calculateAverageScore,
  getScoreProgression,
  isImproving,
  deduplicateBy,
  combineEvaluations,
  calculateScore,
} from './utils';
import { IterationHistory } from './types';

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
    expect(isImproving([{} as unknown as IterationHistory<unknown>])).toBe(true);
  });
});

describe('deduplicateBy', () => {
  it('should remove duplicates based on key function', () => {
    const items = [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
      { id: 1, name: 'c' },
    ];

    const result = deduplicateBy(items, (item) => String(item.id));
    expect(result.length).toBe(2);
    expect(result[0].name).toBe('a');
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

    expect(combined.missingInfo).toEqual(['a', 'b', 'c']);
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

    expect(score).toBe(67);
  });

  it('should handle weighted criteria', () => {
    const score = calculateScore([
      { met: true, weight: 3 },
      { met: false, weight: 1 },
    ]);

    expect(score).toBe(75);
  });

  it('should return 0 for empty criteria', () => {
    expect(calculateScore([])).toBe(0);
  });
});
