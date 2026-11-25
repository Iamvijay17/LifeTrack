// A small, dependency-free .xlsx writer (Office Open XML in an uncompressed ZIP): enough for report exports, opens in Excel, Numbers, LibreOffice and
// Google Sheets. Cells are numbers, text, booleans or blank. Text is stored as an inline string, never as a formula, so a cell that starts with = + - @
// stays text (no spreadsheet formula injection).

const enc = new TextEncoder()
const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
export function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A ZIP archive with every file stored (not compressed). `files`: [{ name, data: string | Uint8Array }]. */
export function zipStore(files) {
  const parts = []
  const central = []
  let offset = 0
  const u16 = (n) => [n & 255, (n >>> 8) & 255]
  const u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]
  for (const f of files) {
    const name = enc.encode(f.name)
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data
    const crc = crc32(data)
    const head = Uint8Array.from([
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(0),
      ...u16(0x21),
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(name.length),
      ...u16(0),
    ])
    parts.push(head, name, data)
    central.push(
      Uint8Array.from([
        ...u32(0x02014b50),
        ...u16(20),
        ...u16(20),
        ...u16(0x0800),
        ...u16(0),
        ...u16(0),
        ...u16(0x21),
        ...u32(crc),
        ...u32(data.length),
        ...u32(data.length),
        ...u16(name.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(offset),
      ]),
      name,
    )
    offset += head.length + name.length + data.length
  }
  const size = central.reduce((n, p) => n + p.length, 0)
  const end = Uint8Array.from([
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(size),
    ...u32(offset),
    ...u16(0),
  ])
  const all = [...parts, ...central, end]
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of all) (out.set(p, at), (at += p.length))
  return out
}

const xml = (s) =>
  String(s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
    .replace(/[^\t\n\r\u0020-\ud7ff\ue000-\ufffd]/gu, '')
const col = (i) => {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}
const sheetName = (n, used) => {
  let base =
    String(n)
      .replace(/[\\/?*[\]:]/g, ' ')
      .trim()
      .slice(0, 31) || 'Sheet'
  let name = base
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28)} ${i}`
  used.add(name.toLowerCase())
  return name
}

/** @param sheets [{ name, rows: (string|number|boolean|null)[][], headerRows?: number, widths?: number[] }]  @returns Uint8Array of the .xlsx file */
export function buildXlsx(sheets) {
  const used = new Set()
  const named = sheets.map((s) => ({ ...s, name: sheetName(s.name, used) }))
  const sheetXml = (s) => {
    const rows = s.rows
      .map((r, ri) => {
        const cells = r
          .map((v, ci) => {
            if (v === null || v === undefined || v === '') return ''
            const ref = `${col(ci)}${ri + 1}`
            const bold = ri < (s.headerRows ?? 0) ? ' s="1"' : ''
            if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${bold}><v>${v}</v></c>`
            if (typeof v === 'boolean') return `<c r="${ref}" t="b"${bold}><v>${v ? 1 : 0}</v></c>`
            return `<c r="${ref}" t="inlineStr"${bold}><is><t xml:space="preserve">${xml(v)}</t></is></c>`
          })
          .join('')
        return `<row r="${ri + 1}">${cells}</row>`
      })
      .join('')
    const widths =
      s.widths ??
      Array.from({ length: Math.max(0, ...s.rows.map((r) => r.length)) }, (_, c) =>
        Math.min(48, Math.max(10, ...s.rows.slice(0, 200).map((r) => String(r[c] ?? '').length + 2))),
      )
    const cols = widths.length
      ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      : ''
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`
  }
  const files = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: 'xl/styles.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`,
    },
    ...named.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ]
  return zipStore(files)
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
/** Saves bytes as a file download. */
export function downloadBytes(filename, bytes, type = XLSX_TYPE) {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
