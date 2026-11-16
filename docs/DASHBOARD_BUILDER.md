# Dashboard builder

The web Overview is a drag-and-drop dashboard. Press **Edit dashboard** to move, resize, add, hide and remove widgets, keep several
dashboards (workspaces) and start from a template. Nothing here touches tasks, habits, transactions or any other data: a widget only
summarises records, so removing one only removes the card.

## Where things live

| Part | File |
| --- | --- |
| Rules: catalog, workspaces, layouts, templates, persistence format (pure, tested) | `packages/core/src/dashboardBuilder.js` |
| Editing state: draft, Save/Cancel, conflict check, workspace switching | `apps/web/src/features/overview/builder/useDashboardBuilder.js` |
| Grid (react-grid-layout), edit chrome, per-widget error boundary | `builder/DashboardGrid.jsx`, `builder/grid.css` |
| Widget library, widget settings, templates, workspace tabs, edit bar | `builder/WidgetLibrary.jsx`, `WidgetSettings.jsx`, `TemplatesDialog.jsx`, `WorkspaceBar.jsx`, `EditBar.jsx` |
| Cards that had no dashboard card before (focus, notes, calendar, budget, transactions, interviews) | `features/overview/MoreCards.jsx` |
| The page that feeds every card | `features/overview/OverviewPage.jsx` |

## Storage

No migration. Everything is in the existing `user_settings.dashboard_widgets` json under the key `ws`:

```
ws = { v: 1, rev, defaultId, workspaces: [Workspace], templates: [Template] }
Workspace = { id, name, createdAt, updatedAt, widgets: [{ id, type, title, config, hidden, size }],
              layouts: { lg: [{ i, x, y, w, h }], md: [...], sm: [...] } }
```

* `lg` is 12 columns, `md` 6, `sm` 1 (a phone). They are measured on the grid's own box, so the sidebar is already accounted for. Each
  size keeps its own layout; a size nobody has laid out is derived from the large one.
* The old keys (`today: false`, `order`, `sizes`) are still written, following the **default** workspace, because the mobile app reads
  them. Changes made on the phone do not flow back into `ws`.
* `rev` rises on every save. Before writing, the builder fetches the saved row again; if its `rev` is not the one the editor started from,
  it asks (keep mine / use the newer one) instead of overwriting.
* The workspace you are looking at is remembered per device in `localStorage` (`lt.dashboard.workspace`); only "default" is saved to the
  account.
* A stored layout is always repaired on read: unknown widgets dropped, sizes clamped to each widget's limits, overlaps and gaps settled
  the way the grid settles them.

## Adding a widget type

Add an entry to `WIDGET_CATALOG` (size, limits, settings), a renderer in `OverviewPage`'s `widgets` map, and, if it shows a locked
module's data, its key in that module's `widgets` list in `moduleLocks.js`.
