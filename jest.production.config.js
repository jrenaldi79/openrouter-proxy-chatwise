module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Only test production tests
  testMatch: [
    '<rootDir>/tests/production/**/*.test.ts'
  ],

  // Ignore only basic directories
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],

  // No coverage for production tests
  collectCoverage: false,

  // Performance and reliability
  testTimeout: 30000, // Longer timeout for real API calls
  maxWorkers: 1, // Sequential for production tests

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Module resolution
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },

  // No setup file needed for production tests
  verbose: true
};