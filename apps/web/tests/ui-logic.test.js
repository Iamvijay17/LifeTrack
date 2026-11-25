import '@testing-library/jest-dom/vitest'
import { describe, it, expect } from 'vitest'
import { parseBlocks } from '@/lib/markdown'
import { searchAll } from '@/components/layout/GlobalSearch'
import { parseTags } from '@/domain/notes'
import { plural, pluralWord } from '@/lib/format'
import { count } from '@/components/context-menu/helpers'

const D = '2026-11-02' // a Monday

describe('markdown', () => {
  it('parses blocks and checklists', () => {
    const b = parseBlocks('# Title\n\nhello **world**\n\n- a\n- [x] done\n- [ ] todo\n\n> quote\n\n```\ncode\n```')
    expect(b.map((x) => x.type)).toEqual(['h', 'p', 'ul', 'quote', 'code'])
    expect(b[2].items).toEqual([{ text: 'a' }, { text: 'done', checked: true }, { text: 'todo', checked: false }])
  })
})

describe('search & tags', () => {
  it('finds across modules and pages, case-insensitively', () => {
    const data = {
      tasks: [{ id: 't', title: 'Read React docs', due_date: D }],
      notes: [{ id: 'n', title: 'Ideas', body: 'react hooks', category: 'Learning', tags: [] }],
      goals: [{ id: 'g', title: 'Ship', notes: '' }],
      job_applications: [],
      habits: [],
      transactions: [],
    }
    const groups = searchAll('REACT', data)
    expect(groups.map((g) => g.title)).toEqual(['Tasks', 'Notes'])
    expect(searchAll('focus', data)[0].items[0].to).toBe('/focus')
    expect(searchAll('   ', data)).toEqual([])
  })
  it('normalises tags', () => {
    expect(parseTags('#React, react , Interview,,')).toEqual(['react', 'interview'])
  })
})

describe('plural', () => {
  it('handles nouns ending in a consonant + y ("entries", not "entrys") and leaves the rest alone', () => {
    expect([plural(1, 'entry'), plural(2, 'entry'), plural(0, 'category')]).toEqual(['1 entry', '2 entries', '0 categories'])
    expect([plural(3, 'day'), plural(2, 'key'), plural(2, 'task'), plural(1, 'task')]).toEqual(['3 days', '2 keys', '2 tasks', '1 task'])
    expect(pluralWord('check-in')).toBe('check-ins')
    expect(count(2, 'entry')).toBe('2 entries') // the context menus' bulk wording
  })
})
