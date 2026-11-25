import { useCallback } from 'react'
import { useConfirm } from '@/components/shared/Confirm'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'
import { sound } from '@/lib/interaction/SoundManager'

/**
 * "Ask, then delete" in one call, with the standard toast and duplicate-submit protection.
 *   const remove = useConfirmedDelete('goals', 'Goal deleted')
 *   remove(goal.id, { title: 'Delete this goal?', description: '…' })
 * Resolves to true when the record was deleted, false when the user cancelled or the delete failed.
 */
export function useConfirmedDelete(table, success) {
  const confirm = useConfirm()
  const [del] = useAction((id) => store.remove(table, id), { success })
  return useCallback(
    async (id, prompt) => {
      if (!(await confirm(prompt))) return false
      // The action will report "success" (and so will its toast); what the person did was delete, so that is the cue they hear.
      sound.alias('success', 'delete')
      const deleted = (await del(id)) !== undefined
      if (!deleted) sound.clearAlias('success')
      return deleted
    },
    [confirm, del],
  )
}
