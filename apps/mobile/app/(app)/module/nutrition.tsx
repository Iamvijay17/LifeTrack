import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ESTIMATE_BASIS, FOOD_CATEGORIES } from '@lifetrack/constants/foods'
import { eachDay, fmtDay, monthEnd, monthStart, timeStrInTz } from '@lifetrack/utils'
import {
  MEAL_LABEL, analyze, calendarTotals, dayMeals, dayTotals, duplicateDraft, entriesOn, entryRow, firstLogDate, fmtKcal, frequentFoods, guessMeal, missingDays,
  categoriesInUse, percentOfGoal, perServing, recentFoods, remainingOf, round, searchFoods, toggleFavorite as toggleFav, viewRange, waterDay, weeklyTrend,
} from '@lifetrack/core/nutrition'
import { foodLogDraftToForm, type FoodLogForm } from '@lifetrack/schemas'
import { api, store } from '../../../src/data/client'
import { useAction } from '../../../src/hooks/useAction'
import { useSettings } from '../../../src/hooks/useSettings'
import { useToday } from '../../../src/hooks/useToday'
import { useTheme } from '../../../src/providers/ThemeProvider'
import { EntryForm } from '../../../src/features/nutrition/EntryForm'
import { FoodForm } from '../../../src/features/nutrition/FoodForm'
import { FoodPicker, Star } from '../../../src/features/nutrition/FoodPicker'
import { GoalsForm } from '../../../src/features/nutrition/GoalsForm'
import { WaterCard } from '../../../src/features/nutrition/WaterCard'
import { useNutrition } from '../../../src/features/nutrition/useNutrition'
import { BarChart, DonutChart } from '../../../src/ui/charts'
import { ModuleHeader } from '../../../src/ui/ModuleHeader'
import { ActionSheet, afterSheetClose } from '../../../src/ui/Sheet'
import { confirm } from '../../../src/ui/confirm'
import { Badge, Chip, DataGate, DateNav, EmptyState, MonthNav, ProgressBar, Segmented, StatTile, pullToRefresh } from '../../../src/ui/controls'
import { AnimatedNumber, ProgressRing } from '../../../src/ui/motion'
import { Button, Card, Field, Txt } from '../../../src/ui'

type Tab = 'today' | 'history' | 'insights' | 'foods'
type View_ = 'daily' | 'weekly' | 'monthly'
const MACRO_COLOR: Record<string, string> = { protein_g: '#84CC16', carbs_g: '#F59E0B', fat_g: '#F43F5E' }
const MACRO_NAME: Record<string, string> = { protein_g: 'Protein', carbs_g: 'Carbs', fat_g: 'Fat' }

type Flow = { mode: 'pick'; date: string; meal: string } | { mode: 'form'; entry: any | null; title: string; values: FoodLogForm } | null

