import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { cn } from '@/lib/utils'

export function StatCard({ icon: Icon, label, value, sub, progress, tone = 'primary', onClick, className }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Card className={cn('transition-colors', onClick && 'hover:border-muted-foreground/40', className)}>
      <Comp onClick={onClick} className="block w-full p-4 text-left">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium">{label}</span>
          {Icon && <Icon className="h-4 w-4" />}
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
        {progress != null && <Progress value={progress} tone={tone} className="mt-3" label={label} />}
      </Comp>
    </Card>
  )
}
