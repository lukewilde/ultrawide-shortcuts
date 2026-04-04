# Wards: Configurable Window Grid Layouts

**Date:** 2026-04-04  
**Status:** Approved

## Context

Window Summoner currently has two distinct features:

1. **Summons** — shortcuts that launch or focus apps by WM class (configurable via prefs)
2. **Position presets** — Alt+Super+1–9 shortcuts that snap the focused window into grid positions (hardcoded in `extension.js` as `POSITION_PRESETS`)

The position preset system is powerful but completely hardcoded. Users cannot change the grid dimensions, the key assignments, the number of presets, or add margins between windows and screen edges. This design makes position presets fully configurable via a new "Wards" tab in the prefs UI, while preserving all existing behavior as the default config.

The prefs tabs are renamed to match the Window Summoner theme:
- **Summons** (was "Bindings") — app launch/focus shortcuts
- **Wards** (new) — grid layout definitions

---

## Data Model

A **Ward** is a named grid configuration with a set of shortcuts. Each shortcut maps a key binding to one or more cell selections within the Ward's grid. Multiple positions per shortcut enable cycling behavior (pressing the same key repeatedly on the same window steps through positions).

```json
[
  {
    "name": "Default",
    "cols": 6,
    "rows": 4,
    "edgeMargin": 0,
    "cellGap": 0,
    "shortcuts": [
      {
        "shortcut": "<Alt><Super>1",
        "positions": [
          { "anchor": {"col": 1, "row": 1}, "target": {"col": 3, "row": 4} },
          { "anchor": {"col": 1, "row": 1}, "target": {"col": 2, "row": 4} }
        ]
      },
      {
        "shortcut": "<Alt><Super>2",
        "positions": [
          { "anchor": {"col": 4, "row": 1}, "target": {"col": 6, "row": 4} }
        ]
      }
    ]
  }
]
```

**Field definitions:**

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name for the Ward |
| `cols` | integer | Number of grid columns |
| `rows` | integer | Number of grid rows |
| `edgeMargin` | integer (px) | Gap between the screen work area edge and windows |
| `cellGap` | integer (px) | Gap between adjacent grid cells |
| `shortcuts[].shortcut` | string | Accelerator string (e.g. `<Alt><Super>1`) |
| `shortcuts[].positions` | array | Ordered list of positions for cycling |
| `positions[].anchor` | `{col, row}` | First corner of selection (1-indexed) |
| `positions[].target` | `{col, row}` | Second corner of selection (1-indexed) |

**Rules:**
- All Wards' shortcuts are active simultaneously — the user is responsible for avoiding collisions.
- Grid dimensions (`cols`, `rows`) are fixed per Ward and inherited by all shortcuts within it.
- Cycling resets after 1 second of inactivity (existing behavior, unchanged).

---

## GSettings Schema Changes

Add one new key to `schemas/org.gnome.shell.extensions.window-summoner.gschema.xml`:

```xml
<key name="wards" type="s">
  <default>'[]'</default>
  <summary>Ward layout definitions</summary>
  <description>
    JSON array of Ward objects. Each Ward has: name, cols, rows,
    edgeMargin (px), cellGap (px), and shortcuts (array of {shortcut, positions[]}).
    Each position has anchor and target {col, row} (1-indexed).
  </description>
</key>
```

The default is `'[]'` — on first load with an empty array, `extension.js` falls back to the built-in default Ward (see Default Config section).

---

## extension.js Changes

### Remove hardcoded presets
Remove the `POSITION_PRESETS` constant and all code that references it.

### Load Wards from GSettings
On `enable()`, load the `wards` JSON string from GSettings. If the parsed array is empty, substitute the built-in default Ward. Register all shortcuts across all Wards.

Re-register on `changed::wards` signal (same pattern as existing `changed::bindings`).

### Shortcut registration
For each Ward, for each shortcut, register an accelerator via `global.display.grab_accelerator()`. The handler calls `_applyWardPreset(ward, shortcutConfig)`.

### _applyWardPreset(ward, shortcutConfig)
Replaces the existing `_applyPositionPreset`. Logic:

