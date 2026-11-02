import { useState, type ReactNode } from 'react'
import { ActivityIndicator, Platform, Pressable, RefreshControl, Text, View } from 'react-native'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { addDays, fmtDay, isValidDay, parseDay } from '@lifetrack/utils'
import { useTheme } from '../providers/ThemeProvider'
import { Button, Txt } from './index'
import { Sheet } from './Sheet'

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function Chip({ label, selected, onPress, color }: { label: string; selected?: boolean; onPress: () => void; color?: string }) {
  const { colors } = useTheme()
  const tint = color ?? colors.primary
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={onPress} hitSlop={4}
      style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: selected ? tint : colors.border, backgroundColor: selected ? tint + '26' : 'transparent', justifyContent: 'center' }}>
      <Text style={{ color: selected ? colors.foreground : colors.mutedForeground, fontWeight: selected ? '600' : '400' }}>{label}</Text>
    </Pressable>
  )
}

/** Single-choice chips. */
export function ChipGroup<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const { colors } = useTheme()
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.foreground, fontWeight: '500' }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{options.map((o) => <Chip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />)}</View>
    </View>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' }) {
  const { colors } = useTheme()
  const c = tone === 'neutral' ? colors.mutedForeground : colors[tone]
  return <Text style={{ color: c, backgroundColor: c + '22', fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' }}>{children}</Text>
}

export function ProgressBar({ value, color, label }: { value: number; color?: string; label: string }) {
  const { colors } = useTheme()
  const pct = Math.max(0, Math.min(100, value))
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }} style={{ height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: 6, backgroundColor: color ?? colors.primary }} />
    </View>
  )
}

export function StatTile({ label, value, sub, progress, tone }: { label: string; value: string | number; sub?: string; progress?: number | null; tone?: 'success' | 'warning' }) {
  const { colors, radius } = useTheme()
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4 }}>
      <Txt variant="small" muted>{label}</Txt>
      <Txt variant="heading">{value}</Txt>
      {sub ? <Txt variant="small" muted>{sub}</Txt> : null}
      {progress != null ? <ProgressBar value={progress} color={tone ? colors[tone] : undefined} label={label} /> : null}
    </View>
  )
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ alignItems: 'center', padding: 24, gap: 8 }}>
      <Txt variant="heading">{title}</Txt>
      {description ? <Txt muted style={{ textAlign: 'center' }}>{description}</Txt> : null}
      {action ? <Button title={action.label} onPress={action.onPress} /> : null}
    </View>
  )
}

/** Loading / error / content gate with retry. */
export function DataGate({ loading, error, onRetry, children }: { loading: boolean; error: Error | null; onRetry: () => void; children: ReactNode }) {
  const { colors } = useTheme()
  if (loading) return <View style={{ padding: 32 }}><ActivityIndicator color={colors.primary} accessibilityLabel="Loading" /></View>
  if (error) return <EmptyState title="Could not load" description={error.message} action={{ label: 'Try again', onPress: onRetry }} />
  return <>{children}</>
}

export const pullToRefresh = (refreshing: boolean, onRefresh: () => void) => <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />

/** Previous / next day with a "Today" shortcut. */
export function DateNav({ date, today, onChange }: { date: string; today: string; onChange: (d: string) => void }) {
  const { colors } = useTheme()
  const isToday = date === today
  const btn = (label: string, a11y: string, to: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={() => onChange(to)} hitSlop={6}
      style={{ width: 44, height: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.foreground, fontSize: 20 }}>{label}</Text>
    </Pressable>
  )
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {btn('‹', 'Previous day', addDays(date, -1))}
      <Text accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: 'center', color: colors.foreground, fontWeight: '600' }}>{isToday ? 'Today' : fmtDay(date, 'EEE, d MMM yyyy')}</Text>
      {btn('›', 'Next day', addDays(date, 1))}
      {!isToday ? <Button title="Today" variant="ghost" onPress={() => onChange(today)} /> : null}
    </View>
  )
}

