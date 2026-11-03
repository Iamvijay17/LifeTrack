import '@testing-library/jest-dom/vitest'
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
