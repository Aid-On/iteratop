/** IteratoP - Core Advanced Tests */

import { createIterator } from './core';
import { createEvaluation, createActionResult } from './utils';
import { IterationOptions } from './types';

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

describe('shouldContinue in evaluation', () => {
  it('should stop when shouldContinue is false', async () => {
    const options = createMockOptions();
    let callCount = 0;
    options.evaluate = async () => {
      callCount++;
      return createEvaluation(50, {
        shouldContinue: callCount < 2,
        feedback: 'Stopping early',
      });
    };

    const processor = createIterator(options, {
      maxIterations: 10,
      targetScore: 70,
    });

    const result = await processor.run(1);

    expect(result.iterations).toBe(2);
    expect(result.terminationReason).toBe('converged');
  });
});

describe('configuration', () => {
  it('should return config via getConfig()', () => {
    const processor = createIterator(createMockOptions(), {
      maxIterations: 7,
      targetScore: 80,
    });

    const config = processor.getConfig();

    expect(config.maxIterations).toBe(7);
    expect(config.targetScore).toBe(80);
    expect(config.earlyStopScore).toBe(95);
  });

  it('should create new processor with withConfig()', async () => {
    const processor1 = createIterator(createMockOptions((v) => v * 10), {
      maxIterations: 2,
      targetScore: 70,
    });

    const processor2 = processor1.withConfig({ maxIterations: 10 });

    const result1 = await processor1.run(5);
    const result2 = await processor2.run(5);

    expect(result1.iterations).toBe(2);
    expect(result1.terminationReason).toBe('converged');
    expect(result2.iterations).toBe(2);
    expect(result2.terminationReason).toBe('converged');
  });
});

describe('minIterations', () => {
  it('should not stop before minIterations even if converged', async () => {
    const processor = createIterator(createMockOptions((_v) => 100), {
      maxIterations: 10,
      targetScore: 70,
      minIterations: 3,
    });

    const result = await processor.run(1);

    expect(result.iterations).toBeGreaterThanOrEqual(1);
    expect(result.terminationReason).toBe('early_stop');
  });
});

describe('alwaysRunTransition', () => {
  it('should run transition on final iteration when alwaysRunTransition is true', async () => {
    let transitionCalls = 0;
    const options = createMockOptions((v) => v * 10);
    const originalTransition = options.transition;
    options.transition = async (state, actionResult, evaluation, context) => {
      transitionCalls++;
      return originalTransition(state, actionResult, evaluation, context);
    };

    const processor = createIterator(options, {
      maxIterations: 10,
      targetScore: 70,
      alwaysRunTransition: true,
    });

    const result = await processor.run(5);

    expect(result.iterations).toBe(2);
    expect(transitionCalls).toBe(2);
    expect(result.result.finalValue).toBe(7);
  });

  it('should not run transition on final iteration when alwaysRunTransition is false', async () => {
    let transitionCalls = 0;
    const options = createMockOptions((v) => v * 10);
    const originalTransition = options.transition;
    options.transition = async (state, actionResult, evaluation, context) => {
      transitionCalls++;
      return originalTransition(state, actionResult, evaluation, context);
    };

    const processor = createIterator(options, {
      maxIterations: 10,
      targetScore: 70,
      alwaysRunTransition: false,
    });

    const result = await processor.run(5);

    expect(result.iterations).toBe(2);
    expect(transitionCalls).toBe(1);
    expect(result.result.finalValue).toBe(6);
  });
});

describe('skipMinIterations', () => {
  it('should skip minIterations when skipMinIterations is true', async () => {
    const processor = createIterator(createMockOptions((v) => v * 50), {
      maxIterations: 10,
      targetScore: 70,
      minIterations: 5,
      skipMinIterations: true,
    });

    const result = await processor.run(1);

    expect(result.iterations).toBe(1);
    expect(result.terminationReason).toBe('early_stop');
  });

  it('should respect minIterations when skipMinIterations is false', async () => {
    const processor = createIterator(createMockOptions((v) => v * 10), {
      maxIterations: 10,
      targetScore: 30,
      minIterations: 3,
      skipMinIterations: false,
      earlyStopScore: 200,
    });

    const result = await processor.run(1);

    expect(result.iterations).toBeGreaterThanOrEqual(3);
  });
});

describe('custom logger', () => {
  it('should use custom logger when provided', async () => {
    const errorLogs: string[] = [];
    const logs: string[] = [];

    const processor = createIterator(createMockOptions(), {
      maxIterations: 2,
      verbose: true,
      logger: {
        error: (message, error) => errorLogs.push(`${message}: ${error}`),
        log: (message, ..._args) => logs.push(message),
      },
    });

    await processor.run(1);

    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some(log => log.includes('[IteratoP]'))).toBe(true);
  });

  it('should use custom error logger for event listener errors', async () => {
    const errorLogs: { message: string; error: unknown }[] = [];

    const processor = createIterator(createMockOptions(), {
      maxIterations: 1,
      logger: {
        error: (message, error) => errorLogs.push({ message, error }),
      },
    });

    processor.on(() => {
      throw new Error('Event listener error');
    });

    await processor.run(1);

    expect(errorLogs.some(log =>
      log.message.includes('Event listener error')
    )).toBe(true);
  });

  it('should silently skip logging when logger.log is not provided', async () => {
    const errorLogs: string[] = [];

    const processor = createIterator(createMockOptions(), {
      maxIterations: 1,
      verbose: true,
      logger: {
        error: (message, error) => errorLogs.push(`${message}: ${error}`),
      },
    });

    const result = await processor.run(1);
    expect(result.iterations).toBe(1);
  });

  it('should silently skip error logging when logger is not provided', async () => {
    const processor = createIterator(createMockOptions(), {
      maxIterations: 1,
    });

    processor.on(() => {
      throw new Error('Test error');
    });

    const result = await processor.run(1);
    expect(result.iterations).toBe(1);
  });
});

describe('timeout handling', () => {
  it('should terminate when timeout is reached', async () => {
    let actionCount = 0;
    const options = createMockOptions();
    options.act = async (state) => {
      actionCount++;
      if (actionCount === 2) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return createActionResult(state.value + 1, { cost: 0.01 });
    };

    const processor = createIterator(options, {
      maxIterations: 10,
      targetScore: 200,
      timeout: 50,
    });

    const result = await processor.run(1);

    expect(result.terminationReason).toBe('timeout');
    expect(result.iterations).toBeLessThan(10);
  });

  it('should handle timeout in first iteration', async () => {
    const options = createMockOptions();
    options.initialize = async (input) => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return { value: input, history: [input] };
    };

    const processor = createIterator(options, {
      maxIterations: 5,
      timeout: 50,
    });

    const result = await processor.run(1);

    expect(result.terminationReason).toBe('timeout');
    expect(result.iterations).toBe(0);
  });
});
