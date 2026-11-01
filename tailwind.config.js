const c = (n) => `rgb(var(--${n}) / <alpha-value>)`
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'] },
      colors: {
        background: c('background'),
        foreground: c('foreground'),
        sidebar: c('sidebar'),
        card: c('card'),
        border: c('border'),
        muted: c('muted'),
        'muted-foreground': c('muted-foreground'),
        primary: c('primary'),
        'primary-foreground': c('primary-foreground'),
        secondary: c('secondary'),
        success: c('success'),
        warning: c('warning'),
        danger: c('danger'),
        accent: c('accent'),
      },
      borderRadius: { lg: '0.5rem', md: '0.375rem', sm: '0.25rem' },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { 'fade-in': 'fade-in .18s ease-out' },
    },
  },
  plugins: [],
}
