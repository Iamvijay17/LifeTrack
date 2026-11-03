import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { revisionStatus, topicGroups } from '@/domain/learning'
import { fmtDay, fmtDuration } from '@/lib/dates'

/** `totals` is topicTotals(): [{ topic, minutes, problems, sessions }]. */
export function TopicsTab({ totals, today, onCreate, onEdit }) {
  const removeTopic = useConfirmedDelete('learning_topics', 'Topic deleted')
  const groups = topicGroups(totals.map((t) => t.topic))
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          Add topic
        </Button>
      </div>
      {groups.length === 0 && (
        <EmptyState title="No topics yet" description="Default topics are created on first sign-in. Add your own any time." />
      )}
      {groups.map((grp) => (
        <section key={grp}>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{grp}</h3>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {totals
              .filter((t) => t.topic.group_name === grp)
              .map(({ topic, minutes, problems }) => {
                const { due, next } = revisionStatus(topic, today)
                return (
                  <Card key={topic.id}>
                    <CardContent className="space-y-1.5 p-3">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-sm font-medium">{topic.name}</p>
                        <Menu
                          label={`Actions for ${topic.name}`}
                          items={[
                            { label: 'Edit notes & revisions', icon: Pencil, onClick: () => onEdit(topic) },
                            {
                              label: 'Delete',
                              icon: Trash2,
                              danger: true,
                              onClick: () =>
                                removeTopic(topic.id, {
                                  title: `Delete ${topic.name}?`,
                                  description: 'Past sessions stay, but lose their topic link.',
                                }),
                            },
                          ]}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {minutes > 0 ? fmtDuration(minutes) : 'No time logged'}
                        {problems > 0 && ` · ${problems} problems`}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {due && <Badge tone="warning">Revise today</Badge>}
                        {next && !due && (
                          <Badge>
                            <CalendarClock className="h-3 w-3" />
                            Revise {fmtDay(next, 'd MMM')}
                          </Badge>
                        )}
                        {topic.notes && <Badge>Has notes</Badge>}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
          </div>
        </section>
      ))}
    </div>
  )
}
