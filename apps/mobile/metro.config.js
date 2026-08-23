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

// --- force a single React instance across the workspace ---
// extraNodeModules is only a fallback for modules Metro can't otherwise
// find — since react-query's nested react DOES resolve normally, that
// fallback never triggers. resolveRequest runs unconditionally for every
// module request, so it's the right tool to force a redirect.
const canonicalReact = path.resolve(workspaceRoot, 'node_modules/react');
const canonicalReactDom = path.resolve(workspaceRoot, 'node_modules/react-dom');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    return context.resolveRequest(
      { ...context, originModulePath: canonicalReact },
      moduleName === 'react' ? canonicalReact : moduleName.replace('react', canonicalReact),
      platform,
    );
  }
  if (moduleName === 'react-dom' || moduleName.startsWith('react-dom/')) {
    return context.resolveRequest(
      { ...context, originModulePath: canonicalReactDom },
      moduleName === 'react-dom'
        ? canonicalReactDom
        : moduleName.replace('react-dom', canonicalReactDom),
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

// --- react-native-svg-transformer ---
// Lets `import Illustration from './foo.svg'` return a React component
// (via react-native-svg) instead of an asset URI. Only *adds* to the
// existing transformer/resolver config above — watchFolders,
// nodeModulesPaths, and monorepo symlink resolution are untouched.
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};
config.resolver = {
  ...config.resolver,
  // svg is handled by the custom transformer above, so pull it out of
  // assetExts (where the default config puts it) and into sourceExts.
  assetExts: config.resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...config.resolver.sourceExts, 'svg'],
};

module.exports = config;
