import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Input } from '@/components/ui/form'
import { addChecklistItem, newChecklist, removeChecklistItem, toggleChecklistItem } from '@/domain/jobs'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'

/** Saves the whole checklist back to the application after each change (small list, so no per-item rows). */
export function usePrepChecklist(app) {
  const [save] = useAction((list) => store.update('job_applications', app.id, { prep_checklist: list }))
  const list = app.prep_checklist ?? []
  return {
    list,
    applyTemplate: () => save(newChecklist()),
    toggle: (id, done) => save(toggleChecklistItem(list, id, done)),
    remove: (id) => save(removeChecklistItem(list, id)),
    add: (text) => save(addChecklistItem(list, text)),
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
