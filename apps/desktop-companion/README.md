# LifeTrack Companion (optional desktop shell)

A minimal Tauri 2 wrapper around the web Companion (`/companion`). **Not compiled or run** when it was written (no Rust here): expect to adjust versions.

What it adds over the browser: a **global shortcut** (Alt+Shift+L toggles the window from any app), a **tray icon** (Show / hide, Quit), an **always-on-top** window that hides instead of quitting. Everything else is the web app.

## Run

```bash
# 1. install Rust (https://rustup.rs) and the Tauri prerequisites for your OS
# 2. point the window at your deployment: edit src-tauri/tauri.conf.json -> app.windows[0].url
cargo install tauri-cli --version "^2"
cd apps/desktop-companion/src-tauri
cargo tauri dev      # or: cargo tauri build
```

Sign in once inside the window; the session is kept by the web view like in any browser. Things to check first: that the shortcut registers on your OS (macOS may ask for permission), the tray icon on Linux (needs a status-notifier host), and that the remote page may open (`app.security`).
