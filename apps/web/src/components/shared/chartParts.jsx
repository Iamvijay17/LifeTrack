// The parts of charts that don't need Recharts, so the app shell and small tiles can use them without loading the chart library.

/** Gradients for chart fills, defined once by <ChartGradients /> in the app shell. */
export const G = {
  mod: 'url(#lt-g-mod)',
  modArea: 'url(#lt-g-mod-area)',
  success: 'url(#lt-g-success)',
  violet: 'url(#lt-g-violet)',
  danger: 'url(#lt-g-danger)',
  dangerArea: 'url(#lt-g-danger-area)',
}

const stops = (top, bottom) => (
  <>
    <stop offset="0" style={{ stopColor: top }} />
    <stop offset="1" style={{ stopColor: bottom }} />
  </>
)
const fade = (color, opacity = 0.32) => (
  <>
    <stop offset="0" style={{ stopColor: color, stopOpacity: opacity }} />
    <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
  </>
)

/** One hidden SVG in the document, whose gradients any chart can reference. */
export const ChartGradients = () => (
  <svg width="0" height="0" aria-hidden className="absolute">
    <defs>
      <linearGradient id="lt-g-mod" x1="0" y1="0" x2="0" y2="1">
        {stops('rgb(var(--mod))', 'rgb(var(--mod-2) / 0.75)')}
      </linearGradient>
      <linearGradient id="lt-g-mod-area" x1="0" y1="0" x2="0" y2="1">
        {fade('rgb(var(--mod))')}
      </linearGradient>
      <linearGradient id="lt-g-success" x1="0" y1="0" x2="0" y2="1">
        {stops('#34D399', '#059669')}
      </linearGradient>
      <linearGradient id="lt-g-violet" x1="0" y1="0" x2="0" y2="1">
        {stops('#A78BFA', '#7C3AED')}
      </linearGradient>
      <linearGradient id="lt-g-danger" x1="0" y1="0" x2="0" y2="1">
        {stops('#FB7185', '#E11D48')}
      </linearGradient>
      <linearGradient id="lt-g-danger-area" x1="0" y1="0" x2="0" y2="1">
        {fade('#FB7185', 0.28)}
      </linearGradient>
    </defs>
  </svg>
)

/** A tiny bar chart for tiles, drawn without a chart library. `values` are numbers or null; `highlight` is the index to emphasise. */
export function SparkBars({ values, highlight, className = 'h-8' }) {
  const max = Math.max(1, ...values.map((v) => v ?? 0))
  return (
    <div aria-hidden className={`flex items-end gap-1 ${className}`}>
      {values.map((v, i) => (
        <span
          key={i}
          className="flex-1 origin-bottom rounded-[3px] transition-transform duration-500 ease-out"
          style={{
            height: '100%',
            transform: `scaleY(${Math.max(0.06, (v ?? 0) / max)})`,
            background: v ? `rgb(var(--mod) / ${i === highlight ? 1 : 0.42})` : 'rgb(var(--muted))',
          }}
        />
      ))}
    </div>
  )
}

/** Seven days as dots: filled where something happened. For yes/no metrics such as "did I train". */
export function SparkDots({ values, className = '' }) {
  return (
    <div aria-hidden className={`flex items-center justify-between gap-1 ${className}`}>
      {values.map((v, i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-full ${v ? 'bg-gradient-to-br from-mod to-mod-2' : 'bg-muted'}`} />
      ))}
    </div>
  )
}
