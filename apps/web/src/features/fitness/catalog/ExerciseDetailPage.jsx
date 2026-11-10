import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState, ErrorState } from '@/components/shared/states'
import { SkeletonLoader } from '@/components/loaders/SkeletonLoader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { inLibrary, imagePair, libraryRowFor } from '@/domain/exerciseCatalog'
import { useAction } from '@/hooks/useAction'
import { useTables } from '@/hooks/store'
import * as store from '@/hooks/store'
import { Attribution } from './Attribution'
import { ExerciseImage } from './ExerciseImage'
import { useCatalog } from './useCatalog'

const BROWSE = '/fitness?tab=library&view=browse'

function Fact({ label, children }) {
  if (!children || (Array.isArray(children) && !children.length)) return null
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-32 shrink-0 text-[13px] text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

/** /fitness/exercises/:id — one exercise from the database, with its start and end images, muscles and instructions. */
export default function ExerciseDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { catalog, loading, error, retry } = useCatalog()
  const { data } = useTables('exercises')
  const [add, adding] = useAction((row) => store.insert('exercises', row), { success: 'Added to your exercises' })

  const back = () => (location.key !== 'default' ? navigate(-1) : navigate(BROWSE))
  const backButton = (
    <Button variant="ghost" size="sm" onClick={back} className="mb-3 -ml-2">
      <ArrowLeft className="h-4 w-4" /> Exercise database
    </Button>
  )

  if (error) return <ErrorState message={error} onRetry={retry} />
  if (loading) return <SkeletonLoader variant="page" cards={3} />
  const e = catalog.index.byId.get(id)
  if (!e)
    return (
      <>
        {backButton}
        <EmptyState
          title="Exercise not found"
          description="It may have been removed from the database."
          action={
            <Button variant="outline" size="sm" onClick={() => navigate(BROWSE)}>
              Browse exercises
            </Button>
          }
        />
      </>
    )

  const { start, end } = imagePair(e)
  const mine = inLibrary(e, data.exercises)
  const none = !start && !end

  return (
    <>
      {backButton}
      <PageHeader
        title={e.name}
        description={`${e.category} · ${e.equipment}`}
        actions={
          mine ? (
            <Badge tone="success">
              <Check className="h-3 w-3" aria-hidden /> In your exercises
            </Badge>
          ) : (
            <Button onClick={() => add(libraryRowFor(e))} loading={adding}>
              <Plus className="h-4 w-4" /> Add to my exercises
            </Button>
          )
        }
      />

      <div className="space-y-6">
        <section aria-label="Demonstration" className={none ? '' : 'grid gap-3 sm:grid-cols-2'}>
          {none ? (
            <ExerciseImage
              path={null}
              alt=""
              label="This exercise has no demonstration images in the database"
              className="mx-auto max-w-md"
            />
          ) : (
            [
              ['Start', start],
              ['End', end],
            ].map(([label, path]) => (
              <figure key={label} className="space-y-1.5">
                <ExerciseImage
                  path={path}
                  priority={label === 'Start'}
                  alt={`${e.name}: ${label.toLowerCase()} position`}
                  label={`No ${label.toLowerCase()} image`}
                />
                <figcaption className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</figcaption>
              </figure>
            ))
          )}
        </section>

        <section className="lt-card space-y-3 p-[var(--pad)]" aria-label="Details">
          <dl className="space-y-2">
            <Fact label="Primary muscles">{e.primary.join(', ')}</Fact>
            <Fact label="Secondary muscles">{e.secondary.join(', ')}</Fact>
            <Fact label="Equipment">{e.equipment}</Fact>
            <Fact label="Level">{e.level}</Fact>
            <Fact label="Type">{e.type}</Fact>
            <Fact label="Force">{e.force}</Fact>
            <Fact label="Mechanic">{e.mechanic}</Fact>
          </dl>
        </section>

        <section className="lt-card p-[var(--pad)]" aria-label="Instructions">
          <h2 className="mb-2 lt-eyebrow">Instructions</h2>
          {e.instructions.length ? (
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed marker:text-muted-foreground">
              {e.instructions.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">The database has no written instructions for this exercise.</p>
          )}
        </section>

        <Attribution meta={catalog.meta} />
        <p className="text-xs text-muted-foreground">
          <Link className="underline underline-offset-2 hover:text-foreground" to={BROWSE}>
            Back to all exercises
          </Link>
        </p>
      </div>
    </>
  )
}
