import { useMemo } from 'react'
import { assessPassword } from '@lifetrack/core/security'
import { m } from '@/components/motion/primitives'
import { cn } from '@/lib/utils'

const TONE = ['bg-danger', 'bg-danger', 'bg-warning', 'bg-success', 'bg-success']
const TEXT = ['text-danger', 'text-danger', 'text-warning', 'text-success', 'text-success']

/** Live strength meter for a NEW password. Pass the field's `error` so the message is not repeated. The same rules the forms enforce (packages/core/src/security.js). Says nothing until something is typed. */
export function PasswordStrength({ password, email, name, error, className }) {
  const r = useMemo(() => assessPassword(password, { email, name }), [password, email, name])
  if (!password) return null
  return (
    <div className={cn('space-y-1.5', className)} aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <m.span
              className={cn('block h-full w-full rounded-full', TONE[r.score])}
              initial={false}
              animate={{ x: i < Math.max(r.score, 1) ? '0%' : '-100%' }}
              transition={{ duration: 0.25 }}
            />
          </span>
        ))}
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
        <span className={cn('font-medium', TEXT[r.score])}>{r.label}</span>
        {/* When the field is already showing an error, do not say the same thing twice. */}
        {!error && (
          <span className="text-muted-foreground">
            {r.ok ? 'A long phrase of unrelated words is easy to remember and hard to guess.' : r.issues[0]}
          </span>
        )}
      </p>
    </div>
  )
}
