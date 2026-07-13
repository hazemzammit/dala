# Dala — UI/UX Design Specification
### *"La base de tout chantier."*
## Premium SaaS visual system for Mobile (Expo/RN) + Web (Next.js)

> This extends Doc 00 §0.6 (Design System) — it doesn't override any
> resolved decision (teal brand, Sora, Phosphor, French-default, RTL-safe
> logical properties). It's the missing layer between "we picked teal
> and Sora" and "here's exactly what to build."

---

## 0. What the reference material tells us

**From your five spec docs**, the constraints are already set:
- Brand accent: teal. Display font: Sora (app name, titles, "numbers that matter"). Body: system font (SF Pro / Roboto / Inter).
- Icons: Phosphor, one set across both platforms.
- Mobile: bottom nav + FAB. Web: persistent left sidebar + top-right contextual action.
- Principle: "the most important number on any screen is the biggest thing on the screen."
- RTL-safe from day one (logical properties, not physical).
- ~40 mobile screens, ~35 web screens, two role systems (org role + project role), multi-org switcher everywhere.

**From the inspiration screenshots**, the shared DNA worth pulling in — regardless of which specific Figma community file each came from — is:
- Large radius (16–24px), low-elevation cards on a soft neutral (not pure white) background — mine cloud and iffee both do this.
- One accent color carrying all emphasis (color, links, active states, primary buttons); everything else stays in a tight neutral/gray scale.
- Numbers rendered large and bold with a small colored delta chip (+8%/-4%) next to them, sparkline underneath — this is *exactly* your "numbers over words" principle, already validated by the iffee and purple-dashboard screenshots.
- Small circular avatar stacks for "who's involved" (mine cloud's sharing row, Coursue's mentor list) — maps directly onto your worker/team/multi-org member lists.
- Left sidebar with a favorites/pinned section above a flat main-menu list, org/workspace switcher pinned at the very top (purple dashboard, mine cloud) — maps directly onto your web shell's org switcher + nav.
- Mobile screenshots (yoga app, Asana, fitness app) confirm: bottom tab bar with a filled circular "+" as the visually distinct action, card-based "today" summaries, soft pastel category chips.

None of these products are Apple's own UI, but they're all downstream of the same Apple-San-Francisco-adjacent visual grammar: restraint, whitespace, one accent, rounded geometry, content-first typography. That's the target register for Dala — not skeuomorphic, not flat-and-cold either.

---

## 1. Design tokens (the actual system, not just the brand words)

### 1.1 Color

Teal is the single accent. Everything else is neutral. Resist the temptation to add a second "success green" or "warning orange" that competes visually with teal for attention — status colors should be *quieter* than the brand color, not louder.

| Token | Light mode hex | Usage |
|---|---|---|
| `accent-50` → `accent-900` | `#F0FBFA` → `#0B4F4A` (teal ramp) | `accent-600` (~`#0F9D8E`) is the primary brand teal — buttons, active nav item, links, focus rings, chart primary series. `accent-50` is used only as a tinted background behind badges/banners, never as a large surface. |
| `neutral-0` | `#FFFFFF` | Cards, sheets, modals — the "raised" surface. |
| `neutral-25` | `#FAFAFA` | App/page background (never pure white behind cards — this is what makes mine cloud/iffee feel premium instead of flat). |
| `neutral-100`–`neutral-300` | `#F2F2F3` → `#DADDE1` | Borders, dividers, disabled fills. |
| `neutral-500` | `#6B7280` | Secondary/muted text, placeholder text. |
| `neutral-900` | `#111318` | Primary text. Never pure `#000` — slightly warmed/cooled off-black reads as more premium. |
| `success` | `#1F9254` (muted green) | Payé, Approuvé, on-track deltas. |
| `warning` | `#B8860B`→ rendered as a muted amber, `#C08A1E` | En attente, storage 80% banner. |
| `danger` | `#C0433D` (muted brick red, not fire-engine red) | Refusé, overdue, storage lock, destructive actions. |
| `info` | reuse `accent-500` | Never introduce a separate blue — teal already reads as "informational" and a second cool color muddies the palette. |

