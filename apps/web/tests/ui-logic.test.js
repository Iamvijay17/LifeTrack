import '@testing-library/jest-dom/vitest'
import { describe, it, expect } from 'vitest'
import { parseBlocks } from '@/lib/markdown'
import { searchAll } from '@/components/layout/GlobalSearch'
import { parseTags } from '@/domain/notes'

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
