import { useState } from 'react'
import { View, Text } from 'react-native'
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg'
import { useTheme } from '../providers/ThemeProvider'

/** Simple vertical bar chart. `data`: [{ label, value }]. Accessible summary replaces per-bar tooltips. */
export function BarChart({ data, height = 160, color, unit = '', summary }: { data: { label: string; value: number }[]; height?: number; color?: string; unit?: string; summary: string }) {
  const { colors } = useTheme()
  const [w, setW] = useState(0)
  const max = Math.max(1, ...data.map((d) => d.value))
  const padB = 22, padT = 16
  const plotH = height - padB - padT
  const slot = w / Math.max(1, data.length)
  const bar = Math.min(28, slot * 0.6)
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={summary}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          <Line x1={0} x2={w} y1={height - padB} y2={height - padB} stroke={colors.border} strokeWidth={1} />
          {data.map((d, i) => {
            const h = (d.value / max) * plotH
            const x = i * slot + (slot - bar) / 2
            return (
              <G key={d.label}>
                <Rect x={x} y={height - padB - h} width={bar} height={Math.max(h, d.value > 0 ? 2 : 0)} rx={4} fill={color ?? colors.primary} />
                {d.value > 0 ? <SvgText x={x + bar / 2} y={height - padB - h - 4} fontSize={10} fill={colors.mutedForeground} textAnchor="middle">{d.value}{unit}</SvgText> : null}
                <SvgText x={x + bar / 2} y={height - 6} fontSize={11} fill={colors.mutedForeground} textAnchor="middle">{d.label}</SvgText>
              </G>
            )
          })}
        </Svg>
      ) : <View style={{ height }} />}
      {data.every((d) => d.value === 0) ? <Text style={{ position: 'absolute', alignSelf: 'center', top: height / 2 - 12, color: colors.mutedForeground }}>No data yet</Text> : null}
    </View>
  )
}
