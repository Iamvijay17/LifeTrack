import { describe, expect, it } from 'vitest'
import { filterNotes, journalCanSave, journalDirty, noteCategories, notePreview, noteTags, parseBlocks, parseTags, tokenizeInline } from '../src/notes'

describe('markdown', () => {
  it('tokenizes inline styles and neutralises unsafe links', () => {
    expect(tokenizeInline('a **b** *c* `d` [ok](https://x.dev) [bad](javascript:alert(1))')).toEqual([
      { type: 'text', text: 'a ' }, { type: 'bold', text: 'b' }, { type: 'text', text: ' ' }, { type: 'italic', text: 'c' }, { type: 'text', text: ' ' },
      { type: 'code', text: 'd' }, { type: 'text', text: ' ' }, { type: 'link', text: 'ok', url: 'https://x.dev' }, { type: 'text', text: ' ' }, { type: 'text', text: 'bad' }, { type: 'text', text: ')' },
    ])
    expect(tokenizeInline('<script>x</script>')).toEqual([{ type: 'text', text: '<script>x</script>' }]) // never interpreted as markup
  })
  it('parses blocks', () => {
    const b = parseBlocks('# T\n\npara one\nline two\n\n- a\n- [x] done\n- [ ] todo\n\n1. x\n2. y\n\n> q\n\n```\ncode\n```\n---')
    expect(b.map((x) => x.type)).toEqual(['h', 'p', 'ul', 'ol', 'quote', 'code', 'hr'])
    expect(b[1].text).toBe('para one line two')
    expect(b[2].items).toEqual([{ text: 'a' }, { text: 'done', checked: true }, { text: 'todo', checked: false }])
    expect(parseBlocks('')).toEqual([])
  })
})
describe('notes list', () => {
  const N = (o) => ({ id: o.t, title: o.t, body: '', category: 'General', tags: [], pinned: false, updated_at: '2026-11-01T00:00:00Z', ...o })
  const notes = [N({ t: 'old', updated_at: '2026-10-01T00:00:00Z', tags: ['react'] }), N({ t: 'new', category: 'Career', tags: ['interview', 'react'] }), N({ t: 'pinned', pinned: true, updated_at: '2026-09-01T00:00:00Z', body: 'Find ME' })]
  it('sorts pinned first then recent, and filters', () => {
    expect(filterNotes(notes).map((n) => n.title)).toEqual(['pinned', 'new', 'old'])
    expect(filterNotes(notes, { tag: 'react' }).map((n) => n.title)).toEqual(['new', 'old'])
    expect(filterNotes(notes, { category: 'Career' }).map((n) => n.title)).toEqual(['new'])
    expect(filterNotes(notes, { q: ' find me ' }).map((n) => n.title)).toEqual(['pinned'])
    expect(noteCategories(notes)).toEqual(['Career', 'General'])
    expect(noteTags(notes)).toEqual(['interview', 'react'])
  })
  it('parses tags and previews', () => {
    expect(parseTags('React, #Interview, react,  ,')).toEqual(['react', 'interview'])
    expect(parseTags(Array.from({ length: 20 }, (_, i) => 't' + i).join(',')).length).toBe(12)
    expect(notePreview('# Hi **there**')).toBe('Hi there')
  })
})
describe('journal', () => {
  it('tracks dirty state and when saving is allowed', () => {
    const entry = { mood: 3, content: 'x', wins: '' }
    expect(journalDirty({ mood: 3, content: 'x', wins: '' }, entry)).toBe(false)
    expect(journalDirty({ mood: 4, content: 'x', wins: '' }, entry)).toBe(true)
    expect(journalCanSave({ mood: null, content: '  ', wins: '' }, undefined)).toBe(false)
    expect(journalCanSave({ mood: 5, content: '', wins: '' }, undefined)).toBe(true)
    expect(journalCanSave({ mood: 3, content: 'x', wins: '' }, entry)).toBe(false)
  })
})
