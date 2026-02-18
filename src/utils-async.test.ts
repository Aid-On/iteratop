/**
 * IteratoP - Utils Async Tests (withRetry, withTimeout, sleep)
 */

import { withRetry, withTimeout, sleep } from './utils';

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

    expect(fn).toHaveBeenCalledTimes(3);
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

    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
