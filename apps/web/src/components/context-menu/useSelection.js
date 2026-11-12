import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * Which items of a list are selected, for bulk actions from the right-click menu.
 *
 *   const sel = useSelection(tasks.map((t) => t.id))
 *   <Card {...sel.itemProps(t.id)} {...menu.bind(() => (sel.targets(t.id).length > 1 ? bulk(sel.targets(t.id)) : single(t)))} />
 *
 * Ctrl/Cmd/Shift+click toggles an item (the click never reaches the card's own action); "Select" in the menu adds one;
 * Escape clears. `targets(id)` is what a menu acts on: the whole selection when the item is in it, else just that item
 * (and the old selection is dropped, as in a file manager).
 */
export function useSelection(ids = []) {
  const [selected, setSelected] = useState(() => new Set())
  const key = ids.join('|')

  // Rows that vanished (deleted, filtered out) fall out of the selection.
  useEffect(() => {
    setSelected((cur) => {
      if (cur.size === 0) return cur
      const live = new Set(ids)
      const next = new Set([...cur].filter((id) => live.has(id)))
      return next.size === cur.size ? cur : next
    })
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback(
    (id) =>
      setSelected((cur) => {
        const next = new Set(cur)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    [],
  )
  const add = useCallback((id) => setSelected((cur) => (cur.has(id) ? cur : new Set(cur).add(id))), [])
  const clear = useCallback(() => setSelected((cur) => (cur.size ? new Set() : cur)), [])
  const selectAll = useCallback(() => setSelected(new Set(ids)), [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selected.size === 0) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (document.querySelector('[data-ctx-menu], [role="dialog"]')) return // Escape belongs to the open menu or dialog first
      clear()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected.size, clear])

  const targets = useCallback(
    (id) => {
      if (selected.has(id)) return [...selected]
      if (selected.size) setSelected(new Set())
      return [id]
    },
    [selected],
  )

  const itemProps = useCallback(
    (id) => ({
      'data-selected': selected.has(id) ? 'true' : undefined,
      onClickCapture(e) {
        if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return
        e.preventDefault()
        e.stopPropagation()
        toggle(id)
      },
    }),
    [selected, toggle],
  )

  return useMemo(
    () => ({ selected, size: selected.size, has: (id) => selected.has(id), toggle, add, clear, selectAll, targets, itemProps }),
    [selected, toggle, add, clear, selectAll, targets, itemProps],
  )
}
