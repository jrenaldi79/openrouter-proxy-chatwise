/**
 * Environment configuration and validation
 */

export interface EnvironmentConfig {
  // Server Configuration
  PORT: number;
  NODE_ENV: string;

  // OpenRouter API Configuration
  OPENROUTER_BASE_URL: string;
  REQUEST_TIMEOUT_MS: number;

  // Rate Limiting Configuration
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;

  // Feature Flags
  ENABLE_TRANSFORMATION: boolean;

  // Security Configuration
  NODE_TLS_REJECT_UNAUTHORIZED: boolean;
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
  };
}

// Export singleton instance
export const envConfig = loadEnvironmentConfig();
