import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { cn } from '@/lib/utils'

/** `to` makes the card a link to its module, `onClick` a button; without either it is plain text. */
export function StatCard({ icon: Icon, label, value, sub, progress, tone = 'primary', onClick, to, className }) {
  const Comp = to ? Link : onClick ? 'button' : 'div'
  return (
    <Card className={cn('transition-colors', (onClick || to) && 'hover:border-muted-foreground/40', className)}>
      <Comp {...(to ? { to } : { onClick })} className="block h-full w-full rounded-lg p-4 text-left">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium">{label}</span>
          {Icon && <Icon className="h-4 w-4" aria-hidden />}
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
        {progress != null && <Progress value={progress} tone={tone} className="mt-3" label={label} />}
      </Comp>
    </Card>
  )
}
