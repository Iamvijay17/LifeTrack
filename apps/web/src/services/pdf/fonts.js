// Inter (SIL OFL, bundled with the app, nothing fetched from a third party) embedded as subsets, so ₹, accents and typographic
// punctuation print as themselves. The "latin" file lacks a few symbols (₹ lives in latin-ext), so each weight is a pair of fonts
// and every run of text is drawn with whichever one has the glyph.
const urls = () =>
  Promise.all([
    import('@fontsource/inter/files/inter-latin-400-normal.woff?url'),
    import('@fontsource/inter/files/inter-latin-ext-400-normal.woff?url'),
    import('@fontsource/inter/files/inter-latin-600-normal.woff?url'),
    import('@fontsource/inter/files/inter-latin-ext-600-normal.woff?url'),
  ]).then((m) => m.map((x) => x.default))

/** Raw font bytes for the four files, as [regular latin, regular ext, bold latin, bold ext]. Browser only; tests pass their own. */
export async function loadFontBytes() {
  const list = await urls()
  return Promise.all(
    list.map(async (u) => {
      const res = await fetch(u)
      if (!res.ok) throw new Error(`The report font could not be loaded (${res.status}).`)
      return new Uint8Array(await res.arrayBuffer())
    }),
  )
}
