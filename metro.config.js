const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
// rxjs 7.8's package.json "exports" map doesn't list its internal paths
// (e.g. "./internal/Observable"), but its own dist/cjs/index.js requires
// them via relative paths. Metro's package-exports resolution enforces that
// map even for a package's own internal requires, which breaks rxjs (pulled
// in by react-native-sensors) with "Unable to resolve module
// ./internal/Observable" - falling back to plain Node-style resolution
// (ignoring "exports") fixes it without needing a metro-config major bump.
const config = {
  resolver: {
    unstable_enablePackageExports: false,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
