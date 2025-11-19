/**
 * Langfuse Observability Configuration
 *
 * Initializes Langfuse for LLM observability and tracing.
 * Langfuse captures:
 * - Request/response traces
 * - LLM API call latency and tokens
 * - Error tracking with full context
 * - Generation-level metrics
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { envConfig } from './environment';
import { Logger } from '../utils/logger';

let langfuseInitialized = false;
let sdk: NodeSDK | null = null;

/**
 * Initialize Langfuse observability platform
 * Only initializes if LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are configured
 *
 * @returns Promise<boolean> - true if initialized, false if skipped
 */
export async function initializeLangfuse(): Promise<boolean> {
  // Skip if already initialized
  if (langfuseInitialized) {
    Logger.info('Langfuse already initialized');
    return true;
  }

  // Skip if Langfuse is not enabled
  if (!envConfig.LANGFUSE_ENABLED) {
    Logger.info(
      'Langfuse observability disabled (LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY not set)'
    );
    return false;
  }

  try {
    // Set Langfuse environment variables for SDK
    if (envConfig.LANGFUSE_PUBLIC_KEY) {
      process.env.LANGFUSE_PUBLIC_KEY = envConfig.LANGFUSE_PUBLIC_KEY;
    }
    if (envConfig.LANGFUSE_SECRET_KEY) {
      process.env.LANGFUSE_SECRET_KEY = envConfig.LANGFUSE_SECRET_KEY;
    }
    if (envConfig.LANGFUSE_BASE_URL) {
      process.env.LANGFUSE_BASE_URL = envConfig.LANGFUSE_BASE_URL;
    }

    // Initialize OpenTelemetry SDK with Langfuse span processor
    sdk = new NodeSDK({
      spanProcessors: [new LangfuseSpanProcessor()],
    });

    sdk.start();

    langfuseInitialized = true;

    Logger.info(
      `Langfuse observability initialized (base URL: ${envConfig.LANGFUSE_BASE_URL || 'default'})`
    );

    return true;
  } catch (error) {
    Logger.error('Failed to initialize Langfuse observability', undefined, {
      error:
        error instanceof Error ? error.message : 'Unknown initialization error',
      baseUrl: envConfig.LANGFUSE_BASE_URL,
    });

    // Don't crash the application if Langfuse fails to initialize
    return false;
  }
}

/**
 * Check if Langfuse is currently initialized and enabled
 */
export function isLangfuseEnabled(): boolean {
  return langfuseInitialized && envConfig.LANGFUSE_ENABLED;
}

/**
 * Check if a specific API key is allowed to be traced
 * Returns true if:
 * 1. Langfuse is not enabled (skip check)
 * 2. Running in test/CI environment (bypass allowlist)
 * 3. No allowlist is configured (trace all)
 * 4. API key is in the allowlist
 */
export function isApiKeyAllowed(apiKey: string | undefined): boolean {
  // If Langfuse is not enabled, skip the check
  if (!isLangfuseEnabled()) {
    return true;
  }

  // In test/CI environments, bypass allowlist restrictions
  // This allows automated tests to trace without explicit allowlist configuration
  if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
    return true;
  }

  // If no allowlist is configured, trace all requests
  if (envConfig.LANGFUSE_API_KEY_ALLOWLIST.length === 0) {
    return true;
  }

  // If no API key is provided, don't trace
  if (!apiKey) {
    return false;
  }

  // Check if the API key is in the allowlist
  return envConfig.LANGFUSE_API_KEY_ALLOWLIST.includes(apiKey);
}

/**
 * Shutdown Langfuse SDK gracefully
 * Called during application shutdown
 */
export async function shutdownLangfuse(): Promise<void> {
  if (sdk) {
    try {
      await sdk.shutdown();
      Logger.info('Langfuse SDK shut down successfully');
    } catch (error) {
      Logger.error('Error shutting down Langfuse SDK', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
