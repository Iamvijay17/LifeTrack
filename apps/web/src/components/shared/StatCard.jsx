import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { AnimatedValue } from '@/components/motion/primitives'
import { cn } from '@/lib/utils'

/**
 * `to` makes the card a link to its module, `onClick` a button; without either it is plain text.
 * `module` gives it that module's accent; `chart` is an optional small visual drawn under the value.
 */
export function StatCard({ icon: Icon, label, value, sub, progress, tone = 'primary', onClick, to, module, chart, className }) {
  const Comp = to ? Link : onClick ? 'button' : 'div'
  const clickable = !!(onClick || to)
  return (
    <Card data-module={module} interactive={clickable} className={cn('group relative overflow-hidden', className)}>
      <Comp {...(to ? { to } : { onClick })} className="block h-full w-full rounded-xl p-4 text-left">
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <span className="text-xs font-medium">{label}</span>
          {Icon && (
            <span className="lt-icon-soft h-7 w-7 rounded-md transition-transform duration-200 group-hover:scale-110">
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
          )}
        </div>
        <div className="lt-stat-value mt-1.5 text-[1.625rem] leading-tight">
          <AnimatedValue value={value} />
        </div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
        {progress != null && <Progress value={progress} tone={tone} className="mt-3" label={label} />}
        {chart && <div className="mt-3">{chart}</div>}
      </Comp>
    </Card>
  )
}
