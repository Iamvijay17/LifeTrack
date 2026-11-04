import { CalendarClock, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { revisionStatus, topicGroups } from '@/domain/learning'
import { fmtDay, fmtDuration } from '@/lib/dates'
import { plural } from '@/lib/format'

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
        <EmptyState
          title="No topics yet"
          description="Add what you're studying, grouped however you like."
          action={
            <Button size="sm" onClick={onCreate}>
              Add a topic
            </Button>
          }
        />
      )}
      {groups.map((grp) => (
        <section key={grp}>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{grp}</h2>
          <Card>
            <ul className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:gap-x-6 md:divide-y-0 md:px-1">
              {totals
                .filter((t) => t.topic.group_name === grp)
                .map(({ topic, minutes, problems }) => {
                  const { due, next } = revisionStatus(topic, today)
                  return (
                    <li key={topic.id} className="flex min-h-12 items-center gap-2 px-3 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{topic.name}</p>
                        {(minutes > 0 || problems > 0) && (
                          <p className="text-xs text-muted-foreground">
                            {minutes > 0 ? fmtDuration(minutes) : ''}
                            {minutes > 0 && problems > 0 ? ' · ' : ''}
                            {problems > 0 ? plural(problems, 'problem') : ''}
                          </p>
                        )}
                      </div>
                      {due && <Badge tone="warning">Revise today</Badge>}
                      {next && !due && (
                        <Badge>
                          <CalendarClock className="h-3 w-3" aria-hidden />
                          Revise {fmtDay(next, 'd MMM')}
                        </Badge>
                      )}
                      {topic.notes && (
                        <span title="Has notes" className="text-muted-foreground">
                          <StickyNote className="h-3.5 w-3.5" aria-hidden />
                          <span className="sr-only">Has notes</span>
                        </span>
                      )}
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
                    </li>
                  )
                })}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  )
}
