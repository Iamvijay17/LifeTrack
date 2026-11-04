import { CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3 } from 'lucide-react'

export const C = {
  primary: 'var(--c-primary)',
  secondary: 'var(--c-secondary)',
  success: 'var(--c-success)',
  warning: 'var(--c-warning)',
  danger: 'var(--c-danger)',
  grid: 'var(--c-grid)',
  axis: 'var(--c-axis)',
}
export const PALETTE = ['#8B5CF6', '#22C55E', '#F59E0B', '#3B82F6', '#EC4899', '#14B8A6', '#EF4444', '#A1A1AA']

const tick = { fill: 'var(--c-axis)', fontSize: 11 }
export const xAxis = (p = {}) => <XAxis tick={tick} tickLine={false} axisLine={{ stroke: 'var(--c-grid)' }} {...p} />
export const yAxis = (p = {}) => <YAxis tick={tick} tickLine={false} axisLine={false} width={36} {...p} />
export const grid = () => <CartesianGrid stroke="var(--c-grid)" vertical={false} />
export const tooltip = (p = {}) => (
  <Tooltip
    cursor={{ fill: 'rgb(var(--muted) / 0.4)' }}
    contentStyle={{
      background: 'rgb(var(--card))',
      border: '1px solid rgb(var(--border))',
      borderRadius: 8,
      fontSize: 12,
      color: 'rgb(var(--foreground))',
    }}
    labelStyle={{ color: 'rgb(var(--muted-foreground))' }}
    itemStyle={{ color: 'rgb(var(--foreground))' }}
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

/** `summary` is what screen readers get instead of the drawing. */
export function Chart({ height = 220, children, empty, emptyText = 'No data in this range yet.', summary }) {
  if (empty)
    return (
      <div className="grid place-items-center text-center text-sm text-muted-foreground" style={{ height }}>
        <div>
          <BarChart3 className="mx-auto mb-2 h-5 w-5 opacity-60" />
          {emptyText}
        </div>
      </div>
    )
  return (
    <div style={{ height }} {...(summary ? { role: 'img', 'aria-label': summary } : {})}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  )
}
