import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Easing, Pressable, RefreshControl, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { ModuleName } from '@lifetrack/design-tokens'
import { addDays, addMonths, fmtDay, isValidDay, parseDay } from '@lifetrack/utils'
import { useTheme } from '../providers/ThemeProvider'
import { useSettings } from '../hooks/useSettings'
import { Button, Txt } from './index'
import { Sheet } from './Sheet'
import { Accent, useAccent } from './accent'
import { AnimatedNumber, FadeIn, IconTile, PressableScale, Skeleton } from './motion'

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function Chip({ label, selected, onPress, color }: { label: string; selected?: boolean; onPress: () => void; color?: string }) {
  const { colors } = useTheme()
  const accent = useAccent()
  const tint = color ?? accent.from
  return (
    <PressableScale accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={onPress} hitSlop={4}
      style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: selected ? tint : colors.border, backgroundColor: selected ? tint + '26' : 'transparent', justifyContent: 'center' }}>
      <Text style={{ color: selected ? colors.foreground : colors.mutedForeground, fontWeight: selected ? '600' : '400' }}>{label}</Text>
    </PressableScale>
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
  const accent = useAccent()
  const c = tone === 'neutral' ? colors.mutedForeground : tone === 'primary' ? accent.text : colors[tone]
  return <Text style={{ color: c, backgroundColor: c + '22', fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' }}>{children}</Text>
}

const BAR_EASE = Easing.bezier(0.22, 1, 0.36, 1)
export function ProgressBar({ value, color, label }: { value: number; color?: string; label: string }) {
  const { colors } = useTheme()
  const accent = useAccent()
  const pct = Math.max(0, Math.min(100, value))
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => { Animated.timing(v, { toValue: pct / 100, duration: 700, easing: BAR_EASE, useNativeDriver: true }).start() }, [pct]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }} style={{ height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: 'hidden' }}>
      <Animated.View style={{ width: '100%', height: 6, borderRadius: 3, backgroundColor: color ?? accent.from, transformOrigin: 'left', transform: [{ scaleX: v }] }} />
    </View>
  )
}

type IconName = React.ComponentProps<typeof Ionicons>['name']
/** One number with its label. `module` gives it that module's colour (a dashboard tile); `icon` draws its icon. */
export function StatTile({ label, value, sub, progress, tone, module, icon, onPress }: { label: string; value: string | number; sub?: string; progress?: number | null; tone?: 'success' | 'warning'; module?: ModuleName; icon?: IconName; onPress?: () => void }) {
  const { colors, radius } = useTheme()
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <View style={{ flex: 1 }}><Txt variant="small" muted>{label}</Txt></View>
        {icon ? <IconTile name={icon} size={26} soft module={module} /> : null}
      </View>
      <AnimatedNumber value={value} style={{ color: colors.foreground, fontSize: 21, fontWeight: '700', letterSpacing: -0.4 }} />
      {sub ? <Txt variant="small" muted>{sub}</Txt> : null}
      {progress != null ? <View style={{ marginTop: 4 }}><ProgressBar value={progress} color={tone ? colors[tone] : undefined} label={label} /></View> : null}
    </>
  )
  const tile = { flexBasis: '47%' as const, flexGrow: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4 }
  const content = onPress
    ? <PressableScale scaleTo={0.97} accessibilityRole="link" accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={tile}>{body}</PressableScale>
    : <View style={tile}>{body}</View>
  return module ? <Accent module={module}>{content}</Accent> : content
}

export function EmptyState({ title, description, action, icon = 'sparkles-outline' }: { title: string; description?: string; action?: { label: string; onPress: () => void }; icon?: IconName }) {
  return (
    <FadeIn style={{ alignItems: 'center', padding: 24, gap: 10 }}>
      <IconTile name={icon} size={48} />
      <Txt variant="heading">{title}</Txt>
      {description ? <Txt muted style={{ textAlign: 'center' }}>{description}</Txt> : null}
      {action ? <Button title={action.label} onPress={action.onPress} /> : null}
    </FadeIn>
  )
}

/** Loading / error / content gate with retry. */
export function DataGate({ loading, error, onRetry, children }: { loading: boolean; error: Error | null; onRetry: () => void; children: ReactNode }) {
  if (loading) {
    return (
      <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading" style={{ gap: 12 }}>
        <Skeleton height={96} radius={18} />
        <View style={{ flexDirection: 'row', gap: 10 }}><Skeleton height={76} width="48%" radius={14} /><Skeleton height={76} width="48%" radius={14} /></View>
        <Skeleton height={140} radius={18} />
      </View>
    )
  }
  if (error) return <EmptyState icon="cloud-offline-outline" title="Could not load" description={error.message} action={{ label: 'Try again', onPress: onRetry }} />
  return <FadeIn style={{ gap: 14 }}>{children}</FadeIn>
}

