# Extending `apps/web`'s org creation to match the mobile wizard

> **STATUS: IMPLEMENTED.** This guide is now historical reference, not an
> open task — `apps/web/src/app/create-organization/page.tsx` and
> `apps/web/src/app/(auth)/login/page.tsx` were built following this plan.
> See `docs/MOBILE_IMPLEMENTATION_STATUS.md`'s "Web parity shipped" entry
> and `docs/spec/04-screens-web-contractor-and-admin.md` §4.1.3/§4.2.1 for
> what actually shipped versus this plan (a plain `<input type="file">`
> logo upload and a chip-row for enum fields, same as this guide proposed
> in §2). §4's open questions were resolved: no separate web organization-
> settings page was built this pass (question 1) — the wizard remains the
> only web surface for these fields for now; RIB stays out entirely
> (question 4, unchanged from the mobile guide); admin surfacing (question 5) was done separately, see `docs/ADMIN_IMPLEMENTATION_STATUS.md`.

**Context for whoever picks this up:** this is the deferred web half of
`dala-full-org-creation-guide.md` (Tunisian construction-site management
SaaS — monorepo, pnpm/Turborepo, Supabase, Expo/React Native + Tamagui
mobile, Next.js web). That guide's mobile half is **done and shipped**:
`apps/mobile/src/app/create-organization.tsx` is now a 4-step wizard
collecting every real `organizations` field, and `apps/mobile/src/app/
login.tsx` redirects an incomplete org into it after login. Hazem
explicitly deferred web parity at that time ("out of scope — mobile only
for now" — see `docs/MOBILE_IMPLEMENTATION_STATUS.md`'s org-creation-wizard
entry and `docs/spec/03-screens-mobile-contractor-and-worker.md` §3.22.2a
for the shipped mobile design this guide should mirror).

**Read this whole document, and re-verify every claim in it against the
actual repo, before writing any code** — treat this file the same way the
mobile guide told its implementer to treat _it_: a prior analysis that may
have drifted by the time you pick this up, not ground truth. In
particular, re-run the migration-count check below; if it's moved past
0077, re-diff every migration after 0077 against `organizations` before
assuming this guide's field list is still complete.

---

## 1. What's confirmed true as of the mobile wizard's completion

### 1.1 The `organizations` schema — unchanged by the mobile work

The mobile wizard added zero new columns and zero new RPCs. Every field
listed in the original guide's §1.1 is still exactly as described there,
plus two system-only columns confirmed present as of migration 0077
(`subscription_status`/`billing_cycle_start`/`seat_price_millimes` from
0043, `onboarding_dismissed_at` from 0077) — all four are system-managed,
never user input, same bucket as `plan`/`verification_status`. **Re-run
`ls supabase/migrations/ | sort | tail -5` before starting** to confirm
nothing has landed since 0077.

### 1.2 The 4 RPCs — identical situation as the mobile guide's §1.2

`create_organization_for_current_user`, `update_organization_profile`,
`update_organization_extended_profile`, `update_organization_rib` are all
already used successfully by the mobile wizard with zero signature
changes. Web needs **no new backend code either** — same as mobile, this
is a pure client-side orchestration problem. Do not touch any of these
four.

### 1.3 Existing Zod schemas — `createOrganizationFullSchema` already exists

`packages/validation/src/organizations.ts` now has
`createOrganizationFullSchema` (added for the mobile wizard) — a Zod
object covering every user-writable field (`name`, `trade_type`,
`logo_url`, `address`, `contact_phone`, `contact_email`,
`matricule_fiscal`, `rc_number`, `legal_form`, `workforce_size_bracket`,
`facebook_url`, `instagram_url`, `website_url`, `service_area`), with
`name` as the only required field. **Reuse this schema directly — do not
duplicate it or write a web-specific variant.** The mobile wizard already
validates each step against a `.pick(...)` slice of it; do the same on
web.

### 1.4 `apps/web`'s current state — confirmed, this pass's actual starting point

- **`apps/web/src/app/create-organization/page.tsx`** — still exactly the
  original minimal form: `name` + `trade_type`, calling
  `create_organization_for_current_user` directly, `createOrganizationSchema`
  (not the full schema), no `org_id` capture from the RPC response, no
  `setActiveOrgId`-equivalent call, redirects straight to `/dashboard`.
