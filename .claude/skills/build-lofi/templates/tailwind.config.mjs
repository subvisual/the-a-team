// Greyscale baseline. Gets replaced/extended by `design-system` once tokens exist.
export default {
  content: ['./src/**/*.{astro,html,js,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans, ui-sans-serif, system-ui, sans-serif)'],
      },
    },
  },
  plugins: [],
};
