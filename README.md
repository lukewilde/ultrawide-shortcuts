# Ultrawide Shortcuts

A GNOME Shell extension that binds keyboard shortcuts to applications. Launch apps with a single keypress, focus them if already running, and snap windows into grid positions.

## Features

- **Launch apps** — Press a shortcut to focus an app. If it's not running, it launches automatically.
- **Grid positioning** — Snap the focused window into configurable grid positions with `Alt+Super+1-9`.
- **Preset cycling** — Press the same position shortcut again to cycle between alternative sizes.
- **Multi-window cycling** — Multiple windows of the same app? The shortcut cycles through them.
- **Live configuration** — Change bindings in the preferences UI or via dconf; takes effect immediately without session restart.
- **WM class auto-detect** — Click "Detect" in preferences to pick from running windows instead of guessing WM class strings.

## Manual Install

```bash
cd ~/.local/share/gnome-shell/extensions
git clone git@github.com:lukewilde/ultrawide-shortcuts.git ultrawide-shortcuts@ding
cd ultrawide-shortcuts@ding
glib-compile-schemas schemas/
```

Restart your GNOME session (log out / log in) before running:

```bash
gnome-extensions enable ultrawide-shortcuts@ding
```

## Configure

Open the preferences UI:

```bash
gnome-extensions prefs ultrawide-shortcuts@ding
```

Each binding has three fields:

- **Shortcut** — The key combination (e.g. `<Shift><Alt><Ctrl>r`)
- **WM Class** — Case-insensitive substring to match the window (e.g. `kitty`)
- **Command** — Launch command if no matching window exists (e.g. `/usr/bin/kitty`)

## Position Presets

`Alt+Super+1` through `Alt+Super+9` snap the focused window to grid positions on a **16-column × 1-row** grid. Presets with multiple sizes cycle on repeated presses:

| Key | First press   | Cols  | Second press        | Cols  |
| --- | ------------- | ----- | ------------------- | ----- |
| 1   | Left quarter  | 1–4   | —                   | —     |
| 2   | Center-left   | 4–8   | Narrow center left  | 5–12  |
| 3   | Right quarter | 13–16 | Narrow right        | 14–16 |
| 4   | Left half     | 1–8   | Left 3/4            | 1–12  |
| 5   | Center half   | 5–12  | Wider center        | 4–13  |
| 6   | Right half    | 9–16  | Right 3/4           | 5–16  |
| 7   | Narrow left   | 1–3   | —                   | —     |
| 8   | Right-center  | 9–13  | Narrow center right | 5–12  |
| 9   | Narrow right  | 14–16 | —                   | —     |

`Shift+Alt+Super+1` through `Shift+Alt+Super+9` position a floating window on an **8-column × 4-row** grid with 24px edge margin and 24px cell gaps — a 3×3 number-pad layout across the screen:

| Key | Position      |
| --- | ------------- |
| 7   | Top left      |
| 8   | Top center    |
| 9   | Top right     |
| 4   | Mid left      |
| 5   | Mid center    |
| 6   | Mid right     |
| 1   | Bottom left   |
| 2   | Bottom center |
| 3   | Bottom right  |

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
