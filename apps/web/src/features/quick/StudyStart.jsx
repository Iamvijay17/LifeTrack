import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FormDialog } from '@/components/shared/FormDialog'
import { TargetSelect } from '@/features/learning/TargetSelect'
import { parseTarget } from '@/domain/learning'
import { useTables } from '@/hooks/store'
import { useToday } from '@/hooks/useToday'
import { useAction } from '@/hooks/useAction'
import { startStudy } from '@/services/api'

/** Quick add → "Start study": pick a goal/topic and start the timer (or jump to the running one). */
export function StudyStart({ onClose }) {
  const nav = useNavigate()
  const today = useToday()
  const { data } = useTables('goals', 'learning_topics', 'study_sessions')
  const [target, setTarget] = useState('')
  const running = data.study_sessions.find((s) => s.status === 'running')
  const [start, pending] = useAction(
    async () => {
      await startStudy(parseTarget(target, data.goals), today)
      onClose()
      nav('/learning')
    },
    { success: 'Timer started' },
  )
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Start study session"
      description={running ? 'A timer is already running.' : 'The timer keeps running on all your devices.'}
      pending={pending}
      submitLabel="Start timer"
      onSubmit={(e) => {
        e.preventDefault()
        if (running) {
          onClose()
          nav('/learning')
        } else start()
      }}
    >
      {running ? (
        <p className="text-sm text-muted-foreground">Stop it on the Learning page before starting another.</p>
      ) : (
        <TargetSelect goals={data.goals} topics={data.learning_topics} value={target} onChange={setTarget} />
      )}
    </FormDialog>
  )
}
