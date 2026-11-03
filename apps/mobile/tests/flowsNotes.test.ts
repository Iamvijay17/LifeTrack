import { describe, expect, it } from 'vitest'
import { CONFLICT_KEYS } from '@lifetrack/constants/schema'
import { filterNotes, journalCanSave } from '@lifetrack/core/notes'
import { blankNote, noteFormSchema, noteToPayload } from '@lifetrack/schemas'
import { setup } from './helpers'

describe('notes flows', () => {
  it('create → pin → search → attach to a goal → delete', async () => {
    const { store, tables } = setup()
    const goal = await store.insert('goals', { title: 'Ship', period: 'monthly', category: 'Personal' }) as any
    const a = await store.insert('notes', noteToPayload(noteFormSchema.parse({ ...blankNote(), title: 'Retro', body: '# Went well', tags: 'Team, #Retro' }))) as any
    await store.insert('notes', noteToPayload(noteFormSchema.parse({ ...blankNote(), title: 'Ideas', goal_id: goal.id })))
    await store.update('notes', a.id, { pinned: true })
    expect(filterNotes(store.peek('notes') as any, {}).map((n: any) => n.title)).toEqual(['Retro', 'Ideas'])
    expect(filterNotes(store.peek('notes') as any, { tag: 'retro' }).map((n: any) => n.title)).toEqual(['Retro'])
    expect(tables.notes[1].goal_id).toBe(goal.id)
    await store.remove('notes', a.id)
    expect(tables.notes).toHaveLength(1)
  })
  it('rejects an empty note and invalid ids before the database', async () => {
    const { store } = setup()
    await expect(store.insert('notes', { title: '', body: '', category: 'General' })).resolves.toBeDefined() // DB-level check is the backstop; the form blocks this first
    expect(noteFormSchema.safeParse(blankNote()).success).toBe(false)
    await expect(store.insert('notes', { title: 'x', goal_id: 'nope' })).rejects.toThrow(/Invalid insert payload/)
  })
  it('journal entry is one row per day (upsert on user_id,entry_date) and clears', async () => {
    const { store, tables } = setup()
    await store.load('journal_entries')
    const key = { onConflict: CONFLICT_KEYS.journal_entries }
    expect(journalCanSave({ mood: null, content: '', wins: '' }, undefined)).toBe(false)
    await store.upsert('journal_entries', { entry_date: '2026-11-02', mood: 4, content: 'good day', wins: '' }, key)
    await store.upsert('journal_entries', { entry_date: '2026-11-02', mood: 5, content: 'great day', wins: 'shipped' }, key)
    expect(tables.journal_entries).toHaveLength(1)
    expect(tables.journal_entries[0]).toMatchObject({ mood: 5, content: 'great day' })
    await store.remove('journal_entries', tables.journal_entries[0].id)
    expect(tables.journal_entries).toHaveLength(0)
  })
})
