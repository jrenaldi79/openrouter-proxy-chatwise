/**
 * Retry utilities for transient network errors
 */

import { Logger } from './logger';

/**
 * Network error codes that are safe to retry
 */
const RETRYABLE_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPIPE',
  'EAI_AGAIN',
  'ECONNABORTED',
  'ESOCKETTIMEDOUT',
]);

/**
 * HTTP status codes that are safe to retry
 */
const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  // Check axios error code
  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;

    // Check error code (ETIMEDOUT, ECONNRESET, etc.)
    if (typeof err.code === 'string' && RETRYABLE_ERROR_CODES.has(err.code)) {
      return true;
    }

    // Check HTTP response status
    if (
      typeof err.response === 'object' &&
      err.response !== null &&
      typeof (err.response as Record<string, unknown>).status === 'number'
    ) {
      const status = (err.response as Record<string, unknown>).status as number;
      if (RETRYABLE_STATUS_CODES.has(status)) {
        return true;
      }
    }

    // Check for timeout errors
    if (err.message && typeof err.message === 'string') {
      const message = err.message.toLowerCase();
      if (
        message.includes('timeout') ||
        message.includes('etimedout') ||
        message.includes('econnreset')
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extract error code from an error object
 */
export function getErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;
    if (typeof err.code === 'string') {
      return err.code;
    }
    if (err.message && typeof err.message === 'string') {
      // Extract code from message if present
      const match = err.message.match(/\b(E[A-Z]+)\b/);
      if (match && match[1]) return match[1];
    }
  }
  return 'UNKNOWN';
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

/**
 * Calculate delay for a given retry attempt (exponential backoff with jitter)
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const exponentialDelay =
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter (±25%) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.floor(cappedDelay + jitter);
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  correlationId: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!isRetryableError(error)) {
        Logger.debug(
          'Non-retryable error, failing immediately',
          correlationId,
          {
            errorCode: getErrorCode(error),
            attempt,
          }
        );
        throw error;
      }

      // Check if we have retries left
      if (attempt >= config.maxRetries) {
        Logger.warn('Max retries exceeded', correlationId, {
          errorCode: getErrorCode(error),
          maxRetries: config.maxRetries,
        });
        throw error;
      }

      // Calculate delay and wait
      const delay = calculateRetryDelay(attempt, config);
      Logger.info('Retrying after transient error', correlationId, {
        errorCode: getErrorCode(error),
        attempt: attempt + 1,
        maxRetries: config.maxRetries,
        delayMs: delay,
      });

      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}
