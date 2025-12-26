/**
 * IteratoP - Builder Pattern Tests
 */

import { iterationBuilder } from './builder';
import { createActionResult, createEvaluation } from './utils';

describe('IterationBuilder', () => {
  describe('fluent API', () => {
    it('should build processor with method chaining', async () => {
      const result = await iterationBuilder<number, { value: number }, number, number>()
        .initialize(async (input) => ({ value: input }))
        .act(async (state) => createActionResult(state.value + 1))
        .evaluate(async (_, result) => createEvaluation(result.data * 10))
        .transition(async (_, result) => ({ value: result.data }))
        .finalize(async (state) => state.value)
        .maxIterations(3)
        .targetScore(70)
        .run(5);

      expect(result.result).toBe(6); // 5->6(60)->7(70 converged, but transition not called)
      expect(result.converged).toBe(true);
    });

    it('should allow partial configuration', async () => {
      const processor = iterationBuilder<number, { value: number }, number, number>()
        .initialize(async (input) => ({ value: input }))
        .act(async (state) => createActionResult(state.value * 2))
        .evaluate(async (_, result) => createEvaluation(result.data))
        .transition(async (_, result) => ({ value: result.data }))
        .finalize(async (state) => state.value)
        .configure({
          maxIterations: 5,
          targetScore: 100,
          verbose: true,
        })
        .build();

      const config = processor.getConfig();
      expect(config.maxIterations).toBe(5);
      expect(config.targetScore).toBe(100);
      expect(config.verbose).toBe(true);
    });
  });

  describe('presets', () => {
    it('should apply fast preset', () => {
      const processor = iterationBuilder()
        .initialize(async () => ({}))
        .act(async () => createActionResult(null))
        .evaluate(async () => createEvaluation(100))
        .transition(async (state) => state)
        .finalize(async () => null)
        .preset('fast')
        .build();

      const config = processor.getConfig();
      expect(config.maxIterations).toBe(3);
      expect(config.targetScore).toBe(60);
      expect(config.skipMinIterations).toBe(true);
    });

    it('should apply thorough preset', () => {
      const processor = iterationBuilder()
        .initialize(async () => ({}))
        .act(async () => createActionResult(null))
        .evaluate(async () => createEvaluation(100))
        .transition(async (state) => state)
        .finalize(async () => null)
        .preset('thorough')
        .build();

      const config = processor.getConfig();
      expect(config.maxIterations).toBe(10);
      expect(config.targetScore).toBe(90);
      expect(config.minIterations).toBe(3);
    });

    it('should apply cost-optimized preset', () => {
      const processor = iterationBuilder()
        .initialize(async () => ({}))
        .act(async () => createActionResult(null))
        .evaluate(async () => createEvaluation(100))
        .transition(async (state) => state)
        .finalize(async () => null)
        .preset('cost-optimized')
        .build();

      const config = processor.getConfig();
      expect(config.maxIterations).toBe(3);
      expect(config.skipMinIterations).toBe(true);
      expect(config.alwaysRunTransition).toBe(false);
    });
  });

  describe('event listeners', () => {
    it('should attach event listeners', async () => {
      const events: any[] = [];

      await iterationBuilder<number, { value: number }, number, number>()
        .initialize(async (input) => ({ value: input }))
        .act(async () => createActionResult(100))
        .evaluate(async () => createEvaluation(100))
        .transition(async (state) => state)
        .finalize(async () => 100)
        .on((event) => events.push(event.type))
        .maxIterations(1)
        .run(1);

      expect(events).toContain('start');
      expect(events).toContain('complete');
    });
  });

  describe('optional handlers', () => {
    it('should set error handler', async () => {
      const result = await iterationBuilder<number, { value: number }, number, number>()
        .initialize(async (input) => ({ value: input }))
        .act(async () => {
          throw new Error('Test error');
        })
        .evaluate(async () => createEvaluation(0))
        .transition(async (state) => state)
        .finalize(async () => 0)
        .onError(async () => -1)
        .run(1);

      expect(result.result).toBe(-1);
    });

    it('should set custom termination', async () => {
      const result = await iterationBuilder<number, { value: number }, number, number>()
        .initialize(async (input) => ({ value: input }))
        .act(async (state) => createActionResult(state.value + 1))
        .evaluate(async () => createEvaluation(0))
        .transition(async (_, result) => ({ value: result.data }))
        .finalize(async (state) => state.value)
        .shouldTerminate((state) => state.value >= 3)
        .maxIterations(10)
        .run(1);

      expect(result.result).toBe(3);
      expect(result.terminationReason).toBe('manual_stop');
    });
  });

  describe('configuration methods', () => {
    it('should set all configuration options', () => {
      const mockLogger = {
        error: vi.fn(),
        log: vi.fn(),
      };

      const processor = iterationBuilder()
        .initialize(async () => ({}))
        .act(async () => createActionResult(null))
        .evaluate(async () => createEvaluation(100))
        .transition(async (state) => state)
        .finalize(async () => null)
        .maxIterations(7)
        .targetScore(80)
        .earlyStopScore(90)
        .minIterations(2)
        .timeout(5000)
        .verbose(true)
        .alwaysRunTransition(true)
        .skipMinIterations(false)
        .logger(mockLogger)
        .build();

      const config = processor.getConfig();
      expect(config.maxIterations).toBe(7);
      expect(config.targetScore).toBe(80);
      expect(config.earlyStopScore).toBe(90);
      expect(config.minIterations).toBe(2);
      expect(config.timeout).toBe(5000);
      expect(config.verbose).toBe(true);
      expect(config.alwaysRunTransition).toBe(true);
      expect(config.skipMinIterations).toBe(false);
      expect(config.logger).toBe(mockLogger);
    });
  });

  describe('validation', () => {
    it('should throw error when required functions are missing', () => {
      expect(() => {
        iterationBuilder().build();
      }).toThrow('initialize function is required');

      expect(() => {
        iterationBuilder()
          .initialize(async () => ({}))
          .build();
      }).toThrow('act function is required');

      expect(() => {
        iterationBuilder()
          .initialize(async () => ({}))
          .act(async () => createActionResult(null))
          .build();
      }).toThrow('evaluate function is required');

      expect(() => {
        iterationBuilder()
          .initialize(async () => ({}))
          .act(async () => createActionResult(null))
          .evaluate(async () => createEvaluation(100))
          .build();
      }).toThrow('transition function is required');

      expect(() => {
        iterationBuilder()
          .initialize(async () => ({}))
          .act(async () => createActionResult(null))
          .evaluate(async () => createEvaluation(100))
          .transition(async (state) => state)
          .build();
      }).toThrow('finalize function is required');
    });
  });
});