// A small, dependency-free PDF writer: A4 pages of headings, wrapped text, tables, bars and column charts in the built-in Helvetica fonts.
// It is only as capable as the Insights report needs. Text is converted to the PDF's Latin-1 (WinAnsi) range: characters outside it
// (₹, dashes, ellipsis, …) are replaced with plain equivalents rather than printed as garbage.
const W = 595.28
const H = 841.89
const M = 42
const CONTENT_W = W - 2 * M

const REPLACE = {
  '₹': 'Rs ',
  '−': '-',
  '–': '-',
  '—': '-',
  '…': '...',
  '’': "'",
  '‘': "'",
  '“': '"',
  '”': '"',
  '→': '->',
  '•': '-',
  '\u00a0': ' ',
  '\u202f': ' ',
}
export function toLatin1(s) {
  let out = ''
  for (const ch of String(s ?? '')) {
    if (REPLACE[ch] != null) out += REPLACE[ch]
    else if (ch.charCodeAt(0) <= 255 && (ch.charCodeAt(0) >= 32 || ch === '\t')) out += ch
    else out += ch.charCodeAt(0) < 32 ? ' ' : '?'
  }
  return out
}
const esc = (s) =>
  toLatin1(s)
    .replace(/[\\()]/g, '\\$&')
    .replace(/[\u0080-\u00ff]/g, (c) => `\\${c.charCodeAt(0).toString(8).padStart(3, '0')}`)

