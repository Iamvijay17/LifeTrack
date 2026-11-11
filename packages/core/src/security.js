// Shared security rules. Pure functions, no I/O: the web app, the in-browser dev backend and (later) the mobile app use the SAME rules, and the
// database mirrors the PIN and lockout rules in supabase/migrations/0012_security.sql (a test runs both against the same table of cases).
//
// What is NOT here: anything secret. Hashing and verification of passwords and PINs happens on the server (GoTrue / Postgres).

// ------------------------------------------------------------------------------------------------------ app lock
export const PIN_LENGTHS = [4, 6]

/** Auto-lock choices, in seconds of inactivity. 0 = lock as soon as the app is left (tab hidden / app backgrounded). */
export const AUTO_LOCK_OPTIONS = [
  { seconds: 0, label: 'When I leave the app' },
  { seconds: 60, label: 'After 1 minute' },
  { seconds: 300, label: 'After 5 minutes' },
  { seconds: 900, label: 'After 15 minutes' },
  { seconds: 1800, label: 'After 30 minutes' },
  { seconds: 3600, label: 'After 1 hour' },
]
export const DEFAULT_AUTO_LOCK = 300
export const isAutoLockSeconds = (n) => AUTO_LOCK_OPTIONS.some((o) => o.seconds === n)
export const autoLockLabel = (seconds) => AUTO_LOCK_OPTIONS.find((o) => o.seconds === seconds)?.label ?? `After ${Math.round(seconds / 60)} min`

/**
 * Brute-force protection for the PIN. Every `every` consecutive wrong tries lock PIN entry for a while that doubles each round
 * (30 s, 1 min, 2 min, … capped at 1 h). From the second round on, the session is also ended, so guessing on through the lockouts needs the
 * account password again. A correct PIN resets the count.
 */
export const LOCKOUT = { every: 5, baseSeconds: 30, maxSeconds: 3600, signOutFrom: 10 }
/** Seconds PIN entry is locked for after the Nth consecutive failure (0 = no lockout yet). */
export function lockoutSecondsAfter(failures) {
  if (!(failures > 0) || failures % LOCKOUT.every !== 0) return 0
  return Math.min(LOCKOUT.baseSeconds * 2 ** (failures / LOCKOUT.every - 1), LOCKOUT.maxSeconds)
}
/** True when this failure also ends the session (the Nth wrong try, from `signOutFrom` on, at every lockout). */
export const revokesSession = (failures) => failures >= LOCKOUT.signOutFrom && failures % LOCKOUT.every === 0
export const triesLeftBeforeLockout = (failures) => LOCKOUT.every - (failures % LOCKOUT.every)

/**
 * Lockout for the ACCOUNT PASSWORD: the database hook `hook_password_verification_attempt` (Supabase) and the in-browser dev backend.
 * Every 5th wrong password in a row blocks password sign-in for 1 minute, doubling each round up to 15 minutes. A correct password resets it.
 */
export const PASSWORD_LOCKOUT = { every: 5, baseSeconds: 60, maxSeconds: 900 }
export function passwordLockoutSecondsAfter(failures) {
  if (!(failures > 0) || failures % PASSWORD_LOCKOUT.every !== 0) return 0
  return Math.min(PASSWORD_LOCKOUT.baseSeconds * 2 ** (failures / PASSWORD_LOCKOUT.every - 1), PASSWORD_LOCKOUT.maxSeconds)
}

