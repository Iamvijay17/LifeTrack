/** A readable name for a browser / device from its user-agent string, e.g. "Chrome on macOS". Best effort; never throws. */
export function describeDevice(ua = '') {
  const s = String(ua)
  if (!s) return { label: 'Unknown device', kind: 'unknown' }
  const browser = /Edg(e|A|iOS)?\//.test(s)
    ? 'Edge'
    : /OPR\/|Opera/.test(s)
      ? 'Opera'
      : /SamsungBrowser/.test(s)
        ? 'Samsung Internet'
        : /Firefox|FxiOS/.test(s)
          ? 'Firefox'
          : /Chrome|CriOS/.test(s)
            ? 'Chrome'
            : /Safari/.test(s)
              ? 'Safari'
              : 'Browser'
  const os = /Windows/.test(s)
    ? 'Windows'
    : /Android/.test(s)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(s)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(s)
          ? 'macOS'
          : /CrOS/.test(s)
            ? 'ChromeOS'
            : /Linux/.test(s)
              ? 'Linux'
              : ''
  const kind =
    /iPad|Tablet/.test(s) || (/Android/.test(s) && !/Mobile/.test(s)) ? 'tablet' : /iPhone|Android|Mobile/.test(s) ? 'phone' : 'desktop'
  return { label: os ? `${browser} on ${os}` : browser, kind }
}
