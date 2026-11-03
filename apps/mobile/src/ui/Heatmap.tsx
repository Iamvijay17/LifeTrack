import type { ReactElement } from 'react'
import { ScrollView, View } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { colors as tokens, rgba } from '@lifetrack/design-tokens'
import { addDays, fmtDay, startOfWeek } from '@lifetrack/utils'
import { useTheme } from '../providers/ThemeProvider'

const CELL = 14, GAP = 3
const ALPHA = [0, 0.25, 0.45, 0.7, 1]

/** GitHub-style grid. `levels`: Map<'yyyy-MM-dd', 0..4>. Taps report the date. */
export function Heatmap({ levels, today, weeks = 20, weekStartsOn = 1, selected, onSelect }: { levels: Map<string, number>; today: string; weeks?: number; weekStartsOn?: number; selected?: string; onSelect?: (d: string) => void }) {
  const { colors, scheme } = useTheme()
  const first = addDays(startOfWeek(today, weekStartsOn), -(weeks - 1) * 7)
  const primary = tokens[scheme].primary
  const width = weeks * (CELL + GAP), height = 7 * (CELL + GAP)
  const cells: ReactElement[] = []
  for (let w = 0; w < weeks; w++) for (let d = 0; d < 7; d++) {
    const date = addDays(first, w * 7 + d)
    if (date > today) continue
    const lvl = levels.get(date) ?? 0
    cells.push(<Rect key={date} x={w * (CELL + GAP)} y={d * (CELL + GAP)} width={CELL} height={CELL} rx={3}
      fill={lvl === 0 ? colors.muted : rgba(primary, ALPHA[lvl])} stroke={selected === date ? colors.foreground : 'none'} strokeWidth={1.5} onPress={onSelect ? () => onSelect(date) : undefined} />)
  }
  const done = [...levels.values()].filter((l) => l > 0).length
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentOffset={{ x: Math.max(0, width), y: 0 }} accessible accessibilityRole="image" accessibilityLabel={`Activity heatmap, ${done} active days in the last ${weeks} weeks`}>
      <View><Svg width={width} height={height}>{cells}</Svg></View>
    </ScrollView>
  )
}
export const heatmapDateLabel = (d: string) => fmtDay(d, 'd MMM yyyy')
