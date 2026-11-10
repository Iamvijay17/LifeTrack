import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { moduleAccents, type ModuleName } from '@lifetrack/design-tokens'
import { useTheme } from '../providers/ThemeProvider'

const Ctx = createContext<ModuleName>('dashboard')

/** Everything inside takes on this module's colour: progress, tiles, charts and active states. */
export const Accent = ({ module, children }: { module: ModuleName; children: ReactNode }) => <Ctx.Provider value={module}>{children}</Ctx.Provider>

/** The current module's gradient, and the shade of it that stays readable on this theme. */
export function useAccent(override?: ModuleName) {
  const inherited = useContext(Ctx)
  const { scheme } = useTheme()
  const name = override ?? inherited
  return useMemo(() => {
    const a = moduleAccents[name]
    return { name, from: a.from, to: a.to, text: a.text[scheme] }
  }, [name, scheme])
}

const ROUTE_MODULE: Record<string, ModuleName> = {
  index: 'dashboard', planner: 'planner', habits: 'habits', finance: 'finance', more: 'settings',
  learning: 'learning', jobs: 'jobs', fitness: 'fitness', health: 'health', nutrition: 'nutrition', focus: 'focus', notes: 'notes', goals: 'goals',
  analytics: 'analytics', notifications: 'notifications', settings: 'settings', help: 'settings',
}
/** Which module a route belongs to, from the last segment of its path. */
export const moduleForSegment = (segment: string | undefined): ModuleName => ROUTE_MODULE[segment ?? ''] ?? 'dashboard'
