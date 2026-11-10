import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Dumbbell, Image as ImageIcon, Plus, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/misc'
import { matchCatalog } from '@/domain/exerciseCatalog'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { ExerciseBrowser } from './catalog/ExerciseBrowser'
import { useCatalog } from './catalog/useCatalog'

const VIEWS = [
  { value: 'mine', label: 'My exercises' },
  { value: 'browse', label: 'Exercise database' },
]

/** Your own exercises grouped by muscle group, and the Free Exercise DB to browse and add from. `groups` is libraryGroups(). */
export function LibraryTab({ groups, onCreate }) {
  // Which half is showing lives in the URL (?view=browse), so Back from an exercise's page returns to it.
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'browse' ? 'browse' : 'mine'
  const setView = (v) => setParams(v === 'browse' ? { tab: 'library', view: 'browse' } : { tab: 'library' }, { replace: true })
  return (
    <div className="space-y-4">
      <Segmented value={view} onChange={setView} options={VIEWS} />
      {view === 'mine' ? <MyExercises groups={groups} onCreate={onCreate} onBrowse={() => setView('browse')} /> : <ExerciseBrowser />}
    </div>
  )
}

function MyExercises({ groups, onCreate, onBrowse }) {
  const removeExercise = useConfirmedDelete('exercises', 'Exercise removed')
  // The catalog loads quietly; chips gain a "see how" link once it is here, and work as before if it never arrives.
  const { catalog } = useCatalog()
  const demoFor = useMemo(() => (catalog ? (name) => matchCatalog(catalog.index, name) : () => null), [catalog])
  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onBrowse}>
          <ImageIcon className="h-4 w-4" />
          Browse database
        </Button>
        <Button variant="outline" size="sm" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          New exercise
        </Button>
      </div>
      {groups.length === 0 && (
        <EmptyState
          icon={Dumbbell}
          title="No exercises yet"
          description="Add the exercises you do and pick them when logging a workout."
          action={
            <Button variant="outline" size="sm" onClick={onBrowse}>
              Browse the exercise database
            </Button>
          }
        />
      )}
      {groups.map(({ group, items }) => (
        <section key={group}>
          <h2 className="mb-1.5 lt-eyebrow">{group}</h2>
          <div className="flex flex-wrap gap-2">
            {items.map((e) => {
              const demo = demoFor(e.name)
              return (
                <span
                  key={e.id}
                  className="lt-lift group inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-sm"
                >
                  {demo ? (
                    <Link
                      to={`/fitness/exercises/${encodeURIComponent(demo.id)}`}
                      aria-label={`See how to do ${e.name}`}
                      className="hover:text-mod-text hover:underline"
                    >
                      {e.name}
                    </Link>
                  ) : (
                    e.name
                  )}
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
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
