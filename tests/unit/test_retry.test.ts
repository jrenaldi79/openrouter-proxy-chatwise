/**
 * Unit tests for retry utility
 */

import {
  isRetryableError,
  getErrorCode,
  calculateRetryDelay,
  withRetry,
  DEFAULT_RETRY_CONFIG,
} from '../../src/utils/retry';

describe('retry utility', () => {
  describe('isRetryableError', () => {
    it('should return true for ETIMEDOUT errors', () => {
      const error = { code: 'ETIMEDOUT', message: 'Connection timed out' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for ECONNRESET errors', () => {
      const error = { code: 'ECONNRESET', message: 'Connection reset' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for ECONNREFUSED errors', () => {
      const error = { code: 'ECONNREFUSED', message: 'Connection refused' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for 502 status code', () => {
      const error = { response: { status: 502 } };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for 503 status code', () => {
      const error = { response: { status: 503 } };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for 429 status code', () => {
      const error = { response: { status: 429 } };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for timeout in message', () => {
      const error = { message: 'Request timeout after 30000ms' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for 400 status code', () => {
      const error = { response: { status: 400 } };
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for 401 status code', () => {
      const error = { response: { status: 401 } };
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
    });

    it('should return false for non-retryable errors', () => {
      const error = { code: 'INVALID_INPUT', message: 'Bad request' };
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('getErrorCode', () => {
    it('should extract code from error object', () => {
      const error = { code: 'ETIMEDOUT' };
      expect(getErrorCode(error)).toBe('ETIMEDOUT');
    });

    it('should extract code from message', () => {
      const error = { message: 'Connection failed: ECONNRESET' };
      expect(getErrorCode(error)).toBe('ECONNRESET');
    });

    it('should return UNKNOWN for missing code', () => {
      const error = { message: 'Something went wrong' };
      expect(getErrorCode(error)).toBe('UNKNOWN');
    });
  });

  describe('calculateRetryDelay', () => {
    it('should return initial delay for first attempt', () => {
      const delay = calculateRetryDelay(0, DEFAULT_RETRY_CONFIG);
      // Should be around 500ms ± 25% jitter
      expect(delay).toBeGreaterThanOrEqual(375);
      expect(delay).toBeLessThanOrEqual(625);
    });

    it('should apply exponential backoff', () => {
      const delay0 = calculateRetryDelay(0, {
        ...DEFAULT_RETRY_CONFIG,
        maxDelayMs: 100000,
      });
      const delay1 = calculateRetryDelay(1, {
        ...DEFAULT_RETRY_CONFIG,
        maxDelayMs: 100000,
      });
      const delay2 = calculateRetryDelay(2, {
        ...DEFAULT_RETRY_CONFIG,
        maxDelayMs: 100000,
      });

      // Each delay should be roughly 2x the previous (ignoring jitter)
      // delay0 ~ 500, delay1 ~ 1000, delay2 ~ 2000
      expect(delay1).toBeGreaterThan(delay0);
      expect(delay2).toBeGreaterThan(delay1);
    });

    it('should cap at maxDelayMs', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, maxDelayMs: 1000 };
      const delay = calculateRetryDelay(10, config);
      // Max should be 1000ms + 25% jitter = 1250ms max
      expect(delay).toBeLessThanOrEqual(1250);
    });
  });

  describe('withRetry', () => {
    it('should succeed on first try', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await withRetry(fn, 'test-correlation-id');
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, 'test-correlation-id', {
        ...DEFAULT_RETRY_CONFIG,
        initialDelayMs: 10, // Speed up test
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should fail immediately on non-retryable error', async () => {
      const fn = jest.fn().mockRejectedValue({ code: 'INVALID_REQUEST' });

      await expect(
        withRetry(fn, 'test-correlation-id', {
          ...DEFAULT_RETRY_CONFIG,
          initialDelayMs: 10,
        })
      ).rejects.toEqual({ code: 'INVALID_REQUEST' });

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should fail after max retries', async () => {
      const fn = jest.fn().mockRejectedValue({ code: 'ETIMEDOUT' });

      await expect(
        withRetry(fn, 'test-correlation-id', {
          maxRetries: 2,
          initialDelayMs: 10,
          maxDelayMs: 50,
          backoffMultiplier: 2,
        })
      ).rejects.toEqual({ code: 'ETIMEDOUT' });

      // Should try 1 initial + 2 retries = 3 times
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should succeed after multiple retries', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockRejectedValueOnce({ code: 'ECONNRESET' })
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, 'test-correlation-id', {
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 50,
        backoffMultiplier: 2,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});
