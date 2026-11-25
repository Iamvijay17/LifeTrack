import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Minus, Plus, Search, Star } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { Badge, Segmented } from '@/components/ui/misc'
import { EmptyState } from '@/components/shared/states'
import { useAction } from '@/hooks/useAction'
import { ESTIMATE_BASIS, FOOD_CATEGORIES } from '@lifetrack/constants/foods'
import {
  MEALS,
  MEAL_LABEL,
  categoriesInUse,
  customServing,
  entryDraftFromFood,
  entryRow,
  foodNutrition,
  recentFoods,
  scaleNutrition,
  searchFoods,
  servingOptions,
  servingUnit,
  supportsCustomWeight,
} from '@/domain/nutrition'
import { cn } from '@/lib/utils'
import { logEntry } from './logEntry'

const SCOPES = [
  { value: 'all', label: 'All foods' },
  { value: 'recent', label: 'Recent' },
  { value: 'favorites', label: 'Favourites' },
]

function Chip({ active, children, ...p }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'lt-press shrink-0 rounded-full border px-3 py-2 text-[13px] font-medium transition-colors md:py-1',
        active ? 'border-mod bg-mod/15 text-mod-text' : 'border-border bg-card/60 text-muted-foreground hover:text-foreground',
      )}
      {...p}
    >
      {children}
    </button>
  )
}

export function Stars({ on, onToggle, name }) {
  return (
    <button
      type="button"
      aria-label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className="lt-press grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted md:h-8 md:w-8"
    >
      <Star className={cn('h-4 w-4', on && 'fill-warning text-warning')} aria-hidden />
    </button>
  )
}

const CUSTOM_WEIGHT = '__custom_weight__'
const PAGE = 60
const macroLine = (f) => `P ${f.protein_g} · C ${f.carbs_g} · F ${f.fat_g}`