Dark mode: invert the neutral ramp (`neutral-25`→near-black `#0E0F12`, cards at `#17191D`), keep `accent-600` roughly as-is but check contrast — teal on near-black often needs to shift one step lighter (`accent-500`) to stay legible. Dark mode is a nice-to-have, not required for MVP per your docs, but build the token layer so it's a config swap, not a rewrite.

### 1.2 Typography scale

Sora is a geometric display face — use it sparingly and with intent, exactly as Doc 00 already specifies. If everything is Sora, nothing reads as "the number that matters."

| Role | Font | Size / weight | Where |
|---|---|---|---|
| Hero number | Sora | 34–40px / 600 | Balance owed, budget consumed %, total revenue — the one number per screen that should win the eye first. |
| Screen title | Sora | 22–24px / 600 | Page/screen headers, sidebar section headers. |
| App wordmark | Sora | — / 700 | Splash, sidebar logo lockup, auth screens. |
| Section label | System | 13px / 600, uppercase, `neutral-500`, +0.04em tracking | "Recent campaigns"-style eyebrow labels (per the purple dashboard reference), card group headers. |
| Body | System (SF Pro/Roboto/Inter) | 15–16px / 400–500 | Form labels, list content, descriptions. |
| Caption/meta | System | 12–13px / 400 | Timestamps, "Yesterday," helper text under fields. |

