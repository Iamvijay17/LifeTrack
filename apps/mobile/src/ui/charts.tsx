import { useState } from 'react'
import { View, Text } from 'react-native'
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polyline, Rect, Stop, Text as SvgText } from 'react-native-svg'
import { useTheme } from '../providers/ThemeProvider'
import { useAccent } from './accent'
import { FadeIn } from './motion'

/** Simple vertical bar chart. `data`: [{ label, value }]. Accessible summary replaces per-bar tooltips. */
export function BarChart({ data, height = 160, color, unit = '', summary, refLine, maxValue }: { data: { label: string; value: number | null }[]; height?: number; color?: string; unit?: string; summary: string; refLine?: number; maxValue?: number }) {
  const { colors } = useTheme()
  const accent = useAccent()
  const [w, setW] = useState(0)
  const max = Math.max(1, maxValue ?? 0, refLine ?? 0, ...data.map((d) => d.value ?? 0))
  const padB = 22, padT = 16
  const plotH = height - padB - padT
  const slot = w / Math.max(1, data.length)
  const bar = Math.min(28, slot * 0.6)
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={summary}>
      {w > 0 ? (
        <FadeIn y={8}>
        <Svg width={w} height={height}>
          <Defs><LinearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={color ?? accent.from} /><Stop offset="1" stopColor={color ?? accent.to} stopOpacity={color ? 0.7 : 0.85} /></LinearGradient></Defs>
          <Line x1={0} x2={w} y1={height - padB} y2={height - padB} stroke={colors.border} strokeWidth={1} />
          {refLine != null ? <Line x1={0} x2={w} y1={height - padB - (refLine / max) * plotH} y2={height - padB - (refLine / max) * plotH} stroke={colors.mutedForeground} strokeWidth={1} strokeDasharray="4 4" /> : null}
          {data.map((d, i) => {
            const v = d.value ?? 0
            const h = (v / max) * plotH
            const x = i * slot + (slot - bar) / 2
            return (
              <G key={d.label}>
                <Rect x={x} y={height - padB - h} width={bar} height={Math.max(h, v > 0 ? 2 : 0)} rx={6} fill="url(#bar)" />
                {v > 0 ? <SvgText x={x + bar / 2} y={height - padB - h - 4} fontSize={10} fill={colors.mutedForeground} textAnchor="middle">{d.value}{unit}</SvgText> : null}
                <SvgText x={x + bar / 2} y={height - 6} fontSize={11} fill={colors.mutedForeground} textAnchor="middle">{d.label}</SvgText>
              </G>
            )
          })}
        </Svg>
        </FadeIn>
      ) : <View style={{ height }} />}
      {data.every((d) => !d.value) ? <Text style={{ position: 'absolute', alignSelf: 'center', top: height / 2 - 12, color: colors.mutedForeground }}>No data yet</Text> : null}
    </View>
  )
}

/** Simple line chart with dots. `domain` pads the y-range around the data. */
export function LineChart({ data, height = 160, color, unit = '', summary }: { data: { label: string; value: number }[]; height?: number; color?: string; unit?: string; summary: string }) {
  const { colors } = useTheme()
  const accent = useAccent()
  const stroke = color ?? accent.from
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
        <FadeIn y={8}>
        <Svg width={w} height={height}>
          <Defs><LinearGradient id="area" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={stroke} stopOpacity={0.28} /><Stop offset="1" stopColor={stroke} stopOpacity={0} /></LinearGradient></Defs>
          <Line x1={0} x2={w} y1={height - padB} y2={height - padB} stroke={colors.border} strokeWidth={1} />
          {data.length > 1 ? <Path d={`M${x(0)},${height - padB} L${pts.replaceAll(' ', ' L')} L${x(data.length - 1)},${height - padB} Z`} fill="url(#area)" /> : null}
          <Polyline points={pts} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <G key={`${d.label}-${i}`}>
              <Circle cx={x(i)} cy={y(d.value)} r={3} fill={stroke} />
              {i % step === 0 ? <SvgText x={x(i)} y={height - 6} fontSize={10} fill={colors.mutedForeground} textAnchor="middle">{d.label}</SvgText> : null}
            </G>
          ))}
          <SvgText x={w - padX} y={padT - 4} fontSize={10} fill={colors.mutedForeground} textAnchor="end">{data.at(-1)!.value}{unit}</SvgText>
        </Svg>
        </FadeIn>
      ) : <View style={{ height }} />}
    </View>
  )
}

/** Donut chart for category shares. `slices`: [{ label, value, color }]. The legend is rendered by the caller. */
export function DonutChart({ slices, size = 180, thickness = 26, centerLabel, summary }: { slices: { label: string; value: number; color: string }[]; size?: number; thickness?: number; centerLabel?: string; summary: string }) {
  const { colors } = useTheme()
  const total = slices.reduce((a, s) => a + s.value, 0)
  const r = (size - thickness) / 2, c = 2 * Math.PI * r
  let offset = 0
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary} style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.muted} strokeWidth={thickness} />
        {total > 0 ? slices.map((s) => {
          const len = (s.value / total) * c
          const el = <Circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness} strokeDasharray={`${Math.max(0, len - 2)} ${c - Math.max(0, len - 2)}`} strokeDashoffset={-offset} />
          offset += len
          return el
        }) : null}
      </Svg>
      {centerLabel ? <Text style={{ position: 'absolute', color: colors.foreground, fontWeight: '600', fontSize: 15 }}>{centerLabel}</Text> : null}
    </View>
  )
}

/** Grouped bars: `series` = [{ name, color }], `data` = [{ label, values: number[] }] (one value per series). */
export function GroupedBarChart({ data, series, height = 180, summary }: { data: { label: string; values: number[] }[]; series: { name: string; color: string }[]; height?: number; summary: string }) {
  const { colors } = useTheme()
  const [w, setW] = useState(0)
  const max = Math.max(1, ...data.flatMap((d) => d.values))
  const padB = 22, padT = 8
  const plotH = height - padB - padT
  const slot = w / Math.max(1, data.length)
  const bar = Math.min(14, (slot * 0.8) / series.length)
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 ? (
          <Svg width={w} height={height}>
            <Line x1={0} x2={w} y1={height - padB} y2={height - padB} stroke={colors.border} strokeWidth={1} />
            {data.map((d, i) => (
              <G key={d.label}>
                {d.values.map((v, k) => {
                  const h = (v / max) * plotH
                  const x = i * slot + (slot - bar * series.length) / 2 + k * bar
                  return <Rect key={k} x={x} y={height - padB - h} width={bar - 1} height={Math.max(h, v > 0 ? 2 : 0)} rx={3} fill={series[k].color} />
                })}
                <SvgText x={i * slot + slot / 2} y={height - 6} fontSize={11} fill={colors.mutedForeground} textAnchor="middle">{d.label}</SvgText>
              </G>
            ))}
          </Svg>
        ) : <View style={{ height }} />}
      </View>
      <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'center', marginTop: 4 }}>
        {series.map((s) => <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} /><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{s.name}</Text></View>)}
      </View>
    </View>
  )
}
