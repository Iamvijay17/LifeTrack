#!/usr/bin/env node
// Imports the Free Exercise DB (https://github.com/yuhonas/free-exercise-db, Unlicense / public domain) into the web app.
//
//   node scripts/sync-exercise-db.mjs            download any missing/corrupt images and verify them (what `prebuild` runs; a no-op when the committed images are intact)
//   node scripts/sync-exercise-db.mjs --refresh  also rebuild catalog.json + the hash manifest from the pinned upstream commit
//   node scripts/sync-exercise-db.mjs --check    verify only; no network; exit 1 if an image is missing or altered
//   node scripts/sync-exercise-db.mjs --report   print dataset coverage and exit
//   --from <dir>                                 read a local checkout of the upstream repo instead of the network
//
// Everything under apps/web/public/exercises is committed: catalog.json, images.sha256.json, LICENSE.txt, ATTRIBUTION.md and the
// .jpg files (about 99 MB). A plain run only repairs a missing or altered image from the pinned commit; it checks each against images.sha256.json.
// Images are copied byte for byte: nothing is resized, recompressed or cropped, and no other image source is ever used.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const UPSTREAM = {
  repo: 'yuhonas/free-exercise-db',
  url: 'https://github.com/yuhonas/free-exercise-db',
  commit: 'f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5',
  license: 'Unlicense',
  licenseUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md',
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(root, 'apps/web/public/exercises')
const RAW = `https://raw.githubusercontent.com/${UPSTREAM.repo}/${UPSTREAM.commit}`

/** The eight categories LifeTrack shows. Order is the display order. */
export const CATEGORIES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Abs', 'Cardio']
const MUSCLE_TO_CATEGORY = {
  chest: 'Chest',
  lats: 'Back', 'middle back': 'Back', 'lower back': 'Back', traps: 'Back',
  shoulders: 'Shoulders', neck: 'Shoulders',
  biceps: 'Biceps', forearms: 'Biceps',
  triceps: 'Triceps',
  quadriceps: 'Legs', hamstrings: 'Legs', glutes: 'Legs', calves: 'Legs', adductors: 'Legs', abductors: 'Legs',
  abdominals: 'Abs',
}
const EQUIPMENT = { 'body only': 'Body only', null: 'No equipment', other: 'Other', 'e-z curl bar': 'E-Z curl bar' }
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const titleCase = (s) => s.split(' ').map(cap).join(' ')

