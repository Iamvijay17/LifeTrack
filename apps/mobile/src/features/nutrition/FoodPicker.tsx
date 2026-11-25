import { useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ESTIMATE_BASIS, FOOD_CATEGORIES } from '@lifetrack/constants/foods'
import { MEALS, MEAL_LABEL, categoriesInUse, customServing, entryDraftFromFood, entryRow, foodNutrition, recentFoods, scaleNutrition, searchFoods, servingOptions, servingUnit, supportsCustomWeight } from '@lifetrack/core/nutrition'
import { store } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useTheme } from '../../providers/ThemeProvider'
import { Sheet } from '../../ui/Sheet'
import { Badge, Chip, ChipGroup, EmptyState, Segmented } from '../../ui/controls'
import { Button, Field, Txt } from '../../ui'

type Scope = 'all' | 'recent' | 'favorites'
const CUSTOM_WEIGHT = '__custom_weight__'
const PAGE = 40

export function Star({ on, onPress, name }: { on: boolean; onPress: () => void; name: string }) {
  const { colors } = useTheme()
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`} accessibilityState={{ selected: on }} onPress={onPress} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={on ? 'star' : 'star-outline'} size={20} color={on ? colors.warning : colors.mutedForeground} />
    </Pressable>
  )
}

function Detail({ food, ctx, favorite, onToggleFavorite, onBack, onSaved, onDetails }: { food: any; ctx: { date: string; meal: string; time: string }; favorite: boolean; onToggleFavorite: () => void; onBack: () => void; onSaved: () => void; onDetails: (draft: any) => void }) {
  const { colors } = useTheme()
  const options = servingOptions(food)
  const [variant, setVariant] = useState('')
  const [servingLabel, setServingLabel] = useState(options[0].label)
  const [grams, setGrams] = useState('')
  const [qty, setQty] = useState('1')
  const [meal, setMeal] = useState(ctx.meal)
  const byWeight = servingLabel === CUSTOM_WEIGHT
  const unit = servingUnit(food)
  const customOption = byWeight ? customServing(food, grams) : null
  const serving = byWeight ? customOption ?? options[0] : options.find((o: any) => o.label === servingLabel) ?? options[0]
  const q = Number(qty)
  const valid = q > 0 && q <= 100 && (!byWeight || !!customOption)
  const total = scaleNutrition(scaleNutrition(foodNutrition(food, variant), 1, serving.factor), valid ? q : 0)
  const draft = () => entryDraftFromFood(food, { variant, serving, quantity: valid ? Math.round(q * 100) / 100 : 1, meal, date: ctx.date, time: ctx.time })
  const [add, pending] = useAction(async () => { await store.insert('food_logs', entryRow(draft())); onSaved() })
  const step = (d: number) => setQty(String(Math.max(0.5, Math.round(((valid ? q : 1) + d) * 100) / 100)))
  return (<>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to results" onPress={onBack} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="arrow-back" size={22} color={colors.foreground} /></Pressable>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '600' }}>{food.name}</Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Txt variant="small" muted>{food.category}</Txt>{food.approximate ? <Badge tone="warning">{(ESTIMATE_BASIS as any)[food.basis]?.label ?? 'Approximate'}</Badge> : null}</View>
        {food.approximate ? <Txt variant="small" muted>{(ESTIMATE_BASIS as any)[food.basis]?.hint ?? ESTIMATE_BASIS.recipe.hint} You can change the numbers when you add it.</Txt> : null}
      </View>
      <Star on={favorite} onPress={onToggleFavorite} name={food.name} />
    </View>
    {food.variants.length > 0 ? <ChipGroup label="Preparation" value={variant} options={[{ value: '', label: 'Standard' }, ...food.variants.map((v: any) => ({ value: v.label, label: v.label }))]} onChange={setVariant} /> : null}
    <ChipGroup label="Serving size" value={servingLabel} options={[...options.map((o: any) => ({ value: o.label, label: o.label })), ...(supportsCustomWeight(food) ? [{ value: CUSTOM_WEIGHT, label: 'Custom weight' }] : [])]} onChange={setServingLabel} />
    {byWeight ? <Field label={`Amount in ${unit === 'ml' ? 'millilitres' : 'grams'}`} value={grams} onChangeText={setGrams} keyboardType="decimal-pad" placeholder="e.g. 175" error={grams !== '' && !customOption ? 'Enter an amount above 0' : undefined} /> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1 }}><Txt>How many?</Txt></View>
      <Button title="−" variant="ghost" onPress={() => step(-0.5)} />
      <View style={{ width: 84 }}><Field label="Quantity" value={qty} onChangeText={setQty} keyboardType="decimal-pad" error={valid ? undefined : 'Enter 0.01–100'} /></View>
      <Button title="+" variant="ghost" onPress={() => step(0.5)} />
    </View>
    <View accessibilityLiveRegion="polite" style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted }}>
      <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: '700' }}>{Math.round(total.kcal)} <Text style={{ fontSize: 14, fontWeight: '400', color: colors.mutedForeground }}>kcal</Text></Text>
      <Txt variant="small" muted>Protein {total.protein_g} g · Carbs {total.carbs_g} g · Fat {total.fat_g} g · Fibre {total.fiber_g} g</Txt>
    </View>
    <ChipGroup label="Meal" value={meal} options={MEALS.map((m) => ({ value: m.id, label: m.label }))} onChange={setMeal} />
    <Button title={`Add to ${MEAL_LABEL[meal]}`} onPress={() => add()} loading={pending} disabled={!valid} />
    <Button title="Add notes, date or time" variant="ghost" onPress={() => onDetails(draft())} />
  </>)
}

/** Search foods, then pick preparation, serving and quantity with live nutrition. */
export function FoodPicker({ visible, onClose, catalog, favorites, logs, ctx, onToggleFavorite, onManual, onDetails }: { visible: boolean; onClose: () => void; catalog: any[]; favorites: string[]; logs: any[]; ctx: { date: string; meal: string; time: string }; onToggleFavorite: (ref: string) => void; onManual: (name: string) => void; onDetails: (draft: any) => void }) {
  const { colors } = useTheme()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const [category, setCategory] = useState('all')
  const [picked, setPicked] = useState<string | null>(null)
  useEffect(() => { if (visible) { setQuery(''); setScope('all'); setCategory('all'); setPicked(null); setShown(PAGE) } }, [visible])
  const recentRefs = useMemo(() => recentFoods(logs, 40).map((r: any) => r.ref).filter(Boolean) as string[], [logs])
  const categories = useMemo(() => categoriesInUse(catalog, FOOD_CATEGORIES), [catalog])
  const [shown, setShown] = useState(PAGE)
  useEffect(() => setShown(PAGE), [query, scope, category])
  const results = useMemo(() => {
    const found = searchFoods(catalog, { query, category, scope, favorites, recentRefs })
    if (query.trim() || scope !== 'all') return found
    return [...found.filter((f: any) => f.meals.includes(ctx.meal)), ...found.filter((f: any) => !f.meals.includes(ctx.meal))]
  }, [catalog, query, category, scope, favorites, recentRefs, ctx.meal])
  const current = picked ? catalog.find((f) => f.ref === picked) : null
  return (
    <Sheet visible={visible} title={current ? 'Add food' : `Add to ${MEAL_LABEL[ctx.meal]}`} onClose={onClose}>
      {current ? (
        <Detail key={current.ref} food={current} ctx={ctx} favorite={favorites.includes(current.ref)} onToggleFavorite={() => onToggleFavorite(current.ref)} onBack={() => setPicked(null)} onSaved={onClose} onDetails={onDetails} />
      ) : (<>
        <Field label="Search foods" value={query} onChangeText={setQuery} placeholder="Idli, biryani, இட்லி…" autoFocus returnKeyType="search" />
        <Segmented value={scope} onChange={setScope} options={[{ value: 'all', label: 'All' }, { value: 'recent', label: 'Recent' }, { value: 'favorites', label: 'Favourites' }]} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="All" selected={category === 'all'} onPress={() => setCategory('all')} />
          {categories.map((c) => <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />)}
        </View>
        {results.length === 0 ? <EmptyState title={scope === 'favorites' ? 'No favourites yet' : scope === 'recent' ? 'Nothing eaten recently' : 'No match'} description={scope === 'favorites' ? 'Tap the star on a food to keep it here.' : 'Try another spelling, or enter it yourself.'} /> : results.slice(0, shown).map((f: any) => (
          <View key={f.ref} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${f.name}, ${Math.round(f.kcal)} calories`} onPress={() => setPicked(f.ref)} style={{ flex: 1, minHeight: 56, paddingVertical: 6, justifyContent: 'center' }}>
              <Text style={{ color: colors.foreground, fontWeight: '500', fontSize: 16 }}>{f.name}{f.source !== 'starter' ? <Text style={{ color: colors.primary, fontSize: 12 }}>{f.source === 'custom' ? '  yours' : '  edited'}</Text> : null}</Text>
              <Txt variant="small" muted>{f.serving_label} · P {f.protein_g} · C {f.carbs_g} · F {f.fat_g}</Txt>
            </Pressable>
            <Text style={{ color: colors.foreground, fontWeight: '700' }}>{Math.round(f.kcal)}<Text style={{ color: colors.mutedForeground, fontWeight: '400', fontSize: 12 }}> kcal</Text></Text>
            <Star on={favorites.includes(f.ref)} onPress={() => onToggleFavorite(f.ref)} name={f.name} />
          </View>
        ))}
        {results.length > shown ? <Button title={`Show more (${results.length - shown} more)`} variant="ghost" onPress={() => setShown((c: number) => c + PAGE)} /> : null}
        <Txt variant="small" muted>{results.length} food{results.length === 1 ? '' : 's'} · Built-in values are approximate. Edit any food in the Foods tab.</Txt>
        <Button title="Enter manually" variant="ghost" onPress={() => onManual(query.trim())} />
      </>)}
    </Sheet>
  )
}
