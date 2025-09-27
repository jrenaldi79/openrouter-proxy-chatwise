module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Test patterns - explicitly exclude production tests
  testMatch: [
    '<rootDir>/tests/contract/**/*.test.ts',
    '<rootDir>/tests/integration/**/*.test.ts',
    '<rootDir>/tests/performance/**/*.test.ts',
    '<rootDir>/tests/unit/**/*.test.ts'
  ],

  // Explicitly ignore production tests directory
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/tests/production/'
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