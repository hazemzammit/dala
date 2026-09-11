/**
 * @dala/config — shared Tailwind preset.
 *
 * Used by apps/web and apps/admin: `presets: [require('@dala/config/tailwind-preset')]`
 * in each app's tailwind.config.js. This is what keeps web and admin on the
 * exact same color/spacing/radius values as mobile's Tamagui config, both
 * ultimately sourced from packages/design-tokens.
 */
// NOTE: requiring a .ts file directly from plain Node requires a TS loader
// (e.g. `node -r tsx/cjs`, which Next.js's own build pipeline provides
// automatically for tailwind.config.js). If you hit a "cannot require .ts"
// error outside of `next dev`/`next build`, the fallback is to add a
// `pnpm --filter @dala/design-tokens build` step that emits `dist/index.js`
// and import that instead — do this before it becomes a real blocker.
const { color, radius, spacing } = require('../design-tokens/src/index.ts');

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        accent: color.accent,
        neutral: color.neutral,
        success: color.status.success,
        warning: color.status.warning,
        danger: color.status.danger,
        successButton: color.status.successButton,
        categorical: color.categorical,
      },
      borderRadius: {
        control: `${radius.control}px`,
        card: `${radius.card}px`,
        sheet: `${radius.sheet}px`,
      },
      spacing: Object.fromEntries(spacing.scale.map((v) => [`${v}`, `${v}px`])),
      fontFamily: {
        display: ['Sora', 'sans-serif'],
      },
    },
  },
};
