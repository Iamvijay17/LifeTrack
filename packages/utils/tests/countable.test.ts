import { describe, expect, it } from 'vitest'
import { drawCountable, hasCountable, parseCountable } from '../src'

const end = (text: string) => drawCountable(parseCountable(text), null, 1)

describe('count-up text', () => {
  it.each(['₹12,345', '₹1,50,000', '2h 30m', '3/5', '84%', '1400 ml', '73.5 kg', '6,200'])('lands on exactly the final text: %s', (text) => {
    expect(end(text)).toBe(text)
  })
  it('starts from zero and keeps the format while counting', () => {
    expect(drawCountable(parseCountable('₹1,000.50'), null, 0)).toBe('₹0.00')
    expect(drawCountable(parseCountable('₹1,000'), null, 0.5)).toBe('₹500')
  })
  it('counts from the previous value when one is given', () => {
    expect(drawCountable(parseCountable('20%'), parseCountable('10%'), 0.5)).toBe('15%')
  })
  it('leaves the total of "3/5" standing still', () => {
    expect(drawCountable(parseCountable('3/5'), null, 0)).toBe('0/5')
  })
  it('knows when there is nothing to count', () => {
    expect(hasCountable(parseCountable('Not planned'))).toBe(false)
    expect(hasCountable(parseCountable('7 days'))).toBe(true)
  })
})
