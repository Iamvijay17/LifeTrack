# Right-click menus (web)

One reusable menu, one provider, and a small declarative item model. Pages describe *what* a menu offers; the system owns *how* it opens, closes, positions and runs.

```
apps/web/src/components/context-menu/
  ContextMenuProvider.jsx  provider + hooks (useContextMenu, usePageContextMenu), right-click and long-press binding, running actions
  ContextMenu.jsx          the portal panel, rows, submenus (built when they open), search box, keyboard navigation
  items.js                 item model + pure rules (separators, locked modules, permissions, search)
  placement.js             where the menu goes (pure; the four screen edges are unit-tested)
  helpers.js               changeField / changeFields / duplicateRow / bulkDelete / copyDetails: the writes most menus share
  useSelection.js, SelectionBar.jsx   multi-select
apps/web/src/features/<module>/contextMenu.js   each module's menus (pure builders over the module's own data layer)
```

## Using it on a page

```jsx
const menu = useContextMenu()
usePageContextMenu(() => [{ label: 'New task', icon: Plus, onSelect: addTask }])   // empty space of the page
<li {...menu.bind(() => taskItems(task, deps), { label: `Actions for ${task.title}` })}>…</li>   // one row
```

`bind()` returns the props for a region: `onContextMenu` for the mouse, and a press-and-hold for touch (`longPress: false` where the page has its own touch gesture, as the calendar does). The innermost region with at least one item wins; one with none lets the event through to the next region up, and finally to the browser. The page-level builder is registered with the shell, so it covers the whole content area.

## Items

`{ label, icon, shortcut, danger, disabled, disabledReason, hidden, checked (+ radio), module, permission, items, confirm, success, onSelect }`, plus `{ type: 'separator' }` and `{ type: 'label', label }`.

- `onSelect` may be async: the row shows a spinner and the menu stays until it settles. It may return `{ message, undo }`; an `undo` function puts an **Undo** button on the toast.
- `confirm: { title, description, confirmLabel }` asks in the app's confirm dialog first (destructive by default).
- `items` (an array, or a function) makes a submenu; a function runs only when it opens.
- `module: 'finance'` hides the item while that module is locked (see `docs/APP_SECURITY.md` §4a). A locked module's page is not mounted at all, so it registers no menu; `module` covers cross-module items such as "Open Finance" on the dashboard.
- `permission: false` greys the item out (`disabledReason` is its tooltip).
- Menus with 12 or more actions get a search box, which also finds actions inside submenus.

## What it never touches

Inputs, textareas, selects, contenteditable, links (`a[href]`), charts (`.recharts-wrapper`), anything marked `data-native-menu`, selected text under the pointer, and Shift+right-click (the way to the browser's own menu). Events that bubble out of a dialog are ignored.

## Multi-select

`useSelection(ids)` + `sel.itemProps(id)` on the row gives Ctrl/Cmd/Shift+click and a `data-selected` outline; `sel.targets(id)` is what a menu acts on (the selection when the row is in it, otherwise just the row). `<SelectionBar />` floats while something is selected. Escape clears.

## Tests

`tests/contextMenu/core.test.jsx` (placement at every edge, items, open/close, keyboard, submenus, search, confirm, undo, loading, long-press, selection, clipboard), `modules.test.jsx` (one or more real operations per module through the app and the in-browser backend) and `locks.test.jsx` (locked modules).
