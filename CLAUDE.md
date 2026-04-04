# Window Summoner

## Tech Stack

- **GJS** (GNOME JavaScript) — ES6+ modules, GObject Introspection bindings
- **GNOME Shell 49**, Wayland session
- **GJS 1.86.0**, Node 25.2.1 (for tooling only)
- Key imports: `gi://Meta`, `gi://Shell`, `gi://Gio`, `resource:///org/gnome/shell/extensions/extension.js`

## Extension Structure

- `extension.js` — Main extension: lifecycle, keybindings, window focus/launch/position
- `positioning.js` — Pure-function grid math and preset parsing (no gi:// imports, testable standalone)
- `prefs.js` — Adw preferences UI with binding editor and WM class auto-detect
- `schemas/` — GSettings schema (compile with `glib-compile-schemas schemas/`)
- `metadata.json` — Extension metadata, uuid, supported shell versions, settings-schema
- `test/test_positioning.js` — Unit tests (run with `gjs -m test/test_positioning.js`)

## Development Workflow

### Critical: Source reload requires session restart

On GNOME 49 Wayland, GJS caches ES modules for the shell process lifetime. There is:
- No `--nested` shell option
- No working `ReloadExtension` D-Bus method (deprecated)
- No `Shell.Eval` (disabled for security)

**`disable()`/`enable()` does NOT reload source files** — it only re-runs lifecycle methods on the cached module. The only way to pick up `.js` changes is `./dev.sh restart-shell` (session logout/login).

**GSettings/dconf values ARE picked up live** — so prefer moving configuration into GSettings rather than hardcoding in source.

### Dev commands

```bash
npm run lint              # ESLint with GJS globals
gjs -m test/test_positioning.js  # Run positioning unit tests
glib-compile-schemas schemas/    # Recompile after schema changes
gnome-extensions prefs window-summoner@ding  # Open preferences UI
./dev.sh toggle           # Re-run enable()/disable() (no source reload)
./dev.sh restart-shell    # Session restart (required for code changes)
./dev.sh trigger WM CMD   # Fire magic_key_pressed(wmClass, command) via D-Bus
./dev.sh errors           # Check extension errors from GNOME Shell
./dev.sh debug            # Extension state + last debug dump
./dev.sh logs             # Tail GNOME Shell journal (journalctl)
./dev.sh pack             # Package as .zip
```

### Dev cycle

1. Edit code
2. `npm run lint` — catch errors before restart
3. `./dev.sh restart-shell` — session restart to load new code
4. `./dev.sh trigger <title> <cmd>` — test via D-Bus without pressing shortcuts
5. `./dev.sh debug` — inspect state
6. `./dev.sh errors` — check for runtime errors

### Batch changes to minimize restarts

Since each code change requires a session restart, batch related changes and lint thoroughly before restarting. Use `./dev.sh trigger` and `./dev.sh debug` to test behavior of currently-loaded code between restarts.

## Window Management APIs

- `global.display.grab_accelerator(shortcut, flags)` — register keyboard shortcuts
- `global.get_window_actors()` — list all window actors
- `w.get_meta_window().get_wm_class()` — window class for matching
- `w.get_meta_window().move_resize_frame(user_op, x, y, width, height)` — position windows
- `workspace.get_work_area_for_monitor(idx)` — usable area per monitor (excludes panels)
- `Main.layoutManager.monitors` — array of monitors with x, y, width, height, geometryScale
- `monitorManager.connect("monitors-changed", ...)` — react to monitor changes
- `Main.activateWindow(metaWindow)` — focus a window

## Configuration

Bindings are stored as a JSON string in GSettings key `bindings` at path
`/org/gnome/shell/extensions/window-summoner/bindings`.

Each binding object has: `shortcut`, `wmClass`, `command`.

Config changes via prefs UI or dconf take effect immediately (bindings re-register on settings change).
Schema changes require `glib-compile-schemas schemas/` + session restart.

Wards are stored as a JSON string in GSettings key `wards` at path
`/org/gnome/shell/extensions/window-summoner/wards`.

Each ward object has: `name`, `cols`, `rows`, `edgeMargin` (px), `cellGap` (px), `shortcuts[]`.
Each shortcut has: `shortcut` (GTK accelerator string), `positions[]`.
Each position has: `anchor: {col, row}`, `target: {col, row}` — **1-indexed in storage**.

`gridToPixels()` takes **0-indexed** coords — subtract 1 from storage values before calling.
`DEFAULT_WARD` in `extension.js` is the runtime fallback when the `wards` key is empty or invalid.

Positions text format (prefs UI and `_textToPositions`/`_positionsToText`):
`"col:row col:row, col:row col:row"` — each comma-separated pair is one cycling position.

## Conventions

- All keyboard shortcuts use `<Shift><Alt><Ctrl>` + letter prefix
- Window matching is case-insensitive substring on WM class
- Debug output written to `/tmp/window-summoner-debug`
- Extension exposes D-Bus interface at `org.gnome.Shell.Extensions.WindowSummoner`

### prefs.js patterns
- `_writing` / `_writingWards` flags suppress the GSettings `changed::` signal handler during saves
  to prevent a reload loop (prefs writes → signal fires → prefs reloads).
- Use GTK `error` CSS class (`widget.add_css_class('error')`) for inline validation feedback.
- Expanded-state preservation: capture `row.get_expanded()` before `_loadWards()`/`_loadBindings()`
  and restore after rebuild — see `_loadWards` for the pattern.

### Dead code
- `parsePositionPresets` in `positioning.js` is no longer called — the wards system supersedes it.
  Do not extend or rely on it; remove it when convenient.

### Useful dconf commands for dev/testing
- `dconf read /org/gnome/shell/extensions/window-summoner/wards` — inspect current wards JSON
- `dconf write /org/gnome/shell/extensions/window-summoner/wards "'[...]'"` — set value directly
