import { Suspense, createContext, lazy, useCallback, useContext, useMemo, useState } from 'react'
import { BookOpen, Briefcase, Check, CheckSquare, Droplets, Dumbbell, Plus, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Magnetic, m, spring } from '@/components/motion/primitives'

// The forms behind the buttons are loaded the first time one is opened (see QuickDialogs).
const QuickDialogs = lazy(() => import('./QuickDialogs'))

export const QUICK = [
  { kind: 'task', label: 'Add task', icon: CheckSquare, module: 'planner' },
  { kind: 'study', label: 'Start study', icon: BookOpen, module: 'learning' },
  { kind: 'workout', label: 'Log workout', icon: Dumbbell, module: 'fitness' },
  { kind: 'expense', label: 'Add expense', icon: Wallet, module: 'finance' },
  { kind: 'water', label: 'Log water', icon: Droplets, module: 'health' },
  { kind: 'habit', label: 'Complete habit', icon: Check, module: 'habits' },
  { kind: 'application', label: 'Job application', icon: Briefcase, module: 'jobs' },
]

const Ctx = createContext({ open: () => {} })
export const useQuick = () => useContext(Ctx)

export function QuickActionsProvider({ children }) {
  const [kind, setKind] = useState(null)
  const [menu, setMenu] = useState(false)
  const close = useCallback(() => setKind(null), [])
  const value = useMemo(
    () => ({
      open: setKind,
      menu: () => {
        setMenu(true)
        import('./QuickDialogs') // start fetching the forms while the menu is on screen, so the chosen one opens at once
      },
    }),
    [],
  )
  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={menu} onOpenChange={setMenu} title="Quick add">
        <div className="grid grid-cols-2 gap-2">
          {QUICK.map(({ kind: k, label, icon: Icon, module }) => (
            <button
              key={k}
              data-module={module}
              onClick={() => {
                setMenu(false)
                setKind(k)
              }}
              className="lt-lift flex items-center gap-2.5 rounded-lg border border-border bg-surface-2/50 px-3 py-3 text-left text-sm font-medium"
            >
              <span className="lt-icon-soft h-8 w-8 rounded-md">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              {label}
            </button>
          ))}
        </div>
      </Dialog>
      {kind && (
        <Suspense fallback={null}>
          <QuickDialogs kind={kind} onClose={close} />
        </Suspense>
      )}
    </Ctx.Provider>
  )
}

/** Desktop header button. */
export function QuickAddMenu() {
  const { menu } = useQuick()
  return (
    <Magnetic className="hidden md:inline-flex">
      <Button size="sm" onClick={menu}>
        <Plus className="h-4 w-4" />
        Quick add
      </Button>
    </Magnetic>
  )
}

/** Mobile floating action button. Must be rendered OUTSIDE the blurred header (backdrop-filter breaks position:fixed). */
export function QuickFab() {
  const { menu } = useQuick()
  return (
    <m.button
      onClick={menu}
      aria-label="Quick add"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      whileTap={{ scale: 0.9, rotate: 90 }}
      transition={spring.snappy}
      className="fixed bottom-[4.75rem] right-4 z-30 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#6246EA] text-white shadow-btn-primary md:hidden"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Plus className="h-6 w-6" />
    </m.button>
  )
}
