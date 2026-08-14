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
      // Windows fix, corrected: the ONLY real problem was `./gradlew` —
      // cmd.exe (what Detox's exec spawns on Windows regardless of
      // PowerShell being the interactive shell) can't parse a `./`-prefixed
      // script invocation, which is what actually produced "'.' is not
      // recognized...". cmd.exe handles `&&` chaining just fine — an
      // earlier version of this fix incorrectly dropped `cd android &&`
      // entirely, which broke the build a different way: gradlew.bat does
      // NOT change its own working directory to wherever it lives, it
      // only uses its own location to find the wrapper jar — Gradle still
      // resolves the PROJECT directory (where it looks for
      // settings.gradle) from the process's actual working directory. So
      // running `android\gradlew.bat` from a cwd of apps/mobile made
      // Gradle look for a build in apps/mobile itself, not apps/mobile/
      // android — "Directory '...\apps\mobile' does not contain a Gradle
      // build". `cd android` is genuinely required; only swap `./gradlew`
      // for `gradlew.bat` for Windows.
      build: 'cd android && gradlew.bat assembleDebug assembleAndroidTest -DtestBuildType=debug',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: { type: 'iPhone 15' },
    },
    emulator: {
      type: 'android.emulator',
      // avdName must match `emulator -list-avds` exactly — confirmed as
      // 'Pixel_7' on this machine, not 'Pixel_7_API_34' as originally
      // guessed (Android Studio doesn't always append the API level to
      // the AVD id the way the device-creation dialog's display name
      // suggests it will).
      device: { avdName: 'Pixel_7' },
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