/** Approximate Helvetica width of a string in points (good enough to wrap and to truncate table cells). */
export function textWidth(s, size, bold = false) {
  let w = 0
  for (const ch of toLatin1(s)) {
    w += /[ijl.,:;'|!]/.test(ch)
      ? 0.26
      : /[ftr()\-/ ]/.test(ch)
        ? 0.34
        : /[mwMW@%]/.test(ch)
          ? 0.84
          : /[A-Z]/.test(ch)
            ? 0.68
            : /[0-9]/.test(ch)
              ? 0.556
              : 0.52
  }
  return w * size * (bold ? 1.06 : 1)
}
const fit = (s, width, size, bold) => {
  let t = toLatin1(s)
  if (textWidth(t, size, bold) <= width) return t
  while (t.length > 1 && textWidth(`${t}...`, size, bold) > width) t = t.slice(0, -1)
  return `${t}...`
}
function wrap(s, width, size) {
  const lines = []
  let line = ''
  for (const word of toLatin1(s).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && textWidth(next, size) > width) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}
const hex = (c) =>
  c
    .match(/\w\w/g)
    .map((h) => (parseInt(h, 16) / 255).toFixed(3))
    .join(' ')
const INK = '1f2937'
const MUTED = '6b7280'
const ACCENT = '6366f1'
const RULE = 'e5e7eb'

/**
 * blocks: { type: 'heading', text } | { type: 'text', text, muted? } |
 *         { type: 'table', columns: [{ header, width (relative), align? }], rows: [[cell…]] } |
 *         { type: 'bars', items: [{ label, value (0..1), text }] } |
 *         { type: 'columns', title, items: [{ label, value|null }], format? }
 * Returns the PDF as a Uint8Array.
 */
export function renderPdf({ title, subtitle, footer = '', blocks }) {
  const pages = []
  let ops = []
  let y = H - M
  const newPage = () => {
    pages.push(ops)
    ops = []
    y = H - M
  }
  const need = (h) => {
    if (y - h < M + 18) newPage()
  }
  const text = (s, x, yy, { size = 9, bold = false, color = INK, align = 'left', width = 0 } = {}) => {
    const t = toLatin1(s)
    let px = x
    if (align === 'right') px = x + width - textWidth(t, size, bold)
    if (align === 'center') px = x + (width - textWidth(t, size, bold)) / 2
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${hex(color)} rg ${px.toFixed(2)} ${yy.toFixed(2)} Td (${esc(t)}) Tj ET`)
  }
  const rect = (x, yy, w, h, color) =>
    ops.push(`${hex(color)} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${Math.max(0, w).toFixed(2)} ${Math.max(0, h).toFixed(2)} re f`)
  const line = (x1, yy, x2, color = RULE) =>
    ops.push(`${hex(color)} RG 0.5 w ${x1.toFixed(2)} ${yy.toFixed(2)} m ${x2.toFixed(2)} ${yy.toFixed(2)} l S`)

  // title block
  rect(M, y - 4, 4, 30, ACCENT)
  text(title, M + 12, y + 12, { size: 18, bold: true })
  if (subtitle) text(subtitle, M + 12, y - 2, { size: 9.5, color: MUTED })
  y -= 34

  for (const b of blocks) {
    if (b.type === 'heading') {
      need(34)
      y -= 10
      text(b.text, M, y, { size: 12, bold: true })
      y -= 5
      line(M, y, W - M)
      y -= 12
    } else if (b.type === 'text') {
      for (const l of wrap(b.text, CONTENT_W, 9)) {
        need(13)
        text(l, M, y, { size: 9, color: b.muted ? MUTED : INK })
        y -= 12.5
      }
      y -= 2
    } else if (b.type === 'table') {
      const total = b.columns.reduce((a, c) => a + c.width, 0)
      const widths = b.columns.map((c) => (c.width / total) * CONTENT_W)
      const drawRow = (cells, { bold = false, color = INK } = {}) => {
        need(15)
        let x = M
        cells.forEach((cell, i) => {
          const pad = 4
          const w = widths[i] - pad * 2
          text(fit(cell ?? '', w, 8.5, bold), x + pad, y, { size: 8.5, bold, color, align: b.columns[i].align ?? 'left', width: w })
          x += widths[i]
        })
        y -= 14
      }
      need(30)
      rect(M, y - 4, CONTENT_W, 15, 'f3f4f6')
      drawRow(
        b.columns.map((c) => c.header),
        { bold: true, color: MUTED },
      )
      for (const r of b.rows) {
        if (y - 14 < M + 18) {
          newPage()
          rect(M, y - 4, CONTENT_W, 15, 'f3f4f6')
          drawRow(
            b.columns.map((c) => c.header),
            { bold: true, color: MUTED },
          )
        }
        drawRow(r)
        line(M, y + 10, W - M, 'f3f4f6')
      }
      y -= 6
    } else if (b.type === 'bars') {
      const labelW = 150
      const valueW = 110
      const barW = CONTENT_W - labelW - valueW
      for (const it of b.items) {
        need(16)
        text(fit(it.label, labelW - 6, 9), M, y, { size: 9 })
        rect(M + labelW, y - 2, barW, 8, 'f3f4f6')
        rect(M + labelW, y - 2, barW * Math.max(0, Math.min(1, it.value ?? 0)), 8, ACCENT)
        text(fit(it.text ?? '', valueW - 6, 9), M + labelW + barW + 8, y, { size: 9, color: MUTED })
        y -= 16
      }
      y -= 4
    } else if (b.type === 'columns') {
      const h = 80
      need(h + 34)
      text(b.title, M, y, { size: 9, bold: true, color: MUTED })
      y -= 8
      const vals = b.items.map((i) => i.value).filter((v) => v != null)
      const max = Math.max(...vals, 0)
      const slot = CONTENT_W / Math.max(1, b.items.length)
      const bw = Math.min(18, slot * 0.7)
      line(M, y - h, W - M)
      b.items.forEach((it, i) => {
        if (it.value == null || max === 0) return
        rect(M + i * slot + (slot - bw) / 2, y - h, bw, Math.max(0.8, (it.value / max) * (h - 8)), ACCENT)
      })
      const every = Math.ceil(b.items.length / 12)
      b.items.forEach((it, i) => {
        if (i % every === 0) text(fit(it.label, slot * every, 7), M + i * slot, y - h - 10, { size: 7, color: MUTED })
      })
      text(`peak ${b.format ? b.format(max) : max}`, W - M - 80, y - 2, { size: 7.5, color: MUTED, align: 'right', width: 80 })
      y -= h + 24
    }
  }
  pages.push(ops)

  // footer on every page
  const total = pages.length
  const pageStreams = pages.map((p, i) => {
    const f = []
    f.push(`${hex(RULE)} RG 0.5 w ${M} ${M} m ${W - M} ${M} l S`)
    f.push(`BT /F1 7.5 Tf ${hex(MUTED)} rg ${M} ${M - 12} Td (${esc(footer)}) Tj ET`)
    const label = `Page ${i + 1} of ${total}`
    f.push(`BT /F1 7.5 Tf ${hex(MUTED)} rg ${(W - M - textWidth(label, 7.5)).toFixed(2)} ${M - 12} Td (${esc(label)}) Tj ET`)
    return [...p, ...f].join('\n')
  })

  // objects: 1 catalog, 2 pages, 3 F1, 4 F2, then (page, content) pairs
  const objs = []
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  const kids = []
  pageStreams.forEach((s, i) => {
    const pageObj = 5 + i * 2
    kids.push(`${pageObj} 0 R`)
    objs[pageObj] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageObj + 1} 0 R >>`
    objs[pageObj + 1] = `<< /Length ${s.length} >>\nstream\n${s}\nendstream`
  })
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${total} >>`

  let out = '%PDF-1.4\n'
  const offsets = []
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`
  }
  const xref = out.length
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  const bytes = new Uint8Array(out.length)
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff
  return bytes
}

export function downloadPdf(filename, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
