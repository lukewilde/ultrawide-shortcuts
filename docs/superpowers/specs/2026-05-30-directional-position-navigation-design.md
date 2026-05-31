# Directional Position Navigation — Design

**Date:** 2026-05-30
**Branch:** feat/double-press-launch (feature will branch from here)
**Status:** Approved

## Summary

Add hotkeys that move the focused window to a *neighbouring* configured position
within a ward (position layout), navigated by direction:

- **Left** — closest split to the left
- **Right** — closest split to the right
- **Up** — closest *wider* split
- **Down** — closest *narrower* split

Each ward (e.g. "Columns", "Floating Grid") gets its own navigation **modifier
prefix**. The four arrow keys are fixed; the prefix selects which ward's
candidate set is navigated. Defaults: **Columns = `<Super>`**, **Grid = `<Alt><Super>`**.

This decouples horizontal movement (left/right) from sizing (wider/narrower), so
that from a centered position pressing Left jumps to a genuinely different split
rather than cycling same-center width variants.

## Navigation Model

### Candidate rectangles

For the targeted ward, flatten **every** `shortcuts[].positions[]` entry —
including cycle variants — into a flat set of candidate rectangles. Each
candidate carries:

- `rect` — pixel rectangle, computed via `gridToPixels` in the focused window's
  current work area, honoring the ward's `cols`/`rows`/`edgeMargin`/`cellGap`.
- `selection` — the 0-indexed `{anchor, target}` used to apply it.

### Reference point

The focused window's actual on-screen frame rectangle. No matching to a
candidate is required — raw geometry is the reference, so navigation works even
when the window is not sitting exactly on a defined position.

### Direction selection (`pickNeighbour`)

A pure function `pickNeighbour(windowRect, candidates, direction)` returns the
index of the chosen candidate, or `-1` if none qualifies.

Geometry per rect: `centerX`, `centerY`, `width`, `height` (pixels). Epsilon
`EPS = 2px` excludes the candidate(s) the window is already sitting on.

Direction filters and scoring (lexicographic — pick the minimum):

| Direction | Filter | Primary key | Tie-break |
|-----------|--------|-------------|-----------|
| `left`    | `candidate.centerX < windowRect.centerX - EPS` | `\|ΔcenterX\|` | euclidean over (Δwidth, ΔcenterY, Δheight) |
| `right`   | `candidate.centerX > windowRect.centerX + EPS` | `\|ΔcenterX\|` | euclidean over (Δwidth, ΔcenterY, Δheight) |
| `wider`   | `candidate.width   > windowRect.width   + EPS` | `\|Δwidth\|`   | euclidean over (ΔcenterX, ΔcenterY, Δheight) |
| `narrower`| `candidate.width   < windowRect.width   - EPS` | `\|Δwidth\|`   | euclidean over (ΔcenterX, ΔcenterY, Δheight) |

- **Left/Right** prioritize horizontal-center proximity → "closest neighbour to
  the left/right". Same-center variants are excluded by the filter, so they
  never absorb a left/right press.
- **Wider/Narrower** prioritize smallest width change → "closest wider/narrower
  split" (fuzzy nearest by size), with position closeness as the tie-break to
  keep the window near where it was.

Each keypress re-reads live geometry, so repeated presses walk the splits. No
cycle state is retained. At an extreme (no candidate passes the filter), the
function returns `-1` and the keypress is a no-op.

## Components

### 1. `positioning.js` — `pickNeighbour` (new)

Pure function, no `gi://` imports, alongside `gridToPixels`. Signature:

```js
pickNeighbour(windowRect, candidates, direction) -> number  // index or -1
```

`windowRect` and each `candidates[i]` are `{x, y, width, height}` in pixels.

### 2. `extension.js`

- **Extract** the window-applying tail of `_applyPositionShortcut` (unmaximize +
  `move_resize_frame`) into a shared `_applySelectionToFocused(ward, focused, selection)`
  helper. `_applyPositionShortcut` calls it; nav calls it too.
- `_buildCandidates(ward, focused)` — compute the work area for `focused`'s
  monitor (with `edgeMargin` applied), then map every `shortcuts[].positions[]`
  entry through `gridToPixels` to `{rect, selection}[]`.
- `_navigate(ward, direction)` — read `focused.get_frame_rect()`, build
  candidates, call `pickNeighbour`, apply the chosen `selection` via the shared
  helper. No-op when there is no focused window or `pickNeighbour` returns `-1`.
