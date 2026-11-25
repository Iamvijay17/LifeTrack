import { useEffect } from 'react'
import { toast } from 'sonner'
import { history } from '@/lib/actionHistory'
import { isTypingTarget } from '@/features/command/model'
import { toAppError } from '@/services/errors'

const WHY = {
  expired: 'That change is too old to undo safely.',
  stale: 'It was changed again since, so undoing it would overwrite newer data.',
  nothing: 'Nothing to undo.',
}

/** Says what an undo or redo did, including why it refused: an action is never reversed silently, and a refusal is never silent either. */
export function announceResult(r, done) {
  if (r.ok) toast.success(done)
  else if (r.reason === 'failed') toast.error(`Could not ${done === 'Redone' ? 'redo' : 'undo'}: ${toAppError(r.error).message}`)
  else
    toast.message(`Can't ${done === 'Redone' ? 'redo' : 'undo'}`, {
      description: r.reason === 'nothing' && done === 'Redone' ? 'Nothing to redo.' : WHY[r.reason],
    })
}

// Something is open on top of the page: Ctrl+Z belongs to it, not to the page behind.
const overlayOpen = () => !!document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')

/**
 * Ctrl/Cmd+Z undoes the last reversible action, Ctrl/Cmd+Shift+Z (or Ctrl+Y) redoes it. Ignored while typing (the field has its own undo) and
 * while a dialog or menu is open. Mount once in the signed-in shell.
 */
export function useUndoShortcuts() {
  useEffect(() => {
    const onKey = async (e) => {
      if (e.defaultPrevented || e.repeat || e.isComposing || e.altKey || !(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      const redo = (k === 'z' && e.shiftKey) || (k === 'y' && e.ctrlKey && !e.metaKey)
      const undo = k === 'z' && !e.shiftKey
      if (!undo && !redo) return
      if (isTypingTarget(e.target) || overlayOpen()) return
      if (undo ? !history.canUndo : !history.canRedo) return // nothing of ours to do: leave the key to the browser
      e.preventDefault()
      announceResult(redo ? await history.redo() : await history.undo(), redo ? 'Redone' : 'Undone')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
