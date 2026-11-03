import { fireEvent, render, screen } from '@testing-library/react-native'
import { ThemeProvider } from '../src/providers/ThemeProvider'
import { Button } from '../src/ui'
import { ChipGroup, ProgressBar } from '../src/ui/controls'

const wrap = async (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>)

describe('Button', () => {
  it('calls onPress', async () => {
    const onPress = jest.fn()
    await wrap(<Button title="Save" onPress={onPress} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
  it('does not fire while loading or disabled (no duplicate submissions)', async () => {
    const onPress = jest.fn()
    await wrap(<><Button title="Busy" onPress={onPress} loading /><Button title="Off" onPress={onPress} disabled /></>)
    await fireEvent.press(screen.getByRole('button', { name: 'Off' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Busy' }))
    expect(onPress).not.toHaveBeenCalled()
  })
})

describe('ChipGroup', () => {
  it('marks the selected option and reports a new choice', async () => {
    const onChange = jest.fn()
    await wrap(<ChipGroup label="Repeats" value="daily" options={[{ value: 'daily', label: 'Every day' }, { value: 'weekly', label: 'Weekly' }]} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Every day' })).toBeSelected()
    expect(screen.getByRole('button', { name: 'Weekly' })).not.toBeSelected()
    await fireEvent.press(screen.getByRole('button', { name: 'Weekly' }))
    expect(onChange).toHaveBeenCalledWith('weekly')
  })
})

describe('ProgressBar', () => {
  it.each([[-5, 0], [42.4, 42], [250, 100]])('clamps %s to %s', async (value, now) => {
    await wrap(<ProgressBar value={value} label="Goal" />)
    expect(screen.getByRole('progressbar', { name: 'Goal' })).toHaveAccessibilityValue({ min: 0, max: 100, now })
  })
})
