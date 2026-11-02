import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { NotebookPen, Pencil, Pin, PinOff, Plus, Search, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { DateNav } from '@/components/shared/DateNav'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/form'
import { Badge, Segmented } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { useConfirm } from '@/components/shared/Confirm'
import { Journal } from '@/features/planner/Journal'
import { NoteDialog } from '@/features/notes/NoteDialog'
import { Markdown } from '@/lib/markdown'
import { useTables } from '@/hooks/store'
import * as store from '@/hooks/store'
import { useToday } from '@/hooks/useToday'
import { useAction } from '@/hooks/useAction'
import { fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'

export default function NotesPage() {
  const today = useToday()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState('notes')
  const [date, setDate] = useState(null)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [tag, setTag] = useState('')
  const [dlg, setDlg] = useState({ open: false, note: null })
  const [view, setView] = useState(null)
  const { data, loading, error, refetch } = useTables('notes', 'goals', 'tasks')

  // deep link from global search: /notes?note=<id>
  useEffect(() => {
    const id = params.get('note')
    if (!id || loading) return
    const n = data.notes.find((x) => x.id === id)
    if (n) setView(n)
    setParams({}, { replace: true })
  }, [params, loading, data.notes, setParams])

  const categories = useMemo(() => [...new Set(data.notes.map((n) => n.category))].sort(), [data.notes])
  const tags = useMemo(() => [...new Set(data.notes.flatMap((n) => n.tags ?? []))].sort(), [data.notes])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return data.notes
      .filter(
        (n) =>
          (!category || n.category === category) &&
          (!tag || (n.tags ?? []).includes(tag)) &&
          (!s || `${n.title} ${n.body} ${(n.tags ?? []).join(' ')}`.toLowerCase().includes(s)),
      )
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at))
  }, [data.notes, q, category, tag])
  const [togglePin] = useAction((n) => store.update('notes', n.id, { pinned: !n.pinned }))
  const [del] = useAction((id) => store.remove('notes', id), { success: 'Note deleted' })
  const askDelete = async (n) => {
    if (await confirm({ title: 'Delete this note?', description: n.title || 'Untitled note' })) {
      setView(null)
      del(n.id)
    }
  }
  const day = date ?? today
  const goalName = (id) => data.goals.find((g) => g.id === id)?.title
  const taskName = (id) => data.tasks.find((t) => t.id === id)?.title
  const openTasks = data.tasks.filter((t) => t.status !== 'cancelled')

  return (
    <>
      <PageHeader
        title="Notes & Journal"
        description="Private to your account. Write in Markdown."
        actions={
          tab === 'notes' && (
            <Button onClick={() => setDlg({ open: true, note: null })}>
              <Plus className="h-4 w-4" />
              New note
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'notes', label: 'Notes' },
            { value: 'journal', label: 'Daily journal' },
          ]}
        />
        {tab === 'journal' && <DateNav date={day} onChange={setDate} today={today} />}
      </div>
      {tab === 'journal' ? (
        <Journal date={day} />
      ) : (
        <DataGate loading={loading} error={error} onRetry={refetch} cards={0}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-40 max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search notes"
                aria-label="Search notes"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select aria-label="Category" className="w-40" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            {tags.length > 0 && (
              <Select aria-label="Tag" className="w-36" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">All tags</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </Select>
            )}
          </div>
          {data.notes.length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title="No notes yet"
              description="Capture ideas, meeting notes and things you learn. Add tags and attach notes to goals or tasks."
              action={<Button onClick={() => setDlg({ open: true, note: null })}>Write your first note</Button>}
            />
          ) : list.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No notes match your search.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((n) => (
                <Card key={n.id} className={cn('transition-colors hover:border-muted-foreground/40', n.pinned && 'border-primary/40')}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <button onClick={() => setView(n)} className="min-w-0 flex-1 text-left">
                        <h3 className="truncate text-sm font-semibold">
                          {n.pinned && <Pin className="mr-1 inline h-3 w-3 text-secondary" aria-label="pinned" />}
                          {n.title || 'Untitled'}
                        </h3>
                      </button>
                      <Menu
                        label={`Actions for ${n.title || 'note'}`}
                        items={[
                          { label: 'Edit', icon: Pencil, onClick: () => setDlg({ open: true, note: n }) },
                          { label: n.pinned ? 'Unpin' : 'Pin', icon: n.pinned ? PinOff : Pin, onClick: () => togglePin(n) },
                          { label: 'Delete', icon: Trash2, danger: true, onClick: () => askDelete(n) },
                        ]}
                      />
                    </div>
                    <button onClick={() => setView(n)} className="block w-full text-left">
                      <p className="line-clamp-4 whitespace-pre-line text-[13px] text-muted-foreground">
                        {n.body.replace(/[#*`>[\]-]/g, '').trim() || ' '}
                      </p>
                    </button>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="primary">{n.category}</Badge>
                      {(n.tags ?? []).map((t) => (
                        <button key={t} onClick={() => setTag(t)}>
                          <Badge>#{t}</Badge>
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {fmtDay(n.updated_at.slice(0, 10), 'd MMM yyyy')}
                      {n.goal_id && goalName(n.goal_id) ? ` · Goal: ${goalName(n.goal_id)}` : ''}
                      {n.task_id && taskName(n.task_id) ? ` · Task: ${taskName(n.task_id)}` : ''}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <NoteDialog
            open={dlg.open}
            note={dlg.note}
            goals={data.goals}
            tasks={openTasks}
            categories={categories}
            onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))}
          />
          {view && (
            <NoteViewer
              note={data.notes.find((x) => x.id === view.id) ?? view}
              goalName={goalName(view.goal_id)}
              taskName={taskName(view.task_id)}
              onClose={() => setView(null)}
              onEdit={() => {
                setDlg({ open: true, note: view })
                setView(null)
              }}
              onDelete={() => askDelete(view)}
            />
          )}
        </DataGate>
      )}
    </>
  )
}

import { Dialog } from '@/components/ui/dialog'
function NoteViewer({ note, goalName, taskName, onClose, onEdit, onDelete }) {
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={note.title || 'Untitled'}
      description={`${note.category} · updated ${fmtDay(note.updated_at.slice(0, 10), 'd MMM yyyy')}`}
      className="md:max-w-2xl"
      footer={
        <>
          <Button variant="ghost" className="text-danger" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </>
      }
    >
      <Markdown source={note.body} />
      {(note.tags?.length > 0 || goalName || taskName) && (
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-3">
          {(note.tags ?? []).map((t) => (
            <Badge key={t}>#{t}</Badge>
          ))}
          {goalName && <Badge tone="success">Goal: {goalName}</Badge>}
          {taskName && <Badge tone="warning">Task: {taskName}</Badge>}
        </div>
      )}
    </Dialog>
  )
}
