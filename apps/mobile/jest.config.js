// Component tests for React Native UI (jest-expo). Pure logic stays in vitest (tests/); these two runners never share files.
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests-rn/**/*.test.tsx'],
  transformIgnorePatterns: ['node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@lifetrack/.*))'],
  setupFilesAfterEnv: ['<rootDir>/tests-rn/setup.ts'],
}
