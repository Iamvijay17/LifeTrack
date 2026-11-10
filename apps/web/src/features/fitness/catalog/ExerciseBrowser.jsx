import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Dumbbell, Search, X } from 'lucide-react'
import { EmptyState, ErrorState } from '@/components/shared/states'
import { ShowMore } from '@/components/shared/ShowMore'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { Badge } from '@/components/ui/misc'
import { SkeletonLoader } from '@/components/loaders/SkeletonLoader'
import { CATALOG_CATEGORIES, categoryCounts, facetValues, hasImages, imagePair, searchCatalog } from '@/domain/exerciseCatalog'
import { useShowMore } from '@/hooks/useShowMore'
import { cn } from '@/lib/utils'
import { Attribution } from './Attribution'
import { ExerciseImage } from './ExerciseImage'
import { useCatalog } from './useCatalog'

const BLANK = { query: '', category: '', equipment: '', level: '', type: '' }
// Filters live in the URL (?q=&cat=&eq=&lvl=&type=): Back from an exercise's page returns to the same search, and it can be shared.
const KEYS = { query: 'q', category: 'cat', equipment: 'eq', level: 'lvl', type: 'type' }

const Chip = ({ active, onClick, children, count }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cn(
      'lt-press inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-[13px] font-medium transition-colors md:py-1',
      active ? 'border-mod bg-mod/15 text-mod-text' : 'border-border bg-card text-muted-foreground hover:text-foreground',
    )}
  >
    {children}
    {count != null && <span className="text-xs opacity-70">{count}</span>}
  </button>
)

export function ExerciseCard({ exercise: e }) {
  const { start } = imagePair(e)
  return (
    <Link
      to={`/fitness/exercises/${encodeURIComponent(e.id)}`}
      className="lt-card lt-lift group flex flex-col overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-mod"
    >
      <ExerciseImage
        path={start}
        alt={`${e.name}: starting position`}
        className="rounded-none border-0 border-b"
        label={hasImages(e) ? 'Image unavailable' : 'No image published'}
      />
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{e.name}</h3>
        <div className="mt-auto flex flex-wrap gap-1">
          <Badge tone="primary">{e.category}</Badge>
          <Badge>{e.equipment}</Badge>
        </div>
      </div>
    </Link>
  )
}

/** Search and filter the whole exercise database, a page of cards at a time. */
export function ExerciseBrowser() {
  const { catalog, loading, error, retry } = useCatalog()
  const [params, setParams] = useSearchParams()
  const f = useMemo(() => Object.fromEntries(Object.entries(KEYS).map(([field, key]) => [field, params.get(key) ?? ''])), [params])
  const set = (patch) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [field, value] of Object.entries(patch)) value ? next.set(KEYS[field], value) : next.delete(KEYS[field])
        return next
      },
      { replace: true },
    )
  const exercises = catalog?.exercises
  const results = useMemo(() => (exercises ? searchCatalog(exercises, f) : []), [exercises, f])
  const counts = useMemo(() => (exercises ? categoryCounts(exercises, f) : {}), [exercises, f])
  const equipment = useMemo(() => (exercises ? facetValues(exercises, 'equipment') : []), [exercises])
  const levels = useMemo(() => (exercises ? facetValues(exercises, 'level') : []), [exercises])
  const types = useMemo(() => (exercises ? facetValues(exercises, 'type') : []), [exercises])
  const { visible, more, showMore } = useShowMore(results, 24, JSON.stringify(f))
  const filtered = Object.values(f).some(Boolean)

  if (error) return <ErrorState message={error} onRetry={retry} />
  if (loading) return <SkeletonLoader variant="page" cards={4} />

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search exercises"
          placeholder={`Search ${catalog.meta.count} exercises by name, muscle or equipment`}
          value={f.query}
          onChange={(e) => set({ query: e.target.value })}
          className="pl-9"
        />
      </div>

      <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Category">
        <Chip active={!f.category} onClick={() => set({ category: '' })}>
          All
        </Chip>
        {CATALOG_CATEGORIES.map((c) => (
          <Chip key={c} active={f.category === c} onClick={() => set({ category: f.category === c ? '' : c })} count={counts[c]}>
            {c}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select aria-label="Equipment" value={f.equipment} onChange={(e) => set({ equipment: e.target.value })}>
          <option value="">Any equipment</option>
          {equipment.map(([v, n]) => (
            <option key={v} value={v}>{`${v} (${n})`}</option>
          ))}
        </Select>
        <Select aria-label="Level" value={f.level} onChange={(e) => set({ level: e.target.value })}>
          <option value="">Any level</option>
          {levels.map(([v, n]) => (
            <option key={v} value={v}>{`${v} (${n})`}</option>
          ))}
        </Select>
        <Select aria-label="Type" value={f.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="">Any type</option>
          {types.map(([v, n]) => (
            <option key={v} value={v}>{`${v} (${n})`}</option>
          ))}
        </Select>
      </div>

      <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
        <p role="status" aria-live="polite" data-testid="result-count">
          {results.length} {results.length === 1 ? 'exercise' : 'exercises'}
        </p>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => set(BLANK)}>
            <X className="h-3.5 w-3.5" /> Clear filters
          </Button>
        )}
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="No exercises match"
          description="Try a different word or remove a filter."
          action={
            <Button variant="outline" size="sm" onClick={() => set(BLANK)}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" aria-label="Exercises">
          {visible.map((e) => (
            <li key={e.id} className="flex">
              <div className="flex w-full flex-col [&>a]:flex-1">
                <ExerciseCard exercise={e} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <ShowMore more={more} step={24} onClick={showMore} />
      <Attribution meta={catalog.meta} className="pt-2" />
    </div>
  )
}
