import { createContext, useContext, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

const Ctx = createContext({ open: () => {} })
export const useQuick = () => useContext(Ctx)
export function QuickActionsProvider({ children }) {
  const [, setKind] = useState(null)
  return <Ctx.Provider value={{ open: setKind }}>{children}</Ctx.Provider>
}
export function QuickAddMenu() { return <Button size="sm"><Plus className="h-4 w-4" />Quick add</Button> }
