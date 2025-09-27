// Global test setup
// This file runs before all tests

// Set test environment
process.env.NODE_ENV = 'test';

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
});

afterAll(() => {
  // Restore original console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

// Global test utilities can be added here
export {};