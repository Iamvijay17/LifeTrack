// The item model of a context menu, and the pure rules that turn what a page hands in into what is drawn.
//
//   { id?, label, icon?, shortcut?, danger?, disabled?, disabledReason?, hidden?, keywords?,
//     checked?, radio?,             // a toggle (menuitemcheckbox), or with `radio` one of a set of choices (menuitemradio)
//     module?,                      // a lockable module key: the item disappears while that module is locked
//     permission?,                  // false (or () => false) greys the item out; disabledReason says why
//     items?,                       // submenu: an array, or a function called only when the submenu opens
//     confirm?: { title, description?, confirmLabel?, destructive? },   // asks first, in the app's confirm dialog
//     success?,                     // toast shown once onSelect has finished
//     onSelect?: () => void | Promise<void | { message?, undo? }> }      // `undo` makes the toast offer Undo
//   { type: 'separator' } · { type: 'label', label }

export const SEPARATOR = Object.freeze({ type: 'separator' })
export const isSeparator = (i) => i?.type === 'separator'
export const isLabel = (i) => i?.type === 'label'
export const isAction = (i) => !!i && !isSeparator(i) && !isLabel(i)
export const hasSubmenu = (i) => isAction(i) && i.items != null

/** `can` rules: a boolean or a function. */
const allowed = (p) => (typeof p === 'function' ? p() !== false : p !== false)

/**
 * Drops hidden items and items of a locked module, greys out items the person may not use, and tidies the separators
 * (none first or last, never two in a row, no empty group labels). Submenus given as arrays are tidied the same way;
 * a submenu given as a function is left alone until it opens (see resolveSubmenu).
 */
export function normalizeItems(items, { isLocked = () => false } = {}) {
  const kept = []
  for (const raw of items ?? []) {
    if (!raw) continue
    if (isAction(raw)) {
      if (raw.hidden || (raw.module && isLocked(raw.module))) continue
      let item = raw
      if (raw.permission !== undefined && !allowed(raw.permission)) item = { ...raw, disabled: true }
      if (Array.isArray(item.items)) {
        const sub = normalizeItems(item.items, { isLocked })
        if (!sub.some(isAction)) continue // a submenu with nothing in it is not offered
        item = { ...item, items: sub }
      }
      kept.push(item)
    } else kept.push(raw)
  }
  // A label only stays when an action follows it before the next label or separator.
  const tidy = []
  kept.forEach((it, i) => {
    if (isLabel(it)) {
      const next = kept.slice(i + 1).find((x) => !isLabel(x))
      if (!isAction(next)) return
    }
    tidy.push(it)
  })
  const out = []
  for (const it of tidy) {
    if (isSeparator(it) && (out.length === 0 || isSeparator(out[out.length - 1]))) continue
    out.push(it)
  }
  while (out.length && isSeparator(out[out.length - 1])) out.pop()
  return out
}

export const resolveSubmenu = (item, opts) => normalizeItems(typeof item.items === 'function' ? item.items() : item.items, opts)

/** Every action reachable from `items`, submenus included, with the path of parent labels (what the search box lists). */
export function flattenActions(items, opts, path = []) {
  const out = []
  for (const it of items) {
    if (!isAction(it)) continue
    if (hasSubmenu(it)) out.push(...flattenActions(resolveSubmenu(it, opts), opts, [...path, it.label]))
    else out.push({ ...it, path })
  }
  return out
}

export const matchesQuery = (item, q) => {
  const hay = [item.label, ...(item.path ?? []), ...(item.keywords ?? [])].join(' ').toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w))
}

/** Menus with this many actions or more get a search box. */
export const SEARCH_THRESHOLD = 9
export const countActions = (items) => items.filter(isAction).length
