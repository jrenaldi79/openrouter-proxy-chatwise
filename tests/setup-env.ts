// Pre-test environment setup
// This file runs BEFORE any test modules are imported (via setupFiles)
// It must set environment variables before dotenv loads from .env

import nock from 'nock';

// Force test environment
process.env.NODE_ENV = 'test';

// Disable observability services to prevent external API calls
// These must be set BEFORE the app imports environment.ts
process.env.WANDB_API_KEY = '';
process.env.WEAVE_PROJECT_NAME = '';
process.env.LANGFUSE_PUBLIC_KEY = '';
process.env.LANGFUSE_SECRET_KEY = '';

// Disable balance injection debug logging in tests
process.env.BALANCE_INJECTION_DEBUG = 'false';

// Set log level to reduce noise
process.env.LOG_LEVEL = 'error';

// CRITICAL: Set up nock BEFORE any modules are imported
// This prevents the ModelDataService from making real API calls during initialization
nock.disableNetConnect();
nock.enableNetConnect(/127\.0\.0\.1|localhost/);

// Set up persistent mock for /api/v1/models - this MUST happen before app is imported
// This ensures the ModelDataService can always fetch models during app initialization
// Using persist() so it never runs out regardless of how many tests run
nock('https://openrouter.ai')
  .persist()
  .get('/api/v1/models')
  .reply(200, {
    data: [
      { id: 'openai/gpt-4', name: 'GPT-4', context_length: 8192 },
      { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo', context_length: 16384 },
      { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', context_length: 200000 },
    ],
  });
