import { useMemo } from 'react'
import { CalendarX, Plus } from 'lucide-react'
import { DateNav } from '@/components/shared/DateNav'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/states'
import { dayMeals, dayTotals, entriesOn, frequentFoods, recentFoods, waterDay } from '@/domain/nutrition'
import { CalorieHero } from './CalorieHero'
import { MealSection } from './MealSection'
import { QuickAdd } from './QuickAdd'
import { WaterCard } from './WaterCard'

/** The day: calorie ring, nutrient bars, water, quick-add chips and the four meals. */
export function TodayTab({ n, day, today, nowTime, setDay, actions, goalsDialog }) {
  const { logs, goals, waterLogs, healthLogs } = n
  const meals = useMemo(() => dayMeals(logs, day), [logs, day])
  const totals = useMemo(() => dayTotals(logs, day), [logs, day])
  const frequent = useMemo(() => frequentFoods(logs, 6), [logs])
  const recent = useMemo(() => recentFoods(logs, 10), [logs])
  const water = useMemo(
    () =>
      waterDay(
        waterLogs,
        healthLogs.find((h) => h.log_date === day),
        day,
      ),
    [waterLogs, healthLogs, day],
  )
  const empty = entriesOn(logs, day).length === 0
  const waterGoal = n.waterGoal

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DateNav date={day} onChange={setDay} today={today} />
        {day !== today && empty && day < today && n.logs.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-warning">
            <CalendarX className="h-3.5 w-3.5" aria-hidden />
            No food logged on this day
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CalorieHero totals={totals} goals={goals} isToday={day === today} onEditGoals={goalsDialog} />
        <WaterCard day={water} goal={waterGoal} date={day} today={today} nowTime={nowTime} />
      </div>
      <QuickAdd frequent={frequent} recent={recent} busy={actions.quickAdding} onPick={(entry) => actions.quickAdd(entry, day)} />
      {empty && n.logs.length === 0 ? (
        <EmptyState
          title="Log your first meal"
          description="Search the Indian starter foods or add your own. Everything is saved to your account and works on every device."
          action={
            <Button onClick={() => actions.openAdd({ date: day })}>
              <Plus className="h-4 w-4" aria-hidden />
              Log food
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {meals.map((meal) => (
            <MealSection
              key={meal.id}
              meal={meal}
              onAdd={(id) => actions.openAdd({ date: day, meal: id })}
              onEdit={actions.openEdit}
              onDuplicate={(e) => actions.openDuplicate(e, day)}
              onDelete={actions.deleteEntry}
              entryProps={actions.entryProps}
              mealProps={actions.mealProps?.(meal)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
