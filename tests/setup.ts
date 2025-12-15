// Global test setup
// This file runs before all tests (via setupFilesAfterEnv)
// Note: Environment variables AND nock setup are done in setup-env.ts (via setupFiles) before this runs

import nock from 'nock';

// Extend Jest timeout for async operations
jest.setTimeout(10000);

/**
 * Standard mock model data used across all tests.
 * This ensures consistent model data for ModelDataService.
 */
const MOCK_MODELS_DATA = {
  data: [
    { id: 'openai/gpt-4', name: 'GPT-4', context_length: 8192 },
    { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo', context_length: 16384 },
    { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', context_length: 200000 },
  ],
};

/**
 * Ensure the models mock exists. Call this BEFORE createApp() in test file's beforeAll.
 * This is necessary because cleanAllMocks() from previous test files may have removed it.
 */
export function ensureModelsMock(): void {
  const pendingMocks = nock.pendingMocks();
  const hasModelsMock = pendingMocks.some(mock => mock.includes('/api/v1/models'));
  if (!hasModelsMock) {
    nock('https://openrouter.ai')
      .persist()
      .get('/api/v1/models')
      .reply(200, MOCK_MODELS_DATA);
  }
}

/**
 * Create the app for testing and wait for initial model fetch to complete.
 * This prevents race conditions where tests clear mocks before the async fetch completes.
 */
export async function createTestApp(): Promise<import('express').Express> {
  // Ensure models mock exists before importing app (which triggers fetchModels)
  ensureModelsMock();

  // Import createApp dynamically to ensure mock is in place
  const { createApp } = await import('../src/app');
  const app = await createApp();

  // Give the async modelDataService.fetchModels() time to complete
  // This is a small delay to let the fire-and-forget call finish
  await new Promise(resolve => setTimeout(resolve, 50));

  return app;
}

// Mock console methods to reduce noise in test output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  // Suppress console.log in tests unless explicitly needed
  console.log = jest.fn();
  // Keep console.error for debugging test failures
  console.error = originalConsoleError;

  // Set up nock if not already configured (setup-env.ts does this for unit tests)
  // For integration/contract tests, we need to do it here
  if (!nock.isActive()) {
    nock.activate();
  }
  // Only disable network if running mock-based tests (setup-env.ts sets NODE_ENV=test early)
  // For integration tests that need real API calls, NODE_ENV might be different
});

afterAll(() => {
  // Restore original console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;

  // Re-enable HTTP connections
  nock.enableNetConnect();
});

// Ensure nock is active and models mock exists before each test
beforeEach(() => {
  // Re-activate nock if it was deactivated
  if (!nock.isActive()) {
    nock.activate();
  }

  // Restore models mock if it was removed by cleanAllMocks()
  ensureModelsMock();
});

/**
 * Clean all nock interceptors to reset state between tests.
 * Use this instead of nock.cleanAll() directly.
 * Restores the persistent models mock after cleaning.
 */
export function cleanTestMocks(): void {
  // Clean all interceptors
  nock.cleanAll();

  // Restore the persistent models mock that was set up in setup-env.ts
  // This ensures the ModelDataService can always fetch models
  nock('https://openrouter.ai')
    .persist()
    .get('/api/v1/models')
    .reply(200, MOCK_MODELS_DATA);
}

/**
 * Clean all nock interceptors INCLUDING the models mock.
 * Use this in tests that need to set up their own /api/v1/models mock.
 * After calling this, you MUST set up your own models mock or tests may timeout.
 */
export function cleanAllMocks(): void {
  nock.cleanAll();
}

// Make functions available globally for tests
(global as Record<string, unknown>).cleanTestMocks = cleanTestMocks;
(global as Record<string, unknown>).cleanAllMocks = cleanAllMocks;
(global as Record<string, unknown>).ensureModelsMock = ensureModelsMock;

// Declare global types for TypeScript
declare global {
  function cleanTestMocks(): void;
  function cleanAllMocks(): void;
  function ensureModelsMock(): void;
}
