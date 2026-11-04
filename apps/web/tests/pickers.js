import { screen, within } from '@testing-library/react'

/** Choose an option of our Select by its value (what `userEvent.selectOptions` did for the native <select>). */
export async function pickOption(user, trigger, value) {
  await user.click(trigger)
  const list = await screen.findByRole('listbox')
  const opt = [...list.querySelectorAll('[role="option"]')].find((o) => o.dataset.value === String(value))
  if (!opt) throw new Error(`Value "${value}" not found in options`)
  await user.click(opt)
}

const monthIndex = (y, m) => y * 12 + m

/** Set a DatePicker to 'yyyy-MM-dd' through its calendar, or clear it with ''. */
export async function pickDate(user, trigger, value) {
  await user.click(trigger)
  const cal = await screen.findByRole('dialog', { name: 'Choose date' })
  const q = within(cal)
  if (value === '') return user.click(q.getByRole('button', { name: 'Clear' }))
  const [y, m] = value.split('-').map(Number)
  const shown = new Date(`1 ${cal.querySelector('[aria-live]').textContent}`)
  const diff = monthIndex(y, m - 1) - monthIndex(shown.getFullYear(), shown.getMonth())
  for (let i = 0; i < Math.abs(diff); i++) await user.click(q.getByRole('button', { name: diff > 0 ? 'Next month' : 'Previous month' }))
  const d = new Date(`${value}T00:00:00`)
  const name = `${d.toLocaleDateString('en-US', { weekday: 'long' })}, ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'long' })} ${y}`
  return user.click(q.getByRole('button', { name }))
}

/** Set a TimePicker to 'HH:mm' (minutes in 5-minute steps) through its hour / minute lists. */
export async function pickTime(user, trigger, value) {
  await user.click(trigger)
  const pop = await screen.findByRole('dialog', { name: 'Choose time' })
  const [h, m] = value.split(':')
  await user.click(within(within(pop).getByRole('listbox', { name: 'Hour' })).getByRole('option', { name: h }))
  await user.click(within(within(pop).getByRole('listbox', { name: 'Minute' })).getByRole('option', { name: m }))
  await user.click(within(pop).getByRole('button', { name: 'Done' }))
}
