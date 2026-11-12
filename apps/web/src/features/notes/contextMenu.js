import { Copy, CopyPlus, Download, ExternalLink, ListChecks, Pencil, Pin, PinOff, Plus, TextCursorInput, Trash2 } from 'lucide-react'
import { SEPARATOR } from '@/components/context-menu/items'
import { bulkDelete, changeField, changeFields, count, duplicateRow } from '@/components/context-menu/helpers'
import { copyText } from '@/components/context-menu/clipboard'
import { download } from '@/services/csv'
import * as store from '@/hooks/store'

const asMarkdown = (n) => `# ${n.title || 'Untitled'}\n\n${n.body ?? ''}`.trimEnd()

/** One note. `d`: { onOpen, onEdit, ask, select } */
export function noteItems(n, d) {
  return [
    { label: 'Open', icon: ExternalLink, onSelect: () => d.onOpen(n) },
    { label: 'Edit note', icon: Pencil, onSelect: () => d.onEdit(n) },
    {
      label: n.pinned ? 'Unpin' : 'Pin to top',
      icon: n.pinned ? PinOff : Pin,
      onSelect: () => changeField('notes', n, { pinned: !n.pinned }, n.pinned ? 'Note unpinned' : 'Note pinned'),
    },
    SEPARATOR,
    {
      label: 'Rename',
      icon: TextCursorInput,
      onSelect: async () => {
        const title = await d.ask({ title: 'Rename note', label: 'Title', value: n.title ?? '', maxLength: 160 })
        if (title && title !== n.title) return changeField('notes', n, { title }, 'Note renamed')
      },
    },
    {
      label: 'Duplicate',
      icon: CopyPlus,
      onSelect: () => duplicateRow('notes', n, { title: `${n.title || 'Untitled'} (copy)`, pinned: false }, 'Note duplicated'),
    },
    { label: 'Copy as Markdown', icon: Copy, onSelect: () => copyText(asMarkdown(n), { success: 'Note copied' }) },
    {
      label: 'Export as Markdown',
      icon: Download,
      onSelect: () => {
        download(`${(n.title || 'note').replace(/[^\w-]+/g, '-').slice(0, 60)}.md`, asMarkdown(n), 'text/markdown;charset=utf-8')
        return { message: 'Note exported' }
      },
    },
    { label: 'Select', icon: ListChecks, onSelect: () => d.select?.(n.id) },
    SEPARATOR,
    {
      label: 'Delete note',
      icon: Trash2,
      danger: true,
      confirm: { title: 'Delete this note?', description: n.title || 'Untitled note', confirmLabel: 'Delete' },
      onSelect: async () => {
        await store.remove('notes', n.id)
        return { message: 'Note deleted' }
      },
    },
  ]
}

export function noteBulkItems(notes) {
  return [
    {
      label: 'Pin',
      icon: Pin,
      hidden: notes.every((n) => n.pinned),
      onSelect: () => changeFields('notes', notes, { pinned: true }, `${count(notes.length, 'note')} pinned`),
    },
    {
      label: 'Unpin',
      icon: PinOff,
      hidden: notes.every((n) => !n.pinned),
      onSelect: () => changeFields('notes', notes, { pinned: false }, `${count(notes.length, 'note')} unpinned`),
    },
    {
      label: `Export ${count(notes.length, 'note')} as Markdown`,
      icon: Download,
      onSelect: () => {
        download('lifetrack-notes.md', notes.map(asMarkdown).join('\n\n---\n\n'), 'text/markdown;charset=utf-8')
        return { message: 'Notes exported' }
      },
    },
    SEPARATOR,
    bulkDelete(
      'notes',
      notes.map((n) => n.id),
      'note',
    ),
  ]
}

export const notesPageItems = ({ newNote }) => [{ label: 'New note', icon: Plus, onSelect: newNote }]
