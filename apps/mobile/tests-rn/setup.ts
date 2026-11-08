jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }))
// Icons load a native font, which doesn't exist under Jest, and they're decorative: the components' accessible names are what the tests check.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
