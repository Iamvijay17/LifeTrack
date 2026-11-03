import '@testing-library/jest-dom/vitest'

// jsdom lacks these browser APIs; the app (sonner, charts, menus) expects them.
if (!window.matchMedia) window.matchMedia = (query) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })
if (!window.ResizeObserver) window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
