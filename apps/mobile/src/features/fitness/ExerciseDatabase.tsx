import { useMemo, useState } from 'react'
import { ActivityIndicator, Image, Linking, Pressable, Text, View } from 'react-native'
import { CATALOG_CATEGORIES, categoryCounts, facetValues, hasImages, imagePair, inLibrary, libraryRowFor, searchCatalog } from '@lifetrack/core/exerciseCatalog'
import { store } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useTheme } from '../../providers/ThemeProvider'
import { Sheet } from '../../ui/Sheet'
import { Badge, Chip, SelectField } from '../../ui/controls'
import { Button, Field, Txt } from '../../ui'
import { type CatalogExercise, exerciseImageUrl, useExerciseCatalog } from './exerciseDb'

const PAGE = 24

/** One demonstration photo in the one frame used everywhere: 3:2, light neutral backdrop, `contain` so nothing is cropped or stretched. */
export function ExerciseImage({ path, alt, label, width }: { path: string | null | undefined; alt?: string; label: string; width?: number }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const uri = exerciseImageUrl(path)
  const frame = { aspectRatio: 3 / 2, width: width ?? ('100%' as const), borderRadius: 8, overflow: 'hidden' as const, backgroundColor: '#F5F5F5', alignItems: 'center' as const, justifyContent: 'center' as const }
  if (!uri || failed) return <View accessibilityRole="image" accessibilityLabel={label} style={frame}><Text style={{ color: '#525252', fontSize: 12, textAlign: 'center', paddingHorizontal: 8 }}>{label}</Text></View>
  return (
    <View style={frame}>
      <Image accessibilityLabel={alt ?? label} source={{ uri }} resizeMode="contain" style={{ width: '100%', height: '100%', opacity: loaded ? 1 : 0 }} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
      {!loaded ? <ActivityIndicator style={{ position: 'absolute' }} color="#737373" /> : null}
    </View>
  )
}

function Detail({ exercise: e, mine, onClose, source }: { exercise: CatalogExercise | null; mine: any; onClose: () => void; source: { source: string; url: string; license: string; licenseUrl: string } | null }) {
  const { colors } = useTheme()
  const [add, adding] = useAction(async () => { await store.insert('exercises', libraryRowFor(e as any)) })
  if (!e) return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>
  const { start, end } = imagePair(e)
  const none = !start && !end
  const rows: [string, string | null | undefined][] = [['Primary muscles', e.primary.join(', ')], ['Secondary muscles', e.secondary.join(', ')], ['Equipment', e.equipment], ['Level', e.level], ['Type', e.type], ['Force', e.force], ['Mechanic', e.mechanic]]
  return (
    <Sheet visible title={e.name} onClose={onClose} footer={mine ? <Txt muted>✓ In your exercises</Txt> : <Button title="Add to my exercises" loading={adding} onPress={async () => { if (await add()) onClose() }} />}>
      {none ? <ExerciseImage path={null} label="No demonstration images for this exercise" /> : (<>
        <View style={{ gap: 4 }}><ExerciseImage path={start} alt={`${e.name}: start position`} label={`${e.name}: no start image`} /><Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: 'center', letterSpacing: 0.5 }}>START</Text></View>
        <View style={{ gap: 4 }}><ExerciseImage path={end} alt={`${e.name}: end position`} label={`${e.name}: no end image`} /><Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: 'center', letterSpacing: 0.5 }}>END</Text></View>
      </>)}
      <View style={{ gap: 4 }}>{rows.filter(([, v]) => v).map(([k, v]) => <Text key={k} style={{ color: colors.foreground }}><Text style={{ color: colors.mutedForeground }}>{k}: </Text>{v}</Text>)}</View>
      <View style={{ gap: 6 }}>
        <Txt variant="heading">Instructions</Txt>
        {e.instructions.length ? e.instructions.map((s, i) => <Text key={i} style={{ color: colors.foreground, lineHeight: 21 }}>{i + 1}. {s}</Text>) : <Txt muted>The database has no written instructions for this exercise.</Txt>}
      </View>
      {source ? <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Exercise data and photos from <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(source.url)}>{source.source}</Text> — {source.license} (public domain).</Text> : null}
    </Sheet>
  )
}

