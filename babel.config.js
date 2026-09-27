module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    'react-native-reanimated/plugin',
    // Release bundles only - console.* calls (including error logging
    // from ErrorBoundary/catch blocks) still print in dev builds, where
    // NODE_ENV isn't 'production'.
    ...(process.env.NODE_ENV === 'production'
      ? ['transform-remove-console']
      : []),
  ],
};
