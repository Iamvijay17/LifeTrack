import { useMemo, useState } from 'react'
import { Eye, EyeOff, LayoutGrid, Maximize2, Plus, Search, X, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { Menu } from '@/components/ui/menu'
import { Segmented } from '@/components/ui/misc'
import { CATEGORIES } from '@/domain/lifeMap'
import { cn } from '@/lib/utils'
import { KIND_STYLE, MAP_KINDS, kindColor } from './kinds'

/** Search box with a short result list: typing dims the rest of the map, choosing a result jumps to it. */
function Search_({ map, vis, query, setQuery, onPick }) {
  const [open, setOpen] = useState(false)
  const results = useMemo(() => map.nodes.filter((n) => vis.matches.has(n.key)).slice(0, 8), [map, vis.matches])
  return (
    <div className="relative w-full min-w-0 sm:w-auto sm:max-w-xs sm:flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        role="combobox"
        aria-expanded={open && !!query && results.length > 0}
        aria-controls="lm-results"
        aria-label="Search the map"
        placeholder="Search goals, habits, tasks…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setQuery('')
            e.currentTarget.blur()
          }
          if (e.key === 'Enter' && results[0]) onPick(results[0])
        }}
        className="h-10 w-full rounded-md border border-border bg-card/60 pl-8 pr-8 text-sm outline-none focus-visible:border-mod md:h-9"
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setQuery('')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {open && query && (
        <ul
          id="lm-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-border bg-card p-1 shadow-overlay"
        >
          {results.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">Nothing matches &ldquo;{query}&rdquo; with the current filters.</li>
          )}
          {results.map((n) => {
            const Icon = KIND_STYLE[n.kind].icon
            return (
              <li key={n.key} role="option" aria-selected="false">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick(n)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted/60"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: kindColor(n) }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{n.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{KIND_STYLE[n.kind].label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Everything that quietens or reshapes the map: search, type buttons, category, done and task visibility, zoom and layout. */
export function MapToolbar({ map, vis, f, setF, onPick, onAdd, onFit, onZoom, onTidy, counts }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Search_ map={map} vis={vis} query={f.query} setQuery={(query) => setF((s) => ({ ...s, query }))} onPick={onPick} />
        <Select
          aria-label="Category"
          className="h-10 w-36 md:h-9"
          value={f.category}
          onChange={(e) => setF((s) => ({ ...s, category: e.target.value }))}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Button variant="outline" size="sm" aria-pressed={f.hideDone} onClick={() => setF((s) => ({ ...s, hideDone: !s.hideDone }))}>
          {f.hideDone ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
          {f.hideDone ? 'Done hidden' : 'Hide done'}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => onZoom(1 / 1.25)}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => onZoom(1.25)}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Fit to screen" onClick={onFit}>
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onTidy} title="Arrange everything left to right and save the layout">
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Tidy up</span>
          </Button>
          <Menu
            label="Add to map"
            trigger={
              <span className="inline-flex h-10 items-center gap-1.5 rounded-md bg-gradient-to-b from-primary-solid to-primary-solid-2 px-3 text-[13px] font-medium text-primary-foreground md:h-8">
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add
              </span>
            }
            items={[
              { label: 'New project', onClick: () => onAdd('project') },
              { label: 'New area of life', onClick: () => onAdd('area') },
            ]}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Show">
        {MAP_KINDS.map((k) => {
          const st = KIND_STYLE[k]
          const on = !f.kinds || f.kinds.has(k)
          const Icon = st.icon
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setF((s) => {
                  const next = new Set(s.kinds ?? MAP_KINDS)
                  next.has(k) ? next.delete(k) : next.add(k)
                  return { ...s, kinds: next.size === MAP_KINDS.length ? null : next }
                })
              }
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors',
                on ? 'border-border bg-card text-foreground' : 'border-dashed border-border text-muted-foreground/60',
              )}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: on ? st.color : undefined }} aria-hidden />
              {st.label}
              <span className="tabular-nums text-muted-foreground">{counts[k] ?? 0}</span>
            </button>
          )
        })}
        <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden />
        <Segmented
          value={f.tasks}
          onChange={(tasks) => setF((s) => ({ ...s, tasks }))}
          options={[
            { value: 'linked', label: 'Linked tasks' },
            { value: 'all', label: 'All tasks' },
          ]}
        />
      </div>
    </div>
  )
}
