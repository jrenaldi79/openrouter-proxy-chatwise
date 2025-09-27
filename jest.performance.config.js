module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Test patterns - PERFORMANCE tests only (with real API calls)
  testMatch: [
    '<rootDir>/tests/performance/**/*.test.ts'
  ],

  // Explicitly ignore other test directories
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/tests/unit/',
    '/tests/contract/',
    '/tests/integration/',
    '/tests/production/'
  ],

  // Performance test configuration
  testTimeout: 45000, // 45 second timeout for real API calls
  maxWorkers: 1, // Single worker to avoid rate limiting

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Module resolution
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
};