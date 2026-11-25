// Turns a period of the user's records into the PDF for the Reports page: validates the request, builds the chosen module sections,
// and hands the blocks to the shared engine. Throws ExportError with a message fit to show the user.
import { diffDays } from '@lifetrack/utils'
import { renderPdf, safeFilename } from '@/services/pdf'
import { fmtDay } from '@/lib/dates'
import { buildModuleBlocks, MODULES } from './templates'

export class ExportError extends Error {
  constructor(message, code = 'failed') {
    super(message)
    this.name = 'ExportError'
    this.code = code
  }
}

/** "25 Nov 2026, 3:42 pm" in the user's own timezone. */
export function stampInTz(date, tz) {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: tz,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  } catch {
    return date.toLocaleString('en-IN')
  }
}

export function validateRequest({ from, to, today, modules, title }) {
  if (!from || !to || from > to) throw new ExportError('Choose a start date that is not after the end date.', 'range')
  if (from > today) throw new ExportError('This period is still in the future, so there is nothing to report yet.', 'future')
  if (diffDays(to, from) > 3660) throw new ExportError('That period is longer than ten years. Choose a shorter one.', 'range')
  if (!modules?.length) throw new ExportError('Select at least one section to include.', 'modules')
  if (!String(title ?? '').trim()) throw new ExportError('Give the report a title.', 'title')
}

export const reportFilename = (title, from, to) => safeFilename(`${title}-${from}_to_${to}`)

/**
 * ctx: { data, report, from, to, today, settings, money }; options: { title, modules, orientation: 'auto'|'portrait'|'landscape' }.
 * Resolves to { bytes, filename, included, skipped }.
 */
export async function buildReportPdf(ctx, { title, modules, orientation = 'auto', onProgress, fontBytes, now = new Date() }) {
  const { from, to, today, settings } = ctx
  validateRequest({ from, to, today, modules, title })
  const last = to > today ? today : to
  onProgress?.(0.05, 'Collecting your records')
  const { blocks: sections, included, skipped } = buildModuleBlocks({ ...ctx, last }, modules)
  if (!sections.length)
    throw new ExportError(
      'There is no recorded data for the selected sections in this period. Try a longer period or other sections.',
      'empty',
    )

  // Wide day-by-day tables get landscape pages in "auto"; everything else stays portrait.
  const blocks = []
  const daily = modules.includes('daily')
  let landscape = false
  for (const b of sections) {
    const wide = daily && b.type === 'heading' && b.text === 'Day-by-day detail'
    if (orientation === 'auto' && wide && !landscape) {
      blocks.push({ type: 'orientation', value: 'landscape' })
      landscape = true
    }
    blocks.push(b)
  }
  const period = `${fmtDay(from, 'd MMM yyyy')} – ${fmtDay(to, 'd MMM yyyy')}`
  const days = diffDays(last, from) + 1
  const spec = {
    title: title.trim(),
    subtitle: `Personal progress report · ${included.join(' · ')}`,
    meta: [
      { label: 'Period', value: period },
      { label: 'Days counted', value: `${days} day${days === 1 ? '' : 's'}${to > today ? ' (future days excluded)' : ''}` },
      { label: 'Currency', value: settings.currency },
      { label: 'Timezone', value: settings.timezone },
    ],
    generated: `Generated ${stampInTz(now, settings.timezone)}`,
    footer: `LifeTrack · ${title.trim()} · ${period}`,
    runningHead: title.trim(),
    subject: `LifeTrack report for ${period}`,
    keywords: ['LifeTrack', 'report', ...included],
    orientation: orientation === 'landscape' ? 'landscape' : 'portrait',
    blocks,
  }
  const bytes = await renderPdf(spec, { fontBytes, onProgress: (f) => onProgress?.(0.1 + f * 0.85, 'Laying out pages') })
  onProgress?.(1, 'Finishing')
  return { bytes, filename: reportFilename(title, from, to), included, skipped }
}

export const defaultTitle = (from, to) => `LifeTrack Report · ${fmtDay(from, 'd MMM')} – ${fmtDay(to, 'd MMM yyyy')}`
export { MODULES }
