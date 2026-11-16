# Desktop Companion

Today in a small window: quick task, today's tasks and habits, a focus timer, and upcoming reminders. Opens at `/companion`, from **Settings → Desktop Companion** or **Alt+Shift+L**.

It uses the same data and the same functions as the rest of the app (`createTask`, `setTaskStatus`, `setHabitStatus`, `recordFocus`), so nothing is a second copy. The focus timer is **the same timer** as the Focus page (one saved state per account on the device), so a block started here shows there and keeps counting to its end time when the window is closed. The block is saved by whichever window finishes it first.

Layout (which widgets, order, spacing, light / dark / follow the app, minimise to a slim bar) is per device in `localStorage` (`lifetrack:companion`).

## What a browser can do, and what it cannot

| Capability | Browser (PWA) | Optional desktop app (Tauri) |
|---|---|---|
| Small window of its own | **Yes**, `window.open` pop-up, every desktop browser | yes |
| Always on top of other windows | **Only in Chrome / Edge 116+** through *Document Picture-in-Picture* (the float button; detected, never assumed). Not in Firefox or Safari | yes |
| Minimise / restore | window controls of the OS; the companion also collapses to a slim bar and resizes pop-ups it opened | yes |
| Dock / taskbar icon | yes, after installing the PWA | yes |
| Keyboard shortcut | **Only while a LifeTrack window is focused** (Alt+Shift+L). A web page cannot hear the keyboard in other apps | **Yes, global** |
| System tray / menu bar icon | **No** | yes |
| Start with the computer | **No** | optional |
| Timer keeps counting | yes (it counts to an end time, so it is right when you look again), but the *chime and the saving of a finished block* need a LifeTrack window open | same |

## Optional desktop app

`apps/desktop-companion/` is a small **Tauri 2** shell, not part of the workspace or CI, that adds the three things a browser cannot: the global shortcut, the tray icon and an always-on-top window. It loads the deployed LifeTrack at `/companion` (no second copy of the app, no JavaScript bridge), hides to the tray when closed, and toggles on **Alt+Shift+L**.

> **Status: untested.** There is no Rust toolchain on the machine this was written on, so the scaffold was **not compiled or run**. Treat it as a starting point; see its README for the commands and what to verify. Electron would work too but ships a whole Chromium (about 100 MB); Tauri uses the system web view (about 5 MB).
