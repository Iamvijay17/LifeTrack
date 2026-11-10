import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Target } from 'lucide-react'
import { foodLogDraftToForm } from '@lifetrack/schemas'
import { FOOD_CATEGORIES } from '@lifetrack/constants/foods'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/misc'
import { useAction } from '@/hooks/useAction'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { saveFavoriteFoods } from '@/services/api'
import { duplicateDraft, entryRow, guessMeal, perServing, toggleFavorite as toggleFav } from '@/domain/nutrition'
import { timeStrInTz } from '@/lib/dates'
import { AnalyticsTab } from './AnalyticsTab'
import { CalendarTab } from './CalendarTab'
import { CustomFoodDialog } from './CustomFoodDialog'
import { FoodEntryFlow } from './FoodEntryFlow'
import { FoodsTab } from './FoodsTab'
import { GoalsDialog } from './GoalsDialog'
import { TodayTab } from './TodayTab'
import { logEntry } from './logEntry'
import { useNutrition } from './useNutrition'

const TABS = [
  { value: 'today', label: 'Today' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'foods', label: 'Foods' },
]

export default function NutritionPage() {
  const today = useToday()
  const { settings } = useSettings()
  const tz = settings.timezone
  const nowTime = () => timeStrInTz(new Date(), tz)
  const nutrition = useNutrition()
  const n = { ...nutrition, waterGoal: settings.water_goal_ml }
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'today'
  const setTab = (value) => setParams(value === 'today' ? {} : { tab: value }, { replace: true })
  const [chosen, setChosen] = useState(null)
  const day = chosen ?? today
  const [flow, setFlow] = useState(null)
  const [goalsOpen, setGoalsOpen] = useState(false)
  const [foodDialog, setFoodDialog] = useState({ open: false, food: null })

  const [toggleFavorite] = useAction((ref) => saveFavoriteFoods(toggleFav(n.favorites, ref)))
  const [quickAdd, quickAdding] = useAction((entry, date) => {
    const meal = date === today ? guessMeal(Number(nowTime().slice(0, 2))) : entry.meal_type
    return logEntry(entryRow(duplicateDraft(entry, { date, meal, time: date === today ? nowTime() : '' })))
  })
  const removeEntry = useConfirmedDelete('food_logs', 'Entry deleted')

  const actions = useMemo(
    () => ({
      quickAdding,
      quickAdd,
      openAdd: ({ date = day, meal } = {}) => setFlow({ mode: 'pick', date, meal: meal ?? guessMeal(Number(nowTime().slice(0, 2))) }),
      openEdit: (entry) =>
        setFlow({
          mode: 'form',
          entry,
          title: 'Edit food entry',
          values: foodLogDraftToForm({
            ...entry,
            quantity: Number(entry.quantity),
            log_time: entry.log_time?.slice(0, 5) ?? '',
            per: perServing(entry),
          }),
        }),
      openDuplicate: (entry, date) =>
        setFlow({
          mode: 'form',
          entry: null,
          title: 'Duplicate entry',
          values: foodLogDraftToForm(duplicateDraft(entry, { date, time: '' })),
        }),
      deleteEntry: (entry) =>
        removeEntry(entry.id, { title: 'Delete this entry?', description: `${entry.name} · ${Math.round(entry.kcal)} kcal` }),
    }),
    // nowTime closes over the timezone only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day, quickAdd, quickAdding, removeEntry, tz],
  )
  const categories = useMemo(() => [...new Set([...FOOD_CATEGORIES, ...n.catalog.map((f) => f.category)])], [n.catalog])
  const openDay = (d) => {
    setChosen(d)
    setTab('today')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <PageHeader
        title="Food & Nutrition"
        description="Calories, macros and water, with Indian starter foods you can edit."
        actions={
          <>
            <Button variant="outline" onClick={() => setGoalsOpen(true)}>
              <Target className="h-4 w-4" aria-hidden />
              Targets
            </Button>
            <Button onClick={() => actions.openAdd({ date: day })}>
              <Plus className="h-4 w-4" aria-hidden />
              Log food
            </Button>
          </>
        }
      />
      <DataGate loading={n.loading} error={n.error} onRetry={n.refetch} cards={4}>
        <div className="space-y-5">
          <Segmented value={tab} onChange={setTab} options={TABS} className="w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none" />
          {tab === 'today' && (
            <TodayTab
              n={n}
              day={day}
              today={today}
              nowTime={nowTime}
              setDay={setChosen}
              actions={actions}
              goalsDialog={() => setGoalsOpen(true)}
            />
          )}
          {tab === 'calendar' && (
            <CalendarTab n={n} today={today} weekStartsOn={settings.week_starts_on} selected={day} onSelect={setChosen} actions={actions} />
          )}
          {tab === 'analytics' && (
            <AnalyticsTab
              n={n}
              today={today}
              weekStartsOn={settings.week_starts_on}
              onOpenDay={openDay}
              waterGoal={settings.water_goal_ml}
            />
          )}
          {tab === 'foods' && (
            <FoodsTab
              n={n}
              toggleFavorite={toggleFavorite}
              onCreate={() => setFoodDialog({ open: true, food: null })}
              onEdit={(food) => setFoodDialog({ open: true, food })}
            />
          )}
        </div>
      </DataGate>
      <FoodEntryFlow
        flow={flow}
        setFlow={setFlow}
        n={n}
        today={today}
        nowTime={nowTime}
        toggleFavorite={toggleFavorite}
        categories={categories}
      />
      <GoalsDialog open={goalsOpen} onOpenChange={setGoalsOpen} settingsRow={n.settingsRow} />
      <CustomFoodDialog
        open={foodDialog.open}
        onOpenChange={(o) => setFoodDialog((d) => ({ ...d, open: o }))}
        food={foodDialog.food}
        categories={categories}
      />
    </>
  )
}
