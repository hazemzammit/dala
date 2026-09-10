/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@dala/config/tailwind-preset.js')],
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui-web/src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
