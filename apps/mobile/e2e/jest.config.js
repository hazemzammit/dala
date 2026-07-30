/**
 * apps/mobile/e2e/jest.config.js
 *
 * Deliberately separate from the root package.json's "jest" block (the
 * unit-test config, preset: jest-expo) — e2e specs run in Detox's own
 * Node-side test environment against a real simulator/emulator, not
 * jest-expo's React Native jsdom-like environment. Mixing the two into one
 * config is the most common way teams accidentally break both.
 */
module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/e2e/**/*.e2e.ts'],
  testTimeout: 180000,
  maxWorkers: 1,
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  verbose: true,
  transform: {
    '^.+\\.ts$': ['babel-jest', { configFile: require.resolve('../babel.config.js') }],
  },
};
