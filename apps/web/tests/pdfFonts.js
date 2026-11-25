// The bundled report fonts read straight from disk, for tests (the app fetches them through the bundler).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const dir = path.join(path.dirname(createRequire(import.meta.url).resolve('@fontsource/inter/package.json')), 'files')
export const testFontBytes = () =>
  ['latin-400', 'latin-ext-400', 'latin-600', 'latin-ext-600'].map(
    (n) => new Uint8Array(readFileSync(path.join(dir, `inter-${n}-normal.woff`))),
  )