function EntryRow({ entry, onPress }: { entry: any; onPress: () => void }) {
  const { colors } = useTheme()
  const q = Number(entry.quantity)
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${entry.name}, ${Math.round(entry.kcal)} calories. Actions`} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 6 }}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: '500', fontSize: 16 }}>{entry.name}</Text>
        <Txt variant="small" muted>{q === 1 ? entry.serving_label : `${q} × ${entry.serving_label}`}{entry.log_time ? ` · ${entry.log_time.slice(0, 5)}` : ''}</Txt>
        <Txt variant="small" muted>P {round(entry.protein_g)} · C {round(entry.carbs_g)} · F {round(entry.fat_g)}</Txt>
      </View>
      <Text style={{ color: colors.foreground, fontWeight: '700' }}>{Math.round(entry.kcal)}<Text style={{ color: colors.mutedForeground, fontWeight: '400', fontSize: 12 }}> kcal</Text></Text>
    </Pressable>
  )
}

function MealCard({ meal, onAdd, onEntry }: { meal: any; onAdd: () => void; onEntry: (e: any) => void }) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Txt variant="heading">{meal.label}</Txt>
          <Txt variant="small" muted>{meal.entries.length ? `${Math.round(meal.totals.kcal)} kcal · P ${Math.round(meal.totals.protein_g)} · C ${Math.round(meal.totals.carbs_g)} · F ${Math.round(meal.totals.fat_g)}` : 'Nothing logged'}</Txt>
        </View>
        <Button title="Add" variant="ghost" onPress={onAdd} />
      </View>
      {meal.entries.map((e: any) => <EntryRow key={e.id} entry={e} onPress={() => onEntry(e)} />)}
    </Card>
  )
}

export default function Nutrition() {
  const { colors } = useTheme()
  const today = useToday()
  const { settings } = useSettings()
  const tz = settings.timezone
  const nowTime = () => timeStrInTz(new Date(), tz)
  const n = useNutrition()
  const [tab, setTab] = useState<Tab>('today')
  const [chosen, setChosen] = useState<string | null>(null)
  const day = chosen ?? today
  const [flow, setFlow] = useState<Flow>(null)
  const [goalsOpen, setGoalsOpen] = useState(false)
  const [foodDialog, setFoodDialog] = useState<{ open: boolean; food: any | null }>({ open: false, food: null })
  const [menuFor, setMenuFor] = useState<any | null>(null)
  const categories = useMemo(() => [...new Set([...FOOD_CATEGORIES, ...n.catalog.map((f: any) => f.category)])], [n.catalog])

  const [toggleFavorite] = useAction((ref: string) => api.saveFavoriteFoods(toggleFav(n.favorites, ref)))
  const [quickAdd, quickAdding] = useAction(async (entry: any, date: string) => {
    const meal = date === today ? guessMeal(Number(nowTime().slice(0, 2))) : entry.meal_type
    await store.insert('food_logs', entryRow(duplicateDraft(entry, { date, meal, time: date === today ? nowTime() : '' })))
  })
  const [del] = useAction((id: string) => store.remove('food_logs', id))
  const [removeFood] = useAction((food: any) => api.deleteFood(food))

  const openAdd = (date = day, meal?: string) => setFlow({ mode: 'pick', date, meal: meal ?? guessMeal(Number(nowTime().slice(0, 2))) })
  const openEdit = (entry: any) => setFlow({ mode: 'form', entry, title: 'Edit food entry', values: foodLogDraftToForm({ ...entry, quantity: Number(entry.quantity), log_time: entry.log_time?.slice(0, 5) ?? '', per: perServing(entry) }) })
  const openDuplicate = (entry: any, date: string) => setFlow({ mode: 'form', entry: null, title: 'Duplicate entry', values: foodLogDraftToForm(duplicateDraft(entry, { date, time: '' }) as any) })
  const blankValues = (date: string, meal: string, name = ''): FoodLogForm => foodLogDraftToForm({ name, category: 'Other', meal_type: meal as FoodLogForm['meal_type'], log_date: date, log_time: '', quantity: 1, serving_label: '1 serving', per: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 } })
  const closeFlow = () => setFlow(null)

  const meals = useMemo(() => dayMeals(n.logs, day), [n.logs, day])
  const totals = useMemo(() => dayTotals(n.logs, day), [n.logs, day])
  const water = useMemo(() => waterDay(n.waterLogs, n.healthLogs.find((h: any) => h.log_date === day), day), [n.waterLogs, n.healthLogs, day])
  const frequent = useMemo(() => frequentFoods(n.logs, 6), [n.logs])
  const recent = useMemo(() => recentFoods(n.logs, 10), [n.logs])
  const goal = n.goals.kcal
  const percent = percentOfGoal(totals.kcal, goal)
  const left = remainingOf(totals.kcal, goal)
  const pick = flow?.mode === 'pick' ? flow : null
  const form = flow?.mode === 'form' ? flow : null
  const ctx = pick ? { date: pick.date, meal: pick.meal, time: pick.date === today ? nowTime() : '' } : { date: today, meal: 'breakfast', time: '' }

  const entryActions = (e: any) => [
    { label: 'Edit', onPress: () => openEdit(e) },
    { label: 'Duplicate', onPress: () => openDuplicate(e, day) },
    { label: 'Delete', destructive: true, onPress: async () => { if (await confirm('Delete this entry?', `${e.name} · ${Math.round(e.kcal)} kcal`)) del(e.id) } },
  ]

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView refreshControl={pullToRefresh(n.refreshing, n.refetch)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <ModuleHeader title="Food & Nutrition" action={<Button title="Log food" onPress={() => openAdd()} />} />
        <DataGate loading={n.loading} error={n.error} onRetry={n.refetch}>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'today', label: 'Today' }, { value: 'history', label: 'History' }, { value: 'insights', label: 'Insights' }, { value: 'foods', label: 'Foods' }]} />

          {tab === 'today' ? (<>
            <DateNav date={day} today={today} onChange={setChosen} />
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <ProgressRing value={percent == null ? null : Math.min(100, percent)} size={128} stroke={12} label={goal ? `${Math.round(totals.kcal)} of ${goal} calories` : `${Math.round(totals.kcal)} calories`}>
                  <AnimatedNumber value={Math.round(totals.kcal).toLocaleString('en-IN')} style={{ color: colors.foreground, fontSize: 26, fontWeight: '700' }} />
                  <Txt variant="small" muted>{goal ? `of ${goal} kcal` : 'kcal eaten'}</Txt>
                </ProgressRing>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="small" muted>{left != null && left < 0 ? 'Over your goal by' : 'Remaining'}</Txt>
                  <Text style={{ color: left != null && left < 0 ? colors.danger : colors.foreground, fontSize: 22, fontWeight: '700' }}>{left == null ? '—' : `${Math.abs(Math.round(left)).toLocaleString('en-IN')} kcal`}</Text>
                  {!goal ? <Button title="Set daily targets" variant="ghost" onPress={() => setGoalsOpen(true)} /> : null}
                </View>
              </View>
              {([['protein_g', 'Protein'], ['carbs_g', 'Carbs'], ['fat_g', 'Fat'], ['fiber_g', 'Fibre']] as const).map(([key, label]) => {
                const g = n.goals[key]
                return (
                  <View key={key} style={{ marginTop: 8, gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Txt variant="small" muted>{label}</Txt>
                      <Txt variant="small">{round(totals[key])}{g ? ` / ${g}` : ''} g</Txt>
                    </View>
                    <ProgressBar value={percentOfGoal(totals[key], g) ?? 0} label={`${label} today`} />
                  </View>
                )
              })}
            </Card>
            <WaterCard day={water} goal={settings.water_goal_ml} date={day} nowTime={nowTime} isToday={day === today} />
            {frequent.length + recent.length > 0 ? (
              <View style={{ gap: 6 }}>
                <Txt variant="small" muted>Quick add</Txt>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {[...frequent, ...recent.filter((r: any) => !frequent.some((f: any) => f.key === r.key)).slice(0, 6)].map((f: any) => (
                    <Chip key={f.key} label={`${f.name.length > 22 ? f.name.slice(0, 21) + '…' : f.name} · ${Math.round(f.entry.kcal)}`} onPress={() => { if (!quickAdding) quickAdd(f.entry, day) }} />
                  ))}
                </ScrollView>
              </View>
            ) : null}
            {entriesOn(n.logs, day).length === 0 && n.logs.length === 0
              ? <EmptyState title="Log your first meal" description="Search the Indian starter foods or add your own. Everything is saved to your account." action={{ label: 'Log food', onPress: () => openAdd() }} />
              : meals.map((meal: any) => <MealCard key={meal.id} meal={meal} onAdd={() => openAdd(day, meal.id)} onEntry={setMenuFor} />)}
          </>) : null}

          {tab === 'history' ? <History n={n} today={today} weekStartsOn={settings.week_starts_on} selected={day} onOpenDay={(d) => { setChosen(d); setTab('today') }} /> : null}
          {tab === 'insights' ? <Insights n={n} today={today} weekStartsOn={settings.week_starts_on} waterGoal={settings.water_goal_ml} onOpenDay={(d) => { setChosen(d); setTab('today') }} /> : null}
          {tab === 'foods' ? <Foods n={n} categories={categories} toggleFavorite={toggleFavorite} onCreate={() => setFoodDialog({ open: true, food: null })} onEdit={(food) => setFoodDialog({ open: true, food })} onRemove={async (food) => {
            const reset = food.source === 'edited'
            if (await confirm(reset ? `Reset ${food.name} to the original?` : `Delete ${food.name}?`, 'Meals you already logged keep their values.', reset ? 'Reset' : 'Delete')) removeFood(food)
          }} /> : null}
          <Button title="Daily targets" variant="ghost" onPress={() => setGoalsOpen(true)} />
        </DataGate>
      </ScrollView>

      <ActionSheet visible={!!menuFor} title={menuFor?.name ?? ''} actions={menuFor ? entryActions(menuFor) : []} onClose={() => setMenuFor(null)} />
      <FoodPicker visible={!!pick} onClose={closeFlow} catalog={n.catalog} favorites={n.favorites} logs={n.logs} ctx={ctx} onToggleFavorite={toggleFavorite}
        onManual={(name) => { closeFlow(); afterSheetClose(() => setFlow({ mode: 'form', entry: null, title: 'Add food entry', values: blankValues(ctx.date, ctx.meal, name) })) }}
        onDetails={(draft) => { closeFlow(); afterSheetClose(() => setFlow({ mode: 'form', entry: null, title: 'Add food entry', values: foodLogDraftToForm(draft) })) }} />
      <EntryForm visible={!!form} entry={form?.entry ?? null} values={form?.values ?? blankValues(today, 'breakfast')} title={form?.title ?? 'Add food entry'} categories={categories} onClose={closeFlow} />
      <GoalsForm visible={goalsOpen} settingsRow={n.settingsRow} onClose={() => setGoalsOpen(false)} />
      <FoodForm visible={foodDialog.open} food={foodDialog.food} catalog={n.catalog} categories={categories} onClose={() => setFoodDialog((d) => ({ ...d, open: false }))} />
    </SafeAreaView>
  )
}

/** Calories per day for a month, with days that have nothing logged flagged. Tap a day to review and edit it. */
function History({ n, today, weekStartsOn: _w, selected: _s, onOpenDay }: { n: ReturnType<typeof useNutrition>; today: string; weekStartsOn: number; selected: string; onOpenDay: (d: string) => void }) {
  const { colors } = useTheme()
  const [month, setMonth] = useState(monthStart(today))
  const from = monthStart(month), to = monthEnd(month)
  const totals = useMemo(() => calendarTotals(n.logs, from, to), [n.logs, from, to])
  const missing = useMemo(() => new Set(missingDays(n.logs, from, to, today)), [n.logs, from, to, today])
  const days = eachDay(from, to > today ? today : to).reverse()
  const goal = n.goals.kcal
  return (<>
    <MonthNav month={month} thisMonth={monthStart(today)} onChange={(m) => setMonth(m ?? monthStart(today))} />
    <Txt variant="small" muted>{firstLogDate(n.logs) == null ? 'Log a meal and your days will fill in here.' : `${Object.keys(totals).length} days logged this month${missing.size ? `, ${missing.size} with nothing logged` : ''}.`}</Txt>
    <Card>
      {days.length === 0 ? <Txt muted>This month has not started yet.</Txt> : days.map((d) => {
        const t = (totals as Record<string, { kcal: number; count: number }>)[d]
        return (
          <Pressable key={d} accessibilityRole="button" accessibilityLabel={`${fmtDay(d, 'EEEE d MMMM')}, ${t ? `${Math.round(t.kcal)} calories` : 'nothing logged'}`} onPress={() => onOpenDay(d)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingVertical: 6 }}>
            <View><Text style={{ color: colors.foreground, fontWeight: '500' }}>{fmtDay(d, 'EEE, d MMM')}</Text>{t ? <Txt variant="small" muted>{t.count} {t.count === 1 ? 'entry' : 'entries'}</Txt> : null}</View>
            {t ? <Text style={{ color: goal > 0 && t.kcal > goal ? colors.danger : colors.foreground, fontWeight: '700' }}>{Math.round(t.kcal)} kcal</Text> : missing.has(d) ? <Badge tone="warning">Nothing logged</Badge> : <Txt muted>—</Txt>}
          </Pressable>
        )
      })}
    </Card>
  </>)
}

function Insights({ n, today, weekStartsOn, waterGoal, onOpenDay }: { n: ReturnType<typeof useNutrition>; today: string; weekStartsOn: 0 | 1; waterGoal: number; onOpenDay: (d: string) => void }) {
  const { colors } = useTheme()
  const [view, setView] = useState<View_>('daily')
  const [month, setMonth] = useState<string | null>(null)
  const anchor = view === 'monthly' ? (month ?? monthStart(today)) : today
  const range = useMemo(() => viewRange(view, anchor, weekStartsOn), [view, anchor, weekStartsOn])
  const a: any = useMemo(() => analyze(n.logs, range.from, range.to, n.goals), [n.logs, range, n.goals])
  const weeks = useMemo(() => (view === 'weekly' ? weeklyTrend(n.logs, today, 8, weekStartsOn) : []), [view, n.logs, today, weekStartsOn])
  const goal = n.goals.kcal
  const calorieData = view === 'weekly' ? weeks.map((w: any) => ({ label: w.label, value: w.kcal })) : a.series.map((p: any) => ({ label: view === 'monthly' ? String(p.day) : p.short, value: p.logged ? Math.round(p.kcal) : null }))
  const waterByDay = new Map<string, number>(n.healthLogs.map((h: any) => [h.log_date, h.water_ml]))
  const waterDays = eachDay(range.from, range.to).map((d) => waterByDay.get(d) || 0).filter(Boolean)
  const avgWater = waterDays.length ? Math.round(waterDays.reduce((s, v) => s + v, 0) / waterDays.length) : null
  const hasData = a.averages.loggedDays > 0
  const standout = (label: string, p: any) => p && (
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={`${label}: ${Math.round(p.kcal)} calories on ${fmtDay(p.d, 'd MMMM')}`} onPress={() => onOpenDay(p.d)} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Txt variant="small" muted>{label}</Txt>
      <Text style={{ color: colors.foreground, fontWeight: '600' }}>{fmtKcal(p.kcal)} · {fmtDay(p.d, 'EEE, d MMM')}</Text>
    </Pressable>
  )
  return (<>
    <Segmented value={view} onChange={setView} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
    {view === 'monthly' ? <MonthNav month={anchor} thisMonth={monthStart(today)} onChange={setMonth} /> : <Txt variant="small" muted>{view === 'daily' ? 'Last 14 days' : 'Last 8 weeks'}</Txt>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <StatTile label="Avg daily calories" value={a.averages.kcal == null ? '—' : fmtKcal(a.averages.kcal)} sub={goal ? `goal ${fmtKcal(goal)}` : 'on days you logged'} />
      <StatTile label="Days logged" value={`${a.averages.loggedDays} / ${a.series.filter((p: any) => p.d <= today).length}`} sub={`${Math.round(a.totals.kcal).toLocaleString('en-IN')} kcal in total`} />
      <StatTile label="Avg protein" value={a.averages.protein_g == null ? '—' : `${a.averages.protein_g} g`} sub={n.goals.protein_g ? `goal ${n.goals.protein_g} g` : 'per logged day'} />
      <StatTile label="Avg water" value={avgWater == null ? '—' : `${avgWater} ml`} sub={waterGoal ? `goal ${waterGoal} ml` : 'per day with water'} />
    </View>
    <Card>
      <Txt variant="heading">{view === 'weekly' ? 'Average daily calories per week' : 'Calories per day'}</Txt>
      {hasData ? <BarChart data={calorieData} unit=" kcal" refLine={goal || undefined} summary={`Calories: ${calorieData.filter((d: any) => d.value != null).map((d: any) => `${d.label} ${d.value}`).join(', ')}`} /> : <Txt muted>Log some meals to see your calories here.</Txt>}
    </Card>
    <Card>
      <Txt variant="heading">Protein, carbs and fat</Txt>
      {hasData ? (<>
        <DonutChart slices={a.macros.map((m: any) => ({ label: MACRO_NAME[m.key], value: m.kcal, color: MACRO_COLOR[m.key] }))} centerLabel={fmtKcal(a.averages.kcal)} summary={a.macros.map((m: any) => `${MACRO_NAME[m.key]} ${m.percent}%`).join(', ')} />
        {a.macros.map((m: any) => <View key={m.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: MACRO_COLOR[m.key] }} /><View style={{ flex: 1 }}><Txt>{MACRO_NAME[m.key]}</Txt></View><Txt muted>{m.grams} g avg</Txt><Txt>{m.percent}%</Txt></View>)}
      </>) : <Txt muted>Macros appear once you log food.</Txt>}
    </Card>
    <Card>
      <Txt variant="heading">Calories by meal</Txt>
      {a.meals.map((m: any) => (
        <View key={m.id} style={{ gap: 4, marginTop: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt>{m.label}</Txt><Txt muted>{Math.round(m.kcal).toLocaleString('en-IN')} kcal · {m.percent}%</Txt></View>
          <ProgressBar value={m.percent} label={`${m.label} share of calories`} />
        </View>
      ))}
    </Card>
    <Card>
      <Txt variant="heading">Standout days</Txt>
      {hasData ? <>{goal > 0 ? standout('Closest to your calorie goal', a.days.closest) : null}{standout('Highest calories', a.days.highest)}{standout('Lowest calories', a.days.lowest)}</> : <Txt muted>Standout days appear once you log food.</Txt>}
    </Card>
    <Card>
      <Txt variant="heading">Food history</Txt>
      {a.top.length === 0 ? <Txt muted>Foods you log will be counted here.</Txt> : a.top.map((f: any) => (
        <View key={f.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 }}>
          <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: '500' }}>{f.name}</Text><Txt variant="small" muted>last {fmtDay(f.last, 'd MMM')}</Txt></View>
          <Txt>{f.count}×</Txt><Txt muted>{Math.round(f.kcal)} kcal</Txt>
        </View>
      ))}
    </Card>
  </>)
}

function Foods({ n, categories, toggleFavorite, onCreate, onEdit, onRemove }: { n: ReturnType<typeof useNutrition>; categories: string[]; toggleFavorite: (ref: string) => void; onCreate: () => void; onEdit: (f: any) => void; onRemove: (f: any) => void }) {
  const { colors } = useTheme()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'all' | 'mine' | 'favorites'>('all')
  const [category, setCategory] = useState('all')
  const [menu, setMenu] = useState<any | null>(null)
  const foods = useMemo(() => searchFoods(scope === 'mine' ? n.catalog.filter((f: any) => f.source !== 'starter') : n.catalog, { query, category, scope: scope === 'favorites' ? 'favorites' : 'all', favorites: n.favorites }), [n.catalog, n.favorites, query, scope, category])
  const cats = categoriesInUse(n.catalog, FOOD_CATEGORIES)
  const [shown, setShown] = useState(40)
  useEffect(() => setShown(40), [query, scope, category])
  return (<>
    <Card><Txt variant="small" muted>The built-in foods are approximate estimates for typical portions. Recipes, oil and portion size change the real numbers, and restaurant dishes vary most, so edit any food to match yours.</Txt></Card>
    <Button title="Create food" onPress={onCreate} />
    <Field label="Search foods" value={query} onChangeText={setQuery} placeholder="Search" />
    <Segmented value={scope} onChange={setScope} options={[{ value: 'all', label: 'All' }, { value: 'mine', label: 'Mine' }, { value: 'favorites', label: 'Favourites' }]} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Chip label="All" selected={category === 'all'} onPress={() => setCategory('all')} />
      {cats.map((c) => <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />)}
    </View>
    {foods.length === 0 ? <EmptyState title={scope === 'mine' ? 'No foods of your own yet' : scope === 'favorites' ? 'No favourites yet' : 'No match'} description={scope === 'mine' ? 'Create a food, or edit a starter food to make it yours.' : 'Try another spelling.'} /> : (
      <Card>
        {foods.slice(0, shown).map((f: any) => (
          <View key={f.ref} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${f.name}, ${Math.round(f.kcal)} calories. Actions`} onPress={() => setMenu(f)} style={{ flex: 1, minHeight: 60, paddingVertical: 6, justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <Text style={{ color: colors.foreground, fontWeight: '500', fontSize: 16 }}>{f.name}</Text>
                {f.source === 'custom' ? <Badge tone="primary">Yours</Badge> : f.source === 'edited' ? <Badge tone="primary">Edited</Badge> : <Badge>≈ {((ESTIMATE_BASIS as any)[f.basis]?.label ?? 'estimate').toLowerCase()}</Badge>}
              </View>
              <Txt variant="small" muted>{f.category} · {f.serving_label}</Txt>
              <Txt variant="small" muted>P {f.protein_g} · C {f.carbs_g} · F {f.fat_g} · Fibre {f.fiber_g}</Txt>
            </Pressable>
            <Text style={{ color: colors.foreground, fontWeight: '700' }}>{Math.round(f.kcal)}</Text>
            <Star on={n.favorites.includes(f.ref)} onPress={() => toggleFavorite(f.ref)} name={f.name} />
          </View>
        ))}
      </Card>
    )}
    {foods.length > shown ? <Button title={`Show more (${foods.length - shown} more)`} variant="ghost" onPress={() => setShown((c: number) => c + 40)} /> : null}
    <Txt variant="small" muted>{foods.length} food{foods.length === 1 ? '' : 's'}</Txt>
    <ActionSheet visible={!!menu} title={menu?.name ?? ''} onClose={() => setMenu(null)} actions={menu ? [
      { label: 'Edit', onPress: () => onEdit(menu) },
      { label: 'Reset to original', hidden: menu.source !== 'edited', onPress: () => onRemove(menu) },
      { label: 'Delete', destructive: true, hidden: menu.source !== 'custom', onPress: () => onRemove(menu) },
    ] : []} />
  </>)
}
