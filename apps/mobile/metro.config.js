const { getDefaultConfig } = require('expo/metro-config')
// Expo auto-detects the pnpm workspace (watchFolders + node_modules resolution), so no manual overrides are needed.
module.exports = getDefaultConfig(__dirname)
