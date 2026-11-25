import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { AnimatedValue, Collapse, MotionProvider, ProgressRing } from '@/components/motion/primitives'
import { CheckButton } from '@/components/shared/CheckButton'
import { WeekStrip } from '@/components/shared/WeekStrip'
import { Checkbox } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { celebrate } from '@/lib/celebrate'
import { moduleForPath } from '@/lib/modules'

describe('AnimatedValue', () => {
  it('shows the exact final text when animation is off', () => {
    render(<AnimatedValue value="₹1,50,000" />)
    expect(screen.getByText('₹1,50,000')).toBeInTheDocument()
  })
  it('updates to the new value', () => {
    const { rerender } = render(<AnimatedValue value="3/5" />)
    rerender(<AnimatedValue value="4/5" />)
    expect(screen.getByText('4/5')).toBeInTheDocument()
  })
  it('leaves text without numbers alone', () => {
    render(<AnimatedValue value="Not planned" />)
    expect(screen.getByText('Not planned')).toBeInTheDocument()
  })
})

describe('ProgressRing', () => {
  it('has a name for screen readers and shows its centre', () => {
    render(
      <ProgressRing value={40} label="Done">
        <span>40%</span>
      </ProgressRing>,
    )
    expect(screen.getByRole('img', { name: 'Done' })).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })
  it('draws no arc when there is nothing to measure', () => {
    const { container } = render(<ProgressRing value={null} />)
    expect(container.querySelectorAll('circle')).toHaveLength(1)
  })
})

describe('CheckButton', () => {
  it('reports its state and toggles', async () => {
    const onToggle = vi.fn()
    render(<CheckButton done={false} onToggle={onToggle} label="Complete Read" />)
    const btn = screen.getByRole('button', { name: 'Complete Read' })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(btn)
    expect(onToggle).toHaveBeenCalledOnce()
  })
  it('cannot be pressed while disabled', async () => {
    const onToggle = vi.fn()
    render(<CheckButton done disabled onToggle={onToggle} label="Undo Read" />)
    await userEvent.click(screen.getByRole('button', { name: 'Undo Read' }))
    expect(onToggle).not.toHaveBeenCalled()
  })
})

describe('Checkbox', () => {
  it('is still a real checkbox under the drawn tick', async () => {
    const onChange = vi.fn()
    render(<Checkbox checked={false} onChange={onChange} label="Show archived" />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Show archived' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('Segmented', () => {
  it('moves with the arrow keys and marks the selected tab', async () => {
    const onChange = vi.fn()
    render(
      <Segmented
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    )
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('aria-selected', 'true')
    screen.getByRole('tab', { name: 'A' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('b')
  })
})

describe('WeekStrip', () => {
  const days = [
    { date: '2026-11-02', ratio: 1, note: '2 of 2 done' },
    { date: '2026-11-03', ratio: 0 },
    { date: '2026-11-04', ratio: null },
  ]
  it('names each day, marks the selected one and reports a choice', async () => {
    const onSelect = vi.fn()
    render(<WeekStrip days={days} selected="2026-11-03" today="2026-11-03" onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: /2 November, 2 of 2 done/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /3 November/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /2 November/ }))
    expect(onSelect).toHaveBeenCalledWith('2026-11-02')
  })
})

describe('Collapse', () => {
  it('keeps closed content away from keyboards', () => {
    const { container, rerender } = render(
      <Collapse open={false}>
        <button>Hidden</button>
      </Collapse>,
    )
    expect(container.firstChild).toHaveAttribute('inert')
    rerender(
      <Collapse open>
        <button>Hidden</button>
      </Collapse>,
    )
    expect(container.firstChild).not.toHaveAttribute('inert')
  })
})

describe('celebrate', () => {
  afterEach(() => {
    MotionGlobalConfig.skipAnimations = true
    vi.unstubAllGlobals()
  })
  it('stays out of the way when motion is off', () => {
    celebrate()
    expect(document.querySelector('canvas')).toBeNull()
  })
  it('does nothing for people who asked for reduced motion', () => {
    MotionGlobalConfig.skipAnimations = false
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    celebrate()
    expect(document.querySelector('canvas')).toBeNull()
  })
})

describe('moduleForPath', () => {
  it.each([
    ['/', 'dashboard'],
    ['/finance', 'finance'],
    ['/jobs', 'jobs'],
    ['/unknown', 'dashboard'],
  ])('%s is %s', (path, module) => {
    expect(moduleForPath(path)).toBe(module)
  })
})

describe('MotionProvider', () => {
  it('renders its children', () => {
    render(
      <MotionProvider>
        <p>Inside</p>
      </MotionProvider>,
    )
    expect(screen.getByText('Inside')).toBeInTheDocument()
  })
})
