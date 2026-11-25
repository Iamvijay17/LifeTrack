import { useState } from 'react'
import { Text, View } from 'react-native'
import { explainScore } from '@lifetrack/core/score'
import { scoreTone } from '@lifetrack/core/dashboard'
import { useTheme } from '../../providers/ThemeProvider'
import { Sheet } from '../../ui/Sheet'
import { ProgressBar } from '../../ui/controls'
import { AnimatedNumber, ProgressRing } from '../../ui/motion'
import { Button, Card, Txt } from '../../ui'

/** Circular progress. `percent` null = nothing planned (shows a dash, never a made-up number). */
export function Ring({ percent, size = 112 }: { percent: number | null; size?: number }) {
  const { colors } = useTheme()
  return (
    <ProgressRing value={percent} size={size} stroke={10} label="Today's progress">
      {percent == null ? <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: '600' }}>—</Text> : <AnimatedNumber value={`${percent}%`} style={{ color: colors.foreground, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 }} />}
    </ProgressRing>
  )
}

const SCORE_RING = { success: ['#34D399', '#059669'], warning: ['#FBBF24', '#F97316'] } as const

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
      <View style={{ alignItems: 'center', paddingVertical: 6, gap: 6 }}>
        <ProgressRing value={s} size={132} stroke={11} colors={tone === 'primary' ? undefined : [SCORE_RING[tone][0], SCORE_RING[tone][1]]} label="Daily score">
          <View accessible accessibilityLabel={s == null ? 'No score yet' : `Score ${s} out of 100`} style={{ alignItems: 'center' }}>
            {s == null ? <Text style={{ color: colors.foreground, fontSize: 36, fontWeight: '700' }}>—</Text> : <AnimatedNumber value={s} style={{ color: colors.foreground, fontSize: 36, fontWeight: '700', letterSpacing: -1 }} />}
            <Txt variant="small" muted>/ 100</Txt>
          </View>
        </ProgressRing>
        {weekAvg != null ? <Txt variant="small" muted>week avg {weekAvg}</Txt> : null}
      </View>
      {s == null ? <Txt variant="small" muted>Nothing planned or logged yet — rest days and empty categories are never counted as zero.</Txt> : null}
      {result.categories.map((c: any) => (
        <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 }}>
          <Text style={{ width: 84, color: colors.mutedForeground, fontSize: 12 }} numberOfLines={1}>{c.label}</Text>
          <View style={{ flex: 1 }}>{c.applicable ? <ProgressBar value={c.fraction * 100} color={c.fraction >= 1 ? colors.success : undefined} label={c.label} /> : <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>not planned</Text>}</View>
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