- **Register nav accelerators**: for each ward with a non-empty `navPrefix`,
  grab `${navPrefix}Left`, `${navPrefix}Right`, `${navPrefix}Up`,
  `${navPrefix}Down` (Up→wider, Down→narrower) into a new `this._navActions`
  list, mirroring `_registerPositions`/`_unregisterPositions`. Re-registered on
  `changed::positions`.

### 3. `keybinding-conflicts.js` (new module)

`KeybindingConflictManager` takes over GNOME built-in window shortcuts that
collide with our nav accelerators, and restores them later.

- Known GNOME keys scanned (schema → keys):
  - `org.gnome.desktop.wm.keybindings`: `maximize`, `unmaximize`,
    `toggle-maximized`, `maximize-horizontally`, `maximize-vertically`
  - `org.gnome.mutter.keybindings`: `toggle-tiled-left`, `toggle-tiled-right`
- `takeOver(accels)`: for each known key, if its accelerator array contains a
  string matching (normalized) one of `accels`, record `{schema, key,
  original: string[]}` and write the array with our accelerator removed.
- `restore()`: write each recorded original back, then clear records.
- **Modifier normalization** (no Gtk dependency in the shell process): a small
  helper parses `<Mod>…Key` into a sorted lowercased modifier set + key name so
  `<Super>Left` and `<Super>Left` compare equal regardless of modifier order.

**Crash-safety / self-healing:** the recorded originals are persisted to a new
GSettings key `nav-keybinding-backup` (JSON). On `enable()`:

1. If `nav-keybinding-backup` is non-empty (last shutdown was unclean), restore
   it first to reach a clean slate, then clear it.
2. Compute current nav accels, `takeOver(...)`, and persist the new backup.

On clean `disable()`: `restore()` and clear `nav-keybinding-backup`.

The manager is owned by the extension and re-run (restore → re-take-over) on
`changed::positions` so live prefix edits clean up correctly.

### 4. Schema + defaults

- Add a `navPrefix` string field to each ward object in the `positions` JSON.
- Update the gschema `positions` default so fresh installs get
  `"navPrefix":"<Super>"` on Columns and `"navPrefix":"<Alt><Super>"` on Grid.
- Add a new key `nav-keybinding-backup` (type `s`, default `'[]'`).
- Mirror the navPrefix defaults into `DEFAULT_POSITIONS` in `extension.js`.
- Recompile: `glib-compile-schemas schemas/`.

### 5. `prefs.js`

- Add `_makeNavPrefixRow(position, positionIndex)`, modelled on
  `_makeDragModifierRow`. ComboRow options:
  `None` (`''`), `<Super>`, `<Alt><Super>`, `<Ctrl><Super>`, `<Shift><Super>`,
  stored as `navPrefix`.
- Subtitle warns that `<Super>` takes over GNOME's tiling/maximize shortcuts
  while the extension is enabled.
- Added to `_createPositionGroup` near the drag-modifier / edge-snap rows.
  Preserve the existing expander/scroll-position handling on rebuild.

### 6. Tests

Extend the test suite (`test/test_positioning.js` or a sibling) with
`pickNeighbour` cases:

- Left/Right pick the nearest different-center candidate.
- Same-center width variants are excluded from Left/Right.
- Wider/Narrower pick the closest split by width difference; tie-break by
  position.
- No-op (`-1`) at the leftmost / widest / narrowest extreme.
- Candidates with a monitor offset (non-zero work-area origin) behave correctly.

## Migration

**Opt-in for existing users.** A missing/empty `navPrefix` means nav is disabled
for that ward — no accelerators grabbed, no GNOME keybindings touched. Existing
users see zero change until they choose a prefix in prefs. Only fresh installs
receive the `<Super>` / `<Alt><Super>` defaults (via the gschema default JSON),
and the take-over of `Super+arrows` happens only because that default opts them
in.

## Error Handling / Edge Cases

- No focused window → no-op.
- No candidate in the requested direction → no-op (`pickNeighbour` → `-1`).
- Maximized window → `unmaximize()` before applying (already in the shared
  helper).
- Ward prefix changed while enabled → conflict manager restores old grabs and
  re-takes-over on `changed::positions`.
- Unclean shutdown → `nav-keybinding-backup` restored on next `enable()`.
- Prefix that doesn't collide with any GNOME key → take-over records nothing;
  restore is a no-op.

## Out of Scope (YAGNI)

- Wrap-around at extremes.
- Non-arrow / fully custom per-direction accelerators (per-ward prefix only).
- Cross-monitor movement.
- Auto-applying defaults to existing users' configs.
