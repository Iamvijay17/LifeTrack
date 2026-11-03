import { useMemo, useState } from 'react'
import { Heatmap, levelFor } from '@/components/shared/Heatmap'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/form'
import { heatmapCounts } from '@/domain/habits'
import { addDays } from '@/lib/dates'

const WEEKS = 26

/** Calendar heatmap of habit completion, for all habits or one. `active` is the non-archived stats rows. */
export function ConsistencyCard({ active, today, weekStartsOn, selected, onSelect }) {
  const [focus, setFocus] = useState('all')
  const { levels, titles } = useMemo(() => {
    const subset = focus === 'all' ? active : active.filter((s) => s.habit.id === focus)
    const counts = heatmapCounts(subset, addDays(today, -WEEKS * 7 - 7), today)
    const levels = new Map()
    const titles = new Map()
    for (const [d, { done, planned }] of counts) {
      levels.set(d, levelFor(done / planned))
      titles.set(d, `${done}/${planned} done`)
    }
    return { levels, titles }
  }, [active, focus, today])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Consistency</CardTitle>
        <Select aria-label="Heatmap habit" className="h-8 w-44 md:h-8" value={focus} onChange={(e) => setFocus(e.target.value)}>
          <option value="all">All habits</option>
          {active.map((s) => (
            <option key={s.habit.id} value={s.habit.id}>
              {s.habit.name}
            </option>
          ))}
        </Select>
      </CardHeader>
      <CardContent>
        {levels.size === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Check in on a habit and your heatmap starts filling in.</p>
        ) : (
          <Heatmap levels={levels} titles={titles} today={today} weekStartsOn={weekStartsOn} selected={selected} onSelect={onSelect} />
        )}
      </CardContent>
    </Card>
  )
}