/** Native date picker; value is 'yyyy-MM-dd' ('' = empty). */
export function DateField({ label, value, onChange, error, clearable }: { label: string; value: string; onChange: (v: string) => void; error?: string; clearable?: boolean }) {
  const { colors, radius } = useTheme()
  const date = isValidDay(value) ? parseDay(value) : new Date()
  const [open, setOpen] = useState(false)
  const show = () => {
    if (Platform.OS === 'android') DateTimePickerAndroid.open({ value: date, mode: 'date', onChange: (e, d) => { if (e.type === 'set' && d) onChange(ymd(d)) } })
    else setOpen((o) => !o)
  }
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.foreground, fontWeight: '500' }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ? fmtDay(value, 'd MMM yyyy') : 'not set'}`} onPress={show}
          style={{ flex: 1, minHeight: 48, borderRadius: radius.lg, borderWidth: 1, borderColor: error ? colors.danger : colors.border, backgroundColor: colors.card, paddingHorizontal: 12, justifyContent: 'center' }}>
          <Text style={{ color: value ? colors.foreground : colors.mutedForeground, fontSize: 16 }}>{value ? fmtDay(value, 'EEE, d MMM yyyy') : 'Not set'}</Text>
        </Pressable>
        {clearable && value ? <Button title="Clear" variant="ghost" onPress={() => onChange('')} /> : null}
      </View>
      {Platform.OS === 'ios' && open ? <DateTimePicker value={date} mode="date" display="inline" themeVariant={colors.background === 'rgb(9, 9, 11)' ? 'dark' : 'light'} onChange={(_e, d) => { if (d) onChange(ymd(d)) }} /> : null}
      {error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
    </View>
  )
}

/** Segmented control for 2–4 mutually exclusive views. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const { colors, radius } = useTheme()
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.muted, borderRadius: radius.lg, padding: 3 }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: on ? colors.card : 'transparent' }}>
            <Text numberOfLines={1} style={{ color: on ? colors.foreground : colors.mutedForeground, fontWeight: on ? '600' : '400', fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export interface SelectOption { value: string; label: string; group?: string }
/** Dropdown replacement: a field that opens a sheet of (optionally grouped) choices. */
export function SelectField({ label, value, options, onChange, placeholder = 'Select…' }: { label: string; value: string; options: SelectOption[]; onChange: (v: string) => void; placeholder?: string }) {
  const { colors, radius } = useTheme()
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)
  const groups = [...new Set(options.map((o) => o.group ?? ''))]
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.foreground, fontWeight: '500' }}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? 'none'}`} onPress={() => setOpen(true)}
        style={{ minHeight: 48, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 12, justifyContent: 'center' }}>
        <Text numberOfLines={1} style={{ color: current ? colors.foreground : colors.mutedForeground, fontSize: 16 }}>{current?.label ?? placeholder}  ▾</Text>
      </Pressable>
      <SelectSheet visible={open} title={label} groups={groups} options={options} value={value} onClose={() => setOpen(false)} onPick={(v) => { onChange(v); setOpen(false) }} />
    </View>
  )
}

function SelectSheet({ visible, title, groups, options, value, onClose, onPick }: { visible: boolean; title: string; groups: string[]; options: SelectOption[]; value: string; onClose: () => void; onPick: (v: string) => void }) {
  const { colors } = useTheme()
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      {groups.map((g) => (
        <View key={g || '_'} style={{ gap: 6 }}>
          {g ? <Text accessibilityRole="header" style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>{g}</Text> : null}
          {options.filter((o) => (o.group ?? '') === g).map((o) => (
            <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected: o.value === value }} onPress={() => onPick(o.value)}
              style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, backgroundColor: o.value === value ? colors.accent : 'transparent' }}>
              <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: o.value === value ? '600' : '400' }}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </Sheet>
  )
}
