import { useEffect, useMemo, useState } from 'react'
import { Info, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/shared/states'
import { useConfirm } from '@/components/shared/Confirm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/form'
import { Menu } from '@/components/ui/menu'
import { Badge, Segmented } from '@/components/ui/misc'
import { ESTIMATE_BASIS, FOOD_CATEGORIES, NUTRITION_SOURCE } from '@lifetrack/constants/foods'
import { useAction } from '@/hooks/useAction'
import { deleteFood } from '@/services/api'
import { categoriesInUse, searchFoods } from '@/domain/nutrition'
import { cn } from '@/lib/utils'
import { Stars } from './FoodPickerDialog'

const PAGE = 60
const SCOPES = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'favorites', label: 'Favourites' },
]

/** The food database: the Indian starter list plus your own foods. Starter values are estimates; edit any of them. */
export function FoodsTab({ n, onCreate, onEdit, toggleFavorite }) {
  const confirm = useConfirm()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('all')
  const [category, setCategory] = useState('all')
  const [remove] = useAction((food) => deleteFood(food), { success: (_r) => 'Food removed' })
  const foods = useMemo(() => {
    const pool = scope === 'mine' ? n.catalog.filter((f) => f.source !== 'starter') : n.catalog
    return searchFoods(pool, { query, category, scope: scope === 'favorites' ? 'favorites' : 'all', favorites: n.favorites })
  }, [n.catalog, n.favorites, query, scope, category])
  const categories = useMemo(() => categoriesInUse(n.catalog, FOOD_CATEGORIES), [n.catalog])
  const [shown, setShown] = useState(PAGE)
  useEffect(() => setShown(PAGE), [query, scope, category])

  const askRemove = async (food) => {
    const reset = food.source === 'edited'
    const ok = await confirm({
      title: reset ? `Reset ${food.name} to the original?` : `Delete ${food.name}?`,
      description: reset
        ? 'Your edits to this food are removed and the built-in estimate comes back. Meals you already logged keep their values.'
        : 'It leaves your food list. Meals you already logged with it keep their values.',
      confirmLabel: reset ? 'Reset' : 'Delete',
    })
    if (ok) remove(food)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-2.5 text-[13px] text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <p>
          The built-in foods are <b className="text-foreground">approximate estimates</b> for typical portions. Recipes, oil and portion
          size change the real numbers, and restaurant dishes vary most, so edit any food to match yours. {NUTRITION_SOURCE.split('. ')[0]}.
        </p>
      </div>
      <Card>
        <CardHeader className="flex-wrap">
          <CardTitle>Foods</CardTitle>
          <Button size="sm" onClick={onCreate}>
            <Plus className="h-4 w-4" aria-hidden />
            Create food
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                className="pl-9"
                placeholder="Search foods"
                aria-label="Search foods"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Segmented value={scope} onChange={setScope} options={SCOPES} />
          </div>
          <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5" role="group" aria-label="Category">
            {['all', ...categories].map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  'lt-press shrink-0 rounded-full border px-3 py-2 text-[13px] font-medium transition-colors md:py-1',
                  category === c
                    ? 'border-mod bg-mod/15 text-mod-text'
                    : 'border-border bg-card/60 text-muted-foreground hover:text-foreground',
                )}
              >
                {c === 'all' ? 'All' : c}
              </button>
            ))}
          </div>
          {foods.length === 0 ? (
            <EmptyState
              title={scope === 'mine' ? 'No foods of your own yet' : scope === 'favorites' ? 'No favourites yet' : 'No match'}
              description={
                scope === 'mine'
                  ? 'Create a food, or edit a starter food to make it yours.'
                  : scope === 'favorites'
                    ? 'Tap the star on a food to keep it close.'
                    : 'Try another spelling.'
              }
              action={scope === 'mine' ? <Button onClick={onCreate}>Create food</Button> : undefined}
              className="py-8"
            />
          ) : (
            <ul className="-mx-2 divide-y divide-border/50" aria-label="Food list">
              {foods.slice(0, shown).map((f) => (
                <li key={f.ref} className="flex items-center gap-1 px-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{f.name}</span>
                      {f.source === 'custom' && <Badge tone="primary">Yours</Badge>}
                      {f.source === 'edited' && <Badge tone="primary">Edited</Badge>}
                      {f.source === 'starter' && (
                        <Badge title={ESTIMATE_BASIS[f.basis]?.hint}>
                          ≈ {(ESTIMATE_BASIS[f.basis]?.label ?? 'estimate').toLowerCase()}
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {f.category} · {f.serving_label}
                      {f.variants.length > 0 && ` · ${f.variants.length} variation${f.variants.length === 1 ? '' : 's'}`}
                    </p>
                    <p className="text-[11px] tabular-nums text-muted-foreground/90">
                      P {f.protein_g} · C {f.carbs_g} · F {f.fat_g} · Fibre {f.fiber_g}
                    </p>
                  </div>
                  <span className="mr-1 shrink-0 text-sm font-semibold tabular-nums">
                    {Math.round(f.kcal)}
                    <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">kcal</span>
                  </span>
                  <Stars on={n.favorites.includes(f.ref)} onToggle={() => toggleFavorite(f.ref)} name={f.name} />
                  <Menu
                    label={`Actions for ${f.name}`}
                    items={[
                      { label: 'Edit', icon: Pencil, onClick: () => onEdit(f) },
                      { label: 'Reset to original', icon: RotateCcw, hidden: f.source !== 'edited', onClick: () => askRemove(f) },
                      { label: 'Delete', icon: Trash2, danger: true, hidden: f.source !== 'custom', onClick: () => askRemove(f) },
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
          {foods.length > shown && (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setShown((c) => c + PAGE)}>
              Show more ({foods.length - shown} more)
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            {foods.length} food{foods.length === 1 ? '' : 's'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