- **`apps/web/src/app/(auth)/login/page.tsx`** — plain email/password form,
  `loginSchema`, `supabase.auth.signInWithPassword`, then a hard
  `window.location.href = '/dashboard'` (not a router push — a full
  reload). No MFA-challenge branching visible in this file (worth
  confirming whether that's handled via middleware/layout before assuming
  it needs adding here). This is the direct equivalent of mobile's
  `login.tsx` and is where a completion-redirect would need to hook in,
  mirroring the mobile approach.
- **No web equivalent of `organization-settings.tsx` exists.** Mobile's
  wizard, and the mobile guide before it, both leaned on
  `organization-settings.tsx` as "the reference implementation that
  already solved this layout problem once." **Web has no such reference —
  there is currently no web page where an org's legal/extended-profile
  fields can be viewed or edited post-creation at all.** This is a real
  gap this pass needs to either fill (build a minimal web equivalent) or
  explicitly flag as follow-on scope — don't assume one exists (see §4).
- **No `Select`-style bottom-sheet/dropdown component exists on web.**
  Mobile's chip-row pattern for `legal_form`/`workforce_size_bracket`
  (plain pressable pills, not a dropdown) is trivially portable to web as
  a row of `<button>`s with active-state styling — confirm this before
  reaching for a new dependency; a picker library is very unlikely to be
  necessary for 4-option and 4-option enum fields.
- **Admin already reads every column via `select('*')`** on the org detail
  API route (`apps/admin/src/app/api/admin/organizations/[orgId]/route.ts`)
  — whatever web writes will show up there automatically, no admin-side
  change needed for data availability (see the note on Admin below, which
  is a separate, pre-existing gap, not something this pass should try to
  fix incidentally).

---

## 2. Suggested wizard design — mirror the mobile breakdown, adapt to web conventions

Reuse the exact 4-step grouping the mobile wizard already shipped and
Hazem already confirmed once (don't re-litigate step grouping — it's
already a proven design):

| Step | Title                | Fields                                                                                              | RPC(s)                                                                                                |
| ---- | -------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1    | Essentials           | `name` (required), `trade_type` (optional)                                                          | `create_organization_for_current_user`                                                                |
| 2    | Coordonnées          | `address`, `contact_phone`, `contact_email`, `logo_url`                                             | `update_organization_profile`                                                                         |
| 3    | Informations légales | `legal_form` (chip row), `matricule_fiscal`, `rc_number`                                            | `update_organization_profile` again + `update_organization_extended_profile` (legal_form only so far) |
| 4    | Profil public        | `workforce_size_bracket` (chip row), `service_area`, `facebook_url`, `instagram_url`, `website_url` | `update_organization_extended_profile` (everything)                                                   |

Same save-as-you-go principle mobile used: each step's RPC call resends
the FULL accumulated state gathered so far, not just that step's own new
fields — so abandoning the flow (closing the tab, navigating away) after
any step leaves a usable, actually-persisted org rather than nothing.

**Web-specific differences to work out, not just copy-paste:**

- **Logo upload.** Mobile's `uploadOrgFile`/`processLogoPhoto` pipeline is
  Expo/React-Native-specific (`expo-image-picker`, RN `fetch`-as-Blob).
  Check whether `apps/web` has its own file-upload helper for Supabase
  Storage already (search for other web screens that upload anything, e.g.
  avatar handling if it exists) before assuming you need to write one from
  scratch — but do **not** assume `uploadOrgFile` itself is reusable
  as-is; it's mobile-only code, confirm this rather than importing it
  across apps.
- **No native bottom sheet.** Mobile's `Select.tsx` free-text "Autre"
  picker for `trade_type` needs a web equivalent — a plain `<select>` or a
  small custom dropdown with a same-shaped "Autre — préciser" option is
  almost certainly sufficient; don't reach for the mobile component or try
  to share code across the two apps for this.
- **Routing.** Web uses Next.js `useRouter()`/`router.push` (see the
  current `create-organization/page.tsx`); the `?org_id=` completion-mode
  param mobile uses translates directly to a Next.js search param
  (`useSearchParams()`), same idea, different API.
