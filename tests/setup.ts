// Global test setup
// This file runs before all tests (via setupFilesAfterEnv)
// Note: Environment variables AND nock setup are done in setup-env.ts (via setupFiles) before this runs

import nock from 'nock';

// Extend Jest timeout for async operations
jest.setTimeout(10000);

// Mock console methods to reduce noise in test output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  // Suppress console.log in tests unless explicitly needed
  console.log = jest.fn();
  // Keep console.error for debugging test failures
  console.error = originalConsoleError;

  // Note: nock.disableNetConnect() is already called in setup-env.ts
  // The models mock is also set up there BEFORE modules are imported
});

afterAll(() => {
  // Restore original console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;

  // Re-enable HTTP connections
  nock.enableNetConnect();
});

// Ensure nock is active before each test
beforeEach(() => {
  // Re-activate nock if it was deactivated
  if (!nock.isActive()) {
    nock.activate();
  }
  // Note: We do NOT restore default mocks here - tests should set up their own mocks
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
    .reply(200, {
      data: [
        { id: 'openai/gpt-4', name: 'GPT-4', context_length: 8192 },
        { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo', context_length: 16384 },
        { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', context_length: 200000 },
      ],
    });
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

// Declare global types for TypeScript
declare global {
  function cleanTestMocks(): void;
  function cleanAllMocks(): void;
}
