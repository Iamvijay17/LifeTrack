// Profile photo helpers. The picture is shrunk in the browser to a small square before it is saved, so what is stored is a ~10 KB data URL
// (never the original file) and no image host is involved.

export const AVATAR_SIZE = 160
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/

/** Whether `v` is something safe to show as a profile picture: an inline image of reasonable size, never a link to somewhere else. */
export const isAvatar = (v) => typeof v === 'string' && v.length <= 60000 && DATA_URL.test(v)

/** The problem with a chosen file, or null when it can be used. */
export function avatarFileProblem(file) {
  if (!file) return 'Choose a picture.'
  if (!OK_TYPES.includes(file.type)) return 'Use a JPEG, PNG or WebP picture.'
  if (file.size > MAX_SOURCE_BYTES) return 'That picture is larger than 8 MB.'
  return null
}

/** The square region of a width × height image that is centred and as large as possible. */
export function centreSquare(w, h) {
  const side = Math.min(w, h)
  return { sx: Math.floor((w - side) / 2), sy: Math.floor((h - side) / 2), side }
}

/** Crop to a centred square, shrink to AVATAR_SIZE and return a JPEG data URL. */
export async function fitAvatar(file) {
  const problem = avatarFileProblem(file)
  if (problem) throw new Error(problem)
  const bitmap = await createImageBitmap(file)
  try {
    const { sx, sy, side } = centreSquare(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = AVATAR_SIZE
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff' // a transparent PNG becomes white rather than black in a JPEG
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
    for (const q of [0.85, 0.7, 0.5]) {
      const url = canvas.toDataURL('image/jpeg', q)
      if (isAvatar(url)) return url
    }
    throw new Error('That picture could not be made small enough.')
  } finally {
    bitmap.close?.()
  }
}
