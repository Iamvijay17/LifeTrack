import { describe, expect, it } from 'vitest'
import { blankNote, insertSchemas, journalFormSchema, noteFormSchema, noteToForm, noteToPayload } from '../src'

describe('note form', () => {
  it('needs a title or content and a category', () => {
    expect(noteFormSchema.safeParse(blankNote()).success).toBe(false)
    expect(noteFormSchema.safeParse({ ...blankNote(), body: '   ' }).success).toBe(false)
    expect(noteFormSchema.safeParse({ ...blankNote(), title: 'x' }).success).toBe(true)
    expect(noteFormSchema.safeParse({ ...blankNote(), title: 'x', category: ' ' }).success).toBe(false)
    expect(noteFormSchema.safeParse({ ...blankNote(), body: 'x'.repeat(20001) }).success).toBe(false)
  })
  it('maps to a database-valid payload with parsed tags', () => {
    const p = noteToPayload(noteFormSchema.parse({ ...blankNote(), title: ' Retro ', body: '# hi', tags: 'Work, #Retro' }))
    expect(p).toMatchObject({ title: 'Retro', tags: ['work', 'retro'], goal_id: null, task_id: null })
    expect(insertSchemas.notes.safeParse(p).success).toBe(true)
    expect(noteToForm({ title: 'a', body: '', category: 'Ideas', tags: ['x', 'y'], pinned: true }).tags).toBe('x, y')
  })
  it('validates journal entries', () => {
    expect(journalFormSchema.safeParse({ mood: 6, content: '', wins: '' }).success).toBe(false)
    expect(journalFormSchema.safeParse({ mood: null, content: 'a', wins: '' }).success).toBe(true)
    expect(insertSchemas.journal_entries.safeParse({ entry_date: '2026-11-02', mood: 4, content: 'a', wins: 'b' }).success).toBe(true)
  })
})
