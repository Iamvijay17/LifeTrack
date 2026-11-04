import '@testing-library/jest-dom/vitest'
import { expect } from 'vitest'
import { configure } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'

// Component tests check behaviour, not choreography: everything lands on its final state at once.
MotionGlobalConfig.skipAnimations = true

// CI runners (especially with coverage on) are slow, and so is any machine running the whole suite in parallel: the first render of a lazily
// imported page has to compile that page on the spot, which has been seen to take well over 5 seconds.
configure({ asyncUtilTimeout: 10_000 })

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
if (!window.IntersectionObserver)
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
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
