// Confetti and haptics for real achievements. Self-contained canvas, no dependency: created for the burst and removed afterwards, so it costs nothing the rest of the time.
import { motionOff } from '@/components/motion/tokens'

const COLORS = ['#8B5CF6', '#6366F1', '#22C55E', '#F59E0B', '#EC4899', '#38BDF8', '#FAFAFA']
const GRAVITY = 0.16
const DRAG = 0.985

/** A short tap on the device, where the browser supports it. */
export function tick(ms = 12) {
  if (motionOff()) return
  navigator.vibrate?.(ms)
}

/**
 * @param origin { x, y } in viewport pixels; defaults to the upper middle of the screen. Pass an element to burst from it.
 * @param count particles. Small wins use a small burst (`celebrate({ count: 28 })`); big ones the default.
 */
export function celebrate({ origin, count = 90 } = {}) {
  if (motionOff() || typeof document === 'undefined') return
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext?.('2d')
  if (!ctx) return
  const scale = Math.min(window.devicePixelRatio || 1, 2)
  const width = window.innerWidth
  const height = window.innerHeight
  canvas.width = width * scale
  canvas.height = height * scale
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:70'
  document.body.appendChild(canvas)
  ctx.scale(scale, scale)

  let from = origin
  if (origin instanceof Element) {
    const box = origin.getBoundingClientRect()
    from = { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  }
  const x0 = from?.x ?? width / 2
  const y0 = from?.y ?? height * 0.3
  const particles = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = 3 + Math.random() * 7
    return {
      x: x0,
      y: y0,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3.5,
      size: 4 + Math.random() * 5,
      turn: Math.random() * 6,
      spin: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }
  })

  const started = performance.now()
  const LIFE = 1500
  const frame = (now) => {
    const age = now - started
    ctx.clearRect(0, 0, width, height)
    ctx.globalAlpha = Math.max(0, 1 - age / LIFE)
    for (const p of particles) {
      p.vx *= DRAG
      p.vy = p.vy * DRAG + GRAVITY
      p.x += p.vx
      p.y += p.vy
      p.turn += p.spin
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.turn)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx.restore()
    }
    if (age < LIFE) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}
