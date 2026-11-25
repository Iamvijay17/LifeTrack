import { useMemo, useState } from 'react'
import { Check, Eye, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/form'
import { Badge } from '@/components/ui/misc'
import { CATEGORIES, WIDGET_CATALOG, canAdd } from '@lifetrack/core/dashboardBuilder'
import { cn } from '@/lib/utils'
import { Wireframe } from './Wireframe'

/** Every widget that can go on this workspace, by category, with a search box. Hidden widgets are listed first so they can be shown again. */
export function WidgetLibrary({ open, onOpenChange, workspace, onAdd, onShow }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const q = query.trim().toLowerCase()
  const hidden = workspace.widgets.filter((w) => w.hidden)
  const list = useMemo(
    () =>
      WIDGET_CATALOG.filter(
        (d) => (category === 'all' || d.category === category) && (!q || `${d.label} ${d.description}`.toLowerCase().includes(q)),
      ),
    [q, category],
  )
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a widget"
      description={`Widgets show your own data from LifeTrack. Adding one to ${workspace.name} changes only this dashboard.`}
      className="md:max-w-3xl"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            aria-label="Search widgets"
            placeholder="Search widgets"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div role="tablist" aria-label="Widget categories" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {[{ key: 'all', label: 'All' }, ...CATEGORIES].map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={category === c.key}
              onClick={() => setCategory(c.key)}
              className={cn(
                'lt-press min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors',
                category === c.key
                  ? 'border-primary/60 bg-primary/15 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        {hidden.length > 0 && !q && category === 'all' && (
          <section aria-label="Hidden widgets" className="rounded-lg border border-dashed border-border p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Hidden on this dashboard</p>
            <div className="flex flex-wrap gap-2">
              {hidden.map((w) => {
                const d = WIDGET_CATALOG.find((x) => x.type === w.type)
                return (
                  <Button key={w.id} size="sm" variant="outline" onClick={() => onShow(w.id)}>
                    <Eye className="h-4 w-4" aria-hidden />
                    Show {w.title || d?.label}
                  </Button>
                )
              })}
            </div>
          </section>
        )}
        {list.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No widget matches “{query}”.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.map((d) => {
              const has = workspace.widgets.some((w) => w.type === d.type)
              const ok = canAdd(workspace, d.type)
              return (
                <li key={d.type} data-testid={`library-${d.type}`} className="flex gap-3 rounded-xl border border-border bg-card/60 p-3">
                  <div className="h-20 w-24 shrink-0">
                    <Wireframe type={d.type} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold leading-tight">{d.label}</h3>
                      <Badge>{CATEGORIES.find((c) => c.key === d.category)?.label}</Badge>
                    </div>
                    <p className="line-clamp-3 text-xs text-muted-foreground">{d.description}</p>
                    <Button
                      size="sm"
                      variant={has && !d.multi ? 'secondary' : 'outline'}
                      className="mt-auto self-start"
                      disabled={!ok}
                      aria-label={`${has && d.multi ? 'Add another' : 'Add'} ${d.label}`}
                      onClick={() => onAdd(d.type)}
                    >
                      {has && !d.multi ? <Check className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                      {has && !d.multi ? 'Added' : has ? (ok ? 'Add another' : 'Limit reached') : 'Add'}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Dialog>
  )
}
