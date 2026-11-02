import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { Select } from '@/components/ui/form'

function Form({ onSubmit }) {
  const { register, handleSubmit, setValue } = useForm({ defaultValues: { c: 'b' } })
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Select aria-label="Pick" {...register('c')}><option value="a">Alpha</option><optgroup label="Grp"><option value="b">Beta</option><option value="c">Gamma</option></optgroup></Select>
      <button type="button" onClick={() => setValue('c', 'a')}>set</button><button type="submit">go</button>
    </form>
  )
}

describe('Select', () => {
  it('works with react-hook-form: shows default, picks, and reflects setValue', async () => {
    const onSubmit = vi.fn(); const u = userEvent.setup()
    render(<Form onSubmit={onSubmit} />)
    const box = screen.getByRole('combobox', { name: 'Pick' })
    expect(box).toHaveTextContent('Beta')
    await u.click(box)
    expect(screen.getByText('Grp')).toBeInTheDocument()
    await u.click(screen.getByRole('option', { name: 'Gamma' }))
    expect(box).toHaveTextContent('Gamma')
    await u.click(screen.getByText('go'))
    expect(onSubmit.mock.calls[0][0]).toEqual({ c: 'c' })
    await u.click(screen.getByText('set'))
    expect(box).toHaveTextContent('Alpha')
  })
  it('supports keyboard and controlled usage', async () => {
    const u = userEvent.setup(); const onChange = vi.fn()
    render(<Select aria-label="K" value="a" onChange={(e) => onChange(e.target.value)}><option value="a">A</option><option value="b">B</option></Select>)
    screen.getByRole('combobox').focus()
    await u.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('b')
  })
})
