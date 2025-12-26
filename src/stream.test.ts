import { describe, it, expect } from 'vitest';
import { StreamingIteratoP, StreamingIteratoPBuilder, createStreamingIterator } from './stream';
import { createEvaluation, createActionResult } from './utils';
import type { IterationContext } from './types';

describe('StreamingIteratoP', () => {
  describe('executeStream', () => {
    it('should stream iteration states', async () => {
      const processor = new StreamingIteratoP(
        {
          initialize: async (input: number) => ({ value: input }),
          act: async (state) => createActionResult({ data: 'test' }),
          evaluate: async (state, actionResult, context) => createEvaluation(state.value * 30, {
            shouldContinue: state.value < 3,
            feedback: 'Continue',
          }),
          transition: async (state) => ({ value: state.value + 1 }),
          finalize: async (state) => state,
        },
        { maxIterations: 5, targetScore: 90 }
      );

      const states: any[] = [];
      const stream = await processor.executeStream(0);
      
      for await (const state of stream) {
        states.push({ ...state });
      }

      expect(states.length).toBeGreaterThan(0);
      expect(states[states.length - 1].converged).toBe(true);
      expect(states[states.length - 1].state.value).toBe(3);
    });

    it('should handle timeout in stream', async () => {
      const processor = new StreamingIteratoP(
        {
          initialize: async (input: number) => ({ value: input }),
          act: async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return createActionResult({ data: 'test' });
          },
          evaluate: async () => createEvaluation(50, {
            shouldContinue: true,
            feedback: 'Continue',
          }),
          transition: async (state) => state,
          finalize: async (state) => state,
        },
        { maxIterations: 10, timeout: 150 }
      );

      const states: any[] = [];
      const stream = await processor.executeStream(0);
      
      for await (const state of stream) {
        states.push({ ...state });
      }

      const lastState = states[states.length - 1];
      expect(lastState.timedOut).toBe(true);
      expect(lastState.iteration).toBeLessThan(10);
    });
  });

  describe('evaluationStream', () => {
    it('should stream evaluations only', async () => {
      const processor = new StreamingIteratoP(
        {
          initialize: async (input: number) => ({ value: input }),
          act: async () => createActionResult({ result: 'action' }),
          evaluate: async (state, actionResult, context) => createEvaluation(context.iteration * 40, {
            shouldContinue: context.iteration < 2,
            feedback: `Iteration ${context.iteration}`,
          }),
          transition: async (state) => state,
          finalize: async (state) => state,
        },
        { maxIterations: 3 }
      );

      const evaluations: any[] = [];
      const stream = await processor.evaluationStream(0);
      
      for await (const evaluation of stream) {
        evaluations.push(evaluation);
      }

      // We get 2 evaluations (iterations 1 and 2)
      expect(evaluations.length).toBe(2);
      expect(evaluations[0].score).toBe(40);
      expect(evaluations[1].score).toBe(80);
    });
  });

  describe('actionStream', () => {
    it('should stream action results only', async () => {
      const processor = new StreamingIteratoP(
        {
          initialize: async (input: number) => ({ value: input }),
          act: async (state, context) => createActionResult({ 
            result: `action-${context.iteration}` 
          }),
          evaluate: async (state, actionResult, context) => createEvaluation(context.iteration * 50, {
            shouldContinue: context.iteration < 2,
            feedback: 'Continue',
          }),
          transition: async (state) => state,
          finalize: async (state) => state,
        },
        { maxIterations: 3 }
      );

      const actions: any[] = [];
      const stream = await processor.actionStream(0);
      
      for await (const action of stream) {
        actions.push(action);
      }

      // We get 2 actions (iterations 1 and 2)
      expect(actions.length).toBe(2);  
      expect(actions[0].data.result).toBe('action-1');
      expect(actions[1].data.result).toBe('action-2');
    });
  });

  describe('StreamingIteratoPBuilder', () => {
    it('should build a streaming processor with builder pattern', async () => {
      const builder = new StreamingIteratoPBuilder<number, { value: number }, { result: string }>();
      
      const processor = builder
        .withInitialize(async (input) => ({ value: input }))
        .withAct(async () => createActionResult({ result: 'test' }))
        .withEvaluate(async (state) => createEvaluation(state.value * 50, {
          shouldContinue: state.value < 2,
          feedback: 'Continue',
        }))
        .withTransition(async (state) => ({ value: state.value + 1 }))
        .withMaxIterations(5)
        .withTargetScore(100)
        .build();

      const states: any[] = [];
      const stream = await processor.executeStream(0);
      
      for await (const state of stream) {
        states.push({ ...state });
      }

      expect(states[states.length - 1].converged).toBe(true);
    });

    it('should throw error when required functions are missing', () => {
      const builder = new StreamingIteratoPBuilder();
      
      expect(() => builder.build()).toThrowError(
        'initialize, act, and evaluate functions are required'
      );
    });

    it('should set all configuration options', () => {
      const builder = new StreamingIteratoPBuilder<number, { value: number }, any>();

      const processor = builder
        .withInitialize(async (input) => ({ value: input }))
        .withAct(async () => createActionResult({}))
        .withEvaluate(async () => createEvaluation(100, {
          shouldContinue: false,
          feedback: 'Done',
        }))
        .withTransition(async (state) => state)
        .withFinalize(async (state) => ({ final: state }))
        .withOptions({ 
          verbose: true, 
          minIterations: 2,
          skipMinIterations: true,
        })
        .withTimeout(5000)
        .build();

      expect(processor).toBeDefined();
    });
  });

  describe('createStreamingIterator', () => {
    it('should create a streaming processor directly', async () => {
      const processor = createStreamingIterator(
        {
          initialize: async (input: number) => ({ value: input }),
          act: async () => createActionResult({ result: 'action' }),
          evaluate: async (state) => createEvaluation(state.value * 50, {
            shouldContinue: state.value < 2,
            feedback: 'Continue',
          }),
          transition: async (state) => ({ value: state.value + 1 }),
          finalize: async (state) => state,
        },
        { maxIterations: 3 }
      );

      const states: any[] = [];
      const stream = await processor.executeStream(0);
      
      for await (const state of stream) {
        states.push({ ...state });
      }

      expect(states.length).toBeGreaterThan(0);
      expect(states[states.length - 1].converged).toBe(true);
    });

    it('should support non-streaming execute method', async () => {
      const processor = createStreamingIterator<number, {value: number}, {result: string}, {final: number}>(
        {
          initialize: async (input: number) => ({ value: input }),
          act: async () => createActionResult({ result: 'test' }),
          evaluate: async () => createEvaluation(100, {
            shouldContinue: false,
            feedback: 'Done',
          }),
          transition: async (state) => state,
          finalize: async (state) => ({ final: state.value * 2 }),
        }
      );

      const result = await processor.execute(5);
      expect(result.result).toEqual({ final: 10 });
      expect(result.converged).toBe(true);
    });
  });
});