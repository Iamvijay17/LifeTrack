import { useState } from 'react'

/**
 * Render a long list a page at a time. Returns the visible slice plus `more` (how many are hidden) and `showMore()`.
 * The limit starts over whenever `resetKey` changes (e.g. a filter), so a new search never opens half-expanded.
 */
export function useShowMore(items, step = 50, resetKey = '') {
  const [state, setState] = useState({ key: resetKey, limit: step })
  const limit = state.key === resetKey ? state.limit : step
  return {
    visible: items.length > limit ? items.slice(0, limit) : items,
    more: Math.max(0, items.length - limit),
    showMore: () => setState({ key: resetKey, limit: limit + step }),
  }
}
