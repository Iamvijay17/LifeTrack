import { cn } from '@/lib/utils'

// A small schematic of a widget (not data): the shape of what it shows, so the library can be browsed by eye without inventing any figures.
const KIND = {
  priorities: 'list',
  upcoming: 'list',
  notes: 'list',
  transactions: 'list',
  interviews: 'list',
  activity: 'list',
  today: 'list',
  goals: 'bars',
  progress: 'bars',
  habits: 'bars',
  learning: 'bars',
  jobs: 'stats',
  fitness: 'stats',
  sleep: 'chart',
  nutrition: 'ring',
  score: 'ring',
  weekly: 'chart',
  spending: 'stats',
  budget: 'bar',
  focus: 'bar',
  calendar: 'calendar',
  stats: 'stats',
  quick: 'chips',
  getting_started: 'list',
}

const Line = ({ w = '100%', tone }) => (
  <span className={cn('block h-1.5 rounded-full', tone ?? 'bg-muted-foreground/25')} style={{ width: w }} />
)

export function Wireframe({ type, className }) {
  const kind = KIND[type] ?? 'list'
  return (
    <div aria-hidden className={cn('flex h-full flex-col gap-1.5 rounded-md border border-border bg-surface-2/60 p-2', className)}>
      <Line w="40%" tone="bg-foreground/40" />
      {kind === 'list' && [88, 70, 80, 55].map((w, i) => <Line key={i} w={`${w}%`} />)}
      {kind === 'bars' && [85, 60, 40].map((w, i) => <Line key={i} w={`${w}%`} tone="bg-primary/50" />)}
      {kind === 'bar' && <Line w="65%" tone="bg-primary/60" />}
      {kind === 'stats' && (
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-5 rounded bg-muted-foreground/20" />
          ))}
        </div>
      )}
      {kind === 'ring' && (
        <span className="mx-auto mt-0.5 block h-8 w-8 rounded-full border-4 border-primary/50 border-t-muted-foreground/20" />
      )}
      {kind === 'chart' && (
        <div className="flex flex-1 items-end gap-1">
          {[40, 70, 55, 90, 65, 80].map((h, i) => (
            <span key={i} className="w-full rounded-sm bg-primary/45" style={{ height: `${h * 0.4}%` }} />
          ))}
        </div>
      )}
      {kind === 'calendar' && (
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: 21 }, (_, i) => (
            <span key={i} className={cn('h-1.5 rounded-sm', i === 9 ? 'bg-primary/70' : 'bg-muted-foreground/20')} />
          ))}
        </div>
      )}
      {kind === 'chips' && (
        <div className="flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-4 flex-1 rounded bg-muted-foreground/20" />
          ))}
        </div>
      )}
    </div>
  )
}
