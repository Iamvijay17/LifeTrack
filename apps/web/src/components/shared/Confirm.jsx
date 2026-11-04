import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const Ctx = createContext(() => Promise.resolve(false))

/** `const confirm = useConfirm(); if (await confirm({title, description, confirmLabel})) ...` */
export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null)
  const resolver = useRef(null)
  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolver.current = resolve
        setReq(opts)
      }),
    [],
  )
  const close = (v) => {
    resolver.current?.(v)
    resolver.current = null
    setReq(null)
  }
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog
        open={!!req}
        onOpenChange={(o) => !o && close(false)}
        title={req?.title ?? ''}
        description={req?.description}
        footer={
          <>
            <Button variant="outline" onClick={() => close(false)}>
              {req?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button variant={req?.destructive === false ? 'default' : 'destructive'} onClick={() => close(true)}>
              {req?.confirmLabel ?? 'Delete'}
            </Button>
          </>
        }
      >
        <p className="sr-only">Please confirm</p>
      </Dialog>
    </Ctx.Provider>
  )
}
export const useConfirm = () => useContext(Ctx)
