# Window Summoner

A GNOME Shell extension that binds keyboard shortcuts to applications. Summon any app to focus with a single keypress, launch it if it's not running, and snap windows into grid positions.

## Features

- **Summon apps** — Press a shortcut to focus an app. If it's not running, it launches automatically.
- **Grid positioning** — Snap the focused window into configurable grid positions with `Alt+Super+1-9`.
- **Preset cycling** — Press the same position shortcut again to cycle between alternative sizes.
- **Multi-window cycling** — Multiple windows of the same app? The shortcut cycles through them.
- **Live configuration** — Change bindings in the preferences UI or via dconf; takes effect immediately without session restart.
- **WM class auto-detect** — Click "Detect" in preferences to pick from running windows instead of guessing WM class strings.

## Install

```bash
cd ~/.local/share/gnome-shell/extensions
git clone git@github.com:lukewilde/gnome-magic-window.git window-summoner@ding
cd window-summoner@ding
glib-compile-schemas schemas/
gnome-extensions enable window-summoner@ding
```

Then restart your GNOME session (log out / log in).

## Configure

Open the preferences UI:

```bash
gnome-extensions prefs window-summoner@ding
```

Each binding has three fields:
- **Shortcut** — The key combination (e.g. `<Shift><Alt><Ctrl>r`)
- **WM Class** — Case-insensitive substring to match the window (e.g. `kitty`)
- **Command** — Launch command if no matching window exists (e.g. `/usr/bin/kitty`)

## Position Presets

`Alt+Super+1` through `Alt+Super+9` snap the focused window to grid positions on a 16-column grid. Presets with multiple sizes cycle on repeated presses:

| Key | First press | Second press |
|-----|------------|-------------|
| 1 | Left quarter | Narrow left |
| 2 | Center-left | Wide center |
| 3 | Right quarter | Narrow right |
| 4 | Left half | Left 3/4 |
| 5 | Center half | Wider center |
| 6 | Right half | Right 3/4 |
| 7 | Narrow left | — |
| 8 | Right-center | Center |
| 9 | Narrow right | — |

## Development

```bash
npm run lint          # ESLint
gjs -m test/test_positioning.js  # Unit tests
./dev.sh restart-shell  # Restart session (required for code changes)
./dev.sh trigger WM CMD # Test via D-Bus
./dev.sh errors         # Check for runtime errors
./dev.sh logs           # Tail GNOME Shell journal
```

## License

GNU General Public License v3. Originally forked from [gnome-magic-window](https://github.com/adrienverge/gnome-magic-window) by Adrien Vergé.
