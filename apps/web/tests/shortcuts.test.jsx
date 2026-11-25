import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useShortcuts } from '@/features/command/useShortcuts'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import {
  DEFAULT_CHORDS,
  buildRegistry,
  chordKeyProblem,
  chordTable,
  findConflicts,
  keycaps,
  normalizeOverrides,
  validChordKey,
} from '@/lib/shortcuts'
import { getChordTables, reloadShortcutPrefs, resetShortcuts, setChordKey } from '@/hooks/useShortcutPrefs'
import ShortcutsPage from '@/features/shortcuts/ShortcutsPage'

const label = (g, t) => `${g}:${t}`

describe('shortcut registry', () => {
  it('shows Mod as Command on a Mac and Ctrl elsewhere', () => {
    expect(keycaps(['Mod', 'Shift', 'N'], true)).toEqual(['⌘', '⇧', 'N'])
    expect(keycaps(['Mod', 'Shift', 'N'], false)).toEqual(['Ctrl', 'Shift', 'N'])
  })
  it('has no conflicts by default', () => {
    expect(findConflicts(buildRegistry({}, label))).toEqual([])
  })
  it('detects two shortcuts that share keys', () => {
    const rows = buildRegistry({}, label)
    rows.push({ id: 'x', group: 'Create', label: 'Something else', keys: ['c', 't'], scope: 'global' })
    expect(findConflicts(rows)).toHaveLength(1)
  })
  it('validates chord keys and refuses a key already used in the group', () => {
    expect(validChordKey('x')).toBe(true)
    expect(validChordKey('ab')).toBe(false)
    expect(validChordKey(' ')).toBe(false)
    expect(chordKeyProblem('go', '/finance', 'd', {})).toMatch(/already used/)
    expect(chordKeyProblem('go', '/finance', 'm', {})).toBeNull() // its own key
    expect(chordKeyProblem('go', '/finance', 'z', {})).toBeNull()
  })
  it('drops invalid or colliding stored remaps', () => {
    const o = normalizeOverrides({ go: { '/finance': 'd', '/nope': 'q', '/habits': 'zz' }, create: { task: 'y' } })
    expect(o.go).toEqual({}) // 'd' collides with the dashboard, the rest are invalid
    expect(o.create).toEqual({ task: 'y' })
    expect(chordTable('create', o).y).toBe('task')
    expect(DEFAULT_CHORDS.go['/finance']).toBe('m')
  })
})

describe('remapping persists and feeds the listener table', () => {
  beforeEach(() => {
    localStorage.clear()
    reloadShortcutPrefs()
  })
  it('applies a remap and resets it', () => {
    expect(setChordKey('go', '/finance', 'z')).toBeNull()
    expect(getChordTables().go.z).toBe('/finance')
    expect(getChordTables().go.m).toBeUndefined()
    expect(setChordKey('go', '/habits', 'z')).toMatch(/already used/)
    reloadShortcutPrefs()
    expect(getChordTables().go.z).toBe('/finance') // survives a reload
    resetShortcuts()
    expect(getChordTables().go.m).toBe('/finance')
  })
})

describe('Shortcuts page', () => {
  beforeEach(() => {
    localStorage.clear()
    reloadShortcutPrefs()
  })
  const open = () =>
    render(
      <MemoryRouter>
        <ShortcutsPage />
      </MemoryRouter>,
    )
  it('lists shortcuts, filters them, and switches between Mac and Windows keys', async () => {
    const user = userEvent.setup()
    open()
    expect(screen.getByText('Quick create')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Mac' }))
    expect(screen.getAllByText('⌘').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('tab', { name: /Windows/ }))
    expect(screen.getAllByText('Ctrl').length).toBeGreaterThan(0)
    await user.type(screen.getByLabelText('Search shortcuts'), 'undo')
    expect(screen.getByText('Undo the last action')).toBeInTheDocument()
    expect(screen.queryByText('Quick create')).not.toBeInTheDocument()
    expect(screen.queryByTestId('shortcut-conflicts')).not.toBeInTheDocument()
  })
  it('remaps a key by pressing it, explains a clash, and can reset', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: 'Change the key for Finance' }))
    await user.keyboard('d') // already the dashboard's
    expect(screen.getByRole('status')).toHaveTextContent(/already used/)
    await user.keyboard('z')
    const row = screen.getByText('Finance').closest('li')
    expect(within(row).getByText('z')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Reset my keys/ }))
    expect(within(screen.getByText('Finance').closest('li')).getByText('m')).toBeInTheDocument()
  })
})

describe('global key handling', () => {
  function Host({ h }) {
    useShortcuts(h)
    return <input aria-label="box" />
  }
  const handlers = () => ({
    toggle: vi.fn(),
    open: vi.fn(),
    help: vi.fn(),
    go: vi.fn(),
    create: vi.fn(),
    quick: vi.fn(),
    paletteOpen: false,
  })
  beforeEach(() => {
    localStorage.clear()
    reloadShortcutPrefs()
  })
  it('Mod+Shift+N opens quick create and Mod+/ opens the sheet, but not while typing', async () => {
    const user = userEvent.setup()
    const h = handlers()
    render(<Host h={h} />)
    await user.keyboard('{Control>}{Shift>}n{/Shift}{/Control}')
    expect(h.quick).toHaveBeenCalledTimes(1)
    await user.keyboard('{Control>}/{/Control}')
    expect(h.help).toHaveBeenCalledTimes(1)
    screen.getByLabelText('box').focus()
    await user.keyboard('{Control>}{Shift>}n{/Shift}{/Control}')
    expect(h.quick).toHaveBeenCalledTimes(1)
  })
  it('a remapped chord key goes to its page, and the old key no longer does', async () => {
    const user = userEvent.setup()
    setChordKey('go', '/finance', 'z')
    const h = handlers()
    render(<Host h={h} />)
    await user.keyboard('gz')
    expect(h.go).toHaveBeenCalledWith('/finance')
    h.go.mockClear()
    await user.keyboard('gm')
    expect(h.go).not.toHaveBeenCalled()
  })
})
