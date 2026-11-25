import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  addWidget,
  applyTemplate,
  builtinTemplate,
  createWorkspace,
  deleteWorkspace,
  duplicateWidget,
  duplicateWorkspace,
  getWorkspace,
  instantiateTemplate,
  mapWorkspace,
  moveInColumn,
  moveWidgetToWorkspace,
  newId,
  readState,
  removeWidget,
  renameWorkspace,
  resetWidget,
  resizeWidget,
  revOf,
  saveTemplate,
  deleteTemplate,
  setDefault,
  setHidden,
  setLayout,
  templateFromWorkspace,
  updateWidget,
  writeState,
} from '@lifetrack/core/dashboardBuilder'
import { peek, refetch, tracked } from '@/hooks/store'
import { toAppError } from '@/services/errors'

const ACTIVE_KEY = 'lt.dashboard.workspace'
const read = () => {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}
const remember = (id) => {
  try {
    localStorage.setItem(ACTIVE_KEY, id)
  } catch {
    /* private window or blocked storage: the default workspace opens next time */
  }
}

/**
 * The dashboard builder's state. The saved layout (`prefs`, the `user_settings.dashboard_widgets` value) holds every workspace.
 *
 *  - Not editing: a change to the workspace list (rename, new workspace, make default...) is written straight away.
 *  - Editing: every change goes to a draft that only this screen sees; Save writes it once, Cancel throws it away, so the saved layout is
 *    never half-changed.
 *
 * Before any write the current saved layout is fetched again and its revision compared with the one this screen started from. If another
 * device saved in between, nothing is overwritten: `conflict` holds both versions and the person picks.
 */
