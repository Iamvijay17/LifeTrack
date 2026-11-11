// Where a context menu goes. Pure (sizes in, position out) so the four screen edges can be unit-tested without a browser.

export const EDGE = 8 // never closer than this to the viewport edge
const SUB_OVERLAP = 4 // a submenu tucks slightly under its parent so the pointer can travel across without a gap

/**
 * The menu opens with its top-left corner at the pointer. When it would run past the right or bottom edge it opens to the
 * left / upwards of the pointer instead (like a native menu), and it is clamped so no part is off screen. A menu taller than
 * the viewport is capped and scrolls.
 */
export function placeContextMenu({ point, size, viewport, edge = EDGE }) {
  const maxHeight = Math.max(120, viewport.height - edge * 2)
  const height = Math.min(size.height, maxHeight)
  const flipX = point.x + size.width > viewport.width - edge
  const flipY = point.y + height > viewport.height - edge
  const wantedLeft = flipX ? point.x - size.width : point.x
  const wantedTop = flipY ? point.y - height : point.y
  return {
    left: Math.max(edge, Math.min(wantedLeft, viewport.width - size.width - edge)),
    top: Math.max(edge, Math.min(wantedTop, viewport.height - height - edge)),
    maxHeight,
    flipX,
    flipY,
  }
}

/** A submenu opens beside its parent, level with the row that opened it: to the right, or to the left when there is no room. */
export function placeSubmenu({ parent, row, size, viewport, edge = EDGE }) {
  const maxHeight = Math.max(120, viewport.height - edge * 2)
  const height = Math.min(size.height, maxHeight)
  const fitsRight = parent.right - SUB_OVERLAP + size.width <= viewport.width - edge
  const fitsLeft = parent.left + SUB_OVERLAP - size.width >= edge
  const side = fitsRight || !fitsLeft ? 'right' : 'left'
  const wantedLeft = side === 'right' ? parent.right - SUB_OVERLAP : parent.left + SUB_OVERLAP - size.width
  return {
    left: Math.max(edge, Math.min(wantedLeft, viewport.width - size.width - edge)),
    top: Math.max(edge, Math.min(row.top - 4, viewport.height - height - edge)),
    maxHeight,
    side,
  }
}
