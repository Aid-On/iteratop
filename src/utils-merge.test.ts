/**
 * IteratoP - Utils Merge Tests (mergeActionResults, mergeArrayActionResults, mergeObjectActionResults)
 */

import {
  createActionResult,
  mergeActionResults,
  mergeArrayActionResults,
  mergeObjectActionResults,
} from './utils';
import { ActionResult } from './types';

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
      const results: ActionResult<unknown>[] = [
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
            arr: [3, 4]
          }
        }),
      ];

      const merged = mergeObjectActionResults(
        results as ActionResult<Record<string, unknown>>[],
        'deep'
      );

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
          arr: [3, 4]
        }
      });
    });

    it('should handle null and undefined values in deep merge', () => {
      const results: ActionResult<unknown>[] = [
        createActionResult({ a: null, b: { x: 1 }, c: undefined }),
        createActionResult({ a: { y: 2 }, b: null, d: 3 }),
      ];

      const merged = mergeObjectActionResults(
        results as ActionResult<Record<string, unknown>>[],
        'deep'
      );

      expect(merged.data).toEqual({
        a: { y: 2 },
        b: null,
        c: undefined,
        d: 3
      });
    });
  });
});
