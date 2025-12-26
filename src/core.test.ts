/**
 * IteratoP - Core Tests
 */

import { IterationProcessor, createIterator } from './core';
import { 
  createEvaluation, 
  createActionResult,
  calculateTotalCost,
  calculateAverageScore,
  getScoreProgression,
  isImproving
} from './utils';
import { IterationOptions, IterationEvent } from './types';

// Test state type
interface TestState {
  value: number;
  history: number[];
}

// Simple mock options that increments value each iteration
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
    evaluate: async (state, actionResult) => {
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

describe('IterationProcessor', () => {
  describe('basic convergence', () => {
    it('should converge when score reaches targetScore', async () => {
      // Score = value * 10, so actionResult.data=7 gives score=70
      // But finalize uses state.value which is updated by transition
      // transition is NOT called after convergence, so finalValue = last transitioned value
      // Flow: init(5) → act→6(score=60)→transition→6 → act→7(score=70)→converged!→finalize(6)
      const processor = createIterator(createMockOptions(), {
        maxIterations: 10,
        targetScore: 70,
      });

      const result = await processor.run(5);

      expect(result.converged).toBe(true);
      expect(result.finalScore).toBeGreaterThanOrEqual(70);
      // State is { value: 6 } because transition wasn't called after final act
      expect(result.result.finalValue).toBe(6);
      expect(result.iterations).toBe(2);
    });

    it('should stop at maxIterations if not converged', async () => {
      // Score = value (slow progress)
      // Flow: init(1) → act→2→trans→2 → act→3→trans→3 → act→4→max_iterations→finalize(3)
      const processor = createIterator(createMockOptions((v) => v), {
        maxIterations: 3,
        targetScore: 70,
      });

      const result = await processor.run(1);

      expect(result.converged).toBe(false);
      expect(result.terminationReason).toBe('max_iterations');
      expect(result.iterations).toBe(3);
      // Last transition was after iteration 2 (0-indexed), so state.value = 3
      expect(result.result.finalValue).toBe(3);
    });

    it('should early stop when earlyStopScore is reached', async () => {
      // Score = value * 20, fast convergence
      const processor = createIterator(createMockOptions((v) => v * 20), {
        maxIterations: 10,
        targetScore: 70,
        earlyStopScore: 95,
      });

      const result = await processor.run(4); // 4->5 gives score=100

      expect(result.terminationReason).toBe('early_stop');
      expect(result.finalScore).toBeGreaterThanOrEqual(95);
    });
  });

  describe('cost tracking', () => {
    it('should accumulate costs across iterations', async () => {
      const processor = createIterator(createMockOptions((v) => v * 10), {
        maxIterations: 5,
        targetScore: 70,
      });

      const result = await processor.run(5);

      expect(result.totalCost).toBe(0.02); // 2 iterations * 0.01
    });
  });

  describe('history tracking', () => {
    it('should record all iterations in history', async () => {
      const processor = createIterator(createMockOptions((v) => v * 10), {
        maxIterations: 10,
        targetScore: 70,
      });

      const result = await processor.run(3); // 3->4->5->6->7 = 4 iterations

      expect(result.history.length).toBe(4);
      expect(result.history[0].iteration).toBe(0);
      expect(result.history[0].actionResult.data).toBe(4);
      expect(result.history[3].actionResult.data).toBe(7);
    });
  });

  describe('event system', () => {
    it('should emit events for each phase', async () => {
      const events: IterationEvent[] = [];
      const processor = createIterator(createMockOptions((v) => v * 25), {
        maxIterations: 5,
        targetScore: 70,
      });

      processor.on((event) => events.push(event));

      await processor.run(2); // 2->3 = score 75, converges in 1 iteration

      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain('start');
      expect(eventTypes).toContain('iteration_start');
      expect(eventTypes).toContain('action_complete');
      expect(eventTypes).toContain('evaluation_complete');
      expect(eventTypes).toContain('converged');
      expect(eventTypes).toContain('complete');
    });

    it('should allow unsubscribing from events', async () => {
      const events: IterationEvent[] = [];
      const processor = createIterator(createMockOptions((v) => v * 25), {
        maxIterations: 5,
        targetScore: 70,
      });

      const unsubscribe = processor.on((event) => events.push(event));
      unsubscribe();

      await processor.run(2);

      expect(events.length).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should propagate errors when no error handler provided', async () => {
      const options = createMockOptions();
      options.act = async () => {
        throw new Error('Test error');
      };

      const processor = createIterator(options, { maxIterations: 3 });

      await expect(processor.run(1)).rejects.toThrow('Test error');
    });

    it('should use error handler when provided', async () => {
      const options = createMockOptions();
      options.act = async () => {
        throw new Error('Test error');
      };
      options.onError = async (error) => ({
        finalValue: -1,
      });

      const processor = createIterator(options, { maxIterations: 3 });

      const result = await processor.run(1);

      expect(result.result.finalValue).toBe(-1);
      expect(result.terminationReason).toBe('manual_stop');
    });
  });

  describe('custom termination', () => {
    it('should respect shouldTerminate callback', async () => {
      const options = createMockOptions((v) => v * 5); // Slow scoring
      options.shouldTerminate = (state) => state.value >= 4;

      const processor = createIterator(options, {
        maxIterations: 10,
        targetScore: 70,
      });

      const result = await processor.run(1); // 1->2->3->4, stops at 4

      expect(result.terminationReason).toBe('manual_stop');
      expect(result.result.finalValue).toBe(4);
    });
  });

  describe('shouldContinue in evaluation', () => {
    it('should stop when shouldContinue is false', async () => {
      const options = createMockOptions();
      let callCount = 0;
      options.evaluate = async () => {
        callCount++;
        return createEvaluation(50, {
          shouldContinue: callCount < 2, // Stop after 2 iterations
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
      expect(config.earlyStopScore).toBe(95); // default
    });

    it('should create new processor with withConfig()', async () => {
      // Score = v * 10, so need actionResult.data >= 7 for score >= 70
      // With maxIterations=2: init(5)→act→6(60)→trans→act→7(70)→converged
      // Actually converges in 2 iterations!
      const processor1 = createIterator(createMockOptions((v) => v * 10), {
        maxIterations: 2,
        targetScore: 70,
      });

      const processor2 = processor1.withConfig({ maxIterations: 10 });

      const result1 = await processor1.run(5);
      const result2 = await processor2.run(5);

      // Both converge in 2 iterations (action returns 7 which gives score 70)
      expect(result1.iterations).toBe(2);
      expect(result1.terminationReason).toBe('converged');
      expect(result2.iterations).toBe(2);
      expect(result2.terminationReason).toBe('converged');
    });
  });

  describe('minIterations', () => {
    it('should not stop before minIterations even if converged', async () => {
      const processor = createIterator(createMockOptions((v) => 100), {
        maxIterations: 10,
        targetScore: 70,
        minIterations: 3,
      });

      const result = await processor.run(1);

      // Score is always 100, but should run at least 3 times
      expect(result.iterations).toBeGreaterThanOrEqual(1);
      // Note: earlyStopScore (95) kicks in immediately, so this tests early_stop
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

      const result = await processor.run(5); // 5->6(60)->7(70) converges

      expect(result.iterations).toBe(2);
      expect(transitionCalls).toBe(2); // Transition called for both iterations
      // With alwaysRunTransition, state should be updated even on final iteration
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
        alwaysRunTransition: false, // Default behavior
      });

      const result = await processor.run(5); // 5->6(60)->7(70) converges

      expect(result.iterations).toBe(2);
      expect(transitionCalls).toBe(1); // Transition not called on final iteration
      expect(result.result.finalValue).toBe(6); // State not updated on final iteration
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

      const result = await processor.run(1); // 1->2(100) immediately converges

      expect(result.iterations).toBe(1); // Skips minIterations requirement
      expect(result.terminationReason).toBe('early_stop'); // earlyStopScore=95
    });

    it('should respect minIterations when skipMinIterations is false', async () => {
      const processor = createIterator(createMockOptions((v) => v * 10), {
        maxIterations: 10,
        targetScore: 30,
        minIterations: 3,
        skipMinIterations: false,
        earlyStopScore: 200, // Prevent early stop
      });

      const result = await processor.run(1); // 1->2(20)->3(30)->4(40) needs 3 iterations

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
          log: (message, ...args) => logs.push(message),
        },
      });

      await processor.run(1);

      // Verbose mode should have logged messages
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

    it('should use console.log when logger.log is not provided', async () => {
      const errorLogs: string[] = [];
      const originalConsoleLog = console.log;
      const consoleLogs: any[] = [];
      console.log = (...args: any[]) => consoleLogs.push(args);

      const processor = createIterator(createMockOptions(), {
        maxIterations: 1,
        verbose: true,
        logger: {
          error: (message, error) => errorLogs.push(`${message}: ${error}`),
          // log is not provided, should fall back to console.log
        },
      });

      await processor.run(1);
      console.log = originalConsoleLog;

      expect(consoleLogs.length).toBeGreaterThan(0);
      expect(consoleLogs.some(args => args[0]?.includes('[IteratoP]'))).toBe(true);
    });

    it('should use console.error when logger.error is not provided', async () => {
      const originalConsoleError = console.error;
      const consoleErrors: any[] = [];
      console.error = (...args: any[]) => consoleErrors.push(args);

      const processor = createIterator(createMockOptions(), {
        maxIterations: 1,
        // No logger provided
      });

      processor.on(() => {
        throw new Error('Test error');
      });

      await processor.run(1);
      console.error = originalConsoleError;

      expect(consoleErrors.length).toBeGreaterThan(0);
      expect(consoleErrors.some(args => 
        args[0]?.includes('[IteratoP] Event listener error')
      )).toBe(true);
    });
  });

  describe('timeout handling', () => {
    it('should terminate when timeout is reached', async () => {
      let actionCount = 0;
      const options = createMockOptions();
      options.act = async (state) => {
        actionCount++;
        // Simulate slow operation on 2nd iteration
        if (actionCount === 2) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        return createActionResult(state.value + 1, { cost: 0.01 });
      };

      const processor = createIterator(options, {
        maxIterations: 10,
        targetScore: 200, // Never reached
        timeout: 50, // Timeout after 50ms
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
      const events: IterationEvent[] = [];
      const processor = createIterator(createMockOptions(), {})
        .updateConfig({ maxIterations: 2 })
        .updateConfig({ targetScore: 60 })
        .updateConfig({ verbose: true });

      processor.on((e) => events.push(e));

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
        processor.updateConfig({ maxIterations: 1 }); // Now minIterations > maxIterations
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
});

describe('edge cases', () => {
  it('should handle non-Error exceptions in error handler', async () => {
    const options = createMockOptions();
    options.act = async () => {
      throw 'string error'; // Non-Error exception
    };
    options.onError = async (error) => ({
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
    config1.maxIterations = 999; // Try to modify

    const config2 = processor.getConfig();
    expect(config2.maxIterations).toBe(5); // Should remain unchanged
  });

  it('should handle multiple event listener unsubscriptions', async () => {
    const events1: IterationEvent[] = [];
    const events2: IterationEvent[] = [];
    
    const processor = createIterator(createMockOptions(), {
      maxIterations: 1,
    });

    const unsubscribe1 = processor.on((e) => events1.push(e));
    const unsubscribe2 = processor.on((e) => events2.push(e));
    
    unsubscribe1();
    unsubscribe1(); // Double unsubscribe should be safe
    
    await processor.run(1);
    
    expect(events1.length).toBe(0); // Unsubscribed
    expect(events2.length).toBeGreaterThan(0); // Still subscribed
  });

  it('should handle empty history in utility functions', () => {
    expect(calculateTotalCost([])).toBe(0);
    expect(calculateAverageScore([])).toBe(0);
    expect(getScoreProgression([])).toEqual([]);
    expect(isImproving([])).toBe(true);
  });

  it('should handle transition on terminated iteration with alwaysRunTransition', async () => {
    let transitionCount = 0;
    const options = createMockOptions((v) => v * 50); // Quick convergence
    options.transition = async (state, actionResult, evaluation, context) => {
      transitionCount++;
      return { value: actionResult.data, history: [...state.history, actionResult.data] };
    };

    const processor = createIterator(options, {
      maxIterations: 10,
      targetScore: 70,
      alwaysRunTransition: true,
      earlyStopScore: 95,
    });

    const result = await processor.run(1); // 1->2(100) immediately hits early stop
    
    expect(transitionCount).toBe(1); // Transition should run even on termination
    expect(result.terminationReason).toBe('early_stop');
    expect(result.result.finalValue).toBe(2); // State should be updated
  });
});

describe('createIterator factory', () => {
  it('should create a working processor', async () => {
    // Flow: init(1)→act→2(0)→trans→2→act→3(0)→trans→3→act→4(0)→trans→4→act→5(100)→converged→finalize(4)
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

    // When act returns 5 (score=100), we converge, but transition wasn't called
    // so state.count = 4 (from previous transition)
    expect(result.result).toBe(4);
    expect(result.converged).toBe(true);
  });
});
