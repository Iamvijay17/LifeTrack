import { useState } from 'react'
import { ChevronDown, Flame, Pencil, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/shared/states'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { useShowMore } from '@/hooks/useShowMore'
import { ShowMore } from '@/components/shared/ShowMore'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { summarizeSets, volume } from '@/domain/fitness'
import { fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'

function details(x, sets) {
  return (
    fmtDay(x.workout_date) +
    (x.duration_minutes ? ` · ${x.duration_minutes} min` : '') +
    (sets.length ? ` · ${sets.length} sets · ${Math.round(volume(sets)).toLocaleString('en-IN')} kg` : '') +
    (x.cardio_minutes ? ` · cardio ${x.cardio_minutes} min${x.cardio_distance_km ? ` / ${x.cardio_distance_km} km` : ''}` : '')
  )
}

/** `history` is workouts newest first; `logsByWorkout` maps a workout id to its sets. Tap a row to see its sets. */
export function HistoryTab({ history, logsByWorkout, onEdit }) {
  const [openId, setOpenId] = useState(null)
  const removeWorkout = useConfirmedDelete('workouts', 'Workout deleted')
  const page = useShowMore(history)
  if (history.length === 0)
    return <EmptyState icon={Flame} title="No workouts logged" description="Your sets, reps and weights will be listed here." />
  return (
    <Card>
      <ul className="divide-y divide-border">
        {page.visible.map((x) => {
          const sets = logsByWorkout.get(x.id) ?? []
          const open = openId === x.id
          return (
            <li key={x.id}>
              <div className="flex items-center gap-3 px-4 py-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => setOpenId(open ? null : x.id)} aria-expanded={open}>
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    {x.name}
                    {x.status !== 'completed' && <Badge>{x.status === 'rest' ? 'Rest day' : 'Skipped'}</Badge>}
                    <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
                  </p>
                  <p className="text-xs text-muted-foreground">{details(x, sets)}</p>
                </button>
                <Menu
                  label="Workout actions"
                  items={[
                    { label: 'Edit', icon: Pencil, hidden: x.status !== 'completed', onClick: () => onEdit(x) },
                    {
                      label: 'Delete',
                      icon: Trash2,
                      danger: true,
                      onClick: () =>
                        removeWorkout(x.id, {
                          title: 'Delete this workout?',
                          description: `${x.name} · ${fmtDay(x.workout_date)}. Its sets are deleted too.`,
                        }),
                    },
                  ]}
                />
              </div>
              {open && (
                <div className="space-y-1 bg-muted/20 px-4 pb-3 text-sm">
                  {summarizeSets(sets).map((e) => (
                    <p key={e.name}>
                      <b>{e.name}</b> <span className="text-muted-foreground">{e.text}</span>
                    </p>
                  ))}
                  {!sets.length && <p className="text-muted-foreground">{x.notes || 'No sets recorded.'}</p>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <ShowMore more={page.more} onClick={page.showMore} />
    </Card>
  )
}