/** Search and filter the whole exercise database; tap one for its start/end photos, instructions and an "Add" button. */
export function ExerciseDatabase({ library }: { library: any[] }) {
  const { colors } = useTheme()
  const { catalog, loading, error, retry } = useExerciseCatalog()
  const [f, setF] = useState({ query: '', category: '', equipment: '' })
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState<CatalogExercise | null>(null)
  const set = (patch: Partial<typeof f>) => { setF((c) => ({ ...c, ...patch })); setLimit(PAGE) }
  const all = catalog?.exercises
  const results = useMemo(() => (all ? (searchCatalog(all as any, f) as CatalogExercise[]) : []), [all, f])
  const counts = useMemo(() => (all ? categoryCounts(all as any, f) : {}) as Record<string, number>, [all, f])
  const equipment = useMemo(() => (all ? facetValues(all as any, 'equipment') : []), [all])

  if (error === 'NO_WEB_URL') return <Txt muted>The exercise database loads from the LifeTrack web app. Set EXPO_PUBLIC_WEB_URL in this build to enable it.</Txt>
  if (loading) return <ActivityIndicator accessibilityLabel="Loading exercises" />
  if (error || !catalog) return <View style={{ gap: 8 }}><Txt muted>{error ?? 'Could not load the exercise database.'}</Txt><Button title="Try again" variant="ghost" onPress={retry} /></View>

  const shown = results.slice(0, limit)
  return (
    <View style={{ gap: 12 }}>
      <Field label="Search exercises" placeholder={`${catalog.meta.count} exercises: name, muscle, equipment`} value={f.query} onChangeText={(query) => set({ query })} autoCorrect={false} returnKeyType="search" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label="All" selected={!f.category} onPress={() => set({ category: '' })} />
        {CATALOG_CATEGORIES.map((c) => <Chip key={c} label={`${c} ${counts[c] ?? 0}`} selected={f.category === c} onPress={() => set({ category: f.category === c ? '' : c })} />)}
      </View>
      <SelectField label="Equipment" value={f.equipment} placeholder="Any equipment" options={[{ value: '', label: 'Any equipment' }, ...equipment.map(([v, n]) => ({ value: String(v), label: `${v} (${n})` }))]} onChange={(equipment) => set({ equipment })} />
      <Text accessibilityLiveRegion="polite" style={{ color: colors.mutedForeground, fontSize: 13 }}>{results.length} {results.length === 1 ? 'exercise' : 'exercises'}</Text>
      {results.length === 0 ? <Txt muted>No exercises match. Try a different word or remove a filter.</Txt> : null}
      {shown.map((e) => (
        <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`${e.name}, ${e.category}, ${e.equipment}`} onPress={() => setOpen(e)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 64 }}>
          <View style={{ width: 96 }}><ExerciseImage path={imagePair(e).start} alt={`${e.name}: starting position`} width={96} label={hasImages(e) ? 'Unavailable' : 'No image'} /></View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text numberOfLines={2} style={{ color: colors.foreground, fontWeight: '600' }}>{e.name}</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}><Badge tone="primary">{e.category}</Badge><Badge>{e.equipment}</Badge></View>
          </View>
        </Pressable>
      ))}
      {results.length > limit ? <Button title={`Show ${Math.min(PAGE, results.length - limit)} more (${results.length - limit} hidden)`} variant="ghost" onPress={() => setLimit((n) => n + PAGE)} /> : null}
      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Exercise data and photos from Free Exercise DB — Unlicense (public domain).</Text>
      <Detail exercise={open} mine={open ? inLibrary(open as any, library) : null} source={catalog.meta} onClose={() => setOpen(null)} />
    </View>
  )
}
