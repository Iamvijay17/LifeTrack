import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { freshBackend, renderApp, signedInUser, db } from './helpers'

beforeEach(async () => { await freshBackend(); await signedInUser() })

async function createHabit(name) {
  await userEvent.click(screen.getAllByRole('button', { name: /new habit|create a habit/i })[0])
  const dialog = await screen.findByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Name'), name)
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

describe('Habits page', () => {
  it('starts with an empty state that leads to creating the first habit', async () => {
    renderApp('/habits')
    expect(await screen.findByText('Build your first habit')).toBeInTheDocument()
    await createHabit('Read 20 pages')
    expect(await screen.findByRole('button', { name: 'Complete Read 20 pages' })).toBeInTheDocument()
    expect(screen.queryByText('Build your first habit')).toBeNull()
    expect(await db.list('habits')).toHaveLength(1)
  })

  it('rejects an empty name inside the dialog and keeps it open', async () => {
    renderApp('/habits')
    await screen.findByText('Build your first habit')
    await userEvent.click(screen.getAllByRole('button', { name: /new habit/i })[0])
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(within(dialog).getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true'))
    expect(await db.list('habits')).toHaveLength(0)
  })

  it('a check-in toggles done, is stored once, and can be undone', async () => {
    renderApp('/habits')
    await screen.findByText('Build your first habit')
    await createHabit('Meditate')
    const complete = await screen.findByRole('button', { name: 'Complete Meditate' })
    await userEvent.click(complete)
    const undo = await screen.findByRole('button', { name: 'Undo Meditate' })
    expect(undo).toHaveAttribute('aria-pressed', 'true')
    await waitFor(async () => expect(await db.list('habit_logs')).toHaveLength(1))
    expect((await db.list('habit_logs'))[0].status).toBe('done')
    expect(screen.getByText('1/1')).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 650)) // the accidental-double-tap guard window
    await userEvent.click(undo)
    await screen.findByRole('button', { name: 'Complete Meditate' })
    await waitFor(async () => expect(await db.list('habit_logs')).toHaveLength(0))
  })

  it('ignores an accidental double tap (no duplicate toggle)', async () => {
    renderApp('/habits')
    await screen.findByText('Build your first habit')
    await createHabit('Stretch')
    const btn = await screen.findByRole('button', { name: 'Complete Stretch' })
    await userEvent.dblClick(btn)
    await waitFor(async () => expect(await db.list('habit_logs')).toHaveLength(1))
    expect(await screen.findByRole('button', { name: 'Undo Stretch' })).toBeInTheDocument()
  })

  it('deleting asks for confirmation; cancelling keeps the habit, confirming removes it', async () => {
    renderApp('/habits')
    await screen.findByText('Build your first habit')
    await createHabit('Journal')
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Journal' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(await db.list('habits')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Journal' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect(await db.list('habits')).toHaveLength(0))
    expect(await screen.findByText('Build your first habit')).toBeInTheDocument()
  })

  it("never shows another user's habits", async () => {
    renderApp('/habits')
    await screen.findByText('Build your first habit')
    await createHabit('Mine')
    await screen.findByRole('button', { name: 'Complete Mine' })
    expect(await db.list('habits')).toHaveLength(1)
    const { auth } = await import('@/services/auth')
    await auth.signOut(); await auth.signUp('bob@example.com', 'secret123', 'Bob')
    expect(await db.list('habits')).toHaveLength(0)
  })
})