/** Upstream record → catalog record. A dataset `cardio` exercise is Cardio whatever its muscles; otherwise the primary muscle decides. */
export function toCatalogEntry(x) {
  const category = x.category === 'cardio' ? 'Cardio' : MUSCLE_TO_CATEGORY[x.primaryMuscles[0]]
  if (!category) throw new Error(`No category for ${x.id} (${x.primaryMuscles})`)
  return {
    id: x.id,
    name: x.name,
    category,
    primary: x.primaryMuscles.map(titleCase),
    secondary: x.secondaryMuscles.map(titleCase),
    equipment: EQUIPMENT[x.equipment] ?? cap(x.equipment),
    level: cap(x.level),
    type: titleCase(x.category),
    force: x.force ? cap(x.force) : null,
    mechanic: x.mechanic ? cap(x.mechanic) : null,
    instructions: x.instructions,
    images: x.images, // [start, end] — upstream's own pair, in upstream's order
  }
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const fromDir = args.includes('--from') ? path.resolve(args[args.indexOf('--from') + 1]) : null

async function upstreamJson() {
  if (fromDir) return JSON.parse(await readFile(path.join(fromDir, 'dist/exercises.json'), 'utf8'))
  const res = await fetch(`${RAW}/dist/exercises.json`)
  if (!res.ok) throw new Error(`exercises.json: HTTP ${res.status}`)
  return res.json()
}
async function upstreamBytes(rel) {
  if (fromDir) return readFile(path.join(fromDir, 'exercises', rel))
  const res = await fetch(`${RAW}/exercises/${rel.split('/').map(encodeURIComponent).join('/')}`)
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}
async function upstreamLicense() {
  if (fromDir) return readFile(path.join(fromDir, 'LICENSE.md'), 'utf8')
  const res = await fetch(`${RAW}/LICENSE.md`)
  if (!res.ok) throw new Error(`LICENSE.md: HTTP ${res.status}`)
  return res.text()
}

function report(raw, entries) {
  const by = (f) => Object.entries(entries.reduce((a, e) => ((a[f(e)] = (a[f(e)] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1])
  console.log(`Exercises: ${raw.length}   with a start+end image pair: ${raw.filter((x) => x.images.length === 2).length}`)
  console.log(`Without images: ${raw.filter((x) => !x.images.length).map((x) => x.id).join(', ') || 'none'}`)
  console.log(`Without instructions: ${raw.filter((x) => !x.instructions.length).map((x) => x.id).join(', ') || 'none'}`)
  for (const c of CATEGORIES) console.log(`  ${c.padEnd(10)} ${entries.filter((e) => e.category === c).length}`)
  console.log('By type:', by((e) => e.type).map(([k, v]) => `${k} ${v}`).join(', '))
  console.log('By equipment:', by((e) => e.equipment).map(([k, v]) => `${k} ${v}`).join(', '))
}

async function refresh(raw, entries) {
  const manifest = {}
  for (const e of entries) {
    for (const rel of e.images) manifest[rel] = sha256(await upstreamBytes(rel).then((b) => (writeImage(rel, b), b)))
  }
  const catalog = {
    meta: { source: 'Free Exercise DB', ...UPSTREAM, count: entries.length, categories: CATEGORIES },
    exercises: entries,
  }
  await writeFile(path.join(OUT, 'catalog.json'), JSON.stringify(catalog))
  await writeFile(path.join(OUT, 'images.sha256.json'), JSON.stringify(manifest, null, 0).replaceAll('","', '",\n"'))
  await writeFile(path.join(OUT, 'LICENSE.txt'), await upstreamLicense())
  await writeFile(
    path.join(OUT, 'ATTRIBUTION.md'),
    `# Exercise data and images\n\nExercise metadata, instructions and start/end demonstration images come from **${catalog.meta.source}**\n(${UPSTREAM.url}), pinned at commit \`${UPSTREAM.commit}\`.\n\nLicense: **${UPSTREAM.license}** (public domain dedication) — see LICENSE.txt, ${UPSTREAM.licenseUrl}.\n\nThe images are served exactly as published upstream (verified by SHA-256 in images.sha256.json). LifeTrack adds only a\ncategory field derived from each exercise's primary muscle and normalised label capitalisation.\nRe-import with \`node scripts/sync-exercise-db.mjs --refresh\`.\n`,
  )
}
const pending = []
function writeImage(rel, buf) {
  const file = path.join(OUT, rel)
  pending.push(mkdir(path.dirname(file), { recursive: true }).then(() => writeFile(file, buf)))
}

async function verifyAndFetch(manifest, { download }) {
  const bad = []
  const rels = Object.keys(manifest)
  let next = 0
  const worker = async () => {
    while (next < rels.length) {
      const rel = rels[next++]
      const file = path.join(OUT, rel)
      const ok = existsSync(file) && sha256(await readFile(file)) === manifest[rel]
      if (ok) continue
      if (!download) { bad.push(rel); continue }
      try {
        const buf = await upstreamBytes(rel)
        if (sha256(buf) !== manifest[rel]) throw new Error('hash mismatch with manifest')
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, buf)
      } catch (err) {
        bad.push(`${rel} (${err.message})`)
      }
    }
  }
  await Promise.all(Array.from({ length: 16 }, worker))
  return bad
}

async function main() {
  await mkdir(OUT, { recursive: true })
  if (flag('report') || flag('refresh')) {
    const raw = await upstreamJson()
    const entries = raw.map(toCatalogEntry)
    report(raw, entries)
    if (flag('report')) return
    await refresh(raw, entries)
    await Promise.all(pending)
    console.log(`Wrote catalog, manifest, license and ${Object.keys(JSON.parse(await readFile(path.join(OUT, 'images.sha256.json'), 'utf8'))).length} images.`)
    return
  }
  const manifestFile = path.join(OUT, 'images.sha256.json')
  if (!existsSync(manifestFile)) throw new Error('images.sha256.json is missing: run with --refresh once')
  const bad = await verifyAndFetch(JSON.parse(await readFile(manifestFile, 'utf8')), { download: !flag('check') })
  if (bad.length) {
    console.error(`${bad.length} exercise image(s) missing or altered:\n  ${bad.slice(0, 10).join('\n  ')}`)
    process.exit(1)
  }
  console.log('Exercise images verified.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
