import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createHistory, history } from '@/lib/actionHistory'

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
const { useUndoShortcuts } = await import('@/hooks/useUndoShortcuts')

describe('createHistory', () => {
  it('undoes the latest action and redoes it, and a new action clears redo', async () => {
    const h = createHistory()
    const log = []
    h.push({ label: 'a', undo: () => log.push('undo a'), redo: () => log.push('redo a') })
    expect(h.canUndo).toBe(true)
    expect(await h.undo()).toMatchObject({ ok: true, label: 'a' })
    expect(h.canRedo).toBe(true)
    expect(await h.redo()).toMatchObject({ ok: true })
    await h.undo()
    h.push({ label: 'b', undo: () => {} })
    expect(h.canRedo).toBe(false)
    expect(log).toEqual(['undo a', 'redo a', 'undo a'])
  })
  it('refuses an expired entry instead of reversing it', async () => {
    let t = 0
    const h = createHistory({ now: () => t, ttl: 1000 })
    const undo = vi.fn()
    const e = h.push({ label: 'old', undo })
    t = 5000
    expect(await h.undo(e)).toMatchObject({ ok: false })
    expect(undo).not.toHaveBeenCalled()
    expect(h.canUndo).toBe(false)
  })
  it('refuses when the data changed since (stale guard) and drops the entry', async () => {
    const h = createHistory()
    let stillSame = true
    const undo = vi.fn()
    h.push({ label: 'edit', undo, check: () => stillSame })
    stillSame = false
    expect(await h.undo()).toMatchObject({ ok: false, reason: 'stale' })
    expect(undo).not.toHaveBeenCalled()
    expect(h.canUndo).toBe(false)
  })
  it('keeps an entry that failed so it can be retried', async () => {
    const h = createHistory()
    let fail = true
    h.push({
      label: 'x',
      undo: () => {
        if (fail) throw new Error('offline')
      },
    })
    expect(await h.undo()).toMatchObject({ ok: false, reason: 'failed' })
    fail = false
    expect(await h.undo()).toMatchObject({ ok: true })
  })
  it('ignores entries without undo and caps its size', () => {
    const h = createHistory({ max: 2 })
    expect(h.push({ label: 'irreversible' })).toBeNull()
    for (const l of ['1', '2', '3']) h.push({ label: l, undo: () => {} })
    expect(h.entries()).toEqual(['3', '2'])
  })
})

describe('Ctrl+Z', () => {
  function Host() {
    useUndoShortcuts()
    return <input aria-label="field" />
  }
  beforeEach(() => history.clear())
  it('undoes and redoes through the shared history, but not while typing', async () => {
    const user = userEvent.setup()
    const undo = vi.fn()
    const redo = vi.fn()
    history.push({ label: 'x', undo, redo })
    const { getByLabelText } = render(<Host />)
    getByLabelText('field').focus()
    await user.keyboard('{Control>}z{/Control}')
    expect(undo).not.toHaveBeenCalled() // the text field keeps its own undo
    getByLabelText('field').blur()
    await user.keyboard('{Control>}z{/Control}')
    expect(undo).toHaveBeenCalledTimes(1)
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    expect(redo).toHaveBeenCalledTimes(1)
  })
  it('says why when it refuses', async () => {
    const user = userEvent.setup()
    history.push({ label: 'x', undo: vi.fn(), check: () => false })
    render(<Host />)
    await user.keyboard('{Control>}z{/Control}')
    expect(toast.message).toHaveBeenCalledWith(
      "Can't undo",
      expect.objectContaining({ description: expect.stringMatching(/overwrite newer data/) }),
    )
  })
})
