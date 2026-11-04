import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { DataGate, EmptyState, ErrorState } from '@/components/shared/states'
import { DateNav } from '@/components/shared/DateNav'
import { FormDialog } from '@/components/shared/FormDialog'
import { ConfirmProvider, useConfirm } from '@/components/shared/Confirm'
import { Heatmap } from '@/components/shared/Heatmap'

describe('DataGate / states', () => {
  it('shows a skeleton while loading, an alert with retry on error, otherwise the content', async () => {
    const retry = vi.fn()
    const { rerender } = render(
      <DataGate loading error={null} onRetry={retry}>
        <p>content</p>
      </DataGate>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.queryByText('content')).toBeNull()
    rerender(
      <DataGate loading={false} error="Network down" onRetry={retry}>
        <p>content</p>
      </DataGate>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Network down')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
    rerender(
      <DataGate loading={false} error={null}>
        <p>content</p>
      </DataGate>,
    )
    expect(screen.getByText('content')).toBeInTheDocument()
  })
  it('error wins over loading, so a failed first load is never stuck on the skeleton', () => {
    render(
      <DataGate loading error="boom">
        <p>x</p>
      </DataGate>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
  it('EmptyState renders its action; ErrorState hides retry when no handler is given', () => {
    render(
      <>
        <EmptyState title="Nothing yet" description="Add one" action={<button>Add</button>} />
        <ErrorState message="x" />
      </>,
    )
    expect(screen.getByText('Nothing yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})

describe('DateNav', () => {
  it('moves a day at a time and offers a way back to today only when away from it', async () => {
    const Harness = () => {
      const [d, setD] = useState('2026-11-02')
      return <DateNav date={d} onChange={setD} today="2026-11-02" />
    }
    render(<Harness />)
    expect(screen.getByText('Today')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(screen.getByText(/Sun, 1 Nov 2026/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next day' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next day' }))
    expect(screen.getByText(/Tue, 3 Nov 2026/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Today' })).toBeNull()
  })
})

describe('FormDialog', () => {
  const open = (props) =>
    render(
      <FormDialog
        open
        onOpenChange={props.onOpenChange ?? (() => {})}
        title="New thing"
        onSubmit={props.onSubmit ?? ((e) => e.preventDefault())}
        pending={props.pending}
      >
        <input aria-label="Name" />
      </FormDialog>,
    )
  it('submits through the form and cancels through onOpenChange(false)', async () => {
    const onSubmit = vi.fn((e) => e.preventDefault())
    const onOpenChange = vi.fn()
    open({ onSubmit, onOpenChange })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
  it('while saving: no duplicate submit, cannot be cancelled or dismissed with Escape', async () => {
    const onSubmit = vi.fn()
    const onOpenChange = vi.fn()
    open({ onSubmit, onOpenChange, pending: true })
    const save = screen.getByRole('button', { name: /Saving/ })
    expect(save).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('useConfirm', () => {
  function Probe({ onResult }) {
    const confirm = useConfirm()
    return <button onClick={async () => onResult(await confirm({ title: 'Delete "Read"?', confirmLabel: 'Delete it' }))}>ask</button>
  }
  it('resolves true on confirm and false on cancel or Escape', async () => {
    const results = []
    render(
      <ConfirmProvider>
        <Probe onResult={(r) => results.push(r)} />
      </ConfirmProvider>,
    )
    await userEvent.click(screen.getByText('ask'))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Delete "Read"?')
    await userEvent.click(screen.getByRole('button', { name: 'Delete it' }))
    await userEvent.click(screen.getByText('ask'))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByText('ask'))
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(results).toEqual([true, false, false]))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Heatmap', () => {
  it('draws a labelled button for each past day (future days are not buttons) and reports the selected day', async () => {
    const onSelect = vi.fn()
    render(<Heatmap levels={new Map([['2026-11-02', 4]])} today="2026-11-04" weeks={2} onSelect={onSelect} />)
    const cells = screen.getAllByRole('button')
    expect(cells).toHaveLength(10) // Thu–Sun after Wed 4 Nov have no button
    expect(cells.every((c) => c.getAttribute('aria-label'))).toBe(true)
    await userEvent.click(screen.getByTitle(/2 Nov 2026/))
    expect(onSelect).toHaveBeenCalledWith('2026-11-02')
  })
})
