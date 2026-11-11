import { Dumbbell, Pencil, Plus, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Menu } from '@/components/ui/menu'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'

export function RoutinesTab({ routines, onCreate, onEdit, onStart, cardProps }) {
  const removeRoutine = useConfirmedDelete('routines', 'Routine deleted')
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          New routine
        </Button>
      </div>
      {routines.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="No routines yet"
          description="Build your own routines — push/pull/legs, full body, anything. Then assign them to days."
          action={<Button onClick={onCreate}>Create routine</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {routines.map((r) => (
            <Card key={r.id} interactive {...cardProps?.(r)}>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-bold tracking-tight">{r.name}</p>
                  <Menu
                    label={`Actions for ${r.name}`}
                    items={[
                      { label: 'Start workout', icon: Dumbbell, onClick: () => onStart(r) },
                      { label: 'Edit', icon: Pencil, onClick: () => onEdit(r) },
                      {
                        label: 'Delete',
                        icon: Trash2,
                        danger: true,
                        onClick: () =>
                          removeRoutine(r.id, { title: `Delete ${r.name}?`, description: 'Logged workouts stay in your history.' }),
                      },
                    ]}
                  />
                </div>
                <ul className="space-y-0.5 text-sm text-muted-foreground">
                  {r.exercises.map((e, i) => (
                    <li key={i}>
                      {e.name}{' '}
                      <span className="text-xs">
                        · {e.sets}×{e.reps}
                        {Number(e.weight_kg) ? ` @ ${e.weight_kg}kg` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
