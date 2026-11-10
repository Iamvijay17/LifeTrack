import { Coffee, Copy, Moon, Pencil, Plus, Sun, Sunset, Trash2 } from 'lucide-react'
import { AnimatePresence, ease, m } from '@/components/motion/primitives'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Menu } from '@/components/ui/menu'
import { fmtGrams } from '@/domain/nutrition'

const MEAL_ICON = { breakfast: Coffee, lunch: Sun, snack: Sunset, dinner: Moon }
const qtyText = (e) => {
  const q = Number(e.quantity)
  return q === 1 ? e.serving_label : `${q} × ${e.serving_label}`
}

export function EntryRow({ entry, onEdit, onDuplicate, onDelete }) {
  return (
    <m.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12, transition: { duration: 0.14 } }}
      transition={{ duration: 0.2, ease: ease.out }}
      className="flex items-center gap-3 py-2.5"
    >
      <button
        type="button"
        onClick={() => onEdit(entry)}
        className="min-w-0 flex-1 rounded-md text-left outline-offset-2"
        aria-label={`Edit ${entry.name}`}
      >
        <p className="truncate text-sm font-medium">{entry.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {qtyText(entry)}
          {entry.log_time ? ` · ${entry.log_time.slice(0, 5)}` : ''}
        </p>
        <p className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground/90">
          P {fmtGrams(entry.protein_g)} · C {fmtGrams(entry.carbs_g)} · F {fmtGrams(entry.fat_g)}
        </p>
      </button>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {Math.round(entry.kcal)}
        <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">kcal</span>
      </span>
      <Menu
        label={`Actions for ${entry.name}`}
        items={[
          { label: 'Edit', icon: Pencil, onClick: () => onEdit(entry) },
          { label: 'Duplicate', icon: Copy, onClick: () => onDuplicate(entry) },
          { label: 'Delete', icon: Trash2, danger: true, onClick: () => onDelete(entry) },
        ]}
      />
    </m.li>
  )
}

/** One meal of the day: its total, its entries, and a one-tap "add". `meal` comes from dayMeals(). */
export function MealSection({ meal, onAdd, onEdit, onDuplicate, onDelete }) {
  const Icon = MEAL_ICON[meal.id]
  const empty = meal.entries.length === 0
  return (
    <Card className="p-4" data-testid={`meal-${meal.id}`}>
      <div className="flex items-center gap-3">
        <span className="lt-icon-soft h-9 w-9 rounded-lg">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight">{meal.label}</h3>
          <p className="text-xs tabular-nums text-muted-foreground">
            {empty
              ? 'Nothing logged'
              : `${Math.round(meal.totals.kcal)} kcal · P ${Math.round(meal.totals.protein_g)} · C ${Math.round(meal.totals.carbs_g)} · F ${Math.round(meal.totals.fat_g)}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onAdd(meal.id)} aria-label={`Add food to ${meal.label}`}>
          <Plus className="h-4 w-4" aria-hidden />
          Add
        </Button>
      </div>
      {!empty && (
        <ul className="mt-2 divide-y divide-border/60">
          <AnimatePresence initial={false}>
            {meal.entries.map((e) => (
              <EntryRow key={e.id} entry={e} onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  )
}
