import { useState } from 'react'
import { Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { CATEGORIES_BY_TYPE } from '@/domain/finance'

const ADD_NEW = '__add_new__'
/** Built-in categories plus any the user has already used for this type: those live in their transactions, so they follow them to every device. */
export const categoryOptions = (type, transactions = []) => [
  ...new Set([...CATEGORIES_BY_TYPE[type], ...transactions.filter((t) => t.type === type).map((t) => t.category)]),
]

/** Category picker with "add new". Lives in a react-hook-form as `category`; `type` decides the list. */
export function CategoryField({ control, setValue, type, transactions, error }) {
  const [adding, setAdding] = useState(false)
  const [custom, setCustom] = useState('')
  const commitCustom = () => {
    const name = custom.trim().slice(0, 40)
    if (name) setValue('category', name, { shouldValidate: true })
    setAdding(false)
    setCustom('')
  }
  return (
    /* Controlled (not register()): when the type changes the option list changes, and an uncontrolled <select> would
       display a different category than the one stored in the form. */
    <Controller
      control={control}
      name="category"
      render={({ field }) => (
        <Field label="Category" error={error}>
          {adding ? (
            <div className="flex gap-2">
              <Input
                autoFocus
                maxLength={40}
                placeholder="New category name"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitCustom()
                  }
                }}
              />
              <Button variant="outline" onClick={commitCustom}>
                Add
              </Button>
            </div>
          ) : (
            <Select
              value={field.value}
              onChange={(e) => (e.target.value === ADD_NEW ? setAdding(true) : field.onChange(e.target.value))}
              onBlur={field.onBlur}
              ref={field.ref}
            >
              {[...new Set([...categoryOptions(type, transactions), field.value])].filter(Boolean).map((c) => (
                <option key={c}>{c}</option>
              ))}
              <option value={ADD_NEW}>+ Add new category…</option>
            </Select>
          )}
        </Field>
      )}
    />
  )
}
