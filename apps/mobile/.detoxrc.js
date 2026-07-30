/**
 * apps/mobile/.detoxrc.js
 *
 * Doc 02 §2.11 — Detox e2e, standing this up for real (was an unused
 * devDependency with nothing pointing at it, per the Phase 9 audit).
 *
 * This is an Expo-managed (expo-router) project, not a bare RN project —
 * there's no checked-in ios/ or android/ folder. Detox needs a real native
 * build to run against, so the one-time local step this config assumes is:
 *
 *   npx expo prebuild
 *
 * which generates ios/ and android/ from app.json (name: "Dala", scheme:
 * "dala", bundleIdentifier/package: "tn.dala.app" — see app.json). That's
 * a regenerable output directory (gitignored), not a permanent eject —
 * the project stays expo-router/managed-workflow otherwise. `prebuild` only
 * needs re-running when native config (app.json, native modules) changes,
 * same as any other Expo config-plugin project that uses Detox.
 *
 * Both configurations point at the *debug* build — Detox interacts with
 * the app through a debug-only native bridge, so debug is what these
 * `build`/`binaryPath` entries target, not what would ship to stores.
 */
module.exports = {
  testRunner: {
    args: {
      config: 'e2e/jest.config.js',
      _: ['e2e'],
    },
    jest: { setupTimeout: 120000 },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/Dala.app',
      build:
        'xcodebuild -workspace ios/Dala.xcworkspace -scheme Dala -configuration Debug ' +
        '-sdk iphonesimulator -derivedDataPath ios/build ' +
        '-quiet CODE_SIGNING_ALLOWED=NO',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      build:
        'cd android && ./gradlew assembleDebug assembleAndroidTest ' +
        '-DtestBuildType=debug && cd ..',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: { type: 'iPhone 15' },
    },
    emulator: {
      type: 'android.emulator',
      device: { avdName: 'Pixel_7_API_34' },
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
  },
};
