import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { downloadPdf } from '@/services/pdf'

/**
 * Runs one PDF export at a time. `start(job)` calls job(onProgress) which must resolve to { bytes, filename }. A second call while one
 * is running is ignored (a double click never produces two files), "done" is only reported once the file has actually been built and
 * handed to the browser, and a failure keeps its message so the caller can offer a retry.
 */
export function usePdfExport() {
  const [state, setState] = useState({ status: 'idle', progress: 0, label: '', error: null })
  const running = useRef(false)
  const last = useRef(null)

  const start = useCallback(async function start(job) {
    if (running.current) return null
    running.current = true
    last.current = job
    setState({ status: 'working', progress: 0, label: 'Preparing', error: null })
    try {
      const result = await job((progress, label) =>
        setState((s) => (s.status === 'working' ? { ...s, progress, label: label ?? s.label } : s)),
      )
      downloadPdf(result.filename, result.bytes)
      setState({ status: 'done', progress: 1, label: 'Done', error: null })
      toast.success('PDF report downloaded')
      return result
    } catch (e) {
      console.error('PDF export failed', e)
      const error =
        e?.name === 'ExportError'
          ? e.message
          : `Something went wrong while building the PDF${e?.message ? ` (${e.message})` : ''}. Please try again.`
      setState({ status: 'error', progress: 0, label: '', error })
      toast.error(error, { action: e?.code && e.code !== 'failed' ? undefined : { label: 'Retry', onClick: () => start(job) } })
      return null
    } finally {
      running.current = false
    }
  }, [])

  const retry = useCallback(() => (last.current ? start(last.current) : null), [start])
  const reset = useCallback(() => setState({ status: 'idle', progress: 0, label: '', error: null }), [])
  return { ...state, busy: state.status === 'working', start, retry, reset }
}