export function useDashboardBuilder(prefs, save) {
  const saved = useMemo(() => readState(prefs), [prefs])
  const [draft, setDraft] = useState(null)
  const [optimistic, setOptimistic] = useState(null) // an unsaved-yet workspace-list change, shown at once
  const [status, setStatus] = useState({ state: 'idle', error: null }) // idle | saving | saved | error
  const [conflict, setConflict] = useState(null)
  const [activeId, setActiveId] = useState(read)

  const draftRef = useRef(null)
  const savedRef = useRef(saved)
  const baseRev = useRef(saved.rev)
  const queue = useRef(Promise.resolve())
  savedRef.current = optimistic ?? saved
  if (!draft && !optimistic) baseRev.current = saved.rev

  const state = draft ?? optimistic ?? saved
  const active = getWorkspace(state, activeId)
  const editing = !!draft
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(saved)

  /** Write `next` (the whole state). Resolves true when the account now holds it. */
  const persist = useCallback(
    (next, { force = false } = {}) => {
      const run = async () => {
        setStatus({ state: 'saving', error: null })
        try {
          await refetch('user_settings')
          const remote = peek('user_settings')[0]?.dashboard_widgets ?? {}
          const remoteRev = revOf(remote)
          if (!force && remoteRev !== baseRev.current) {
            setConflict({ mine: next, theirs: readState(remote), remote })
            setStatus({ state: 'idle', error: null })
            return false
          }
          await save({ dashboard_widgets: writeState(remote, { ...next, rev: remoteRev }) })
          baseRev.current = remoteRev + 1
          setStatus({ state: 'saved', error: null })
          return true
        } catch (e) {
          const message = toAppError(e).message
          setStatus({ state: 'error', error: message })
          toast.error(`Couldn't save your dashboard: ${message}`)
          return false
        }
      }
      // One write at a time, in order, and the save indicator (and leave-page guard) covers each of them.
      const result = queue.current.then(() => tracked(run))
      queue.current = result.catch(() => {})
      return result
    },
    [save],
  )

  /** Apply `fn(state)` to the draft, or (outside edit mode) save the result. */
  const mutate = useCallback(
    (fn) => {
      if (draftRef.current) {
        const next = fn(draftRef.current)
        if (next === draftRef.current) return
        draftRef.current = next
        setDraft(next)
        return
      }
      const next = fn(savedRef.current)
      if (next === savedRef.current) return
      setOptimistic(next)
      persist(next).then(() => setOptimistic(null))
    },
    [persist],
  )

  const select = useCallback((id) => {
    setActiveId(id)
    remember(id)
  }, [])

  const startEdit = useCallback(() => {
    baseRev.current = savedRef.current.rev
    draftRef.current = savedRef.current
    setDraft(savedRef.current)
    setStatus({ state: 'idle', error: null })
  }, [])
  const cancel = useCallback(() => {
    draftRef.current = null
    setDraft(null)
    setConflict(null)
  }, [])
  const commit = useCallback(async () => {
    const next = draftRef.current
    if (!next) return true
    const ok = await persist(next)
    if (ok) {
      draftRef.current = null
      setDraft(null)
    }
    return ok
  }, [persist])

  const resolveConflict = useCallback(
    async (choice) => {
      const c = conflict
      setConflict(null)
      if (!c || choice === 'dismiss') return // dismissed: keep editing, nothing is dropped or written
      if (choice === 'theirs') {
        draftRef.current = null
        setDraft(null)
        setOptimistic(null)
        return
      }
      const ok = await persist(c.mine, { force: true })
      if (ok) {
        draftRef.current = null
        setDraft(null)
        setOptimistic(null)
      }
    },
    [conflict, persist],
  )

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const id = active.id
  const ws = (fn) => mutate((s) => mapWorkspace(s, id, fn))
  const ops = useMemo(
    () => ({
      addWidget: (type, opts) => ws((w) => addWidget(w, type, opts)),
      removeWidget: (wid) => ws((w) => removeWidget(w, wid)),
      setHidden: (wid, hidden) => ws((w) => setHidden(w, wid, hidden)),
      updateWidget: (wid, patch) => ws((w) => updateWidget(w, wid, patch)),
      duplicateWidget: (wid) => ws((w) => duplicateWidget(w, wid)),
      resizeWidget: (wid, key) => ws((w) => resizeWidget(w, wid, key)),
      resetWidget: (wid) => ws((w) => resetWidget(w, wid)),
      moveInColumn: (wid, by) => ws((w) => moveInColumn(w, wid, by)),
      setLayout: (bp, items) => ws((w) => setLayout(w, bp, items)),
      moveToWorkspace: (wid, toId) => mutate((s) => moveWidgetToWorkspace(s, id, wid, toId)),
      createWorkspace: (name, tplKey) => {
        const wsId = newId('ws')
        const tpl =
          tplKey &&
          (builtinTemplate(tplKey) ??
            savedRef.current.templates.find((t) => t.id === tplKey) ??
            draftRef.current?.templates.find((t) => t.id === tplKey))
        mutate((s) => createWorkspace(s, name, { id: wsId, ...(tpl ? instantiateTemplate(tpl) : {}) }).state)
        select(wsId)
        return wsId
      },
      renameWorkspace: (wsId, name) => mutate((s) => renameWorkspace(s, wsId, name)),
      duplicateWorkspace: (wsId) => {
        const copyId = newId('ws')
        mutate((s) => duplicateWorkspace(s, wsId, { newWorkspaceId: copyId }).state)
        select(copyId)
      },
      deleteWorkspace: (wsId) => {
        mutate((s) => deleteWorkspace(s, wsId))
        if (wsId === activeId || wsId === id) setActiveId(null)
      },
      setDefault: (wsId) => mutate((s) => setDefault(s, wsId)),
      applyTemplate: (tpl) => mutate((s) => applyTemplate(s, id, tpl)),
      resetWorkspace: () => mutate((s) => applyTemplate(s, id, builtinTemplate('balanced'))),
      saveAsTemplate: (name) => mutate((s) => saveTemplate(s, templateFromWorkspace(getWorkspace(s, id), name))),
      deleteTemplate: (tid) => mutate((s) => deleteTemplate(s, tid)),
      /** Put a whole state back (Undo). */
      restore: (s) => mutate(() => s),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ws` and `mutate` only close over stable refs and `id`
    [id, activeId, mutate, select],
  )

  return {
    state,
    active,
    editing,
    dirty,
    status,
    conflict,
    select,
    startEdit,
    cancel,
    commit,
    resolveConflict,
    ops,
    current: () => draftRef.current ?? savedRef.current,
  }
}
