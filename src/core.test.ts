/**
 * IteratoP - Core Tests (basic convergence, cost, history, events, errors)
 */

import { createIterator } from './core';
import {
  createEvaluation,
  createActionResult,
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

describe('IterationProcessor', () => {
  describe('basic convergence', () => {
    it('should converge when score reaches targetScore', async () => {
      const processor = createIterator(createMockOptions(), {
        maxIterations: 10,
        targetScore: 70,
      });

      const result = await processor.run(5);

      expect(result.converged).toBe(true);
      expect(result.finalScore).toBeGreaterThanOrEqual(70);
      expect(result.result.finalValue).toBe(6);
      expect(result.iterations).toBe(2);
    });

    it('should stop at maxIterations if not converged', async () => {
      const processor = createIterator(createMockOptions((v) => v), {
        maxIterations: 3,
        targetScore: 70,
      });

      const result = await processor.run(1);

      expect(result.converged).toBe(false);
      expect(result.terminationReason).toBe('max_iterations');
      expect(result.iterations).toBe(3);
      expect(result.result.finalValue).toBe(3);
    });

    it('should early stop when earlyStopScore is reached', async () => {
      const processor = createIterator(createMockOptions((v) => v * 20), {
        maxIterations: 10,
        targetScore: 70,
        earlyStopScore: 95,
      });

      const result = await processor.run(4);

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

      expect(result.totalCost).toBe(0.02);
    });
  });

  describe('history tracking', () => {
    it('should record all iterations in history', async () => {
      const processor = createIterator(createMockOptions((v) => v * 10), {
        maxIterations: 10,
        targetScore: 70,
      });

      const result = await processor.run(3);

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

      await processor.run(2);

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
      options.onError = async (_error) => ({
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
      const options = createMockOptions((v) => v * 5);
      options.shouldTerminate = (state) => state.value >= 4;

      const processor = createIterator(options, {
        maxIterations: 10,
        targetScore: 70,
      });

      const result = await processor.run(1);

      expect(result.terminationReason).toBe('manual_stop');
      expect(result.result.finalValue).toBe(4);
    });
  });
});
