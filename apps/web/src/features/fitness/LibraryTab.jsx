import { Plus, Trash2 } from 'lucide-react'
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
      {groups.map(({ group, items }) => (
        <section key={group}>
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</h3>
          <div className="flex flex-wrap gap-2">
            {items.map((e) => (
              <span
                key={e.id}
                className="group inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-sm"
              >
                {e.name}
                {e.equipment && <span className="text-xs text-muted-foreground">· {e.equipment}</span>}
                <button
                  aria-label={`Remove ${e.name}`}
                  className="hidden text-muted-foreground hover:text-danger group-hover:inline focus:inline"
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
