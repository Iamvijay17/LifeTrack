// Public entry for PDF export. The engine, pdf-lib and the fonts are loaded on first use, so none of it weighs on the app's first paint.
export { COLORS, SERIES } from './theme'

/**
 * Build a PDF. `spec` is described in engine.js (title, subtitle, meta, blocks…). `fontBytes` is only for tests and tools that
 * run outside a browser; the app loads its bundled Inter files itself.
 */
export async function renderPdf(spec, { onProgress, fontBytes } = {}) {
  const [{ renderPdfDocument }, fonts] = await Promise.all([import('./engine'), fontBytes ? null : import('./fonts')])
  const bytes = fontBytes ?? (await fonts.loadFontBytes())
  return renderPdfDocument(spec, bytes, { onProgress })
}

/** Hand the finished bytes to the browser as a download, then release the temporary object URL. */
export function downloadPdf(filename, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

/** A file name that is safe on every OS: no path characters, no double spaces. */
export const safeFilename = (s, ext = 'pdf') =>
  `${
    String(s ?? 'report')
      .normalize('NFKD')
      .replace(/[^\w\- .]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'report'
  }.${ext}`
