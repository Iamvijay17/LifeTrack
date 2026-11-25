import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react'
import { Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/states'
import { LockedCard } from '@/features/security/ModuleUnlock'
import { fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { formatChange } from './format'

/** One consistent legend for every multi-series chart. */
export const legend = () => (
  <Legend
    verticalAlign="top"
    align="right"
    height={28}
    iconType="circle"
    iconSize={8}
    wrapperStyle={{ fontSize: 12, color: 'var(--c-axis)' }}
  />
)

const TONE = {
  better: 'text-success bg-success/10',
  worse: 'text-danger bg-danger/10',
  same: 'text-muted-foreground bg-muted',
  changed: 'text-primary bg-primary/10',
  unavailable: 'text-muted-foreground bg-muted',
}

/** "+12%" against the previous period, coloured by whether that is good for this metric. Unavailable data says so instead of showing 0. */
export function Delta({ row, money, className }) {
  const Icon = row.verdict === 'unavailable' || row.verdict === 'same' ? Minus : row.diff > 0 ? ArrowUpRight : ArrowDownRight
  const label =
    row.verdict === 'unavailable'
      ? row.cur == null
        ? 'No data this period'
        : 'No earlier data to compare'
      : `${formatChange(row, money)} vs previous period`
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
        TONE[row.verdict],
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {row.verdict === 'unavailable' ? 'n/a' : formatChange(row, money)}
    </span>
  )
}

/** A titled chart/list card. */
export const Panel = ({ title, hint, actions, children, className }) => (
  <Card className={className}>
    <CardHeader className="flex-row items-center justify-between gap-2">
      <div className="min-w-0">
        <CardTitle as="h3">{title}</CardTitle>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {actions}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
)

/**
 * Why a module has nothing to show, said precisely:
 *  - locked: the module lock is closed;
 *  - never used: nothing was ever recorded;
 *  - not started yet: the first record is after this period.
 */
export function ModuleEmpty({ module, label, icon, first, locked, to, cta, never }) {
  if (locked) return <LockedCard module={module} />
  const started = first != null
  return (
    <EmptyState
      icon={icon}
      title={started ? `No ${label} data in this period` : `No ${label} history yet`}
      description={
        started
          ? `Your first ${label} record is from ${fmtDay(first, 'd MMM yyyy')}, after this period, so there is nothing to show or compare yet. Pick a later period.`
          : (never ?? `Once you start recording ${label}, its trends and comparisons will appear here.`)
      }
      action={
        to && !started ? (
          <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-mod-text hover:underline">
            {cta} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null
      }
    />
  )
}

/** Compact stat tile with a change badge. */
export function Metric({ label, value, row, sub, money, module }) {
  return (
    <Card data-module={module} className="p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="lt-stat-value mt-1.5 text-[1.5rem] leading-tight tabular-nums">{value}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {row && <Delta row={row} money={money} />}
        {sub && <span>{sub}</span>}
      </div>
    </Card>
  )
}

/** A horizontal ranked list with a proportion bar. */
export function BarList({ items, empty }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <li key={it.key ?? it.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{it.label}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{it.text}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${it.label}: ${it.text}`}>
            <div
              className="h-full rounded-full bg-[rgb(var(--mod))] transition-[width] duration-500"
              style={{ width: `${Math.max(2, Math.min(100, (it.value ?? 0) * 100))}%`, background: it.color }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
