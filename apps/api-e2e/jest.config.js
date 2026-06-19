const { readFileSync } = require('fs');

const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);
swcJestConfig.swcrc = false;

module.exports = {
  displayName: 'api-e2e',
  globalSetup: '<rootDir>/src/support/global-setup.ts',
  globalTeardown: '<rootDir>/src/support/global-teardown.ts',
  setupFiles: ['<rootDir>/src/support/test-setup.ts'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.e2e.spec.ts'],
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleNameMapper: {
    '^shared$': '<rootDir>/../../libs/shared/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  testTimeout: 30000,
  coverageDirectory: 'test-output/jest/coverage',
};
