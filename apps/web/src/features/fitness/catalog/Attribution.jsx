/** Source and licence credit for everything shown from the exercise database. */
export function Attribution({ meta, className = '' }) {
  if (!meta) return null
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      Exercise data and demonstration images from{' '}
      <a className="underline underline-offset-2 hover:text-foreground" href={meta.url} target="_blank" rel="noopener noreferrer">
        {meta.source}
      </a>{' '}
      — {meta.license} (public domain),{' '}
      <a className="underline underline-offset-2 hover:text-foreground" href={meta.licenseUrl} target="_blank" rel="noopener noreferrer">
        licence
      </a>
      .
    </p>
  )
}
