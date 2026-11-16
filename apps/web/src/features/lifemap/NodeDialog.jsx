import { Controller } from 'react-hook-form'
import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select } from '@/components/ui/form'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import * as store from '@/hooks/store'
import { CATEGORIES } from '@/domain/lifeMap'
import { cn } from '@/lib/utils'

const COLORS = ['#6366F1', '#14B8A6', '#EC4899', '#F59E0B', '#3B82F6', '#22C55E', '#EF4444']
const schema = z.object({
  kind: z.enum(['project', 'area']),
  title: z.string().trim().min(1, 'Give it a name').max(120),
  category: z.enum(CATEGORIES),
  notes: z.string().max(1000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

/** Create or edit a project or an area of life: the two kinds of node that exist only on the map. */
export function NodeDialog({ open, onOpenChange, node, defaultKind = 'project', onSaved }) {
  const blank = { kind: defaultKind, title: '', category: 'Personal', notes: '', color: defaultKind === 'area' ? '#14B8A6' : '#6366F1' }
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useDialogForm({
    open,
    schema,
    recordKey: node?.id ?? defaultKind,
    valuesFor: () =>
      node
        ? {
            kind: node.kind,
            title: node.title,
            category: node.category ?? 'Personal',
            notes: node.notes ?? '',
            color: node.color ?? blank.color,
          }
        : blank,
  })
  const [save, pending] = useAction(
    async (v) => {
      const row = node ? await store.update('life_map_nodes', node.id, v) : await store.insert('life_map_nodes', v)
      onOpenChange(false)
      onSaved?.(row)
    },
    { success: node ? 'Saved' : 'Added to your map' },
  )
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={node ? 'Edit item' : defaultKind === 'area' ? 'New area of life' : 'New project'}
      description="A project or an area has no progress of its own: it shows how much of what feeds it is done."
      pending={pending}
      onSubmit={handleSubmit(save)}
    >
      <Field label="Name" error={errors.title?.message}>
        <Input autoFocus placeholder={defaultKind === 'area' ? 'e.g. Career' : 'e.g. Build my portfolio'} {...register('title')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select {...register('kind')} disabled={!!node}>
            <option value="project">Project</option>
            <option value="area">Area of life</option>
          </Select>
        </Field>
        <Field label="Category">
          <Select {...register('category')}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Notes (optional)">
        <Input {...register('notes')} />
      </Field>
      <Controller
        control={control}
        name="color"
        render={({ field }) => (
          <Field label="Colour">
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  aria-pressed={field.value === c}
                  onClick={() => field.onChange(c)}
                  style={{ background: c }}
                  className={cn('h-7 w-7 rounded-full ring-offset-2 ring-offset-card', field.value === c && 'ring-2 ring-foreground')}
                />
              ))}
            </div>
          </Field>
        )}
      />
    </FormDialog>
  )
}
