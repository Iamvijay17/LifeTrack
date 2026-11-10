import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { imagePair, suggestExercises } from '@lifetrack/core/exerciseCatalog'
import { useTheme } from '../../providers/ThemeProvider'
import { Sheet } from '../../ui/Sheet'
import { Field } from '../../ui'
import { ExerciseImage } from './ExerciseDatabase'
import { useExerciseCatalog } from './exerciseDb'

function Suggestions({ library, onPick }: { library: any[]; onPick: (name: string) => void }) {
  const { colors } = useTheme()
  const { catalog } = useExerciseCatalog() // loads when the sheet opens; without it the list still works, just without photos
  const [query, setQuery] = useState('')
  const items = useMemo(() => suggestExercises({ library, catalog: catalog?.exercises as any, query }) as any[], [library, catalog, query])
  return (<>
    <Field label="Search" value={query} onChangeText={setQuery} placeholder="Type to search your exercises and the database" autoCorrect={false} />
    {items.length === 0 ? <Text style={{ color: colors.mutedForeground }}>No exercises match. Use the Name field to type your own.</Text> : null}
    {items.map((it, i) => (
      <View key={it.key} style={{ gap: 4 }}>
        {it.kind === 'database' && items[i - 1]?.kind !== 'database' ? <Text accessibilityRole="header" style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 }}>From the exercise database</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`${it.name}${it.detail ? `, ${it.detail}` : ''}`} onPress={() => onPick(it.name)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 56 }}>
          <View style={{ width: 80 }}><ExerciseImage path={imagePair(it.entry).start} alt={`${it.name}: starting position`} width={80} label="" /></View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 16, fontWeight: '600' }}>{it.name}</Text>
            {it.detail ? <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 13 }}>{it.detail}</Text> : null}
          </View>
        </Pressable>
      </View>
    ))}
  </>)
}

/** "Pick from library…" for a workout or routine row: opens a sheet of your exercises (then the exercise database) with a photo beside each name. */
export function ExercisePickerField({ label, library, onChange, placeholder = 'Pick from library…' }: { label: string; library: any[]; onChange: (name: string) => void; placeholder?: string }) {
  const { colors, radius } = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.foreground, fontWeight: '500' }}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: none`} onPress={() => setOpen(true)} style={{ minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, paddingHorizontal: 12, justifyContent: 'center' }}>
        <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 16 }}>{placeholder}  ▾</Text>
      </Pressable>
      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        {open ? <Suggestions library={library} onPick={(name) => { onChange(name); setOpen(false) }} /> : null}
      </Sheet>
    </View>
  )
}
