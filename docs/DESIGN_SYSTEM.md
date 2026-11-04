# Design system

How LifeTrack looks and moves. Tokens live in `packages/design-tokens` (shared by web and native) and are mirrored as CSS variables in `apps/web/src/index.css`; `packages/design-tokens/tests/css-sync.test.ts` fails if the two drift.

## Colour

Dark first. Light is a full theme, not an afterthought: every token has both values.

| Token | Dark | Used for |
| --- | --- | --- |
| `background` | `#09090B` | The page |
| `sidebar` | `#0D0D10` | Navigation |
| `card` | `#111114` | Cards and dialogs |
| `surface-2` | `#18181B` | Tiles inside a card, toolbar wells |
| `primary` / `indigo` | `#8B5CF6` / `#6366F1` | Brand. Primary buttons and focus rings are always violet |
| `foreground` / `muted-foreground` | `#FAFAFA` / `#A1A1AA` | Text |

### Module accents

Each module has a gradient (`moduleAccents`). On the web, `[data-module='finance']` sets `--mod`, `--mod-2` and `--mod-text`, and `AppShell` puts the current module's name on `<html>`, so progress, charts, active states and the ambient light all follow it. A single tile can carry its own: `<StatCard module="fitness">`. On native, `useAccent()` does the same job.

`--mod-text` is the shade of the accent that stays readable on that theme. Use it for text; use `--mod` for fills.

Glass (`.lt-glass`) is deliberately rare: the sticky header and the mobile tab bar. Phones get a near-solid surface instead, because blur is the costliest thing on a mid-range device.

## Shape and depth

Radii: `sm` 6, `md` 10 (controls), `lg` 14, `xl` 18 (cards), `2xl` 22 (hero cards). Shadows barely read on near-black, so dark-theme depth comes from a hairline highlight along the top edge (`--shadow-card`, `--shadow-raised`, `--shadow-overlay`).

## Motion

Web tokens are in `components/motion/tokens.js`, native in `packages/design-tokens` (`motion`).

| Kind | Timing | For |
| --- | --- | --- |
| Feedback | 120 ms | Press, hover, leaving |
| Standard | 200 ms ease-out | Dialogs, popups |
| Arrival | 320 ms ease-out | Pages, content |
| Count | 700 ms | Numbers, bars |
| `spring.snappy` | 420 / 32 | Sliding indicators, list moves |
| `spring.bouncy` | 520 / 18 | Celebrations and check-offs only |

Rules:

- **Things arrive unhurried and leave fast.** Nothing leaving ever makes you wait.
- **Only transform and opacity**, so the page underneath never repaints. Rings are the one exception (SVG stroke) and are small.
- **CSS for what repeats, Motion for what enters.** Hover lift (`.lt-lift`) and press (`.lt-press`) are CSS, because a list can hold hundreds of them.
- **Reduced motion is honoured everywhere.** `MotionConfig reducedMotion="user"` and a global CSS rule on the web, `useReducedMotion()` on native. Confetti and count-ups turn off entirely.
- **Confetti is for real achievements, as they happen**, never on revisiting a finished day: `celebrate()` on web, `useConfetti()` on native.
- **A dialog on top of another uses `stacked`**, so it leaves at once. While a dialog animates out it's still the top layer and would swallow an Escape meant for the one underneath.

## Primitives

Web (`components/motion/primitives.jsx`): `Stagger`, `StaggerItem`, `Reveal`, `AnimatedValue`, `ProgressRing`, `Magnetic`, `Collapse`. Also `CheckButton`, `WeekStrip`, `SparkBars`, `SparkDots`.

Native (`src/ui/motion.tsx`): `FadeIn`, `PressableScale`, `AnimatedNumber`, `ProgressRing`, `Gradient`, `IconTile`, `Hero`, `CheckCircle`, `Skeleton`, `useConfetti`, plus `LifeTabBar`.

Anything that scrolls into view (`data-reveal`) is forced visible when printing, so a report never prints blank.

## Performance

- The first load carries no chart library. `chartParts.jsx` holds what the shell and tiles need; Recharts stays in `charts.jsx`, loaded with the pages that draw charts.
- Motion's animation engine is its own chunk (`LazyMotion`). Use `m.div`, not `motion.div`.
- `AnimatedValue` writes to the DOM directly, so counting never re-renders anything. The dashboard clock re-renders only itself.
