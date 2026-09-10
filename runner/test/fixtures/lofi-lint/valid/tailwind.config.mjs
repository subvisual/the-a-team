export default {
  theme: {
    extend: {
      fontSize: {
        caption: '0.75rem',
        body: '1rem',
        h1: '2rem',
      },
      lineHeight: {
        spacious: '1.75',
      },
      colors: {
        brand: { 500: 'oklch(var(--brand-500))' },
        neutral: { 50: 'oklch(var(--neutral-50))' },
        success: 'oklch(var(--success))',
        warning: 'oklch(var(--warning))',
        error: 'oklch(var(--error))',
        info: 'oklch(var(--info))',
        surface: { raised: 'var(--surface-raised)' },
      },
    },
  },
}
