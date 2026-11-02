import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { radius, spacing, theme, type ColorName } from '@lifetrack/design-tokens'

export type ThemePreference = 'system' | 'dark' | 'light'
interface Theme { scheme: 'light' | 'dark'; colors: Record<ColorName, string>; radius: typeof radius; spacing: typeof spacing; preference: ThemePreference; setPreference: (p: ThemePreference) => void }
const Ctx = createContext<Theme | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme()
  const [preference, setPreference] = useState<ThemePreference>('system')
  // 'system' follows the device (dark is the brand default when the device doesn't say); the saved account preference overrides it.
  const scheme: 'light' | 'dark' = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference
  const value = useMemo<Theme>(() => ({ scheme, colors: theme(scheme), radius, spacing, preference, setPreference }), [scheme, preference])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export const useTheme = () => {
  const t = useContext(Ctx)
  if (!t) throw new Error('useTheme must be used inside ThemeProvider')
  return t
}
