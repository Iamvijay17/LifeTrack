// The layout engine behind every LifeTrack PDF. It is deliberately small: a cursor that flows blocks down A4 pages and never lets a
// block run off one. pdf-lib only writes the file; all measuring and pagination happen here, with the real metrics of the embedded font.
//
// Block types (see `renderBlocks`): heading, text, note, kpis, table, bars, chart, pagebreak, orientation.
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { COLORS, MARGIN, PAGE, SERIES, TYPE } from './theme'

const hex = (c) => {
  const n = parseInt(c.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

// Characters the bundled font lacks, written as their closest plain equivalent.
const FALLBACK = {
  '\u00a0': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '→': '->',
  '←': '<-',
  '↑': '^',
  '↓': 'v',
  '✓': 'v',
  '✔': 'v',
  '✗': 'x',
  '✘': 'x',
  '−': '-',
}
const invisible = (cp) =>
  (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x202a && cp <= 0x202e) || cp === 0x2060 || cp === 0xfe0e || cp === 0xfe0f
const EMOJI = /\p{Extended_Pictographic}/u

class Typeface {
  constructor(pdf, kit) {
    this.pdf = pdf // [regular fonts…], [bold fonts…]: pdf-lib fonts, the first covering the most
    this.kit = kit
    this.cache = new Map()
  }
  has(weight, cp) {
    return this.kit[weight].some((f) => f.hasGlyphForCodePoint(cp))
  }
  /** Text the font can really draw: control characters become spaces, emoji are dropped, unknown symbols become "?". */
  clean(s, weight = 0) {
    let out = ''
    for (const ch of String(s ?? '')) {
      const cp = ch.codePointAt(0)
      if (ch === '\n' || ch === '\t' || cp < 32 || cp === 127) out += ' '
      else if (invisible(cp) || EMOJI.test(ch)) continue
      else if (FALLBACK[ch] != null && !(cp > 255 && this.has(weight, cp) && ch !== '−')) out += FALLBACK[ch]
      else if (this.has(weight, cp)) out += ch
      else out += FALLBACK[ch] ?? '?'
    }
    return out
  }
  /** Split into runs, each drawn with the first font that has all its glyphs. */
  runs(s, weight) {
    const runs = []
    for (const ch of s) {
      const i = Math.max(
        0,
        this.kit[weight].findIndex((f) => f.hasGlyphForCodePoint(ch.codePointAt(0))),
      )
      const last = runs[runs.length - 1]
      if (last && last.i === i) last.text += ch
      else runs.push({ i, text: ch })
    }
    return runs.map((r) => ({ font: this.pdf[weight][r.i], text: r.text }))
  }
  width(s, size, bold = false) {
    if (!s) return 0
    const w = bold ? 1 : 0
    const key = `${w}|${size}|${s}`
    let v = this.cache.get(key)
    if (v == null) {
      v = this.runs(s, w).reduce((a, r) => a + r.font.widthOfTextAtSize(r.text, size), 0)
      if (this.cache.size > 20000) this.cache.clear()
      this.cache.set(key, v)
    }
    return v
  }
}

/** Tidy axis ticks covering [min, max]. Counts get whole-number steps; a line chart's axis may start above zero. */
export function niceTicks(max, count = 4, { min = 0, integer = false } = {}) {
  const span = max - min
  if (!(span > 0)) {
    if (!(max > 0)) return [0, 1]
    return [Math.max(0, min - 1), max + 1].map((v) => (integer ? Math.round(v) : v))
  }
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  let step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw)
  if (integer) step = Math.max(1, Math.ceil(step))
  const lo = min === 0 ? 0 : Math.floor(min / step) * step
  const ticks = []
  for (let k = 0; lo + k * step < max + step * 0.001; k++) ticks.push(Math.round((lo + k * step) * 1e6) / 1e6)
  if (ticks[ticks.length - 1] < max) ticks.push(Math.round((ticks[ticks.length - 1] + step) * 1e6) / 1e6)
  return ticks
}

class Doc {
  constructor(pdf, tf, spec) {
    this.pdf = pdf
    this.tf = tf
    this.spec = spec
    this.pages = []
    this.orient = spec.orientation === 'landscape' ? 'landscape' : 'portrait'
    this.newPage()
  }

  get W() {
    return PAGE[this.orient].w
  }
  get H() {
    return PAGE[this.orient].h
  }
  get contentW() {
    return this.W - 2 * MARGIN.x
  }
  get limit() {
    return this.H - MARGIN.bottom
  }

  newPage() {
    const page = this.pdf.addPage([this.W, this.H])
    this.pages.push({ page, orient: this.orient, W: this.W, H: this.H })
    this.page = page
    this.y = MARGIN.top + (this.pages.length > 1 ? 24 : 0)
    this.fresh = true
  }

  /** Start a new page unless `h` more points still fit on this one. */
  ensure(h) {
    if (this.y + h > this.limit && !this.fresh) this.newPage()
  }

  setOrientation(o) {
    if (o === this.orient) return
    this.orient = o
    if (this.fresh) {
      // Nothing drawn on the page yet: reshape it instead of leaving a blank one behind.
      const p = this.pages[this.pages.length - 1]
      Object.assign(p, { orient: o, W: this.W, H: this.H })
      p.page.setSize(this.W, this.H)
    } else this.newPage()
  }

  // ----- primitives (y measured from the top of the page) -----
  text(s, x, top, { size = TYPE.body, bold = false, color = COLORS.body, align = 'left', width = 0 } = {}) {
    const t = this.tf.clean(s, bold ? 1 : 0)
    if (!t || !allFinite(x, top, width)) return
    let px = x
    const w = this.tf.width(t, size, bold)
    if (align === 'right') px = x + width - w
    else if (align === 'center') px = x + (width - w) / 2
    const base = this.H - top - size * 0.8
    for (const r of this.tf.runs(t, bold ? 1 : 0)) {
      this.page.drawText(r.text, { x: px, y: base, size, font: r.font, color: hex(color) })
      px += r.font.widthOfTextAtSize(r.text, size)
    }
    this.fresh = false
  }
  rect(x, top, w, h, color, opts = {}) {
    if (!allFinite(x, top, w, h) || w <= 0 || h <= 0) return
    this.page.drawRectangle({ x, y: this.H - top - h, width: w, height: h, color: hex(color), ...opts })
    this.fresh = false
  }
  hline(x1, x2, top, color = COLORS.rule, thickness = 0.6) {
    if (!allFinite(x1, x2, top)) return
    this.page.drawLine({ start: { x: x1, y: this.H - top }, end: { x: x2, y: this.H - top }, thickness, color: hex(color) })
    this.fresh = false
  }
  line(x1, t1, x2, t2, color, thickness = 1.4) {
    if (!allFinite(x1, t1, x2, t2)) return
    this.page.drawLine({ start: { x: x1, y: this.H - t1 }, end: { x: x2, y: this.H - t2 }, thickness, color: hex(color) })
    this.fresh = false
  }
  dot(x, top, r, color) {
    if (!allFinite(x, top, r)) return
    this.page.drawCircle({ x, y: this.H - top, size: r, color: hex(color) })
    this.fresh = false
  }

  /** Word-wrap `s` to `width` points. Over-long words are broken by character, so nothing can overflow. Optionally capped with an ellipsis. */
  wrap(s, width, size, bold = false, maxLines = Infinity) {
    const t = this.tf.clean(s, bold ? 1 : 0)
    const w = (x) => this.tf.width(x, size, bold)
    const lines = []
    let cur = ''
    const push = () => {
      lines.push(cur)
      cur = ''
    }
    for (const word of t.split(/ +/).filter(Boolean)) {
      let piece = word
      while (w(piece) > width) {
        // a single word wider than the column: break it
        if (cur) push()
        let n = piece.length
        while (n > 1 && w(piece.slice(0, n)) > width) n--
        lines.push(piece.slice(0, n))
        piece = piece.slice(n)
      }
      const next = cur ? `${cur} ${piece}` : piece
      if (cur && w(next) > width) {
        push()
        cur = piece
      } else cur = next
    }
    if (cur || !lines.length) lines.push(cur)
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines)
      let last = kept[maxLines - 1]
      while (last.length > 1 && w(`${last}…`) > width) last = last.slice(0, -1)
      kept[maxLines - 1] = `${last}…`
      return kept
    }
    return lines
  }

  /** The LifeTrack app icon (public/brand/lifetrack-icon.svg) as vector paths, so it stays sharp at any zoom. `top` is the distance from the page top. */
  logoMark(x, top, size) {
    if (!allFinite(x, top, size) || size <= 0) return
    const k = size / 512
    const y = this.H - top
    const violet = hex('#7c3aed')
    this.page.drawSvgPath('M112 0H400A112 112 0 0 1 512 112V400A112 112 0 0 1 400 512H112A112 112 0 0 1 0 400V112A112 112 0 0 1 112 0Z', {
      x,
      y,
      scale: k,
      color: hex('#09090b'),
    })
    for (const d of ['M406 262A150 150 0 1 1 292 126', 'M185 275L235 325L400 160', 'M342 160H400V218']) {
      // the icon's artwork is nudged up 4 units inside its square
      this.page.drawSvgPath(d, { x, y: y + 4 * k, scale: k, borderColor: violet, borderWidth: 40 * k, borderLineCap: 1, borderLineJoin: 1 })
    }
    this.fresh = false
  }

  // ----- page furniture -----
  cover({ title, subtitle, meta = [], generated }) {
    const { contentW: cw } = this
    this.logoMark(MARGIN.x, this.y, 18)
    this.text('LifeTrack', MARGIN.x + 24, this.y + 3.5, { size: 10.5, bold: true, color: COLORS.accent })
    if (generated) this.text(generated, MARGIN.x, this.y + 4, { size: TYPE.small, color: COLORS.muted, align: 'right', width: cw })
    this.y += 34
    for (const l of this.wrap(title, cw, TYPE.title, true, 2)) {
      this.text(l, MARGIN.x, this.y, { size: TYPE.title, bold: true, color: COLORS.ink })
      this.y += TYPE.title * 1.25
    }
    if (subtitle) {
      for (const l of this.wrap(subtitle, cw, TYPE.subtitle, false, 3)) {
        this.text(l, MARGIN.x, this.y + 2, { size: TYPE.subtitle, color: COLORS.muted })
        this.y += TYPE.subtitle * 1.5
      }
    }
    this.y += 8
    if (meta.length) {
      const cols = Math.min(meta.length, this.orient === 'landscape' ? 5 : 4)
      const cellW = cw / cols
      const rows = Math.ceil(meta.length / cols)
      const cells = meta.map((m) => ({ ...m, lines: this.wrap(m.value, cellW - 16, TYPE.body, true, 2) }))
      const rowH = (r) => 22 + Math.max(...cells.slice(r * cols, r * cols + cols).map((c) => c.lines.length)) * 12
      const total = Array.from({ length: rows }, (_, r) => rowH(r)).reduce((a, b) => a + b, 0) + 6
      this.rect(MARGIN.x, this.y, cw, total, COLORS.panel, { borderColor: hex(COLORS.rule), borderWidth: 0.6 })
      let top = this.y + 7
      for (let r = 0; r < rows; r++) {
        cells.slice(r * cols, r * cols + cols).forEach((c, i) => {
          const x = MARGIN.x + i * cellW + 8
          this.text(c.label.toUpperCase(), x, top, { size: TYPE.tiny, bold: true, color: COLORS.muted })
          c.lines.forEach((l, k) => this.text(l, x, top + 11 + k * 12, { size: TYPE.body, bold: true, color: COLORS.ink }))
        })
        top += rowH(r)
      }
      this.y += total + 10
    }
    this.hline(MARGIN.x, MARGIN.x + cw, this.y, COLORS.accent, 1.2)
    this.y += 16
  }

  /** Running header and footer on every page, drawn last because the page count is only known then. */
  furniture() {
    const { title, footer, runningHead } = this.spec
    const total = this.pages.length
    this.pages.forEach((p, i) => {
      this.page = p.page
      this.orient = p.orient
      if (i > 0) {
        const head = this.tf.clean(`LifeTrack  ·  ${runningHead ?? title}`)
        this.text(head, MARGIN.x, 24, { size: TYPE.small, bold: true, color: COLORS.muted })
        this.hline(MARGIN.x, p.W - MARGIN.x, 38, COLORS.rule)
      }
      const fy = p.H - MARGIN.bottom + 14
      this.hline(MARGIN.x, p.W - MARGIN.x, fy - 6, COLORS.rule)
      const label = `Page ${i + 1} of ${total}`
      const lw = this.tf.width(label, TYPE.small)
      let f = this.tf.clean(footer ?? '')
      const room = p.W - 2 * MARGIN.x - lw - 20
      while (f.length > 1 && this.tf.width(f, TYPE.small) > room) f = f.slice(0, -1)
      this.text(f, MARGIN.x, fy, { size: TYPE.small, color: COLORS.muted })
      this.text(label, p.W - MARGIN.x - lw, fy, { size: TYPE.small, color: COLORS.muted })
    })
  }

  // ----- blocks -----
  heading({ text, level = 1 }) {
    const size = level === 1 ? TYPE.h1 : TYPE.h2
    const h = size * 1.4 + (level === 1 ? 14 : 8)
    this.ensure(h + 56) // never leave a heading alone at the foot of a page
    this.y += level === 1 ? 12 : 6
    for (const l of this.wrap(text, this.contentW, size, true, 2)) {
      this.text(l, MARGIN.x, this.y, { size, bold: true, color: level === 1 ? COLORS.ink : COLORS.body })
      this.y += size * 1.35
    }
    if (level === 1) {
      this.hline(MARGIN.x, MARGIN.x + this.contentW, this.y + 2, COLORS.rule, 0.8)
      this.rect(MARGIN.x, this.y + 1.2, 28, 1.6, COLORS.accent)
      this.y += 10
    } else this.y += 4
  }

  paragraph({ text, muted = false, bold = false, size = TYPE.body }) {
    const lh = size * 1.5
    for (const l of this.wrap(text, this.contentW, size, bold)) {
      this.ensure(lh)
      this.text(l, MARGIN.x, this.y, { size, bold, color: muted ? COLORS.muted : COLORS.body })
      this.y += lh
    }
    this.y += 4
  }

  kpis({ items }) {
    if (!items.length) return
    const gap = 8
    const cols = Math.max(1, Math.min(items.length, Math.floor((this.contentW + gap) / 118), this.orient === 'landscape' ? 6 : 4))
    const cw = (this.contentW - gap * (cols - 1)) / cols
    const inner = cw - 16
    const cards = items.map((k) => {
      let size = 15
      const value = this.tf.clean(k.value ?? '—', 1)
      while (size > 9 && this.tf.width(value, size, true) > inner) size -= 0.5
      return {
        label: this.wrap(k.label, inner, TYPE.small, false, 2),
        value: this.wrap(value, inner, size, true, 2),
        size,
        sub: k.sub ? this.wrap(k.sub, inner, TYPE.small, false, 2) : [],
      }
    })
    for (let r = 0; r < cards.length; r += cols) {
      const row = cards.slice(r, r + cols)
      const h = 14 + Math.max(...row.map((c) => c.label.length * 11 + c.value.length * c.size * 1.2 + c.sub.length * 10.5 + 8))
      this.ensure(h + 8)
      row.forEach((c, i) => {
        const x = MARGIN.x + i * (cw + gap)
        this.rect(x, this.y, cw, h, COLORS.panel, { borderColor: hex(COLORS.rule), borderWidth: 0.6 })
        this.rect(x, this.y, 2.4, h, COLORS.accent)
        let t = this.y + 8
        c.label.forEach((l) => {
          this.text(l, x + 10, t, { size: TYPE.small, color: COLORS.muted })
          t += 11
        })
        t += 2
        c.value.forEach((l) => {
          this.text(l, x + 10, t, { size: c.size, bold: true, color: COLORS.ink })
          t += c.size * 1.2
        })
        t += 2
        c.sub.forEach((l) => {
          this.text(l, x + 10, t, { size: TYPE.small, color: COLORS.muted })
          t += 10.5
        })
      })
      this.y += h + gap
    }
    this.y += 4
  }

  table({ columns, rows, zebra = true, totals, caption }) {
    if (!columns.length) return
    const n = columns.length
    const size = n > 12 ? 6.8 : n > 8 ? 7.5 : 8.5
    const lh = size * 1.4
    const padX = n > 10 ? 3 : 5
    const padY = 3.6
    const flex = columns.reduce((a, c) => a + (c.width ?? 1), 0)
    const widths = columns.map((c) => ((c.width ?? 1) / flex) * this.contentW)
    const cellOf = (v) => (v && typeof v === 'object' ? v : { text: v })
    const prep = (cells, bold) =>
      cells.map((v, i) => {
        const c = cellOf(v)
        const b = bold || c.bold || columns[i].bold
        return {
          lines: this.wrap(c.text == null || c.text === '' ? '—' : String(c.text), widths[i] - 2 * padX, size, b, 5),
          bold: b,
          color: c.color,
        }
      })
    const heightOf = (cells) => Math.max(...cells.map((c) => c.lines.length)) * lh + 2 * padY
    const drawRow = (cells, top, { shade, head, rule = true }) => {
      const h = heightOf(cells)
      if (shade) this.rect(MARGIN.x, top, this.contentW, h, shade)
      let x = MARGIN.x
      cells.forEach((c, i) => {
        const align = columns[i].align ?? 'left'
        c.lines.forEach((l, k) =>
          this.text(l, x + padX, top + padY + k * lh + 0.6, {
            size,
            bold: c.bold || head,
            color: c.color ?? (head ? COLORS.muted : COLORS.body),
            align,
            width: widths[i] - 2 * padX,
          }),
        )
        x += widths[i]
      })
      if (rule) this.hline(MARGIN.x, MARGIN.x + this.contentW, top + h, head ? COLORS.faint : COLORS.rule, head ? 0.8 : 0.4)
      return h
    }
    const header = prep(
      columns.map((c) => ({ text: c.header })),
      true,
    )
    const headH = heightOf(header)
    const body = rows.map((r) => prep(r, false))
    const foot = totals ? prep(totals, true) : null
    if (caption) this.paragraph({ text: caption, muted: true, size: TYPE.small })

    const startHead = () => {
      this.y += drawRow(header, this.y, { shade: COLORS.head, head: true })
    }
    // the header and at least two rows (or all of them) stay together
    this.ensure(headH + (body[0] ? heightOf(body[0]) : 0) + (body[1] ? heightOf(body[1]) : 0) + 4)
    startHead()
    if (!body.length) {
      this.paragraph({ text: 'No records in this period.', muted: true })
      return
    }
    body.forEach((cells, i) => {
      const h = heightOf(cells)
      if (this.y + h > this.limit) {
        this.newPage()
        startHead() // column headers repeat on every page
      }
      this.y += drawRow(cells, this.y, { shade: zebra && i % 2 ? COLORS.zebra : null })
    })
    if (foot) {
      const h = heightOf(foot)
      if (this.y + h > this.limit) {
        this.newPage()
        startHead()
      }
      this.y += drawRow(foot, this.y, { shade: COLORS.head })
    }
    this.y += 10
  }

  /** Horizontal share bars: label, bar, value. Labels wrap instead of being cut. */
  bars({ title, items, unitNote }) {
    if (!items.length) return
    const labelW = Math.min(170, this.contentW * 0.32)
    const valueW = Math.min(120, this.contentW * 0.24)
    const barW = this.contentW - labelW - valueW - 12
    if (title) {
      this.ensure(40)
      this.text(title, MARGIN.x, this.y, { size: TYPE.h2, bold: true })
      this.y += 17
    }
    items.forEach((it) => {
      const label = this.wrap(it.label, labelW - 8, TYPE.body, false, 2)
      const value = this.wrap(it.text ?? '', valueW, TYPE.body, false, 2)
      const h = Math.max(label.length, value.length) * 12 + 5
      this.ensure(h)
      label.forEach((l, k) => this.text(l, MARGIN.x, this.y + k * 12, { size: TYPE.body }))
      const by = this.y + 1.5
      this.rect(MARGIN.x + labelW, by, barW, 8, COLORS.accentSoft)
      this.rect(MARGIN.x + labelW, by, barW * Math.max(0, Math.min(1, Number.isFinite(it.value) ? it.value : 0)), 8, SERIES[(it.color ?? 0) % SERIES.length])
      value.forEach((l, k) => this.text(l, MARGIN.x + labelW + barW + 12, this.y + k * 12, { size: TYPE.body, color: COLORS.muted }))
      this.y += h
    })
    if (unitNote) {
      this.text(unitNote, MARGIN.x, this.y, { size: TYPE.tiny, color: COLORS.muted })
      this.y += 11
    }
    this.y += 6
  }

  /** Column or line chart drawn as vectors: it can never be blurred, stretched or half-rendered. */
  chart({ kind = 'columns', title, unit, labels, series, format = (v) => String(v), height = 128 }) {
    series = series.map((s) => ({ ...s, values: s.values.map((v) => (Number.isFinite(v) ? v : null)) }))
    const hasData = series.some((s) => s.values.some((v) => v != null))
    if (!hasData || !labels.length) return
    const legend = series.length > 1
    const head = 17 + (legend ? 14 : 0)
    this.ensure(head + height + 30)
    this.text(unit ? `${title} (${unit})` : title, MARGIN.x, this.y, { size: TYPE.h2, bold: true })
    this.y += 16
    if (legend) {
      let lx = MARGIN.x
      series.forEach((s, i) => {
        this.rect(lx, this.y + 1.5, 8, 8, SERIES[i % SERIES.length])
        this.text(s.name, lx + 12, this.y, { size: TYPE.small, color: COLORS.muted })
        lx += 12 + this.tf.width(this.tf.clean(s.name), TYPE.small) + 16
      })
      this.y += 14
    }
    const all = series.flatMap((s) => s.values.filter((v) => v != null))
    const integer = all.every((v) => Number.isInteger(v)) && Math.max(...all) <= 40
    const ticks =
      kind === 'line' ? niceTicks(Math.max(...all), 4, { min: Math.min(...all), integer }) : niceTicks(Math.max(...all, 0), 4, { integer })
    const bottom = ticks[0]
    const top = ticks[ticks.length - 1]
    const span = top - bottom || 1
    const tickLabels = ticks.map((t) => this.tf.clean(format(t)))
    const axisW = Math.max(...tickLabels.map((t) => this.tf.width(t, TYPE.tiny))) + 8
    const x0 = MARGIN.x + axisW
    const plotW = this.contentW - axisW
    const y0 = this.y + 6
    const plotH = height - 6
    const yOf = (v) => y0 + plotH - ((v - bottom) / span) * plotH
    ticks.forEach((t, i) => {
      this.hline(x0, x0 + plotW, yOf(t), i === 0 ? COLORS.faint : COLORS.rule, i === 0 ? 0.8 : 0.4)
      this.text(tickLabels[i], MARGIN.x, yOf(t) - TYPE.tiny * 0.5, {
        size: TYPE.tiny,
        color: COLORS.muted,
        align: 'right',
        width: axisW - 5,
      })
    })
    const n = labels.length
    const slot = plotW / n
    const xOf = (i) => x0 + slot * (i + 0.5)
    if (kind === 'columns') {
      const group = Math.min(slot * 0.78, 26 * series.length)
      const bw = group / series.length
      series.forEach((s, si) =>
        s.values.forEach((v, i) => {
          if (v == null) return
          const h = Math.max(v > 0 ? 0.8 : 0, (v / span) * plotH)
          this.rect(
            xOf(i) - group / 2 + si * bw,
            y0 + plotH - h,
            Math.max(1, bw - (series.length > 1 ? 0.8 : 0)),
            h,
            SERIES[si % SERIES.length],
          )
        }),
      )
      if (series.length === 1 && n <= 16) {
        series[0].values.forEach((v, i) => {
          if (v == null) return
          const t = this.tf.clean(format(v))
          if (this.tf.width(t, TYPE.tiny) < slot + 6)
            this.text(t, xOf(i) - slot / 2, yOf(v) - 9, { size: TYPE.tiny, color: COLORS.muted, align: 'center', width: slot })
        })
      }
    } else {
      series.forEach((s, si) => {
        const color = SERIES[si % SERIES.length]
        let prev = null
        s.values.forEach((v, i) => {
          if (v == null) {
            prev = null
            return
          }
          if (prev != null) this.line(xOf(prev.i), yOf(prev.v), xOf(i), yOf(v), color)
          prev = { i, v }
        })
        s.values.forEach((v, i) => v != null && n <= 45 && this.dot(xOf(i), yOf(v), n > 25 ? 1.3 : 2, color))
      })
    }
    // x labels, thinned so neighbours never overlap
    const lab = labels.map((l) => this.tf.clean(String(l)))
    const widest = Math.max(...lab.map((l) => this.tf.width(l, TYPE.tiny)))
    const every = Math.max(1, Math.ceil((widest + 6) / slot))
    const ly = y0 + plotH + 5
    let lastEnd = -Infinity
    lab.forEach((l, i) => {
      if (i % every) return
      const w = this.tf.width(l, TYPE.tiny)
      const px = Math.min(Math.max(xOf(i) - w / 2, MARGIN.x), x0 + plotW - w)
      if (px < lastEnd + 5) return // never print one label over its neighbour
      this.text(l, px, ly, { size: TYPE.tiny, color: COLORS.muted })
      lastEnd = px + w
    })
    this.y = ly + 18
  }

  run(block) {
    switch (block.type) {
      case 'heading':
        return this.heading(block)
      case 'text':
        return this.paragraph(block)
      case 'note':
        return this.paragraph({ ...block, muted: true, size: TYPE.small })
      case 'kpis':
        return this.kpis(block)
      case 'table':
        return this.table(block)
      case 'bars':
        return this.bars(block)
      case 'chart':
        return this.chart(block)
      case 'columns': // legacy shape: one series of {label, value}
        return this.chart({
          kind: 'columns',
          title: block.title,
          unit: block.unit,
          labels: block.items.map((i) => i.label),
          series: [{ name: block.title, values: block.items.map((i) => i.value) }],
          format: block.format,
        })
      case 'orientation':
        return this.setOrientation(block.value)
      case 'pagebreak':
        if (!this.fresh) this.newPage()
        return undefined
      default:
        throw new Error(`Unknown report block "${block.type}"`)
    }
  }
}

