/**
 * IteratoP - Core Edge Cases, Dynamic Config, Validation, and Factory Tests
 */

import { createIterator } from './core';
import {
  createEvaluation,
  createActionResult,
  calculateTotalCost,
  calculateAverageScore,
  getScoreProgression,
  isImproving,
} from './utils';
import { IterationOptions, IterationEvent } from './types';

interface TestState {
  value: number;
  history: number[];
}

function createMockOptions(
  scoreFunction: (value: number) => number = (v) => v * 10
): IterationOptions<number, TestState, number, { finalValue: number }> {
  return {
    initialize: async (input) => ({
      value: input,
      history: [input],
    }),
    act: async (state) => {
      const newValue = state.value + 1;
      return createActionResult(newValue, { cost: 0.01 });
    },
    evaluate: async (_state, actionResult) => {
      const score = scoreFunction(actionResult.data);
      return createEvaluation(score, {
        shouldContinue: score < 70,
        feedback: `Score: ${score}`,
      });
    },
    transition: async (state, actionResult) => ({
      value: actionResult.data,
      history: [...state.history, actionResult.data],
    }),
    finalize: async (state) => ({
      finalValue: state.value,
    }),
  };
}

describe('dynamic configuration', () => {
  it('should update configuration dynamically', async () => {
    const processor = createIterator(createMockOptions(), {
      maxIterations: 5,
      targetScore: 80,
    });

    processor.updateConfig({ maxIterations: 10, targetScore: 90 });
    const config = processor.getConfig();

    expect(config.maxIterations).toBe(10);
    expect(config.targetScore).toBe(90);
  });

  it('should allow method chaining with updateConfig', async () => {
    const _events: IterationEvent[] = [];
    const processor = createIterator(createMockOptions(), {})
      .updateConfig({ maxIterations: 2 })
      .updateConfig({ targetScore: 60 })
      .updateConfig({ verbose: true });

    processor.on((e) => _events.push(e));

    const config = processor.getConfig();
    expect(config.maxIterations).toBe(2);
    expect(config.targetScore).toBe(60);
    expect(config.verbose).toBe(true);
  });

  it('should validate when updating configuration', () => {
    const processor = createIterator(createMockOptions(), {
      maxIterations: 5,
      minIterations: 2,
    });

    expect(() => {
      processor.updateConfig({ maxIterations: 1 });
    }).toThrow('minIterations (2) cannot be greater than maxIterations (1)');
  });

  it('should reset configuration to defaults', () => {
    const processor = createIterator(createMockOptions(), {
      maxIterations: 10,
      targetScore: 90,
      verbose: true,
    });

    processor.resetConfig();
    const config = processor.getConfig();

    expect(config.maxIterations).toBe(5);
    expect(config.targetScore).toBe(70);
    expect(config.verbose).toBe(false);
  });
});

describe('configuration validation', () => {
  it('should throw error when minIterations > maxIterations', () => {
    expect(() => {
      createIterator(createMockOptions(), {
        maxIterations: 3,
        minIterations: 5,
      });
    }).toThrow('minIterations (5) cannot be greater than maxIterations (3)');
  });

  it('should accept valid configurations', () => {
    expect(() => {
      createIterator(createMockOptions(), {
        maxIterations: 5,
        minIterations: 3,
      });
    }).not.toThrow();
  });
});

describe('edge cases', () => {
  it('should handle non-Error exceptions in error handler', async () => {
    const options = createMockOptions();
    options.act = async () => {
      throw new Error('string error');
    };
    options.onError = async (_error) => ({
      finalValue: -999,
    });

    const processor = createIterator(options, { maxIterations: 1 });
    const result = await processor.run(1);

    expect(result.result.finalValue).toBe(-999);
  });

  it('should handle getConfig immutability', () => {
    const processor = createIterator(createMockOptions(), {
      maxIterations: 5,
      targetScore: 80,
    });

    const config1 = processor.getConfig();
    config1.maxIterations = 999;

    const config2 = processor.getConfig();
    expect(config2.maxIterations).toBe(5);
  });

  it('should handle multiple event listener unsubscriptions', async () => {
    const events1: IterationEvent[] = [];
    const events2: IterationEvent[] = [];

    const processor = createIterator(createMockOptions(), {
      maxIterations: 1,
    });

    const unsubscribe1 = processor.on((e) => events1.push(e));
    processor.on((e) => events2.push(e));

    unsubscribe1();
    unsubscribe1();

    await processor.run(1);

    expect(events1.length).toBe(0);
    expect(events2.length).toBeGreaterThan(0);
  });

  it('should handle empty history in utility functions', () => {
    expect(calculateTotalCost([])).toBe(0);
    expect(calculateAverageScore([])).toBe(0);
    expect(getScoreProgression([])).toEqual([]);
    expect(isImproving([])).toBe(true);
  });

  it('should handle transition on terminated iteration with alwaysRunTransition', async () => {
    let transitionCount = 0;
    const options = createMockOptions((_v) => 100);
    options.transition = async (state, actionResult, _evaluation, _context) => {
      transitionCount++;
      return { value: actionResult.data, history: [...state.history, actionResult.data] };
    };

    const processor = createIterator(options, {
      maxIterations: 10,
      targetScore: 70,
      alwaysRunTransition: true,
      earlyStopScore: 95,
    });

    const result = await processor.run(1);

    expect(transitionCount).toBe(1);
    expect(result.terminationReason).toBe('early_stop');
    expect(result.result.finalValue).toBe(2);
  });
});

describe('createIterator factory', () => {
  it('should create a working processor', async () => {
    const processor = createIterator(
      {
        initialize: async (n: number) => ({ count: n }),
        act: async (state) => createActionResult(state.count + 1),
        evaluate: async (_, result) =>
          createEvaluation(result.data >= 5 ? 100 : 0),
        transition: async (_, result) => ({ count: result.data }),
        finalize: async (state) => state.count,
      },
      { maxIterations: 10, targetScore: 70 }
    );

    const result = await processor.run(1);

    expect(result.result).toBe(4);
    expect(result.converged).toBe(true);
  });
});
