import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'

const Ctx = createContext(() => Promise.resolve(null))

/**
 * One line of text, asked for in the app's own dialog. `const ask = usePrompt(); const name = await ask({ title: 'Rename task', label: 'Title', value: task.title })`
 * resolves to the trimmed text, or null when it was cancelled. `validate(text)` returns an error message to keep the dialog open.
 */
export function PromptProvider({ children }) {
  const [req, setReq] = useState(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const resolver = useRef(null)
  const ask = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolver.current = resolve
        setText(opts.value ?? '')
        setError('')
        setReq(opts)
      }),
    [],
  )
  const close = (v) => {
    resolver.current?.(v)
    resolver.current = null
    setReq(null)
  }
  const submit = (e) => {
    e.preventDefault()
    const value = text.trim()
    const problem = value ? req?.validate?.(value) : 'Enter a value'
    if (problem) return setError(problem)
    close(value)
  }
  return (
    <Ctx.Provider value={ask}>
      {children}
      <Dialog
        stacked
        open={!!req}
        onOpenChange={(o) => !o && close(null)}
        title={req?.title ?? ''}
        description={req?.description}
        footer={
          <>
            <Button variant="outline" onClick={() => close(null)}>
              Cancel
            </Button>
            <Button type="submit" form="prompt-form">
              {req?.confirmLabel ?? 'Save'}
            </Button>
          </>
        }
      >
        <form id="prompt-form" onSubmit={submit}>
          <Field label={req?.label ?? 'Value'} error={error}>
            <Input
              autoFocus
              value={text}
              maxLength={req?.maxLength ?? 200}
              onChange={(e) => {
                setText(e.target.value)
                setError('')
              }}
              autoComplete="off"
            />
          </Field>
        </form>
      </Dialog>
    </Ctx.Provider>
  )
}
export const usePrompt = () => useContext(Ctx)