/** A NaN or Infinity written into a page makes viewers refuse the whole file, so such shapes are skipped instead. */
const allFinite = (...n) => n.every(Number.isFinite)

const tick = () => new Promise((r) => setTimeout(r, 0))

/**
 * spec: { title, subtitle, meta: [{label, value}], generated, footer, runningHead, orientation, author, subject, keywords, blocks }
 * fontBytes: [regular latin, regular ext, bold latin, bold ext]. Returns the PDF as a Uint8Array.
 */
export async function renderPdfDocument(spec, fontBytes, { onProgress } = {}) {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const embed = (b) => pdf.embedFont(b, { subset: true })
  const [r1, r2, b1, b2] = await Promise.all(fontBytes.map(embed))
  const kit = fontBytes.map((b) => fontkit.create(b))
  const tf = new Typeface(
    [
      [r1, r2],
      [b1, b2],
    ],
    [
      [kit[0], kit[1]],
      [kit[2], kit[3]],
    ],
  )

  pdf.setTitle(spec.title)
  pdf.setAuthor('LifeTrack')
  pdf.setSubject(spec.subject ?? spec.subtitle ?? 'LifeTrack report')
  pdf.setKeywords(spec.keywords ?? ['LifeTrack', 'report'])
  pdf.setCreator('LifeTrack')
  pdf.setProducer('LifeTrack PDF export')
  pdf.setCreationDate(new Date())
  pdf.setModificationDate(new Date())

  const doc = new Doc(pdf, tf, spec)
  doc.cover({ title: spec.title, subtitle: spec.subtitle, meta: spec.meta ?? [], generated: spec.generated })
  const blocks = spec.blocks ?? []
  for (let i = 0; i < blocks.length; i++) {
    doc.run(blocks[i])
    onProgress?.((i + 1) / blocks.length)
    if (i % 4 === 3) await tick() // keep the page responsive while a large report is laid out
  }
  doc.furniture()
  const bytes = await pdf.save({ useObjectStreams: false })
  // Read the file back: a document that cannot be re-opened here would show "Failed to load PDF document" in the viewer.
  await PDFDocument.load(bytes, { updateMetadata: false })
  return bytes
}
