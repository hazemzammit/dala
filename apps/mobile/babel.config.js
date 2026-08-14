module.exports = function (api) {
  api.cache(false);

  return {
    presets: ['babel-preset-expo'],

    plugins: [
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui'],
          config: './src/lib/tamagui.config.ts',
          logTimings: true,
        },
      ],
      // Phase 23: react-native-reanimated / react-native-worklets are not
      // imported anywhere under src/ — nothing in this app uses Reanimated
      // directly, and @tamagui/animations-react-native (our actual Tamagui
      // animation driver) does not depend on it either. They are kept as
      // direct dependencies because expo-router (~6.0.24) declares
      // react-native-reanimated as a required peerDependency ("*") for its
      // Stack navigator internals, so removing them would leave an unmet
      // peer and risk breaking expo-router's native-stack transitions.
      // This plugin (Reanimated v4's Worklets Babel transform, split into
      // its own package as of v4) was never registered before Phase 23 —
      // that's a latent bug: harmless today because nothing calls into a
      // worklet, but it would fail at build/runtime the moment any
      // Reanimated-backed code path (a future animation, or a library
      // update that starts using it internally) actually executes. Must
      // stay last in this plugins array per Reanimated's own docs.
      'react-native-worklets/plugin',
    ],

    // Keep class-features transforms off node_modules. They are only needed
    // for WatermelonDB model decorators under src/db/models.
    overrides: [
      {
        test: /[\\/]src[\\/]db[\\/]models[\\/].*\.[jt]sx?$/,
        plugins: [
          ['@babel/plugin-proposal-decorators', { legacy: true }],
          ['@babel/plugin-proposal-class-properties', { loose: true }],
        ],
      },
    ],
  };
};
