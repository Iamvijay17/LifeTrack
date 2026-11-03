import { Select } from '@/components/ui/form'
import { topicGroups } from '@/domain/learning'

/** "What are you studying?" — active goals, then topics grouped by category. Value format: see parseTarget. */
export function TargetSelect({ goals, topics, value, onChange }) {
  const activeGoals = goals.filter((g) => g.status === 'active')
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="What are you studying?">
      <option value="">No specific goal / topic</option>
      {activeGoals.length > 0 && (
        <optgroup label="Goals">
          {activeGoals.map((g) => (
            <option key={g.id} value={`g:${g.id}`}>
              {g.title}
            </option>
          ))}
        </optgroup>
      )}
      {topicGroups(topics).map((grp) => (
        <optgroup key={grp} label={grp}>
          {topics
            .filter((t) => t.group_name === grp && !t.archived)
            .map((t) => (
              <option key={t.id} value={`t:${t.id}`}>
                {t.name}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  )
}
