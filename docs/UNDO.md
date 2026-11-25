# Undo and redo

`lib/actionHistory.js` keeps a short history of reversible actions. Anything a context-menu or bulk action returns with an `undo` (optionally `redo` and `check`) is recorded, and the toast's **Undo** button and **Ctrl/Cmd+Z** / **Ctrl/Cmd+Shift+Z** use the same entries.

- **Expiry:** an entry older than 10 minutes is refused, with a message, never reversed silently.
- **Stale data:** `changeField`/`changeFields` supply a `check()` that confirms the rows still hold what the action wrote. If they changed since (this tab or another device), Undo refuses and drops the entry rather than overwrite newer data.
- **Irreversible actions** (deleting, completing a repeating task) report no `undo`, so they never enter the history.
- **Shortcuts** ignore typing fields (they keep their own undo) and any open dialog or menu.
- Limits: the history is per tab and lost on reload. Redo exists only for patch-style edits.
