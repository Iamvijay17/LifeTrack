// Which cue a click or tap deserves, decided from the element alone. Pure (it only reads the element), so it is unit-tested without a browser.
// Anything can override with `data-sound="<cue>"`, or opt out with `data-sound="off"` (an element or any ancestor).

const INTERACTIVE = [
  '[data-sound]',
  'button',
  'a[href]',
  'summary',
  '[role=button]',
  '[role=tab]',
  '[role=switch]',
  '[role=checkbox]',
  '[role=menuitem]',
  '[role=option]',
  'input[type=checkbox]',
  'input[type=radio]',
].join(',')

const isDisabled = (el) => el.disabled === true || el.getAttribute('aria-disabled') === 'true'

/** True for controls whose cue depends on the state the click produces (switches, checkboxes). The new state is only in the DOM once React has rendered it. */
export function isStateful(target) {
  if (!(target instanceof Element) || target.closest('[data-sound]')) return false
  return !!target.closest('[role=switch], [role=checkbox], input[type=checkbox]')
}

/** The cue for a click on `target`, or null for none. For switches and checkboxes it reads the state the click just produced. */
export function cueForTarget(target) {
  if (!(target instanceof Element)) return null
  if (target.closest('[data-sound="off"]')) return null
  const el = target.closest(INTERACTIVE)
  if (!el || isDisabled(el)) return null

  const explicit = el.getAttribute('data-sound')
  if (explicit) return explicit === 'off' ? null : explicit

  const role = el.getAttribute('role')
  if (role === 'switch') return el.getAttribute('aria-checked') === 'true' ? 'toggleOn' : 'toggleOff'
  // A click on a label's text is followed by the browser's own click on its input, which is the one that carries the new state.
  if (el.matches('input[type=radio]')) return 'select'
  if (el.matches('input[type=checkbox]')) return el.checked ? 'toggleOn' : 'toggleOff'
  if (role === 'checkbox') return el.getAttribute('aria-checked') === 'true' ? 'toggleOn' : 'toggleOff'
  if (role === 'tab' || role === 'option' || role === 'menuitem') return 'select'
  // A same-origin link that moves around the app is navigation; anything else (mailto:, a download, another site) is just a click.
  if (el.matches('a[href]')) {
    const href = el.getAttribute('href') ?? ''
    if (href.startsWith('/') && !el.hasAttribute('download') && el.target !== '_blank') return 'navigate'
    return 'click'
  }
  // The expand/collapse family opens or closes something: a soft cue is enough, and the real cue fires from the component that owns it.
  return 'click'
}
