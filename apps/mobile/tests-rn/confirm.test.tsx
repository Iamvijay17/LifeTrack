import { Alert } from 'react-native'
import { confirm } from '../src/ui/confirm'

type Btn = { text: string; onPress?: () => void }
const press = (text: string) => (jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { (buttons as Btn[]).find((b) => b.text === text)?.onPress?.() }))

afterEach(() => jest.restoreAllMocks())

describe('confirm()', () => {
  it('resolves true only when the destructive button is pressed', async () => {
    press('Delete')
    await expect(confirm('Delete "Read"?', 'Cannot be undone')).resolves.toBe(true)
  })
  it('resolves false on Cancel', async () => {
    press('Cancel')
    await expect(confirm('Delete?')).resolves.toBe(false)
  })
  it('resolves false when dismissed outside the dialog', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, _b, options) => options?.onDismiss?.())
    await expect(confirm('Delete?')).resolves.toBe(false)
  })
  it('uses a custom confirm label', async () => {
    press('Sign out')
    await expect(confirm('Sign out?', undefined, 'Sign out')).resolves.toBe(true)
  })
})
