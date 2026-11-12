// Small builders the module menus share. They go through the app's own data layer (hooks/store), so every menu action is the same write a form or
// button would make: same validation in the adapters, same cache update, same save indicator.
import * as store from '@/hooks/store'
import { copyText } from './clipboard'

const SERVER_FIELDS = ['id', 'created_at', 'updated_at', 'user_id']

/** The fields of `row` named in `patch`, as they are now: what an undo writes back. */
export const previous = (row, patch) => Object.fromEntries(Object.keys(patch).map((k) => [k, row[k] === undefined ? null : row[k]]))

/** Updates a row and hands back the toast that can undo exactly that change. */
export async function changeField(table, row, patch, message) {
  const before = previous(row, patch)
  await store.update(table, row.id, patch)
  return { message, undo: () => store.update(table, row.id, before) }
}

/** Inserts a copy of `row` (without its identity and bookkeeping columns) with `overrides` on top; undo deletes the copy. */
export async function duplicateRow(table, row, overrides = {}, message = 'Duplicated') {
  const rest = Object.fromEntries(Object.entries(row).filter(([k]) => !SERVER_FIELDS.includes(k)))
  const copy = await store.insert(table, { ...rest, ...overrides })
  return { message, undo: () => store.remove(table, copy.id) }
}

/** "Copy" for any record: puts `lines` (label: value, in order, empty ones skipped) on the clipboard. */
export const copyDetails = (title, fields) => {
  const lines = [title, ...fields.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}: ${v}`)]
  return copyText(lines.join('\n'), { success: 'Copied to clipboard' })
}

/** `n` things, for messages: plural(3, 'task') → "3 tasks". */
export const count = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`

/** Deletes several rows of one table at once, with the wording a bulk confirm dialog needs. */
export const bulkDelete = (table, ids, noun) => ({
  label: `Delete ${count(ids.length, noun)}`,
  danger: true,
  confirm: {
    title: `Delete ${count(ids.length, noun)}?`,
    description: 'This cannot be undone.',
    confirmLabel: `Delete ${ids.length}`,
  },
  onSelect: async () => {
    await store.removeMany(table, ids)
    return { message: `${count(ids.length, noun)} deleted` }
  },
})

/** Applies the same `patch` to several rows; the undo puts each row's own previous values back. */
export async function changeFields(table, rows, patch, message) {
  const before = rows.map((r) => [r.id, previous(r, patch)])
  for (const r of rows) await store.update(table, r.id, patch)
  return {
    message,
    undo: async () => {
      for (const [id, prev] of before) await store.update(table, id, prev)
    },
  }
}
