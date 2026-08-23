# App store readiness

Phase 12 (improvement-plan §10.5). Confirmed what actually exists in the repo before
assuming a green field.

## Already exists (confirmed by reading, not assumed)

- `apps/mobile/assets/icon.png`, `adaptive-icon.png`, `splash.png` — all three present.
  Not evaluated for actual visual quality/App-Store-guideline compliance here (that's a
  design-review judgment call, not a file-existence check) — flagged as a human
  reviewer's job.
- `app.json` has `bundleIdentifier`/`package: "tn.dala.app"`, a real `name`/`slug`, and
  (as of this phase) a `NSFaceIDUsageDescription` and `updates`/`runtimeVersion` block.
- `eas.json` (this phase — did not exist before) with development/preview/production
  build profiles and channels.

## Drafted this phase (achievable without store access)

- `docs/PRIVACY_POLICY.md` — draft text, needs legal review and a **real hosted URL**
  before it satisfies either store's "public privacy policy link" requirement. The
  in-app link this phase added (`sign-up.tsx`'s `PRIVACY_POLICY_URL` constant) currently
  points at a placeholder (`https://dala.tn/confidentialite`) that does not resolve to
  anything today — must be replaced with a real published URL before submission, not
  left as-is.
- `docs/DATA_RETENTION_POLICY.md` — same status.
- A privacy-consent checkbox on `sign-up.tsx` (this phase) — see that file's own header
  for the disclosed client-side-only scope.

## Genuinely cannot be attempted in this sandbox — flagged, not faked

- **App Store Connect / Google Play Console accounts** — no access exists here. Someone
  with the `hazemzammits-team` EAS/Expo org's actual store credentials needs to:
  1. Create the app listing on both platforms (bundle ID `tn.dala.app` already reserved
     in `app.json`, but that's not the same as the listing existing on either platform).
  2. Write store-listing copy (title, subtitle, description, keywords) — a marketing/
     copywriting task, not something this phase invented placeholder text for, since
     placeholder store copy risks being submitted as-is by accident.
  3. Capture and upload real device screenshots — needs a real build running on a real
     device/simulator, which this sandbox has neither of.
  4. Fill in Apple's App Privacy questionnaire and Google's Data Safety form — both
     require literally re-stating this phase's `docs/PRIVACY_POLICY.md` content into
     each platform's own structured form; the source-of-truth content exists now, but
     the form-filling itself needs the actual developer console.
  5. Submit for review. iOS review can take from several hours to a few days; Android's
     is typically faster but not instant — budget real calendar time, not something a
     script can shortcut.
- **A real production build** to actually test the icon/splash rendering on-device
  before submission — same "needs Xcode/Android SDK + a device" limitation as
  `docs/DETOX_VERIFICATION.md`'s own section.

## Recommended order of operations for whoever picks this up

1. Get the privacy policy and data-retention doc reviewed by an actual lawyer.
2. Host both at a real, stable URL; update `PRIVACY_POLICY_URL` in `sign-up.tsx`.
3. Run a production `eas build` for both platforms.
4. Manually verify icon/splash/app name render correctly on a real device.
5. Complete the store listings, screenshots, and privacy questionnaires.
6. Submit.
