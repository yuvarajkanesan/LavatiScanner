const path = require('path');
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
// ./internal/Observable". Disabling package-exports resolution globally
// used to be the fix, but react-native itself now relies on its own
// package.json "exports" (e.g. "react-native/asset-registry" -> "./src/
// asset-registry.js"), so that's no longer an option - instead, only
// disable exports resolution for requests originating from inside rxjs.
const rxjsDir = `${path.sep}rxjs${path.sep}`;
const config = {
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      if (context.originModulePath?.includes(rxjsDir)) {
        return context.resolveRequest(
          {...context, unstable_enablePackageExports: false},
          moduleName,
          platform,
        );
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
