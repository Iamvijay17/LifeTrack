import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { NotebookPen, Plus, Search } from 'lucide-react'
import { SelectionBar, useContextMenu, usePageContextMenu, useSelection } from '@/components/context-menu'
import { usePrompt } from '@/components/shared/Prompt'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { DateNav } from '@/components/shared/DateNav'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { useConfirm } from '@/components/shared/Confirm'
import { Journal } from '@/features/notes/Journal'
import { NoteDialog } from '@/features/notes/NoteDialog'
import { noteBulkItems, noteItems, notesPageItems } from '@/features/notes/contextMenu'
import { NoteCard } from '@/features/notes/NoteCard'
import { NoteViewer } from '@/features/notes/NoteViewer'
import { filterNotes, noteCategories, noteTags } from '@/domain/notes'
import { useTables } from '@/hooks/store'
import * as store from '@/hooks/store'
import { useShowMore } from '@/hooks/useShowMore'
import { ShowMore } from '@/components/shared/ShowMore'
import { useToday } from '@/hooks/useToday'
import { useAction } from '@/hooks/useAction'

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

  const categories = useMemo(() => noteCategories(data.notes), [data.notes])
  const tags = useMemo(() => noteTags(data.notes), [data.notes])
  const list = useMemo(() => filterNotes(data.notes, { q, category, tag }), [data.notes, q, category, tag])
  const page = useShowMore(list, 30, `${q}|${category}|${tag}`)
  const [togglePin] = useAction((n) => store.update('notes', n.id, { pinned: !n.pinned }))
  const [del] = useAction((id) => store.remove('notes', id), { success: 'Note deleted' })
  const askDelete = async (n) => {
    if (await confirm({ title: 'Delete this note?', description: n.title || 'Untitled note' })) {
      setView(null)
      del(n.id)
    }
  }
  const menu = useContextMenu()
  const ask = usePrompt()
  const sel = useSelection(useMemo(() => list.map((n) => n.id), [list]))
  const bulk = (ids) => noteBulkItems(ids.map((id) => data.notes.find((n) => n.id === id)).filter(Boolean))
  usePageContextMenu(() => (tab === 'notes' ? notesPageItems({ newNote: () => setDlg({ open: true, note: null }) }) : []))
  const cardProps = (n) => ({
    ...sel.itemProps(n.id),
    ...menu.bind(
      () => {
        const ids = sel.targets(n.id)
        return ids.length > 1
          ? bulk(ids)
          : noteItems(n, { onOpen: setView, onEdit: (note) => setDlg({ open: true, note }), ask, select: sel.add })
      },
      { label: `Actions for ${n.title || 'note'}` },
    ),
  })
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
            <>
              <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 [&>*]:mb-3 [&>*]:break-inside-avoid">
                {page.visible.map((n) => (
                  <NoteCard
                    key={n.id}
                    note={n}
                    goalName={goalName(n.goal_id)}
                    taskName={taskName(n.task_id)}
                    onOpen={setView}
                    onEdit={(note) => setDlg({ open: true, note })}
                    onTogglePin={togglePin}
                    onDelete={askDelete}
                    onTag={setTag}
                    ctxProps={cardProps(n)}
                  />
                ))}
              </div>
              <ShowMore more={page.more} step={30} onClick={page.showMore} />
            </>
          )}
          <SelectionBar selection={sel} noun="note" build={() => bulk([...sel.selected])} />
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
