module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Run all unit tests (mock-based tests)
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.ts'
  ],

  // Ignore other test directories
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/tests/integration/',
    '/tests/contract/',
    '/tests/production/',
    '/tests/performance/'
  ],

  // Coverage settings for unit tests
  collectCoverage: true,
  coverageDirectory: 'coverage/unit',
  coverageReporters: ['text', 'lcov', 'html'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/dist/'
  ],

  // Performance settings for local development
  testTimeout: 10000, // Shorter timeout for mocked tests
  maxWorkers: '50%', // Parallel execution for faster unit tests

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Module resolution
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },

  // Setup file for unit tests (if needed)
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  verbose: true,

  // Display name for Jest runs
  displayName: 'Unit Tests (Mock-based)'
};