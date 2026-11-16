# Sound & Feedback Studio

Settings → Profile & appearance → **Sound & Feedback Studio**. The sound engine itself (Web Audio, no files, one voice at a time, audio unlocked on the first gesture) already existed; this adds the controls around it.

## Events

Ten events, each with its own switch, volume and preview: button clicks, task completion, habit completion, goal achievement (and other celebrations), timer start, timer pause (and stop), timer completion, notifications, error feedback, successful actions (saved, added, removed). Every cue belongs to one event (`recipes.js`).

## Profiles

| Profile | What it does |
|---|---|
| Minimal | everything quiet; no success chime |
| Focus | only timer, notification and error sounds; no clicks or celebrations |
| Productivity (default) | brighter, longer completion sounds for tasks, habits and goals |
| Silent | nothing |

Pick an **everyday profile**, and a **focus profile** that takes over automatically while a focus block is running on this device (can be switched off). Choosing a profile resets the per-event changes (a profile is a fresh start); the master volume is kept. A person's own change to an event shows **Edited · reset**. **Restore defaults** resets everything.

## How loudness works

`audible = masterCurve(master volume) × event volume`. Master volume 0, mute, the master switch, a disabled event, a hidden tab (except a finished focus block) and audio that is still locked all produce silence, never a queued sound. Previews ignore an event's switch but never mute.

## Storage

Per device, in `localStorage` (`lifetrack:interaction-prefs`), so no migration and no network. Values from the first version (five on/off groups) are converted: a group that was off becomes its events off. Corrupt or blocked storage falls back to the defaults.

## Limits

Preferences are per device, not per account. Haptics are separate and only work where `navigator.vibrate` exists (Android Chrome and Firefox, not iOS Safari). The mobile app has no sound settings.
