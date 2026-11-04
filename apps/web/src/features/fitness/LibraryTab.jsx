import { Dumbbell, Plus, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'

/** The exercise library grouped by muscle group. `groups` is libraryGroups(). */
export function LibraryTab({ groups, onCreate }) {
  const removeExercise = useConfirmedDelete('exercises', 'Exercise removed')
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          New exercise
        </Button>
      </div>
      {groups.length === 0 && (
        <EmptyState icon={Dumbbell} title="No exercises yet" description="Add the exercises you do and pick them when logging a workout." />
      )}
      {groups.map(({ group, items }) => (
        <section key={group}>
          <h2 className="mb-1.5 lt-eyebrow">{group}</h2>
          <div className="flex flex-wrap gap-2">
            {items.map((e) => (
              <span
                key={e.id}
                className="lt-lift group inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-sm"
              >
                {e.name}
                {e.equipment && <span className="text-xs text-muted-foreground">· {e.equipment}</span>}
                <button
                  aria-label={`Remove ${e.name}`}
                  // Always visible on touch layouts, where there is no hover; revealed on hover or keyboard focus with a mouse.
                  className="-my-1 -mr-1.5 rounded p-1.5 text-muted-foreground hover:text-danger md:my-0 md:mr-0 md:p-0 md:opacity-0 md:focus:opacity-100 md:group-hover:opacity-100"
                  onClick={() =>
                    removeExercise(e.id, {
                      title: `Remove ${e.name} from the library?`,
                      description: 'Past workouts keep the exercise name.',
                    })
                  }
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
