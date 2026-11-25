import { useCallback } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/shared/Confirm'
import { modifiesData, validateWorkflow } from '@lifetrack/core/automation'
import { deleteRow, saveWorkflow, setAutomationsPaused, setWorkflowEnabled } from '@/services/api'
import { toAppError } from '@/services/errors'

/** Switching on, off, duplicating, deleting and pausing: each asks first where it should, and says what happened. */
export function useWorkflowActions() {
  const confirm = useConfirm()
  const guard = async (fn, fail) => {
    try {
      return await fn()
    } catch (e) {
      toast.error(`${fail}: ${toAppError(e).message}`)
      return undefined
    }
  }

  const toggle = useCallback(
    async (w, on) => {
      if (on) {
        const v = validateWorkflow(w)
        if (!v.ok) {
          toast.error(`"${w.name}" is not ready: ${v.errors[0].message}`)
          return false
        }
        if (
          modifiesData(w.graph) &&
          !(await confirm({
            title: `Switch on "${w.name}"?`,
            description:
              'This automation changes tasks or goals that already exist. It never deletes anything. You can see everything it did in the history.',
            confirmLabel: 'Switch on',
            destructive: false,
          }))
        )
          return false
      }
      const done = await guard(() => setWorkflowEnabled(w, on), on ? "Couldn't switch it on" : "Couldn't switch it off")
      if (done && on) toast.success(`"${w.name}" is on. It reacts to what happens from now on.`)
      return !!done
    },
    [confirm],
  )

  const remove = useCallback(
    async (w) => {
      if (
        !(await confirm({
          title: `Delete "${w.name}"?`,
          description: 'The workflow is removed. Its run history is kept. Tasks and reminders it created stay where they are.',
          confirmLabel: 'Delete workflow',
        }))
      )
        return false
      return !!(await guard(async () => {
        await deleteRow('automation_workflows', w.id)
        toast.success('Workflow deleted')
        return true
      }, "Couldn't delete it"))
    },
    [confirm],
  )

  const duplicate = useCallback(
    (w) =>
      guard(async () => {
        const { workflow } = await saveWorkflow(null, {
          name: `${w.name} (copy)`.slice(0, 120),
          description: w.description,
          graph: w.graph,
          template_key: w.template_key,
          max_runs_per_day: w.max_runs_per_day,
        })
        toast.success('Copied. The copy is switched off.')
        return workflow
      }, "Couldn't copy it"),
    [],
  )

  const setPaused = useCallback(async (paused) => {
    const done = await guard(() => setAutomationsPaused(paused), "Couldn't change that")
    if (done) toast.success(paused ? 'All automations are paused.' : 'Automations are running again.')
  }, [])
  return { toggle, remove, duplicate, setPaused }
}
