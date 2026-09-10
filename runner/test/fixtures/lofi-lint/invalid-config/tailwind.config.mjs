export default {
  theme: {
    colors: {
      surface: 'var(--surface)',
    },
    extend: {
      colors: {
        surface: 'red',
        fallback: 'var(--missing, red)',
        chain: 'var(--surface, var(--surface-fallback))',
        rawFallback: 'var(--a-very-long-missing-custom-property, #f00)',
      },
    },
  },
}
