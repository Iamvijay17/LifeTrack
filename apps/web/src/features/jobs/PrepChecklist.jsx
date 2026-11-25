import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox, Input } from '@/components/ui/form'
import { addChecklistItem, newChecklist, removeChecklistItem, toggleChecklistItem } from '@/domain/jobs'
import * as store from '@/hooks/store'
import { actionSucceeded } from '@/lib/interaction/feedback'
import { toAppError } from '@/services/errors'

/**
 * Saves the whole checklist back to the application after each change (small list, so no per-item rows).
 * Every tap counts: a change made while the previous one is still saving is applied to the newest list and saved after it, in order,
 * instead of being dropped.
 */
export function usePrepChecklist(app) {
  const list = app.prep_checklist ?? []
  const latest = useRef(list)
  const pending = useRef(0)
  const queue = useRef(Promise.resolve())
  if (pending.current === 0) latest.current = list // while saves are queued, the newest list is the one built here
  const change = (edit) => {
    const next = edit(latest.current)
    latest.current = next
    pending.current += 1
    queue.current = queue.current
      .then(() => store.update('job_applications', app.id, { prep_checklist: next }))
      .then(actionSucceeded)
      .catch((e) => toast.error(toAppError(e).message))
      .finally(() => (pending.current -= 1))
    return queue.current
  }
  return {
    list,
    applyTemplate: () => change(() => newChecklist()),
    toggle: (id, done) => change((l) => toggleChecklistItem(l, id, done)),
    remove: (id) => change((l) => removeChecklistItem(l, id)),
    add: (text) => change((l) => addChecklistItem(l, text)),
  }
}

export function PrepChecklist({ checklist }) {
  const [text, setText] = useState('')
  const { list, toggle, remove, add } = checklist
  return (
    <>
      <ul className="space-y-1">
        {list.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2">
            <Checkbox
              checked={i.done}
              label={<span className={i.done ? 'text-muted-foreground line-through' : ''}>{i.text}</span>}
              onChange={(v) => toggle(i.id, v)}
            />
            <button aria-label={`Remove ${i.text}`} className="text-muted-foreground hover:text-danger" onClick={() => remove(i.id)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) {
            add(text)
            setText('')
          }
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a prep item" aria-label="New prep item" />
        <Button type="submit" variant="outline">
          Add
        </Button>
      </form>
    </>
  )
}
