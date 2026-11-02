import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { radius, spacing, theme, type ColorName } from '@lifetrack/design-tokens'

interface Theme { scheme: 'light' | 'dark'; colors: Record<ColorName, string>; radius: typeof radius; spacing: typeof spacing }
const Ctx = createContext<Theme | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark' // dark is the brand default
  const value = useMemo<Theme>(() => ({ scheme, colors: theme(scheme), radius, spacing }), [scheme])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export const useTheme = () => {
  const t = useContext(Ctx)
  if (!t) throw new Error('useTheme must be used inside ThemeProvider')
  return t
}
