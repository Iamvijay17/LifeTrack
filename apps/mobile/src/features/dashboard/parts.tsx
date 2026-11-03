import { useState } from 'react'
import { Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { explainScore } from '@lifetrack/core/score'
import { scoreTone } from '@lifetrack/core/dashboard'
import { useTheme } from '../../providers/ThemeProvider'
import { Sheet } from '../../ui/Sheet'
import { ProgressBar } from '../../ui/controls'
import { Button, Card, Txt } from '../../ui'

/** Circular progress. `percent` null = nothing planned (shows a dash, never a made-up number). */
export function Ring({ percent, size = 112 }: { percent: number | null; size?: number }) {
  const { colors } = useTheme()
  const r = size / 2 - 9, c = 2 * Math.PI * r
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Today's progress" accessibilityValue={percent == null ? undefined : { min: 0, max: 100, now: percent }} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.muted} strokeWidth={9} fill="none" />
        {percent != null ? <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.primary} strokeWidth={9} strokeLinecap="round" fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} /> : null}
      </Svg>
      <Text style={{ position: 'absolute', color: colors.foreground, fontSize: 24, fontWeight: '600' }}>{percent == null ? '—' : `${percent}%`}</Text>
    </View>
  )
}

export function ScoreCard({ result, weekAvg }: { result: any; weekAvg: number | null }) {
  const { colors } = useTheme()
  const [open, setOpen] = useState(false)
  const s = result.score as number | null
  const tone = scoreTone(s) as 'primary' | 'success' | 'warning'
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt variant="heading">Daily score</Txt>
        <Button title="How?" variant="ghost" onPress={() => setOpen(true)} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text accessibilityLabel={s == null ? 'No score yet' : `Score ${s} out of 100`} style={{ color: colors.foreground, fontSize: 40, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{s ?? '—'}</Text>
        <Txt muted>/ 100</Txt>
        {weekAvg != null ? <Txt variant="small" muted style={{ marginLeft: 'auto' }}>week avg {weekAvg}</Txt> : null}
      </View>
      <ProgressBar value={s ?? 0} color={colors[tone]} label="Daily score" />
      {s == null ? <Txt variant="small" muted>Nothing planned or logged yet — rest days and empty categories are never counted as zero.</Txt> : null}
      {result.categories.map((c: any) => (
        <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 }}>
          <Text style={{ width: 84, color: colors.mutedForeground, fontSize: 12 }} numberOfLines={1}>{c.label}</Text>
          <View style={{ flex: 1 }}>{c.applicable ? <ProgressBar value={c.fraction * 100} color={c.fraction >= 1 ? colors.success : colors.primary} label={c.label} /> : <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>not planned</Text>}</View>
          <Text style={{ width: 38, textAlign: 'right', color: colors.mutedForeground, fontSize: 12 }}>{c.applicable ? `${Math.round(c.fraction * 100)}%` : '—'}</Text>
        </View>
      ))}
      <Sheet visible={open} title="How your daily score works" onClose={() => setOpen(false)}>
        <Txt muted>{explainScore(result)}</Txt>
        {result.categories.map((c: any) => (
          <View key={c.key} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.foreground, fontWeight: '700' }}>{c.label}</Text>
              <Txt variant="small" muted>weight {c.weight}%{c.applicable && c.effectiveWeight > 0 ? ` → counts as ${Math.round(c.effectiveWeight)}%` : ''}</Txt>
            </View>
            <Txt variant="small" muted>{c.hint}</Txt>
            {c.applicable ? c.items.map((i: any) => <View key={i.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt variant="small">{i.label}</Txt><Txt variant="small" muted>{i.detail} · {Math.round(i.fraction * 100)}%</Txt></View>) : <Txt variant="small" muted>Nothing planned or logged — skipped.</Txt>}
          </View>
        ))}
        <Txt variant="small" muted>Change the weights in Settings → Daily score weights.</Txt>
      </Sheet>
    </Card>
  )
}
