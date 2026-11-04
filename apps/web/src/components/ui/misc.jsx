import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badge = cva('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-muted text-muted-foreground',
      primary: 'bg-primary/15 text-secondary',
      success: 'bg-success/15 text-success',
      warning: 'bg-warning/15 text-warning',
      danger: 'bg-danger/15 text-danger',
    },
  },
  defaultVariants: { tone: 'neutral' },
})
export const Badge = ({ tone, className, ...p }) => <span className={cn(badge({ tone }), className)} {...p} />

export const Skeleton = ({ className }) => <div aria-hidden className={cn('skeleton h-4 w-full', className)} />

export function Progress({ value, tone = 'primary', className, label }) {
  const v = Math.max(0, Math.min(100, value ?? 0))
  const bar = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[tone]
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div className={cn('h-full rounded-full transition-all duration-500', bar)} style={{ width: `${v}%` }} />
    </div>
  )
}

export function Segmented({ value, onChange, options, className }) {
  const onKeyDown = (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
    if (!step && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const at = options.findIndex((o) => o.value === value)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : (at + step + options.length) % options.length
    onChange(options[next].value)
    e.currentTarget.querySelectorAll('[role=tab]')[next]?.focus()
  }
  return (
    <div
      role="tablist"
      onKeyDown={onKeyDown}
      className={cn('inline-flex max-w-full overflow-x-auto rounded-md border border-border bg-card p-0.5', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'shrink-0 whitespace-nowrap rounded px-3 py-2.5 text-[13px] font-medium transition-colors md:py-1.5',
            value === o.value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
