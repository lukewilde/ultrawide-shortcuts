# Ultrawide Shortcuts

GNOME Shell 49 extension (GJS ES6+ modules, GObject Introspection).

## Critical: Source Changes Require Session Restart

GJS caches ES modules — `disable()`/`enable()` does NOT reload source files.
**Use `./dev.sh restart-shell` to pick up `.js` changes.** Batch changes to minimize restarts.
GSettings/dconf values ARE live — prefer config over hardcoded values.

## Dev Commands

```bash
npm run lint                      # ESLint — always run before restart
./dev.sh restart-shell            # Reload source (session logout/login)
./dev.sh toggle                   # Re-run enable()/disable() only
./dev.sh trigger WM CMD           # Test via D-Bus without keypress
./dev.sh errors                   # Extension errors from GNOME Shell
./dev.sh debug                    # Extension state + debug dump
./dev.sh logs                     # Tail GNOME Shell journal
gjs -m test/test_positioning.js   # Run unit tests
glib-compile-schemas schemas/     # After schema changes
```

## Positions — Indexing Gotcha

Positions stored **1-indexed** in GSettings. `gridToPixels()` takes **0-indexed** — subtract 1 before calling.
`DEFAULT_POSITIONS` in `extension.js` is the runtime fallback when `positions` key is empty/invalid.

Position shape: `{name, cols, rows, edgeMargin, cellGap, shortcuts[{shortcut, positions[{anchor, target}]}]}`.
Positions text format: `"col:row col:row, col:row col:row"` — comma = cycling positions.

## prefs.js Patterns

- `_writing`/`_writingPositions` flags prevent reload loop (suppress `changed::` during saves).
- Preserve `row.get_expanded()` before `_loadPositions()`/`_loadBindings()`, restore after rebuild.