/** How long until a number of seconds is over, e.g. "1 min 30 s". */
export function formatWait(seconds) {
  const s = Math.max(0, Math.ceil(seconds))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m < 60) return r ? `${m} min ${r} s` : `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

// PINs that are guessed first. Mirrors weak_pin() in the migration.
const COMMON_PINS = new Set([
  '1234', '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1212', '2580', '1004', '2000', '6969', '1122', '1313',
  '4321', '2001', '1010', '0852', '123123', '112233', '121212', '159753', '654321', '123321', '111222', '000000', '121314',
])
const isRun = (s, step) => [...s].every((c, i) => i === 0 || (Number(c) - Number(s[i - 1]) + 10) % 10 === step) // wraps 9→0, so 7890 and 0987 count
/** Reasons a well-formed PIN is too easy to guess, or null when it is fine. */
export function weakPinReason(pin) {
  if (/^(\d)\1+$/.test(pin)) return 'Avoid repeating one digit.'
  if (isRun(pin, 1) || isRun(pin, 9)) return 'Avoid straight runs like 1234 or 4321.'
  if (COMMON_PINS.has(pin)) return 'That PIN is one of the first an attacker would try.'
  return null
}
/** `length` (4 or 6) is optional: when given, the PIN must have exactly that many digits. */
export function validatePin(pin, length) {
  const s = typeof pin === 'string' ? pin : ''
  if (!/^\d+$/.test(s)) return { ok: false, reason: 'A PIN is digits only.' }
  if (!PIN_LENGTHS.includes(s.length)) return { ok: false, reason: 'Use 4 or 6 digits.' }
  if (length && s.length !== length) return { ok: false, reason: `Use exactly ${length} digits.` }
  const weak = weakPinReason(s)
  return weak ? { ok: false, reason: weak } : { ok: true, reason: null }
}

// ------------------------------------------------------------------------------------------------------ passwords
const LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong']
export const PASSWORD_MIN = 8
export const PASSWORD_MAX_BYTES = 72 // bcrypt (what Supabase Auth uses) ignores everything past 72 bytes, so longer input would silently weaken

// The most guessed passwords and the words they are built from. A password is rejected when it equals one of these, or one of them plus
// digits/symbols (password1, Welcome2024!), or one of them written in leetspeak (p@ssw0rd). Not a dictionary: a short list of what attackers try first.
const COMMON = new Set(
  (
    'password passwd pass admin administrator root user login welcome letmein secret master monkey dragon baseball football soccer hockey ' +
    'basketball cricket iloveyou sunshine princess shadow superman batman spiderman starwars pokemon naruto qwerty qwertyuiop asdfgh asdfghjkl ' +
    'zxcvbnm azerty abc abcd abcdef trustno1 whatever freedom hello hunter killer jordan michael jennifer ashley nicole daniel andrew thomas ' +
    'charlie buster tiger lakers yankees ginger summer winter spring autumn flower cookie cheese chocolate coffee pepper banana orange ' +
    'computer internet google facebook twitter youtube netflix amazon apple samsung iphone android windows linux ubuntu changeme default ' +
    'test testing guest demo sample temp temporary system server network access security private mypassword lifetrack india chennai mumbai delhi ' +
    'bangalore krishna ganesh murugan shiva lakshmi iloveu loveme forever angel angels starwar passw0rd p4ssword letmein1 qazwsx zaq12wsx 1q2w3e ' +
    'abc123 password1 welcome1 iloveyou1 football1 monkey1 dragon1 master1 sunshine1 princess1'
  ).split(' '),
)
const UNLEET = { 0: 'o', 1: 'l', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '+': 't' }
const unleet = (s) => [...s].map((c) => UNLEET[c] ?? c).join('')
const ALPHABETS = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const step = (a, b) => {
  for (const abc of ALPHABETS) {
    const i = abc.indexOf(a)
    if (i >= 0 && i + 1 < abc.length && abc[i + 1] === b) return 1
    if (i > 0 && abc[i - 1] === b) return -1
  }
  return a === b ? 0 : null
}
/** Share of characters sitting in a run of 3+ that goes up, down or repeats (1234, cba, aaaa, qwerty). */
export function patternShare(pw) {
  const s = pw.toLowerCase()
  if (!s.length) return 0
  const covered = new Array(s.length).fill(false)
  let i = 0
  while (i < s.length - 1) {
    const d = step(s[i], s[i + 1])
    if (d === null) {
      i++
      continue
    }
    let j = i + 1 // the run i..j keeps the same direction
    while (j < s.length - 1 && step(s[j], s[j + 1]) === d) j++
    if (j - i + 1 >= 3) for (let k = i; k <= j; k++) covered[k] = true
    i = j
  }
  return covered.filter(Boolean).length / s.length
}
const utf8Length = (s) => (typeof TextEncoder === 'function' ? new TextEncoder().encode(s).length : unescape(encodeURIComponent(s)).length)
const stripAffixes = (s) => s.replace(/^[^a-z]+/, '').replace(/[^a-z]+$/, '')
const classes = (s) => (/[a-z]/.test(s) ? 26 : 0) + (/[A-Z]/.test(s) ? 26 : 0) + (/\d/.test(s) ? 10 : 0) + (/[^A-Za-z0-9]/.test(s) ? 33 : 0)

/**
 * Judges a NEW password. `ok` is what forms require; `score` (0-4) and `label` drive the strength meter; `issues` explains a "no".
 * Length matters most, then variety; common passwords, personal details, repeats and runs cap the score.
 * `context` is { email, name }: a password built from them is a guess every attacker tries.
 */
export function assessPassword(password, { email = '', name = '' } = {}) {
  const pw = typeof password === 'string' ? password : ''
  const issues = []
  if (pw.length < PASSWORD_MIN) issues.push(`Use at least ${PASSWORD_MIN} characters.`)
  if (utf8Length(pw) > PASSWORD_MAX_BYTES) issues.push(`Use at most ${PASSWORD_MAX_BYTES} bytes (about ${PASSWORD_MAX_BYTES} characters).`)

  const lower = pw.toLowerCase()
  const core = stripAffixes(lower)
  if (pw && (COMMON.has(lower) || COMMON.has(core) || COMMON.has(unleet(lower)) || COMMON.has(stripAffixes(unleet(lower))))) {
    issues.push('This is one of the most common passwords, or a small variation of one.')
  }
  const personal = [String(email).split('@')[0], ...String(name).split(/\s+/)].map((p) => p.toLowerCase()).filter((p) => p.length >= 3)
  if (pw && personal.some((p) => lower.includes(p))) issues.push('Do not build the password from your name or email.')
  const share = patternShare(pw)
  if (pw && share >= 0.5) issues.push('Avoid runs and repeats like 1234, abcd, qwerty or aaaa.')

  // Rough guess-count estimate: each repeated character adds little, then scale by the size of the alphabet used.
  const unique = new Set(pw).size
  const bits = pw ? (unique + 0.35 * (pw.length - unique)) * Math.log2(Math.max(classes(pw), 2)) : 0
  let score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 56 ? 2 : bits < 72 ? 3 : 4
  if (issues.length) score = Math.min(score, 1)
  else if (share >= 0.25) score = Math.min(score, 2)
  const ok = issues.length === 0 && score >= 2
  if (!ok && !issues.length) issues.push('Make it longer, or mix letters, numbers and symbols. A few unrelated words works well.')
  return { ok, score, label: LABELS[score], issues, bits: Math.round(bits) }
}
