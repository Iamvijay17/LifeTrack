import { Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { useTheme } from '../providers/ThemeProvider'
import { FadeIn } from './motion'

/** The LifeTrack mark and name, for the top of the sign-in screens. Same check-and-arrow as the app icon. */
export function BrandMark() {
  const { colors } = useTheme()
  return (
    <FadeIn y={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, marginTop: 8 }}>
      <Svg width={36} height={36} viewBox="0 0 512 512" accessibilityElementsHidden>
        <Defs><LinearGradient id="mark" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#8B5CF6" /><Stop offset="1" stopColor="#6246EA" /></LinearGradient></Defs>
        <Rect width={512} height={512} rx={112} fill="url(#mark)" />
        <Path d="M185 275L235 325L400 160M342 160H400V218" stroke="#FFFFFF" strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
      <View style={{ flexDirection: 'row' }}>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '500' }}>Life</Text>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '700' }}>Track</Text>
      </View>
    </FadeIn>
  )
}