- **No React Native `ScrollView`/Tamagui primitives** — this is a plain
  Next.js/Tailwind app judging by the existing `page.tsx` (`Card`,
  `FormField`, `Button` from `@/components/ui`), so the wizard's actual
  JSX will look nothing like the mobile file structurally even though the
  field/step/RPC logic mirrors it exactly.

---

## 3. Login-redirect parity — same mechanism, same reasoning

Mobile's `login.tsx` checks the active org's completion (5-field calc:
logo, legal_form, workforce_size_bracket, service_area, matricule_fiscal)
against `org_checklist_dismissed_at` right after a successful
`signInWithPassword`, and redirects into the wizard's step 2 instead of
the dashboard when incomplete and not dismissed — **only** when there's no
explicit `next` destination already requested. The same mechanism belongs
in `apps/web/src/app/(auth)/login/page.tsx`, replacing (or gating) its
current unconditional `window.location.href = '/dashboard'`.

**One thing to check before building this, not assume:** whether web's
sign-up flow is actually the same "minimal, no org fields beyond
name/trade_type" shape mobile's is. If web has ever had its own separate
sign-up screen with a different field set, the "why redirect after login
instead of at signup" reasoning from the mobile guide (§3.1 of the
original guide — routing an already-authenticated user into the wizard
rather than making them fill 12 fields before an account exists) needs to
be re-confirmed against web's actual sign-up shape, not assumed to
transfer unchanged.

---

## 4. Open questions — confirm with Hazem before/while implementing

Don't silently pick an answer to any of these:

1. **Organization-settings equivalent on web** — since no such page exists
   today, does this pass also need to build a minimal web
   "view/edit organization" screen (the natural place to _also_ expose
   RIB entry, matching mobile's owner-only "Ajouter un RIB" sheet), or is
   the wizard itself the only web surface these fields get for now (i.e.
   fields are one-time-set at creation, not editable afterward on web
   until a settings page exists)? This materially changes scope.
2. **Web sign-up's actual current shape** — confirm it before assuming
   the "keep sign-up minimal, redirect after login" reasoning applies
   unchanged (see §3 above).
3. **Logo upload on web** — is there already a reusable Storage-upload
   helper in `apps/web`, or does this pass need to write one? (§2's
   bullet above — check before assuming either way.)
4. **RIB** — same guide-wide answer as mobile (never collected at
   creation), unless question 1 changes the picture by introducing a web
   settings page.
5. **Admin surfacing these fields** — separate from this guide's actual
   scope, but worth deciding explicitly rather than letting it sit
   silently: does extending web's creation flow also warrant finally
   surfacing `legal_form`/`workforce_size_bracket`/`service_area`/etc. on
   `apps/admin`'s org detail page, which currently shows none of them
   (see the note in this repo's admin discussion — a pre-existing gap,
   not something either the mobile or this web pass created)? If yes,
   scope it as its own small follow-on, not folded silently into this
   guide's work.

---

## 5. Suggested implementation order

1. Re-verify §1 of this guide against the current repo (migration count,
   RPC signatures, `createOrganizationFullSchema`'s current shape,
   `apps/web`'s current `create-organization/page.tsx` and `login/page.tsx`
   content) before writing anything — the same verification-first
   discipline the mobile pass used.
2. Resolve §4's open questions with Hazem, especially #1 (organization-
   settings equivalent) since it changes the actual scope of this pass.
3. Build the web wizard in `create-organization/page.tsx` (or split into
   step components if that fits the codebase's existing conventions
   better — check how other multi-step or multi-section web pages, if
   any, are structured first).
4. Add the completion-redirect to `login/page.tsx`.
5. If §4.1 came back "yes, build it," add the minimal web
   organization-settings-equivalent page as its own follow-on step, not
   bundled invisibly into the wizard's own commit.
6. Typecheck and lint after each file, the same way the mobile pass did —
   confirm the actual web equivalent commands first (check
   `apps/web/package.json`'s scripts; likely `next build`/`tsc --noEmit`
   and `eslint`, but don't assume the exact invocation without checking).
