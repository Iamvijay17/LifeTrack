import { useState } from 'react'
import { View, Text } from 'react-native'
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg'
import { useTheme } from '../providers/ThemeProvider'

/** Simple vertical bar chart. `data`: [{ label, value }]. Accessible summary replaces per-bar tooltips. */
export function BarChart({ data, height = 160, color, unit = '', summary, refLine, maxValue }: { data: { label: string; value: number | null }[]; height?: number; color?: string; unit?: string; summary: string; refLine?: number; maxValue?: number }) {
  const { colors } = useTheme()
  const [w, setW] = useState(0)
  const max = Math.max(1, maxValue ?? 0, refLine ?? 0, ...data.map((d) => d.value ?? 0))
  const padB = 22, padT = 16
  const plotH = height - padB - padT
  const slot = w / Math.max(1, data.length)
  const bar = Math.min(28, slot * 0.6)
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={summary}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          <Line x1={0} x2={w} y1={height - padB} y2={height - padB} stroke={colors.border} strokeWidth={1} />
          {refLine != null ? <Line x1={0} x2={w} y1={height - padB - (refLine / max) * plotH} y2={height - padB - (refLine / max) * plotH} stroke={colors.mutedForeground} strokeWidth={1} strokeDasharray="4 4" /> : null}
          {data.map((d, i) => {
            const v = d.value ?? 0
            const h = (v / max) * plotH
            const x = i * slot + (slot - bar) / 2
            return (
              <G key={d.label}>
                <Rect x={x} y={height - padB - h} width={bar} height={Math.max(h, v > 0 ? 2 : 0)} rx={4} fill={color ?? colors.primary} />
                {v > 0 ? <SvgText x={x + bar / 2} y={height - padB - h - 4} fontSize={10} fill={colors.mutedForeground} textAnchor="middle">{d.value}{unit}</SvgText> : null}
                <SvgText x={x + bar / 2} y={height - 6} fontSize={11} fill={colors.mutedForeground} textAnchor="middle">{d.label}</SvgText>
              </G>
            )
          })}
        </Svg>
      ) : <View style={{ height }} />}
      {data.every((d) => !d.value) ? <Text style={{ position: 'absolute', alignSelf: 'center', top: height / 2 - 12, color: colors.mutedForeground }}>No data yet</Text> : null}
    </View>
  )
}

/** Simple line chart with dots. `domain` pads the y-range around the data. */
export function LineChart({ data, height = 160, color, unit = '', summary }: { data: { label: string; value: number }[]; height?: number; color?: string; unit?: string; summary: string }) {
  const { colors } = useTheme()
  const [w, setW] = useState(0)
  const padB = 22, padT = 16, padX = 14
  const plotH = height - padB - padT
  const vals = data.map((d) => d.value)
  const lo = Math.min(...vals) - 1, hi = Math.max(...vals) + 1
  const x = (i: number) => padX + (data.length === 1 ? (w - 2 * padX) / 2 : (i * (w - 2 * padX)) / (data.length - 1))
  const y = (v: number) => padT + plotH - ((v - lo) / (hi - lo || 1)) * plotH
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')
  const step = Math.max(1, Math.ceil(data.length / 5))
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={summary}>
      {w > 0 && data.length > 0 ? (
        <Svg width={w} height={height}>
          <Line x1={0} x2={w} y1={height - padB} y2={height - padB} stroke={colors.border} strokeWidth={1} />
          <Polyline points={pts} fill="none" stroke={color ?? colors.primary} strokeWidth={2} />
          {data.map((d, i) => (
            <G key={`${d.label}-${i}`}>
              <Circle cx={x(i)} cy={y(d.value)} r={3} fill={color ?? colors.primary} />
              {i % step === 0 ? <SvgText x={x(i)} y={height - 6} fontSize={10} fill={colors.mutedForeground} textAnchor="middle">{d.label}</SvgText> : null}
            </G>
          ))}
          <SvgText x={w - padX} y={padT - 4} fontSize={10} fill={colors.mutedForeground} textAnchor="end">{data.at(-1)!.value}{unit}</SvgText>
        </Svg>
      ) : <View style={{ height }} />}
    </View>
  )
}
