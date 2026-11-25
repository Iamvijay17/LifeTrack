import { toast } from 'sonner'

/** Copy text to the clipboard (with a fallback for pages without the async clipboard API). Resolves to true when it worked. */
export async function copyText(text, { success = 'Copied to clipboard' } = {}) {
  let ok = false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      ok = true
    }
  } catch {
    /* fall through to the legacy path */
  }
  if (!ok) {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
      document.body.appendChild(area)
      area.select()
      ok = document.execCommand?.('copy') ?? false
      area.remove()
    } catch {
      ok = false
    }
  }
  if (ok) {
    if (success) toast.success(success)
  } else toast.error('Could not copy. Your browser blocked clipboard access.')
  return ok
}
