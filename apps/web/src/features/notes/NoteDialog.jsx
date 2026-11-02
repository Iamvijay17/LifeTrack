import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { noteFormSchema, blankNote, noteToForm, noteToPayload } from '@lifetrack/schemas'
import { NOTE_CATEGORIES, parseTags } from '@lifetrack/core/notes'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select, Textarea, Checkbox } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { Markdown } from '@/lib/markdown'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'

export { NOTE_CATEGORIES, parseTags }
const schema = noteFormSchema

export function NoteDialog({ open, onOpenChange, note, goals = [], tasks = [], categories = [] }) {
  const blank = blankNote()
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  const [preview, setPreview] = useState('write')
  useEffect(() => {
    if (!open) return
    setPreview('write')
    reset(note ? noteToForm(note) : blank)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, note?.id])
  const [save, pending] = useAction(async (v) => {
    const row = noteToPayload(v)
    if (note) await store.update('notes', note.id, row); else await store.insert('notes', row)
    onOpenChange(false)
  }, { success: note ? 'Note updated' : 'Note saved' })
  const cats = [...new Set([...NOTE_CATEGORIES, ...categories, watch('category')])].filter(Boolean)
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={note ? 'Edit note' : 'New note'} pending={pending} onSubmit={handleSubmit(save)} submitLabel={note ? 'Save changes' : 'Save note'} className="md:max-w-2xl">
      <Field label="Title" error={errors.title?.message}><Input autoFocus placeholder="Untitled" {...register('title')} /></Field>
      <div className="space-y-1.5">
        <div className="flex justify-end"><Segmented value={preview} onChange={setPreview} options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} /></div>
        {preview === 'write'
          ? <Field label="Content (Markdown)" error={errors.body?.message}><Textarea rows={10} className="font-mono text-[13px]" placeholder={'# Heading\n- bullet\n- [ ] checklist item\n**bold**, *italic*, `code`, [link](https://…)'} {...register('body')} /></Field>
          : <div className="min-h-48 rounded-md border border-border p-3"><Markdown source={watch('body')} /></div>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category"><Select {...register('category')}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Tags" hint="Comma separated"><Input placeholder="react, interview" {...register('tags')} /></Field>
        <Field label="Attach to goal"><Select {...register('goal_id')}><option value="">None</option>{goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</Select></Field>
        <Field label="Attach to task"><Select {...register('task_id')}><option value="">None</option>{tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</Select></Field>
      </div>
      <Checkbox checked={watch('pinned')} onChange={(v) => setValue('pinned', v)} label="Pin to top" />
    </FormDialog>
  )
}