Line-height: 1.4 for body, 1.15 for the hero numbers (tight, so a 3-line stat card doesn't feel airy). Numeric characters should use tabular figures (`font-variant-numeric: tabular-nums`) anywhere numbers stack in a column (salary tables, dispatch cost columns) so digits align.

### 1.3 Spacing, radius, elevation

- **Base unit**: 4px. Standard paddings: 8 / 12 / 16 / 24 / 32.
- **Radius**: 12px for buttons/inputs/chips, 16px for cards, 20–24px for modals/bottom sheets/large hero cards. This is the single biggest lever for the "premium" feel your references share — none of them use sharp corners.
- **Elevation**: avoid heavy drop shadows. Use a 1px `neutral-100` border *plus* a whisper-soft shadow (`0 1px 2px rgba(17,19,24,0.04), 0 4px 12px rgba(17,19,24,0.03)`). Two-layer elevation only: resting card, and raised (modal/dropdown/actively-dragged dispatch chip). Never three or four shadow depths — that's what makes cheaper admin templates look busy.
- **Iconography**: Phosphor, "regular" weight at rest, "fill" or "bold" weight for the active/selected state (e.g. a filled bottom-nav icon vs. its outline sibling when inactive) — this single micro-detail is a large part of why Apple-style nav feels premium instead of generic.

### 1.4 Motion

- Screen transitions: 200–250ms ease-out slide (mobile: platform-native push/pop; web: soft fade+8px translate, never a hard cut).
- Micro-interactions (button press, checkbox check, worker state-machine button flip on the Worker Home screen): 120–150ms, spring-ish (slight overshoot), never linear.
- Dispatch drag-and-drop (web): the dragged chip lifts with a scale(1.03) + shadow increase; a rejected drop animates back to origin over 200ms with the conflict toast fading in simultaneously, not sequentially — don't make the user wait through a settle animation before seeing *why* it failed.
- Loading states: skeleton screens (shimmering neutral-100 blocks matching the real layout), never a centered spinner on a blank screen for anything beyond the ~800ms splash-check window your docs already specify.

---

## 2. Mobile app (Expo/React Native) — UX & UI detail

### 2.1 Global shell

- **Bottom nav**: 4–5 items max (Doc 03's ~15 modules don't all fit — group into Accueil / Chantiers / Dispatch / Équipe / Plus, with "Plus" opening a sheet listing everything else: Véhicules, Matériaux, Journal, Sécurité, Portail client, Collaboration, Rapports, Facturation, Paramètres). Active item: filled Phosphor icon + `accent-600` label; inactive: outline icon + `neutral-500` label. No text-only tabs — icon+label always, per the reference mobile screenshots (yoga app, Asana mobile).
- **FAB**: single circular filled `accent-600` button, floating above the bottom nav, contextual per screen (New dispatch on Dispatch, New chantier on Projects, Update chantier on Worker Home). Never more than one FAB action visible — if a screen needs multiple quick actions, use a FAB-expand (small radial menu) rather than multiple floating buttons.
- **Org switcher**: pinned directly under the greeting on Home (per Doc 03 §3.9/§3.22.2a) — rendered as a compact pill: small org logo/initial + org name + chevron. Tapping opens the bottom sheet described in your spec. Visually this should look like mine cloud's folder/workspace switcher — a lightweight, tappable identity chip, not a heavy dropdown button.
- **Top area**: no top nav bar on most screens (per Doc 00) — instead a large greeting/context header ("Bonjour, {{name}}" + today's date, Sora for the name) that scrolls with content, collapsing to a slim sticky title bar on scroll (this is the "Apple-like" behavior — Settings.app / Mail.app large-title-collapsing pattern).

### 2.2 Home / Dashboard

Single-column stack, but each block is a distinct card, not a flat list — mirroring the iffee stat-card grid, just stacked vertically instead of in a grid (phone width forces single column). Order, top to bottom:
1. Greeting + org switcher pill.
2. **Hero card**: this week's cash snapshot — one big Sora number (net owed or budget-consumed %), small delta chip, thin sparkline beneath (reuse iffee's "Weekly Invoices" bar treatment, or the purple dashboard's line sparkline — either reads as premium; bars read slightly more "financial," lines read slightly more "trend," pick bars for money and lines for progress/time metrics).
3. **Dispatch summary card**: today's assignments as a horizontal-scrolling row of compact worker chips (avatar + name + status dot: parti/en route/sur place), matching the small-avatar-stack pattern from mine cloud/Coursue.
4. **Active projects** — 2–3 project cards (name, client, progress bar, budget-consumed chip), "Voir tout" link to full list.
5. **Activity feed** — timestamped list, small icon per event type (Phosphor), grouped by day with a "Yesterday"/"Aujourd'hui" label exactly like mine cloud's activity panel.

### 2.3 Dispatch board (mobile)

Weekly grid, but on a phone this must be a horizontally-swipeable day view, not a cramped 7-column grid. Each day is a full-width card containing vehicle "lanes" (small chip per vehicle showing assigned worker avatars). Tap-to-assign opens a bottom sheet with a searchable worker list (avatar, name, availability badge) — selecting one animates the chip into the lane. Conflict detection surfaces as an inline red-outline pulse on the chip plus a toast, never a blocking modal (keep the field-use flow fast).

### 2.4 Worker Home (the 3-action app)

This screen is intentionally the simplest in the whole product and should look it — huge single mission card at top (site name in Sora, address, vehicle, teammates as small avatar row, departure time), one enormous state-machine button beneath (full-width, 56px height, filled `accent-600`, label changes per state: "Je suis parti" → "Je suis arrivé" → "Envoyer un update"), and the salary strip pinned at the very bottom as a slim, permanently-visible bar (never scrolls away — it's the one thing a worker checks constantly). No nav chrome beyond a minimal 3-item bottom bar (Accueil / Salaire / Réglages) — resist adding anything else here; complexity creep on the worker app defeats its whole design premise from Doc 02/03.

### 2.5 Forms (Sign Up, New chantier, Advance/Material request, etc.)

- Field label above input (never placeholder-as-label — placeholders disappear on focus and users lose context, especially on a construction site with sun glare on the phone).
- Single-column, generous 16px vertical rhythm between fields.
- Inline validation on blur, error text in `danger` directly under the field, field border shifts to `danger` — never a top-of-form error summary alone.
- Primary CTA is always full-width, bottom-anchored (sticky above keyboard when the keyboard is open), secondary/text actions below it, smaller and `neutral-500`.
- Password strength meter: horizontal 3-segment bar beneath the field (Faible/Moyen/Fort), colored `danger`→`warning`→`success` as it fills — never a blocking wall, matching your resolved risk-register decision.

### 2.6 Camera/photo capture (site log, worker updates)

Full-screen camera view, minimal chrome (shutter button, flash toggle, gallery-import thumbnail in the corner) — after capture, a lightweight review screen with the note-voice/note-text fields beneath the photo thumbnail, matching your "at least one of three" validation. Compression spinner (if visible at all) should be a subtle inline dot-pulse on the send button, not a separate loading screen — your docs already specify this should be near-instant and invisible.

---

## 3. Web app (Next.js) — UX & UI detail

### 3.1 Global shell

- **Left sidebar**, fixed width ~260px, `neutral-0` background against the `neutral-25` page canvas (this two-tone split is what makes mine cloud's and the purple dashboard's shells read as premium rather than a single flat gray page).
  - Top: org switcher (logo/initial + name + chevron), same grouped dropdown as mobile's sheet.
  - Middle: flat nav list, Phosphor icon + label, active item gets a `accent-50` filled rounded-rect background behind it (not just a colored left-border tick — the filled-pill active state is the more premium/modern read of the two, matching the purple dashboard reference).
  - Bottom: account row (avatar, name, small "..." menu) pinned above a subtle divider, plus a storage-usage mini-bar when relevant (mirroring mine cloud's storage widget at the sidebar's base).
- **Top bar**: search field (center-left, Postgres FTS-backed per Doc 01 §1.12, results drop down grouped by entity type), notification bell with unread dot, account avatar. No page title repeated here — the page's own Sora title header does that job, avoiding the double-title redundancy some of the reference dashboards have.
- **Primary action**: always top-right of the content area, filled `accent-600` button with a leading Phosphor plus-icon ("+ Nouveau chantier," "+ Inviter un membre") — this is the direct web equivalent of the mobile FAB, and should be visually the single most prominent interactive element on any list screen.

### 3.2 Dashboard

Responsive grid, up to 4 columns on wide viewports, collapsing to 2 then 1 on narrower windows. Reuse the same card types as mobile (hero cash card, dispatch summary, active projects, activity feed) but let the hero cash card span 2 columns and pair with 2–3 smaller single-column stat tiles beside it (TASKS COMPLETED-style tiles from the iffee reference: big number, small colored delta, muted label above) — this is exactly the layout grammar of your iffee and purple-dashboard screenshots, just re-skinned in teal/neutral.

### 3.3 Projects list

Table/grid toggle (per Doc 04 §4.2.3). The **table view** should look like mine cloud's file table: sortable column headers with a subtle chevron, row hover state (`neutral-25` tint), avatar-stack cell for "who's on this project" (lead org + trade orgs), a slim progress bar rendered inline in its own column, and a right-aligned budget-consumed percentage as a small colored chip (green under 80%, amber 80–100%, red over). The **card/grid view** mirrors mine cloud's Quick Access cards — icon/thumbnail top-left, name bold, metadata line beneath in `neutral-500`.

### 3.4 Dispatch board (web)

Full 7-column weekly grid (this is where web genuinely earns its "denser" layout over mobile's day-swipe). Each cell is a vehicle lane; worker chips are draggable (see motion §1.4). "Copier semaine précédente" as a small text-button top-right of the grid, not competing with the primary "+ Nouvelle assignation" action.

### 3.5 Data-dense screens (Salary/payroll, Reports, Materials approval queue)

These are the screens where a construction SaaS most risks looking like a boring back-office tool — actively fight that by:
- Always pairing a big number/chart at the top of the screen with the data table below it (never a bare table as the entire screen) — e.g. Payroll screen leads with a Sora total-payroll-this-cycle number and a small bar chart of weekly totals, *then* the row-by-row worker table underneath.
- Status as colored pill-badges (Payé/En attente/Refusé), never colored table-row backgrounds (that reads as a spreadsheet, not a product).
- Bulk actions surface as a slim contextual toolbar that slides in above the table only once rows are checkbox-selected — invisible otherwise.

### 3.6 Platform Admin (`admin.dala.tn`)

Deliberately a *visually distinct* application per Doc 04 (separate app, separate auth) — same design tokens (don't invent a new color/type system) but a plainer, denser, more utilitarian layout: no marketing-adjacent hero cards, tables-first, a persistent "impersonation session" banner (per Doc 00 §0.5 item 18) rendered in `danger`-tinted background whenever active so an admin can never forget they're inside a live impersonation.

---

## 4. Component inventory (build these once, reuse everywhere)

| Component | Key states | Notes |
|---|---|---|
| **StatCard** | default, loading (skeleton), empty | Hero number + label + delta chip + optional sparkline. The single most-reused component across both apps. |
| **Avatar / AvatarStack** | 1–N overlapping circles + "+N more" | Used for worker chips, project membership, team lists. |
| **StatusBadge/Pill** | success / warning / danger / neutral / info | Rounded-full, small dot + label, never a full-width banner for row-level status. |
| **PrimaryButton** | default, pressed, disabled, loading (inline spinner replaces label, button width doesn't jump) | Full-width on mobile forms, auto-width elsewhere. |
| **BottomSheet (mobile) / Dropdown-panel (web)** | Org switcher, worker-select, filters — same content, platform-appropriate container. |
| **FormField** | default, focused (accent border), error (danger border + helper text), disabled | Label-above pattern, consistent across every one of your ~15 form screens. |
| **ConflictToast** | Appears on rejected dispatch drag/tap-assign | Auto-dismiss 4s, manual dismiss always available. |
| **EmptyState** | Illustration + headline + primary CTA | Every list screen needs one (Doc 03 references several, e.g. "Créez votre premier chantier"). |
| **DataTable (web only)** | sortable header, row hover, row-select checkbox, bulk-action toolbar | Used by Projects, Payroll, Materials queue, Reports. |
| **NavItem** | active (filled pill + fill-weight icon), inactive (outline icon), hover (web only) | Shared visual logic between mobile bottom-nav and web sidebar. |

---

## 5. What "Apple-like premium" concretely means here — a checklist

Use this to review any screen before calling it done:

- [ ] Is there exactly **one** number on this screen bigger/bolder than everything else?
- [ ] Is the background a soft off-white/off-black (`neutral-25`), not pure white, behind raised `neutral-0` cards?
- [ ] Is teal the *only* saturated color doing active work (buttons, links, active nav, chart primary), with status colors kept deliberately muted?
- [ ] Are corners consistently rounded (12/16/20px family), never a mix of sharp and round on the same screen?
- [ ] Is there restraint on shadows — one soft resting shadow, one raised shadow, nothing heavier?
- [ ] Do icons switch outline→filled on active/selected state rather than just changing color?
- [ ] Is body copy in the system font and Sora reserved for titles/numbers only?
- [ ] Does every list screen have a real empty state, not a blank white rectangle?
- [ ] Is every form field labeled above the input, never placeholder-only?
- [ ] Would this screen still make sense flipped RTL with only logical-property changes (no hardcoded left/right)?

---

## 6. On the Figma links

Those four community files under `q_id=1a14f511…` and three under `q_id=a2172b1f…` are Figma's own "resources/community" URLs — they sit behind Figma's account/session wall, so I wasn't able to open them from here to extract specifics. If there's something particular in one of them you want reflected (a component style, a specific chart treatment, a specific onboarding pattern), the fastest path is to either screenshot the frames you like — the way you did for the seven images above — or duplicate the file into your own Figma account and share that direct link, since community-resource links generally require the viewer to already be signed into Figma.
