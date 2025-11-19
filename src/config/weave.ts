/**
 * Weave Observability Configuration
 *
 * Initializes Weights & Biases Weave for LLM observability and tracing.
 * Weave automatically captures:
 * - Request/response traces
 * - LLM API call latency and tokens
 * - Error tracking with full context
 * - Custom operation metrics
 */

import * as weave from 'weave';
import { envConfig } from './environment';
import { Logger } from '../utils/logger';

let weaveInitialized = false;

/**
 * Initialize Weave observability platform
 * Only initializes if WANDB_API_KEY and WEAVE_PROJECT_NAME are configured
 *
 * @returns Promise<boolean> - true if initialized, false if skipped
 */
export async function initializeWeave(): Promise<boolean> {
  // Skip if already initialized
  if (weaveInitialized) {
    Logger.info('Weave already initialized');
    return true;
  }

  // Skip if Weave is not enabled
  if (!envConfig.WEAVE_ENABLED) {
    Logger.info(
      'Weave observability disabled (WANDB_API_KEY or WEAVE_PROJECT_NAME not set)'
    );
    return false;
  }

  try {
    // Set WANDB_API_KEY environment variable for Weave SDK
    if (envConfig.WANDB_API_KEY) {
      process.env.WANDB_API_KEY = envConfig.WANDB_API_KEY;
    }

    // Initialize Weave with project name
    await weave.init(envConfig.WEAVE_PROJECT_NAME!);

    weaveInitialized = true;

    Logger.info(
      `Weave observability initialized for project: ${envConfig.WEAVE_PROJECT_NAME}`
    );

    return true;
  } catch (error) {
    Logger.error('Failed to initialize Weave observability', undefined, {
      error:
        error instanceof Error ? error.message : 'Unknown initialization error',
      projectName: envConfig.WEAVE_PROJECT_NAME,
    });

    // Don't crash the application if Weave fails to initialize
    return false;
  }
}

/**
 * Check if Weave is currently initialized and enabled
 */
export function isWeaveEnabled(): boolean {
  return weaveInitialized && envConfig.WEAVE_ENABLED;
}

/**
 * Check if a specific API key is allowed to be traced
 * Returns true if:
 * 1. Weave is not enabled (skip check)
 * 2. Running in test/CI environment (bypass allowlist)
 * 3. No allowlist is configured (trace all)
 * 4. API key is in the allowlist
 */
export function isApiKeyAllowed(apiKey: string | undefined): boolean {
  // If Weave is not enabled, skip the check
  if (!isWeaveEnabled()) {
    return true;
  }

  // In test/CI environments, bypass allowlist restrictions
  // This allows automated tests to trace without explicit allowlist configuration
  if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
    return true;
  }

  // If no allowlist is configured, trace all requests
  if (envConfig.WEAVE_API_KEY_ALLOWLIST.length === 0) {
    return true;
  }

  // If no API key is provided, don't trace
  if (!apiKey) {
    return false;
  }

  // Check if the API key is in the allowlist
  return envConfig.WEAVE_API_KEY_ALLOWLIST.includes(apiKey);
}

/**
 * Get Weave operation wrapper
 * Returns weave.op if enabled, otherwise returns identity function
 *
 * This allows instrumentation code to work whether Weave is enabled or not
 */
export function getWeaveOp():
  | typeof weave.op
  | (<T extends (...args: unknown[]) => unknown>(fn: T) => T) {
  return isWeaveEnabled()
    ? weave.op
    : <T extends (...args: unknown[]) => unknown>(fn: T) => fn;
}

/**
 * Export weave for direct usage in instrumentation
 */
export { weave };
