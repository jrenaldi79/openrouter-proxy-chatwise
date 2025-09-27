module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Test patterns - LOCAL tests only (no real API calls)
  testMatch: [
    '<rootDir>/tests/contract/**/*.test.ts',
    '<rootDir>/tests/integration/**/*.test.ts',
    '<rootDir>/tests/unit/**/*.test.ts'
  ],

  // Explicitly ignore real API test directories
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/tests/production/',
    '/tests/performance/'
  ],

  // Coverage configuration
  collectCoverage: false, // Only when explicitly requested
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 29,
      functions: 35,
      lines: 35,
      statements: 35
    }
  },

  // Performance and reliability
  testTimeout: 10000,
  maxWorkers: '50%',

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