import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// The hook's logic without a renderer: useState keeps its values in `cells` (one per call, in call order, like React), useCallback returns the
// function. `render()` calls the hook again, as a re-render would, so values set through the setters are what the next render sees.
const cells: unknown[] = []
let cursor = 0
vi.mock('react', () => ({
  useState: (init: unknown) => {
    const i = cursor++
    if (!(i in cells)) cells[i] = init
    return [cells[i], (next: unknown) => { cells[i] = typeof next === 'function' ? (next as (v: unknown) => unknown)(cells[i]) : next }]
  },
  useCallback: (fn: unknown) => fn,
}))
const { useZodForm } = await import('../src/hooks/useZodForm')

const schema = z.object({ name: z.string().min(1, 'Name it'), kind: z.enum(['a', 'b']), items: z.array(z.string().min(1, 'Item')) })
type In = z.input<typeof schema>
const start: In = { name: '', kind: 'a', items: [''] }
const render = () => { cursor = 0; return useZodForm(schema, start) }

beforeEach(() => { cells.length = 0 })

describe('useZodForm (mobile forms)', () => {
  it('reports the first error per field, and set() clears that field\'s error', () => {
    expect(render().validate()).toBeNull()
    expect(render().errors).toEqual({ name: 'Name it', items: 'Item' })
    render().set('name', 'Run')
    expect(render().errors).toEqual({ items: 'Item' })
    render().set('kind', 'b') // a field without an error leaves the errors as they are
    expect(render().errors).toEqual({ items: 'Item' })
  })
  it('validates other values when asked (a hidden part of the form left out), without changing what is shown', () => {
    render().set('name', 'Run')
    const f = render()
    expect(f.validate({ ...f.values, items: [] })).toEqual({ name: 'Run', kind: 'a', items: [] })
    expect(render().errors).toEqual({})
    expect(render().values.items).toEqual(['']) // the form still holds what was typed
  })
  it('reset() replaces the values and clears the errors; a valid form returns the parsed output', () => {
    render().validate()
    render().reset({ name: 'Swim', kind: 'b', items: ['x'] })
    const f = render()
    expect(f.errors).toEqual({})
    expect(f.validate()).toEqual({ name: 'Swim', kind: 'b', items: ['x'] })
  })
})
