# Life Map

`/map` (Growth → Life Map). Shows how daily activity connects to long-term goals.

## Nothing is duplicated

Goals, milestones, habits and tasks appear automatically from the tables LifeTrack already has. The map adds only:

| Table (`0020_life_map.sql`) | Holds |
|---|---|
| `life_map_nodes` | **projects** and **areas of life**, which have no other home |
| `life_map_links` | "A contributes to B" between any two items (unique per direction, no self-links, label up to 60 chars) |
| `life_map_positions` | where each item was left (one row per item, bounded) |

An item is named by a key `kind:uuid`. Keys cannot be foreign keys (they point at four tables), so four small `AFTER DELETE` triggers remove a record's links and position when the record is deleted, and the screen also ignores any link whose ends are missing. A milestone's link to its goal is drawn from `milestones.goal_id`, not stored.

## Reading the map

- A link reads "from contributes to to", flowing left to right. Green and solid once what it starts from is **done**; grey and dashed while **pending**; dotted for links the app drew itself.
- Each item shows its own progress (goal: milestones, study time or manual %; habit: 30-day rate; task and milestone: done or not). A project or area has none of its own: it is the share of what feeds it that is done.
- Tasks appear only once you link them (**Linked tasks**), or all of them with **All tasks**, so a long to-do list cannot bury the map.

## Using it

Drag from the dot on an item's right edge onto another to connect; or select an item and use **Connect to** (keyboard and touch friendly). Loops, repeats and reverse duplicates are refused with the reason. Drag items to place them; positions are saved. **Tidy up** arranges everything left to right and saves it. Scroll or pinch to zoom, drag the background to pan, **Fit** to see everything. Search dims what does not match and lists results to jump to; the type buttons, category, **Hide done** and **Focus** (one item and its neighbours) quiet a busy map. Keyboard: Tab between items, Enter selects, arrows move the selected one (Shift = bigger steps), Escape clears.

## Limits

No graph library: plain SVG with its own pan, zoom and drag (a few hundred items stay smooth; tens of thousands would not). No minimap, no named layouts, no mobile app screen. The viewport (zoom and position) is remembered per device.