1. Get the focused window.
2. Determine cycling index (same window + same shortcut within 1s → advance index).
3. Select `position = shortcutConfig.positions[cycleIndex % positions.length]`.
4. Get the monitor work area for the focused window's monitor.
5. Apply `edgeMargin` by shrinking the work area rect on all sides.
6. Call `gridToPixels(ward.cols, ward.rows, position.anchor, position.target, shrunkWorkArea, ward.cellGap)`.
7. Call `metaWindow.move_resize_frame(true, x, y, width, height)`.

### Cycling state
The existing cycle state tracks `{windowId, presetIndex}` with a 1s timeout reset. Extend to track `{windowId, shortcutKey}` so each shortcut has independent cycle state across all Wards.

---

## positioning.js Changes

Update `gridToPixels` to accept margin parameters:

```js
// Current signature:
gridToPixels(cols, rows, anchor, target, workArea)

// New signature:
gridToPixels(cols, rows, anchor, target, workArea, cellGap = 0)
```

The `edgeMargin` is applied by the caller (shrinking `workArea` before passing it in). The `cellGap` is applied inside `gridToPixels` — each cell's pixel bounds are inset by `cellGap / 2` on each side (so adjacent cells have a full `cellGap` gap between them, and edge cells have `cellGap / 2` from the edge of the work area).

Unit tests in `test/test_positioning.js` should be updated to cover `cellGap` behavior.

---

## prefs.js Changes

### Tab rename
Rename the existing `Adw.PreferencesPage` title from "Bindings" to "Summons" and update its icon to match.

### New Wards tab
Add a second `Adw.PreferencesPage` titled "Wards" with a grid icon.

**Structure (accordion):**

```
Wards page
└── [for each Ward]
    Adw.ExpanderRow (Ward card)
    ├── Settings row: Name | Columns | Rows | Edge Margin | Cell Gap
    ├── [for each shortcut]
    │   Adw.ExpanderRow (shortcut row)
    │   ├── Shortcut field (Adw.EntryRow)
    │   ├── [for each position]
    │   │   ActionRow: "col X–Y, row X–Y" label + remove button
    │   └── "Add position" button row
    └── "Add shortcut" button row
    "Add Ward" button (below all Ward cards)
```

**Position editing flow:** Clicking "Add position" (or clicking an existing position row) opens an `Adw.AlertDialog` with four spinners: Anchor Col, Anchor Row, Target Col, Target Row. Values are validated against the Ward's `cols`/`rows`. On confirm, the position is added/updated and the label regenerated.

**Live labels:** Each shortcut's `ExpanderRow` subtitle shows "N position(s) (cycling)" or "1 position". Each position row shows a human-readable label: `col 1–3, row 1–4`.

**Settings persistence:** Same `_writing` flag pattern as existing bindings — prevents reload loop when prefs writes to GSettings.

---

## Default Config

The built-in default Ward re-expresses the current 9 hardcoded `POSITION_PRESETS` as a single Ward. It is used when the `wards` GSettings key is empty (`[]`).

```js
const DEFAULT_WARD = {
  name: 'Default',
  cols: 6,
  rows: 4,
  edgeMargin: 0,
  cellGap: 0,
  shortcuts: [
    // Re-expressed from existing POSITION_PRESETS
    // Alt+Super+1 through Alt+Super+9
    // (to be derived from the existing hardcoded values during implementation)
  ],
};
```

This ensures zero behavior change on upgrade for existing users.

---

## Verification

1. **Unit tests:** `gjs -m test/test_positioning.js` — add cases for `cellGap` in `gridToPixels`.
2. **Schema compile:** `glib-compile-schemas schemas/` — no errors.
3. **Default behavior:** Fresh install (or cleared `wards` key) → Alt+Super+1–9 behave identically to current hardcoded presets.
4. **Custom Ward:** Create a new Ward via prefs UI, assign a shortcut, trigger it with `./dev.sh trigger` or the actual shortcut → window snaps correctly.
5. **Margins:** Set `edgeMargin: 20` and `cellGap: 10` on a Ward, trigger a shortcut → verify pixel-level gap between window and screen edge / between tiled windows.
6. **Cycling:** Assign 2+ positions to a shortcut → repeated key presses cycle through them; cycling resets after 1s inactivity.
7. **Multiple Wards:** Create two Wards with non-overlapping shortcuts → both sets of shortcuts work simultaneously.
8. **Prefs reload:** Edit via dconf CLI while prefs window is open → UI updates; edit via prefs UI → dconf value updates.
9. **Tab names:** Prefs window shows "Summons" and "Wards" tabs.
