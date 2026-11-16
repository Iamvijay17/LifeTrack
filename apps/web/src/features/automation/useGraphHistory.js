import { useCallback, useState } from 'react'

const MAX = 100

/**
 * The graph being edited, with undo and redo. Three ways to change it:
 *  - commit(next)       one undoable step (add, delete, connect, edit a field)
 *  - transient(next)    a live preview while dragging; not undoable by itself
 *  - checkpoint(base)   when the drag ends: `base` (the graph before it) becomes the undo step
 */
export function useGraphHistory(initial) {
  const [s, setS] = useState({ past: [], present: initial, future: [] })
  const commit = useCallback(
    (next) => setS((c) => (next === c.present ? c : { past: [...c.past.slice(-(MAX - 1)), c.present], present: next, future: [] })),
    [],
  )
  const transient = useCallback((next) => setS((c) => ({ ...c, present: next })), [])
  const checkpoint = useCallback(
    (base) => setS((c) => (base === c.present ? c : { past: [...c.past.slice(-(MAX - 1)), base], present: c.present, future: [] })),
    [],
  )
  const undo = useCallback(
    () => setS((c) => (c.past.length ? { past: c.past.slice(0, -1), present: c.past.at(-1), future: [c.present, ...c.future] } : c)),
    [],
  )
  const redo = useCallback(
    () => setS((c) => (c.future.length ? { past: [...c.past, c.present], present: c.future[0], future: c.future.slice(1) } : c)),
    [],
  )
  const reset = useCallback((graph) => setS({ past: [], present: graph, future: [] }), [])
  return { graph: s.present, commit, transient, checkpoint, undo, redo, reset, canUndo: s.past.length > 0, canRedo: s.future.length > 0 }
}