function Detail({ food, ctx, onBack, onSaved, onDetails, favorite, onToggleFavorite }) {
  const [variant, setVariant] = useState('')
  const options = servingOptions(food)
  const [servingLabel, setServingLabel] = useState(options[0].label)
  const [grams, setGrams] = useState('')
  const [qty, setQty] = useState('1')
  const [meal, setMeal] = useState(ctx.meal)
  const byWeight = servingLabel === CUSTOM_WEIGHT
  const unit = servingUnit(food)
  const customOption = byWeight ? customServing(food, grams) : null
  const serving = byWeight ? (customOption ?? options[0]) : (options.find((o) => o.label === servingLabel) ?? options[0])
  const q = Number(qty)
  const valid = q > 0 && q <= 100 && (!byWeight || !!customOption)
  const per = scaleNutrition(foodNutrition(food, variant), 1, serving.factor)
  const total = scaleNutrition(per, valid ? q : 0)
  const draft = () =>
    entryDraftFromFood(food, { variant, serving, quantity: valid ? Math.round(q * 100) / 100 : 1, meal, date: ctx.date, time: ctx.time })
  const [add, pending] = useAction(async () => {
    await logEntry(entryRow(draft()))
    onSaved()
  })
  const step = (d) => setQty(String(Math.max(0.5, Math.round(((valid ? q : 1) + d) * 100) / 100)))
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Back to results" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold tracking-tight">{food.name}</h3>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {food.category}
            {food.approximate && <Badge tone="warning">{ESTIMATE_BASIS[food.basis]?.label ?? 'Approximate'}</Badge>}
            {food.numbers_from && <span>· from {food.numbers_from}</span>}
          </p>
          {food.approximate && (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {ESTIMATE_BASIS[food.basis]?.hint ?? ESTIMATE_BASIS.recipe.hint} You can change the numbers when you add it.
            </p>
          )}
        </div>
        <Stars on={favorite} onToggle={onToggleFavorite} name={food.name} />
      </div>

      {food.variants.length > 0 && (
        <div>
          <p className="mb-1.5 text-[13px] font-medium">Preparation</p>
          <div className="flex flex-wrap gap-2">
            <Chip active={variant === ''} onClick={() => setVariant('')}>
              Standard
            </Chip>
            {food.variants.map((v) => (
              <Chip key={v.label} active={variant === v.label} onClick={() => setVariant(v.label)}>
                {v.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[13px] font-medium">Serving size</p>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <Chip key={o.label} active={servingLabel === o.label} onClick={() => setServingLabel(o.label)}>
              {o.label}
            </Chip>
          ))}
          {supportsCustomWeight(food) && (
            <Chip active={byWeight} onClick={() => setServingLabel(CUSTOM_WEIGHT)}>
              Custom weight
            </Chip>
          )}
        </div>
        {byWeight && (
          <div className="mt-2 flex items-center gap-2">
            <Input
              inputMode="decimal"
              autoFocus
              aria-label={`Amount in ${unit === 'ml' ? 'millilitres' : 'grams'}`}
              className="w-28 tabular-nums"
              placeholder="e.g. 175"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              aria-invalid={(grams !== '' && !customOption) || undefined}
            />
            <span className="text-sm text-muted-foreground">{unit === 'ml' ? 'ml' : 'grams'}</span>
            <span className="text-xs text-muted-foreground">
              (1 serving = {food.serving_g} {unit})
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <p className="text-[13px] font-medium">How many?</p>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="icon-sm" aria-label="Fewer" onClick={() => step(-0.5)} disabled={valid && q <= 0.5}>
            <Minus className="h-4 w-4" />
          </Button>
          <Input
            inputMode="decimal"
            aria-label="Quantity"
            className="w-20 text-center tabular-nums"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            aria-invalid={!valid || undefined}
          />
          <Button variant="outline" size="icon-sm" aria-label="More" onClick={() => step(0.5)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-mod/5 p-3" aria-live="polite">
        <p className="lt-stat-value text-2xl">
          {Math.round(total.kcal)} <span className="text-sm font-normal text-muted-foreground">kcal</span>
        </p>
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          Protein {total.protein_g} g · Carbs {total.carbs_g} g · Fat {total.fat_g} g · Fibre {total.fiber_g} g
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-[13px] font-medium">Meal</p>
        <Segmented
          className="w-full [&>button]:flex-1"
          value={meal}
          onChange={setMeal}
          options={MEALS.map((m) => ({ value: m.id, label: m.id === 'snack' ? 'Snacks' : m.label }))}
        />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => onDetails(draft())}>
          Add notes, date or time
        </Button>
        <Button loading={pending} disabled={!valid} onClick={() => add()}>
          <Check className="h-4 w-4" aria-hidden />
          Add to {MEAL_LABEL[meal]}
        </Button>
      </div>
    </div>
  )
}

/**
 * Pick a food: search by name, filter by category, recent and favourites, then choose preparation, serving and quantity with live nutrition.
 * `ctx` = { date, meal, time } the entry will be logged with. `onDetails(draft)` continues to the full entry form; `onManual(name)` skips picking.
 */
export function FoodPickerDialog({ open, onOpenChange, catalog, favorites, logs, ctx, onToggleFavorite, onManual, onDetails }) {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('all')
  const [category, setCategory] = useState('all')
  const [picked, setPicked] = useState(null)
  useEffect(() => {
    if (open) {
      setQuery('')
      setScope('all')
      setCategory('all')
      setPicked(null)
      setShown(PAGE)
    }
  }, [open])
  useEffect(() => setShown(PAGE), [query, scope, category])
  const recentRefs = useMemo(
    () =>
      recentFoods(logs, 40)
        .map((r) => r.ref)
        .filter(Boolean),
    [logs],
  )
  const categories = useMemo(() => categoriesInUse(catalog, FOOD_CATEGORIES), [catalog])
  const [shown, setShown] = useState(PAGE)
  const results = useMemo(() => {
    const found = searchFoods(catalog, { query, category, scope, favorites, recentRefs })
    if (query.trim() || scope !== 'all') return found
    // With nothing typed, foods people usually eat at this meal come first.
    return [...found.filter((f) => f.meals.includes(ctx.meal)), ...found.filter((f) => !f.meals.includes(ctx.meal))]
  }, [catalog, query, category, scope, favorites, recentRefs, ctx.meal])
  const current = picked && catalog.find((f) => f.ref === picked)

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={current ? 'Add food' : `Add to ${MEAL_LABEL[ctx.meal]}`}
      description={current ? undefined : 'Search foods, or tap one to choose its serving.'}
      className="md:max-w-xl"
    >
      {current ? (
        <Detail
          key={current.ref}
          food={current}
          ctx={ctx}
          favorite={favorites.includes(current.ref)}
          onToggleFavorite={() => onToggleFavorite(current.ref)}
          onBack={() => setPicked(null)}
          onSaved={() => onOpenChange(false)}
          onDetails={onDetails}
        />
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              autoFocus
              className="pl-9"
              placeholder="Search idli, biryani, இட்லி…"
              aria-label="Search foods"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Segmented className="w-full [&>button]:flex-1" value={scope} onChange={setScope} options={SCOPES} />
          <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5" role="group" aria-label="Category">
            <Chip active={category === 'all'} onClick={() => setCategory('all')}>
              All
            </Chip>
            {categories.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                {c}
              </Chip>
            ))}
          </div>
          {results.length === 0 ? (
            <EmptyState
              title={scope === 'favorites' ? 'No favourites yet' : scope === 'recent' ? 'Nothing eaten recently' : 'No match'}
              description={
                scope === 'favorites'
                  ? 'Tap the star on a food to keep it here.'
                  : scope === 'recent'
                    ? 'Foods you log will show up here.'
                    : 'Try another spelling, or enter it yourself.'
              }
              className="py-8"
            />
          ) : (
            <ul className="-mx-2 divide-y divide-border/50" aria-label="Foods">
              {results.slice(0, shown).map((f) => (
                <li key={f.ref} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setPicked(f.ref)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {f.name}
                        {f.source !== 'starter' && (
                          <span className="ml-1.5 text-[11px] font-normal text-mod-text">{f.source === 'custom' ? 'yours' : 'edited'}</span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{f.serving_label}</p>
                      <p className="truncate text-[11px] tabular-nums text-muted-foreground/90">{macroLine(f)}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {Math.round(f.kcal)}
                      <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">kcal</span>
                    </span>
                  </button>
                  <Stars on={favorites.includes(f.ref)} onToggle={() => onToggleFavorite(f.ref)} name={f.name} />
                </li>
              ))}
            </ul>
          )}
          {results.length > shown && (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setShown((n) => n + PAGE)}>
              Show more ({results.length - shown} more)
            </Button>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              {results.length} food{results.length === 1 ? '' : 's'} · Built-in values are approximate. Edit any food in the Foods tab.
            </p>
            <Button variant="outline" size="sm" onClick={() => onManual(query.trim())}>
              Enter manually
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
