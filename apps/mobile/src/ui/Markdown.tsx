import { Fragment } from 'react'
import { Linking, Text, View } from 'react-native'
import { parseBlocks, tokenizeInline } from '@lifetrack/core/notes'
import { useTheme } from '../providers/ThemeProvider'

/** Renders the shared Markdown AST with native Text. Only http(s)/mailto links are tappable; nothing is interpreted as HTML. */
export function Markdown({ source }: { source: string }) {
  const { colors, radius } = useTheme()
  const blocks = parseBlocks(source) as any[]
  const inline = (text: string, base: object = {}) => (
    <Text style={[{ color: colors.foreground, fontSize: 15, lineHeight: 22 }, base]}>
      {tokenizeInline(text).map((t: any, i: number) =>
        t.type === 'bold' ? <Text key={i} style={{ fontWeight: '700' }}>{t.text}</Text>
        : t.type === 'italic' ? <Text key={i} style={{ fontStyle: 'italic' }}>{t.text}</Text>
        : t.type === 'code' ? <Text key={i} style={{ fontFamily: 'Courier', backgroundColor: colors.muted }}>{t.text}</Text>
        : t.type === 'link' ? <Text key={i} accessibilityRole="link" style={{ color: colors.secondary, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(t.url).catch(() => {})}>{t.text}</Text>
        : <Fragment key={i}>{t.text}</Fragment>)}
    </Text>
  )
  if (!blocks.length) return <Text style={{ color: colors.mutedForeground }}>Nothing to preview yet.</Text>
  return (
    <View style={{ gap: 10 }}>
      {blocks.map((b, i) => {
        if (b.type === 'h') return <View key={i} accessibilityRole="header">{inline(b.text, { fontSize: b.level === 1 ? 20 : 17, fontWeight: '700' })}</View>
        if (b.type === 'p') return <View key={i}>{inline(b.text)}</View>
        if (b.type === 'quote') return <View key={i} style={{ borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 10 }}>{inline(b.text, { color: colors.mutedForeground })}</View>
        if (b.type === 'code') return <View key={i} style={{ backgroundColor: colors.muted, borderRadius: radius.md, padding: 10 }}><Text style={{ color: colors.foreground, fontFamily: 'Courier', fontSize: 13 }}>{b.text}</Text></View>
        if (b.type === 'hr') return <View key={i} style={{ height: 1, backgroundColor: colors.border }} />
        return (
          <View key={i} style={{ gap: 4 }}>
            {b.items.map((it: any, j: number) => (
              <View key={j} style={{ flexDirection: 'row', gap: 8 }} accessible accessibilityLabel={it.checked != null ? `${it.checked ? 'Done' : 'Not done'}: ${it.text}` : undefined}>
                <Text style={{ color: colors.mutedForeground, width: 20, textAlign: 'right' }}>{it.checked != null ? (it.checked ? '☑' : '☐') : b.type === 'ol' ? `${j + 1}.` : '•'}</Text>
                <View style={{ flex: 1 }}>{inline(it.text, it.checked ? { color: colors.mutedForeground } : {})}</View>
              </View>
            ))}
          </View>
        )
      })}
    </View>
  )
}
