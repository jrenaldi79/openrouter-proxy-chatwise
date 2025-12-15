/**
 * Environment configuration and validation
 */

export interface EnvironmentConfig {
  // Server Configuration
  PORT: number;
  NODE_ENV: string;

  // OpenRouter API Configuration
  OPENROUTER_BASE_URL: string;
  OPENROUTER_API_KEY?: string; // Optional API key for server-side operations (fetching model data)
  REQUEST_TIMEOUT_MS: number;

  // Rate Limiting Configuration
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;

  // Feature Flags
  ENABLE_TRANSFORMATION: boolean;

  // Security Configuration
  NODE_TLS_REJECT_UNAUTHORIZED: boolean;

  // Weave Observability Configuration
  WANDB_API_KEY?: string;
  WEAVE_PROJECT_NAME?: string;
  WEAVE_API_KEY_ALLOWLIST: string[];
  WEAVE_ENABLED: boolean;

  // Langfuse Observability Configuration
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;
  LANGFUSE_BASE_URL?: string;
  LANGFUSE_API_KEY_ALLOWLIST: string[];
  LANGFUSE_ENABLED: boolean;
}

/**
 * Parse and validate environment variables
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  return {
    // Server Configuration
    PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',

    // OpenRouter API Configuration
    OPENROUTER_BASE_URL:
      process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, // Optional for server-side model data fetching
    REQUEST_TIMEOUT_MS: process.env.REQUEST_TIMEOUT_MS
      ? parseInt(process.env.REQUEST_TIMEOUT_MS, 10)
      : 30000,

    // Rate Limiting Configuration
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS
      ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10)
      : 60000,
    RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS
      ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10)
      : 100,

    // Feature Flags
    ENABLE_TRANSFORMATION: process.env.ENABLE_TRANSFORMATION !== 'false',

    // Security Configuration
    NODE_TLS_REJECT_UNAUTHORIZED:
      process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',

    // Weave Observability Configuration
    WANDB_API_KEY: process.env.WANDB_API_KEY,
    WEAVE_PROJECT_NAME: process.env.WEAVE_PROJECT_NAME,
    WEAVE_API_KEY_ALLOWLIST: process.env.WEAVE_API_KEY_ALLOWLIST
      ? process.env.WEAVE_API_KEY_ALLOWLIST.split(',').map(key => key.trim())
      : [],
    WEAVE_ENABLED:
      !!process.env.WANDB_API_KEY && !!process.env.WEAVE_PROJECT_NAME,

    // Langfuse Observability Configuration
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL:
      process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
    LANGFUSE_API_KEY_ALLOWLIST: process.env.LANGFUSE_API_KEY_ALLOWLIST
      ? process.env.LANGFUSE_API_KEY_ALLOWLIST.split(',').map(key => key.trim())
      : [],
    LANGFUSE_ENABLED:
      !!process.env.LANGFUSE_PUBLIC_KEY && !!process.env.LANGFUSE_SECRET_KEY,
  };
}

// Export singleton instance
export const envConfig = loadEnvironmentConfig();

/**
 * Check if stream debug logging is enabled.
 * IMPORTANT: Stream debug is ONLY allowed in non-production environments
 * to prevent accidental logging of sensitive message content.
 */
export function isStreamDebugEnabled(): boolean {
  return (
    process.env.STREAM_DEBUG === 'true' && process.env.NODE_ENV !== 'production'
  );
}
