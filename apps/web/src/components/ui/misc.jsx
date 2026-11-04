import { useId } from 'react'
import { cva } from 'class-variance-authority'
import { LayoutGroup, ease, m, spring } from '@/components/motion/primitives'
import { cn } from '@/lib/utils'

const badge = cva('inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-muted text-muted-foreground',
      primary: 'bg-mod/15 text-mod-text',
      success: 'bg-success/15 text-success',
      warning: 'bg-warning/15 text-warning',
      danger: 'bg-danger/15 text-danger',
    },
  },
  defaultVariants: { tone: 'neutral' },
})
export const Badge = ({ tone, className, ...p }) => <span className={cn(badge({ tone }), className)} {...p} />

export const Skeleton = ({ className }) => <div aria-hidden className={cn('skeleton h-4 w-full', className)} />

const BAR = {
  primary: 'bg-gradient-to-r from-mod to-mod-2',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

/** Slides a full-width bar in from the left with a transform, which never triggers layout and keeps the bar's rounded end round. */
export function Progress({ value, tone = 'primary', className, label }) {
  const v = Math.max(0, Math.min(100, value ?? 0))
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <m.div
        className={cn('h-full w-full rounded-full', BAR[tone])}
        initial={{ x: '-100%' }}
        animate={{ x: `${v - 100}%` }}
        transition={{ duration: 0.7, ease: ease.out }}
      />
    </div>
  )
}

export function Segmented({ value, onChange, options, className }) {
  const group = useId()
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
    <LayoutGroup id={group}>
      <div
        role="tablist"
        onKeyDown={onKeyDown}
        className={cn(
          'scrollbar-none inline-flex max-w-full overflow-x-auto rounded-lg border border-border bg-surface-2/70 p-0.5',
          className,
        )}
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
              'lt-press relative shrink-0 whitespace-nowrap rounded-md px-3 py-2.5 text-[13px] font-medium transition-colors duration-150 md:py-1.5',
              value === o.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {value === o.value && (
              <m.span
                layoutId="pill"
                aria-hidden
                className="absolute inset-0 rounded-md border border-border bg-card shadow-card"
                transition={spring.snappy}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  )
}
