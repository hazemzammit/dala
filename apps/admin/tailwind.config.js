/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@dala/config/tailwind-preset.js')],
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
