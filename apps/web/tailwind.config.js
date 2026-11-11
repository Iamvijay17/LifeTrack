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
        'surface-2': c('surface2'),
        border: c('border'),
        muted: c('muted'),
        'muted-foreground': c('muted-foreground'),
        primary: c('primary'),
        'primary-solid': c('primary-solid'),
        'primary-foreground': c('primary-foreground'),
        secondary: c('secondary'),
        indigo: c('indigo'),
        success: c('success'),
        warning: c('warning'),
        danger: c('danger'),
        'danger-solid': c('danger-solid'),
        accent: c('accent'),
        // The current module's accent. Set by [data-module] in index.css, so a page or a single tile can carry its own colour.
        mod: c('mod'),
        'mod-2': c('mod-2'),
        'mod-text': c('mod-text'),
      },
      borderRadius: { sm: '0.375rem', md: '0.625rem', lg: '0.875rem', xl: '1.125rem', '2xl': '1.375rem' },
      letterSpacing: { display: '-0.025em' },
      boxShadow: {
        card: 'var(--shadow-card)',
        raised: 'var(--shadow-raised)',
        overlay: 'var(--shadow-overlay)',
        glow: '0 0 0 1px rgb(var(--mod) / 0.35), 0 8px 28px -8px rgb(var(--mod) / 0.45)',
        'btn-primary': 'inset 0 1px 0 rgb(255 255 255 / 0.18), 0 1px 2px rgb(0 0 0 / 0.3), 0 6px 18px -8px rgb(124 58 237 / 0.7)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        // `translate`/`scale` (not `transform`), so an element centred with transform utilities stays centred while it animates.
        'fade-in': { from: { opacity: 0, translate: '0 4px' }, to: { opacity: 1, translate: '0 0' } },
        'pop-in': { from: { opacity: 0, scale: '0.96', translate: '0 -4px' }, to: { opacity: 1, scale: '1', translate: '0 0' } },
        'slide-down': { from: { opacity: 0, translate: '0 -4px' }, to: { opacity: 1, translate: '0 0' } },
        'ctx-in': { from: { opacity: 0, scale: '0.96' }, to: { opacity: 1, scale: '1' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in .18s cubic-bezier(0.22, 1, 0.36, 1)',
        'pop-in': 'pop-in .16s cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-down': 'slide-down .18s cubic-bezier(0.22, 1, 0.36, 1)',
        'ctx-in': 'ctx-in .12s cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
}
