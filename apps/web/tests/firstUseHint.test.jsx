import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FirstUseHint } from '@/components/shared/FirstUseHint'
import { updateOnboarding } from '@/hooks/useOnboarding'

const hint = () => (
  <FirstUseHint id="demo-hint" title="Try this" keys={['Mod', 'K']}>
    Something useful.
  </FirstUseHint>
)
beforeEach(() => {
  localStorage.removeItem('lifetrack:onboarding:skip')
  act(() => updateOnboarding({ status: 'done', offered: {} }))
})

describe('FirstUseHint', () => {
  it('shows once, shows the shortcut, and stays dismissed', async () => {
    const user = userEvent.setup()
    const { unmount } = render(hint())
    expect(screen.getByText('Try this')).toBeInTheDocument()
    expect(screen.getByText(/Ctrl|⌘/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /got it/i }))
    expect(screen.queryByText('Try this')).not.toBeInTheDocument()
    unmount()
    render(hint())
    expect(screen.queryByText('Try this')).not.toBeInTheDocument()
  })
  it('is hidden in automated runs, which would otherwise have every layout shifted by it', () => {
    localStorage.setItem('lifetrack:onboarding:skip', '1')
    render(hint())
    expect(screen.queryByText('Try this')).not.toBeInTheDocument()
  })
  it('stays out of the way while the welcome setup is open', () => {
    act(() => updateOnboarding({ status: 'in_progress' }))
    render(hint())
    expect(screen.queryByText('Try this')).not.toBeInTheDocument()
  })
})
