import '@testing-library/jest-dom/vitest'
import { expect } from 'vitest'
import { configure } from '@testing-library/react'

// CI runners (especially with coverage on) are slow: the first render of a lazily imported page can take longer than the 1s default.
configure({ asyncUtilTimeout: 5000 })

// jsdom lacks these browser APIs; the app (sonner, charts, menus) expects them.
if (!window.matchMedia)
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })
if (!window.ResizeObserver)
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

// Our Select / date / time pickers keep their value in a hidden <input> next to the trigger button.
expect.extend({
  toHavePickerValue(trigger, expected) {
    const actual = trigger.parentElement?.querySelector('input[hidden]')?.value
    return {
      pass: actual === expected,
      message: () => `expected picker value ${JSON.stringify(actual)} ${this.isNot ? 'not ' : ''}to be ${JSON.stringify(expected)}`,
    }
  },
})
