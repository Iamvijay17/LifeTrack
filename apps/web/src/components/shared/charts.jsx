import { Area, Bar, CartesianGrid, Line, Pie, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { motionOff } from '@/components/motion/tokens'
export { ChartGradients, G, SparkBars, SparkDots } from './chartParts'

export const C = {
  primary: 'var(--c-primary)',
  secondary: 'var(--c-secondary)',
  success: 'var(--c-success)',
  warning: 'var(--c-warning)',
  danger: 'var(--c-danger)',
  grid: 'var(--c-grid)',
  axis: 'var(--c-axis)',
  mod: 'rgb(var(--mod))',
  mod2: 'rgb(var(--mod-2))',
}
export const PALETTE = ['#8B5CF6', '#22C55E', '#F59E0B', '#3B82F6', '#EC4899', '#14B8A6', '#EF4444', '#A1A1AA']

// A snappy, shared rhythm for every chart in the app instead of Recharts' default 1.5 seconds, and none at all for reduced motion.
for (const series of [Bar, Line, Area, Pie]) {
  if (series.defaultProps) {
    series.defaultProps.animationDuration = 650
    series.defaultProps.animationEasing = 'ease-out'
    series.defaultProps.isAnimationActive = !motionOff()
  }
}

const tick = { fill: 'var(--c-axis)', fontSize: 11 }
export const xAxis = (p = {}) => <XAxis tick={tick} tickLine={false} axisLine={false} tickMargin={8} {...p} />
export const yAxis = (p = {}) => <YAxis tick={tick} tickLine={false} axisLine={false} width={36} {...p} />
export const grid = () => <CartesianGrid stroke="var(--c-grid)" strokeDasharray="3 5" vertical={false} />
export const tooltip = (p = {}) => (
  <Tooltip
    cursor={{ fill: 'rgb(var(--mod) / 0.08)', radius: 8 }}
    animationDuration={120}
    contentStyle={{
      background: 'rgb(var(--card))',
      border: '1px solid rgb(var(--border))',
      borderRadius: 12,
      boxShadow: 'var(--shadow-overlay)',
      fontSize: 12,
      padding: '8px 12px',
      color: 'rgb(var(--foreground))',
    }}
    labelStyle={{ color: 'rgb(var(--muted-foreground))', marginBottom: 2 }}
    itemStyle={{ color: 'rgb(var(--foreground))', fontVariantNumeric: 'tabular-nums' }}
    {...p}
  />
)

/** A text version of a series for `<Chart summary>`. Long series are reduced to their range and latest value, which is what a listener needs. */
export function seriesSummary(title, rows, key, unit = '') {
  const points = rows.filter((r) => r[key] != null)
  if (!points.length) return `${title}: no data.`
  const text = (r) => `${r.label} ${Math.round(r[key] * 100) / 100}${unit}`
  if (points.length <= 12) return `${title}: ${points.map(text).join(', ')}.`
  const values = points.map((r) => r[key])
  return `${title}: ${points.length} points from ${points[0].label} to ${points.at(-1).label}, lowest ${Math.min(...values)}${unit}, highest ${Math.max(...values)}${unit}, latest ${text(points.at(-1))}.`
}

/** A chart that has nothing to draw yet: the ghost of the bars it will show. */
function EmptyChart({ text }) {
  const bars = [38, 62, 46, 80, 54, 70, 44]
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
      <div aria-hidden className="flex h-12 items-end gap-1.5">
        {bars.map((h, i) => (
          <span key={i} className="w-2.5 rounded-t-[3px] bg-mod/15" style={{ height: `${h}%` }} />
        ))}
      </div>
      <p className="max-w-xs text-[13px]">{text}</p>
    </div>
  )
}

/** `summary` is what screen readers get instead of the drawing. */
export function Chart({ height = 220, children, empty, emptyText = 'No data in this range yet.', summary }) {
  if (empty)
    return (
      <div style={{ height }}>
        <EmptyChart text={emptyText} />
      </div>
    )
  return (
    <div style={{ height }} {...(summary ? { role: 'img', 'aria-label': summary } : {})}>
      <ResponsiveContainer width="100%" height="100%" debounce={60}>
        {children}
      </ResponsiveContainer>
    </div>
  )
}
