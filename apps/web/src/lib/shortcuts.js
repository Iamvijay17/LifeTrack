// The keyboard shortcut registry: what exists, how it is shown on each platform, which chord keys a person has remapped, and which shortcuts
// overlap. Pure functions; the listeners live in features/command/useShortcuts.js and hooks/useUndoShortcuts.js, and the per-device choices
// in hooks/useShortcutPrefs.js.
import { CREATE_KEYS, GO_KEYS } from '@/features/command/model'

export const isMacPlatform = () => /mac|iphone|ipad/i.test(globalThis.navigator?.platform ?? '')

/** "Mod" is ⌘ on a Mac and Ctrl elsewhere. */
export function keycaps(tokens, mac = isMacPlatform()) {
  const map = mac ? { Mod: '⌘', Alt: '⌥', Shift: '⇧', Enter: '↵', Esc: 'Esc' } : { Mod: 'Ctrl', Enter: 'Enter' }
  return tokens.map((t) => map[t] ?? t)
}

// ----------------------------------------------------------------- chord keys (g then …, c then …)
/** A key a chord can use: one printable character that is not a space. */
export const validChordKey = (k) => typeof k === 'string' && k.length === 1 && /^[a-z0-9,./;'[\]\-=]$/.test(k)

const invert = (table) => Object.fromEntries(Object.entries(table).map(([k, v]) => [v, k]))
export const DEFAULT_CHORDS = { go: invert(GO_KEYS), create: invert(CREATE_KEYS) } // target → key

/** Anything stored becomes a valid overrides object: only known targets, valid keys, no key used twice in one group. */
export function normalizeOverrides(raw) {
  const out = { go: {}, create: {} }
  for (const group of ['go', 'create']) {
    const src = raw && typeof raw === 'object' && raw[group] && typeof raw[group] === 'object' ? raw[group] : {}
    const taken = new Set()
    for (const target of Object.keys(DEFAULT_CHORDS[group])) {
      const k = src[target]
      if (validChordKey(k) && !taken.has(k)) ((out[group][target] = k), taken.add(k))
    }
    // A remap that collides with a default of an UN-remapped target would make two targets share a key: drop it.
    const effective = chordKeys(group, out)
    const seen = new Set()
    for (const [target, key] of Object.entries(effective)) {
      if (seen.has(key)) delete out[group][target]
      seen.add(key)
    }
  }
  return out
}

/** target → key for a group after the overrides. */
export const chordKeys = (group, overrides) => ({ ...DEFAULT_CHORDS[group], ...(overrides?.[group] ?? {}) })
/** key → target, the shape the listener uses. */
export const chordTable = (group, overrides) => invert(chordKeys(group, overrides))
export const defaultTables = () => ({ go: { ...GO_KEYS }, create: { ...CREATE_KEYS } })

/** Why `key` cannot be given to `target` in `group`, or null when it can. */
export function chordKeyProblem(group, target, key, overrides) {
  if (!validChordKey(key)) return 'Use a single letter, number or punctuation key.'
  const owner = Object.entries(chordKeys(group, overrides)).find(([t, k]) => k === key && t !== target)
  return owner ? `"${key}" is already used for another shortcut in this group.` : null
}

// ----------------------------------------------------------------- the reference list
/**
 * Every shortcut as { id, group, label, keys (tokens), scope ('global' or a page path), customizable }.
 * `labelFor(group, target)` names a chord target (a page or a create action).
 */
export function buildRegistry(overrides, labelFor) {
  const rows = [
    { id: 'palette', group: 'Everywhere', label: 'Search and command palette', keys: ['Mod', 'K'], scope: 'global' },
    { id: 'palette-slash', group: 'Everywhere', label: 'Open the search', keys: ['/'], scope: 'global' },
    {
      id: 'quick',
      group: 'Everywhere',
      label: 'Quick create',
      keys: ['Mod', 'Shift', 'N'],
      scope: 'global',
      note: 'Some browsers keep this for a private window; "c" then a letter works everywhere.',
    },
    { id: 'help', group: 'Everywhere', label: 'Show keyboard shortcuts', keys: ['Mod', '/'], scope: 'global' },
    { id: 'help-q', group: 'Everywhere', label: 'Show keyboard shortcuts', keys: ['?'], scope: 'global' },
    { id: 'esc', group: 'Everywhere', label: 'Close the open dialog or menu', keys: ['Esc'], scope: 'global' },
    { id: 'undo', group: 'Editing', label: 'Undo the last action', keys: ['Mod', 'Z'], scope: 'global' },
    { id: 'redo', group: 'Editing', label: 'Redo', keys: ['Mod', 'Shift', 'Z'], scope: 'global' },
    {
      id: 'select',
      group: 'Editing',
      label: 'Select several records',
      keys: ['Mod', 'Click'],
      scope: 'global',
      note: 'Shift-click works too. Esc clears the selection.',
    },
  ]
  for (const [target, key] of Object.entries(chordKeys('go', overrides)))
    rows.push({
      id: `go:${target}`,
      group: 'Go to a page',
      label: labelFor('go', target),
      keys: ['g', key],
      scope: 'global',
      customizable: { group: 'go', target },
      chord: true,
    })
  for (const [target, key] of Object.entries(chordKeys('create', overrides)))
    rows.push({
      id: `create:${target}`,
      group: 'Create',
      label: labelFor('create', target),
      keys: ['c', key],
      scope: 'global',
      customizable: { group: 'create', target },
      chord: true,
    })
  return rows
}

/** Page shortcuts that exist only on one page. They share the keys of global ones on purpose; the reference says where each applies. */
export const PAGE_SHORTCUTS = [
  {
    page: '/calendar',
    label: 'Calendar',
    rows: [
      ['T', 'Go to today'],
      ['D W M A', 'Day, week, month or agenda view'],
      ['J / K', 'Next / previous period'],
      ['N or C', 'New event'],
      ['Shift N', 'New task'],
      ['G', 'Go to a date'],
      ['Alt + arrows', 'Move the focused item'],
    ],
  },
]

const signature = (r) => r.keys.map((k) => k.toLowerCase()).join('+')

/** Shortcuts that would fire from the same keys. Two global ones with one signature is a real conflict; a page key that matches a global one is reported as an overlap. */
export function findConflicts(rows) {
  const by = new Map()
  for (const r of rows) {
    const s = signature(r)
    by.set(s, [...(by.get(s) ?? []), r])
  }
  return [...by.values()].filter((g) => g.length > 1 && new Set(g.map((r) => r.label)).size > 1)
}

/** Single keys a page binds that a global shortcut also uses (for the reference page's note). */
export function pageOverlaps(rows) {
  const first = new Set(rows.filter((r) => r.chord).map((r) => r.keys[0].toLowerCase()))
  first.add('/')
  first.add('?')
  const out = []
  for (const p of PAGE_SHORTCUTS)
    for (const [keys, what] of p.rows) {
      const hit = keys.split(/\s+/).find((k) => first.has(k.toLowerCase()))
      if (hit && keys.split(/\s+/).length <= 4 && !keys.includes('+')) out.push({ page: p.label, key: hit, what })
    }
  return out
}
