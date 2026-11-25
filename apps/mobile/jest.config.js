// Component tests for React Native UI (jest-expo). Pure logic stays in vitest (tests/); these two runners never share files.
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests-rn/**/*.test.tsx'],
  transformIgnorePatterns: ['node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@noble/.*|@lifetrack/.*))'],
  setupFilesAfterEnv: ['<rootDir>/tests-rn/setup.ts'],
  // The first test in a file pays for loading React Native and the screen (seconds when the machine is busy with other suites);
  // jest's 5 s default made those first tests time out under load although they pass alone. Same budget as the web suite.
  testTimeout: 30_000,
}
