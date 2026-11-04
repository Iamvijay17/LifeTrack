import { Suspense, createContext, lazy, useCallback, useContext, useMemo, useState } from 'react'
import { BookOpen, Briefcase, Check, CheckSquare, Droplets, Dumbbell, Plus, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

// The forms behind the buttons are loaded the first time one is opened (see QuickDialogs).
const QuickDialogs = lazy(() => import('./QuickDialogs'))

export const QUICK = [
  { kind: 'task', label: 'Add task', icon: CheckSquare },
  { kind: 'study', label: 'Start study', icon: BookOpen },
  { kind: 'workout', label: 'Log workout', icon: Dumbbell },
  { kind: 'expense', label: 'Add expense', icon: Wallet },
  { kind: 'water', label: 'Log water', icon: Droplets },
  { kind: 'habit', label: 'Complete habit', icon: Check },
  { kind: 'application', label: 'Job application', icon: Briefcase },
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
          {QUICK.map(({ kind: k, label, icon: Icon }) => (
            <button
              key={k}
              onClick={() => {
                setMenu(false)
                setKind(k)
              }}
              className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-3 text-left text-sm font-medium transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <Icon className="h-4 w-4 text-secondary" />
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
    <Button size="sm" className="hidden md:inline-flex" onClick={menu}>
      <Plus className="h-4 w-4" />
      Quick add
    </Button>
  )
}

/** Mobile floating action button. Must be rendered OUTSIDE the blurred header (backdrop-filter breaks position:fixed). */
export function QuickFab() {
  const { menu } = useQuick()
  return (
    <button
      onClick={menu}
      aria-label="Quick add"
      className="fixed bottom-[4.5rem] right-4 z-30 grid h-12 w-12 place-items-center rounded-full bg-primary-solid text-white shadow-lg shadow-primary/30 active:scale-95 md:hidden"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Plus className="h-6 w-6" />
    </button>
  )
}
