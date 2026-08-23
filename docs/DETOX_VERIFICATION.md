# Detox e2e — verification-by-inspection + execution runbook

Phase 12 (improvement-plan §10.2). "Has never been run" — true, and still true after
this phase: this sandbox has no iOS/Android simulator or emulator, so no Detox run
could actually happen here. What this phase DID do, per the plan's own instruction, is
read `.detoxrc.js`, `e2e/jest.config.js`, and the one existing spec (`twoFactorAuth.e2e.ts`

- its `totp.ts` helper) in full before assuming anything about their state, and traced
  every `testID` the spec references against the actual current screens.

## Finding: the suite is in better shape than assumed going in

Contrary to what a "never run" status might suggest, this is not a green field or a
suite full of drift:

- `.detoxrc.js` is a real, filled-in config (iOS simulator + Android emulator, correct
  `expo prebuild`-based binary paths, a documented Windows `gradlew.bat` fix with real
  reasoning, not a stub).
- `e2e/jest.config.js` correctly separates its Jest config from the root unit-test one,
  loads `.env.e2e` (which exists in the repo, `apps/mobile/.env.e2e`), and sets a
  `transformIgnorePatterns` allowing `otplib`'s ESM-only TOTP dependency through — the
  exact kind of "would silently break on first real run" issue prior phases (Phase 16's
  own live-verification pass, per its own brief) found and fixed for the UNIT test
  suite; it appears to have already been applied here too, not overlooked.
- One real spec exists: `twoFactorAuth.e2e.ts`, covering the 2FA enroll → logout →
  login-with-TOTP flow Doc 02 §2.11 names explicitly as a must-have.

## testID trace (the actual verification-by-inspection work)

Every `by.id(...)` reference in the spec was checked against a literal `testID="..."`
string in the current screens. Two categories:

**Static testIDs — direct match, confirmed present:**
`login-email-input`, `login-password-input`, `login-submit-button`, `bottom-nav-plus`,
`mfa-challenge-code-input`, `mfa-challenge-verify-button`, `security-2fa-*` (six IDs),
all present verbatim in `login.tsx`, `BottomNav.tsx`, the MFA challenge screen, and
`security-settings.tsx` respectively.

**Dynamically-constructed testIDs — required tracing the construction, not a literal
grep, before either could be judged present or drifted:**

- `plus-sheet-settings` — not a literal string anywhere; `PlusSheet.tsx` builds it as
  `` `plus-sheet-${item.href.replace('/', '')}` ``, and the settings item's `href` is
  `/settings` → `plus-sheet-settings`. **Matches.**
- `settings-security-row` / `settings-logout-row` — not literal strings either;
  `settings.tsx` assigns them via a `testID: 'settings-security-row'` field on a row-data
  array, spread onto each row as `testID={row.testID}`. **Both match.**

**Conclusion: zero drift found.** Every testID the spec references resolves correctly
against the current screens. This is a genuinely different, more specific finding than
"looks fine" — it's the result of tracing two dynamic-construction sites, not just
grepping literals and stopping.

## What this phase did NOT do, and why

Did not add new spec files beyond fixing/confirming the existing one. The plan's own
wording for §10.2 says the deliverable "is likely... a verified-runnable suite + a clear
runbook," not a larger test suite — expanding coverage (dispatch flow, offline sync
flow, invite-accept flow) is real, valuable follow-up work but a distinct scope decision
from "make what exists trustworthy," which is what was verifiable by inspection here.
Flagged as a natural next increment, not started this phase, so as not to add specs that
themselves can't be run here either.

## Execution runbook (for a person with a simulator/emulator)

1. `cd apps/mobile && npx expo prebuild` (regenerates `ios/`/`android/` — gitignored,
   not a permanent eject; re-run whenever `app.json`/native deps change, including this
   phase's own `expo-updates`/`expo-local-authentication` additions).
2. Seed a throwaway Supabase test user with **no 2FA factor enrolled**, matching
   `twoFactorAuth.e2e.ts`'s own header requirement. Set `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`
   in `apps/mobile/.env.e2e`.
3. iOS: `pnpm test:e2e:build` then `pnpm test:e2e`. Android: `pnpm test:e2e:android:build`
   then `pnpm test:e2e:android`.
4. Confirm the spec passes end to end, including its own cleanup step (disabling 2FA
   again) — a failed run partway through may leave the test account with 2FA still
   enrolled; re-disable manually via the app or `supabase.auth.admin` before re-running.

Genuinely cannot be attempted in this sandbox: no simulator/emulator, no ability to run
`expo prebuild`'s native toolchain (Xcode/Android SDK) at all.
