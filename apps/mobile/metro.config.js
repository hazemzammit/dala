const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Extend (not replace) the defaults so Expo's own watchFolders stay included
config.watchFolders = [...new Set([...config.watchFolders, workspaceRoot])];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// --- react-native-svg-transformer ---
// Lets `import Illustration from './foo.svg'` return a React component
// (via react-native-svg) instead of an asset URI. Only *adds* to the
// existing transformer/resolver config above — watchFolders,
// nodeModulesPaths, and monorepo symlink resolution are untouched.
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};
config.resolver = {
  ...config.resolver,
  // svg is handled by the custom transformer above, so pull it out of
  // assetExts (where the default config puts it) and into sourceExts.
  assetExts: config.resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...config.resolver.sourceExts, 'svg'],
};

module.exports = config;