export const pullToRefresh = (refreshing: boolean, onRefresh: () => void) => <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />

/** Previous / next day with a "Today" shortcut. */
export function DateNav({ date, today, onChange }: { date: string; today: string; onChange: (d: string) => void }) {
  const { colors } = useTheme()
  const isToday = date === today
  const btn = (label: string, a11y: string, to: string) => (
    <PressableScale accessibilityRole="button" accessibilityLabel={a11y} onPress={() => onChange(to)} hitSlop={6} scaleTo={0.92}
      style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={label === '‹' ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.foreground} />
    </PressableScale>
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

const pad2 = (n: number) => String(n).padStart(2, '0')
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** In-app month calendar sheet. `value` / result are 'yyyy-MM-dd'. */
function CalendarSheet({ visible, title, value, onClose, onPick, onClear }: { visible: boolean; title: string; value: string; onClose: () => void; onPick: (v: string) => void; onClear?: () => void }) {
  const { colors } = useTheme()
  const { settings } = useSettings()
  const weekStart = Number(settings.week_starts_on) === 0 ? 0 : 1
  const today = ymd(new Date())
  const base = isValidDay(value) ? parseDay(value) : new Date()
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() })
  useEffect(() => { if (visible) setView({ y: base.getFullYear(), m: base.getMonth() }) }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps
  const shift = (dm: number) => setView((v) => { const d = new Date(v.y, v.m + dm, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const lead = (new Date(view.y, view.m, 1).getDay() - weekStart + 7) % 7
  const days = new Date(view.y, view.m + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)
  const heads = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(i + weekStart) % 7])
  const nav = (label: string, a11y: string, dm: number) => (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={() => shift(dm)} hitSlop={6}
      style={{ width: 44, height: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.foreground, fontSize: 20 }}>{label}</Text>
    </Pressable>
  )
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {nav('«', 'Previous year', -12)}
        {nav('‹', 'Previous month', -1)}
        <Text accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: 'center', color: colors.foreground, fontWeight: '600', fontSize: 16 }}>{fmtDay(`${view.y}-${pad2(view.m + 1)}-01`, 'MMMM yyyy')}</Text>
        {nav('›', 'Next month', 1)}
        {nav('»', 'Next year', 12)}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {heads.map((h) => <Text key={h} style={{ flex: 1, textAlign: 'center', color: colors.mutedForeground, fontSize: 12, fontWeight: '600' }}>{h}</Text>)}
      </View>
      <View style={{ gap: 4 }}>
        {Array.from({ length: cells.length / 7 }, (_, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 4 }}>
            {cells.slice(r * 7, r * 7 + 7).map((d, i) => {
              if (d == null) return <View key={i} style={{ flex: 1, height: 44 }} />
              const iso = `${view.y}-${pad2(view.m + 1)}-${pad2(d)}`
              const sel = iso === value
              const isToday = iso === today
              return (
                <Pressable key={i} accessibilityRole="button" accessibilityState={{ selected: sel }} accessibilityLabel={fmtDay(iso, 'EEEE, d MMMM yyyy')} onPress={() => onPick(iso)}
                  style={{ flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? colors.primary : 'transparent', borderWidth: isToday && !sel ? 1 : 0, borderColor: colors.primary }}>
                  <Text style={{ color: sel ? colors.primaryForeground : colors.foreground, fontWeight: sel || isToday ? '700' : '400', fontSize: 15 }}>{d}</Text>
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'space-between' }}>
        <Button title="Today" variant="ghost" onPress={() => onPick(today)} />
        {onClear ? <Button title="Clear" variant="ghost" onPress={onClear} /> : null}
      </View>
    </Sheet>
  )
}

/** Date field with our own calendar sheet; value is 'yyyy-MM-dd' ('' = empty). */
export function DateField({ label, value, onChange, error, clearable }: { label: string; value: string; onChange: (v: string) => void; error?: string; clearable?: boolean }) {
  const { colors, radius } = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.foreground, fontWeight: '500' }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ? fmtDay(value, 'd MMM yyyy') : 'not set'}`} onPress={() => setOpen(true)}
          style={{ flex: 1, minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: error ? colors.danger : colors.border, backgroundColor: colors.surface2, paddingHorizontal: 12, justifyContent: 'center' }}>
          <Text style={{ color: value ? colors.foreground : colors.mutedForeground, fontSize: 16 }}>{value ? fmtDay(value, 'EEE, d MMM yyyy') : 'Not set'}  ▾</Text>
        </Pressable>
        {clearable && value ? <Button title="Clear" variant="ghost" onPress={() => onChange('')} /> : null}
      </View>
      {error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
      <CalendarSheet visible={open} title={label} value={value} onClose={() => setOpen(false)} onPick={(v) => { onChange(v); setOpen(false) }} onClear={clearable && value ? () => { onChange(''); setOpen(false) } : undefined} />
    </View>
  )
}

/** Segmented control for 2–4 mutually exclusive views. A pill slides to the chosen one. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const { colors, radius } = useTheme()
  const [width, setWidth] = useState(0)
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const slot = width / Math.max(1, options.length)
  const x = useRef(new Animated.Value(index)).current
  useEffect(() => { Animated.spring(x, { toValue: index, stiffness: 420, damping: 32, mass: 0.8, useNativeDriver: true }).start() }, [index]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View accessibilityRole="tablist" onLayout={(e) => setWidth(e.nativeEvent.layout.width - 6)} style={{ flexDirection: 'row', backgroundColor: colors.muted, borderRadius: radius.lg, padding: 3 }}>
      {width > 0 ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 3, bottom: 3, left: 3, width: slot, borderRadius: radius.md, backgroundColor: colors.card, transform: [{ translateX: x.interpolate({ inputRange: [0, Math.max(1, options.length - 1)], outputRange: [0, slot * Math.max(1, options.length - 1)] }) }] }} />
      ) : null}
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md }}>
            <Text numberOfLines={1} style={{ color: on ? colors.foreground : colors.mutedForeground, fontWeight: on ? '600' : '400', fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export interface SelectOption { value: string; label: string; group?: string }
/** Dropdown replacement: a field that opens a sheet of (optionally grouped) choices. */
export function SelectField({ label, value, options, onChange, placeholder = 'Select…', error }: { label: string; value: string; options: SelectOption[]; onChange: (v: string) => void; placeholder?: string; error?: string }) {
  const { colors, radius } = useTheme()
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)
  const groups = [...new Set(options.map((o) => o.group ?? ''))]
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.foreground, fontWeight: '500' }}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? 'none'}`} onPress={() => setOpen(true)}
        style={{ minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: error ? colors.danger : colors.border, backgroundColor: colors.surface2, paddingHorizontal: 12, justifyContent: 'center' }}>
        <Text numberOfLines={1} style={{ color: current ? colors.foreground : colors.mutedForeground, fontSize: 16 }}>{current?.label ?? placeholder}  ▾</Text>
      </Pressable>
      {error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
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

const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i))
const MINUTES = Array.from({ length: 12 }, (_, i) => pad2(i * 5))

