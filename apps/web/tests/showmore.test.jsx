import '@testing-library/jest-dom/vitest'
import { describe, it, expect } from 'vitest'
import { render, screen, renderHook, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useShowMore } from '@/hooks/useShowMore'
import { ShowMore } from '@/components/shared/ShowMore'
import { InboxTab } from '@/features/notifications/InboxTab'
import { SessionsTab } from '@/features/learning/SessionsTab'
import { MemoryRouter } from 'react-router-dom'
import { dateStrInTz } from '@/lib/dates'

const items = Array.from({ length: 120 }, (_, i) => i)

describe('useShowMore', () => {
  it('shows one page, then grows by a page, never beyond the list', () => {
    const { result } = renderHook(() => useShowMore(items, 50))
    expect(result.current.visible).toHaveLength(50)
    expect(result.current.more).toBe(70)
    act(() => result.current.showMore())
    expect(result.current.visible).toHaveLength(100)
    act(() => result.current.showMore())
    expect(result.current.visible).toHaveLength(120)
    expect(result.current.more).toBe(0)
  })
  it('keeps the original order and the first items', () => {
    const { result } = renderHook(() => useShowMore(items, 3))
    expect(result.current.visible).toEqual([0, 1, 2])
  })
  it('starts over when the reset key (filter) changes', () => {
    const { result, rerender } = renderHook(({ k }) => useShowMore(items, 50, k), { initialProps: { k: 'a' } })
    act(() => result.current.showMore())
    expect(result.current.visible).toHaveLength(100)
    rerender({ k: 'b' })
    expect(result.current.visible).toHaveLength(50)
  })
  it('short lists are returned untouched', () => {
    const short = [1, 2]
    const { result } = renderHook(() => useShowMore(short, 50))
    expect(result.current.visible).toBe(short)
    expect(result.current.more).toBe(0)
  })
})

describe('ShowMore', () => {
  it('renders nothing when nothing is hidden', () => {
    const { container } = render(<ShowMore more={0} onClick={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('says how many are hidden and the size of the next page', async () => {
    let n = 0
    render(<ShowMore more={7} step={50} onClick={() => n++} />)
    await userEvent.click(screen.getByRole('button', { name: /Show 7 more/ }))
    expect(screen.getByText('(7 hidden)')).toBeInTheDocument()
    expect(n).toBe(1)
  })
})

describe('long lists no longer hide older rows', () => {
  it('inbox: 120 notifications → 50, then all', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({
      id: `n${i}`,
      title: `note ${i}`,
      body: '',
      link: '',
      priority: 'normal',
      created_at: '2026-03-01T00:00:00Z',
      read_at: null,
      kind: 'custom',
    }))
    const actions = { read: () => {}, unread: () => {}, dismiss: () => {}, restore: () => {}, snooze: () => {}, remove: () => {} }
    render(
      <MemoryRouter>
        <InboxTab
          rows={rows}
          now={Date.parse('2026-03-02T00:00:00Z')}
          tz="Asia/Kolkata"
          actions={actions}
          onOpen={() => {}}
          onPickTime={() => {}}
          onCreateReminder={() => {}}
        />
      </MemoryRouter>,
    )
    expect(screen.getAllByTestId('notification')).toHaveLength(50)
    await userEvent.click(screen.getByRole('button', { name: /Show 50 more/ }))
    await userEvent.click(screen.getByRole('button', { name: /Show 20 more/ }))
    expect(screen.getAllByTestId('notification')).toHaveLength(120)
    expect(screen.queryByRole('button', { name: /Show .* more/ })).not.toBeInTheDocument()
  })
  it('sessions: 150 sessions are all reachable (used to stop silently at 100)', async () => {
    const history = Array.from({ length: 150 }, (_, i) => ({
      id: `s${i}`,
      session_date: '2026-03-01',
      duration_seconds: 600,
      status: 'completed',
      title: `S${i}`,
    }))
    render(<SessionsTab history={history} goals={[]} topics={[]} onEdit={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Show 50 more/ }))
    await userEvent.click(screen.getByRole('button', { name: /Show 50 more/ }))
    expect(screen.getAllByRole('listitem')).toHaveLength(150)
  })
})

describe('dateStrInTz (cached formatter)', () => {
  it('still gives the right day per timezone when calls alternate', () => {
    const t = '2026-03-10T20:00:00Z'
    for (let i = 0; i < 3; i++) {
      expect(dateStrInTz(t, 'Asia/Kolkata')).toBe('2026-03-11')
      expect(dateStrInTz(t, 'America/Los_Angeles')).toBe('2026-03-10')
      expect(dateStrInTz(new Date(t), 'UTC')).toBe('2026-03-10')
    }
  })
})