/** Time field with our own hour / minute sheet; value is 'HH:mm' ('' = empty). */
export function TimeField({ label, value, onChange, error, clearable }: { label: string; value: string; onChange: (v: string) => void; error?: string; clearable?: boolean }) {
  const { colors, radius } = useTheme()
  const [open, setOpen] = useState(false)
  const [h, m] = (value || '09:00').split(':')
  const minutes = MINUTES.includes(m) ? MINUTES : [...MINUTES, m].sort()
  const grid = (items: string[], current: string, pick: (v: string) => void, name: string) => (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>{name}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{items.map((v) => <Chip key={v} label={v} selected={v === current} onPress={() => pick(v)} />)}</View>
    </View>
  )
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Text style={{ color: colors.foreground, fontWeight: '500' }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value || 'not set'}`} onPress={() => setOpen(true)}
          style={{ flex: 1, minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: error ? colors.danger : colors.border, backgroundColor: colors.surface2, paddingHorizontal: 12, justifyContent: 'center' }}>
          <Text style={{ color: value ? colors.foreground : colors.mutedForeground, fontSize: 16 }}>{value || 'Not set'}</Text>
        </Pressable>
        {clearable && value ? <Button title="Clear" variant="ghost" onPress={() => onChange('')} /> : null}
      </View>
      {error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
      <Sheet visible={open} title={label} onClose={() => setOpen(false)} footer={<Button title="Done" onPress={() => setOpen(false)} />}>
        {grid(HOURS, h, (v) => onChange(`${v}:${m}`), 'Hour')}
        {grid(minutes, m, (v) => onChange(`${h}:${v}`), 'Minute')}
      </Sheet>
    </View>
  )
}

/** Previous / next month with a "This month" shortcut. `month` is 'yyyy-MM-01'. */
export function MonthNav({ month, thisMonth, onChange }: { month: string; thisMonth: string; onChange: (m: string | null) => void }) {
  const { colors } = useTheme()
  const btn = (label: string, a11y: string, to: string) => (
    <PressableScale accessibilityRole="button" accessibilityLabel={a11y} onPress={() => onChange(to)} hitSlop={6} scaleTo={0.92}
      style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={label === '‹' ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.foreground} />
    </PressableScale>
  )
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {btn('‹', 'Previous month', addMonths(month, -1))}
      <Text accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: 'center', color: colors.foreground, fontWeight: '600' }}>{fmtDay(month, 'MMMM yyyy')}</Text>
      {btn('›', 'Next month', addMonths(month, 1))}
      {month !== thisMonth ? <Button title="This month" variant="ghost" onPress={() => onChange(null)} /> : null}
    </View>
  )
}
