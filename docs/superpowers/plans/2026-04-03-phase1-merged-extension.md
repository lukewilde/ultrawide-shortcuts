# Phase 1: Merged Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge gnome-magic-window and gTile's positioning into a single extension with GSettings configuration, a preferences UI, auto-detect WM class, and fixed window cycling.

**Architecture:** The extension keeps its existing focus/launch/cycle behavior and adds grid-based window positioning. Configuration moves from hardcoded JS to GSettings (dconf), enabling live config changes without session restart. A `prefs.js` provides an Adw-based settings UI. Window positioning is a pure-function module testable outside GNOME Shell.

**Tech Stack:** GJS (ES modules), GNOME Shell 49, GSettings/dconf, Libadwaita (prefs UI), Meta/Shell GI bindings.

---

## File Structure

```
gnome-magic-window@adrienverge/
├── extension.js              — Main extension: lifecycle, keybindings, window focus/launch/position
├── positioning.js            — Pure-function grid-to-pixel math and preset parsing (no gi:// imports)
├── prefs.js                  — Adw preferences UI: binding editor, WM class auto-detect
├── schemas/
│   └── org.gnome.shell.extensions.gnome-magic-window.gschema.xml
├── metadata.json             — Updated with settings-schema reference
├── test/
│   └── test_positioning.js   — Standalone GJS unit tests for positioning module
├── dev.sh                    — Dev workflow script (existing)
├── package.json              — ESLint + npm scripts (existing)
├── eslint.config.js          — Lint config (existing)
└── CLAUDE.md                 — Dev workflow docs (existing)
```

**Responsibilities:**
- `positioning.js` — Zero GNOME dependencies. Takes plain `{cols, rows}`, `{anchor, target}`, `{x, y, width, height}` objects. Returns pixel rectangles. Parses position preset strings. Testable with `gjs -m`.
- `extension.js` — Reads bindings from GSettings, registers accelerators, handles focus/launch/position logic, exposes D-Bus interface (including `list_windows` for prefs auto-detect).
- `prefs.js` — Runs in separate process. Reads/writes GSettings. Calls extension's D-Bus `list_windows` to populate WM class picker.

---

## Task 1: Positioning Module + Tests

**Files:**
- Create: `positioning.js`
- Create: `test/test_positioning.js`

This task has zero GNOME Shell dependencies and can be developed and tested standalone with `gjs -m`.

- [ ] **Step 1: Write the failing tests**

Create `test/test_positioning.js`:

```javascript
// Run with: gjs -m test/test_positioning.js
import { gridToPixels, parsePositionPresets } from '../positioning.js';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error(`FAIL: ${msg}`); }
}

function assertRect(actual, expected, msg) {
  assert(
    actual.x === expected.x &&
    actual.y === expected.y &&
    actual.width === expected.width &&
    actual.height === expected.height,
    `${msg}: expected {x:${expected.x},y:${expected.y},w:${expected.width},h:${expected.height}}, ` +
    `got {x:${actual.x},y:${actual.y},w:${actual.width},h:${actual.height}}`
  );
}

// --- gridToPixels tests ---

// Full-width on 16x1 grid (1920px wide monitor at origin)
const fullHD = { x: 0, y: 0, width: 1920, height: 1080 };

// Left quarter: cols 0-3 of 16
assertRect(
  gridToPixels({ anchor: { col: 0, row: 0 }, target: { col: 3, row: 0 } }, { cols: 16, rows: 1 }, fullHD),
  { x: 0, y: 0, width: 480, height: 1080 },
  'left quarter of 1920px'
);

// Right half: cols 8-15 of 16
assertRect(
  gridToPixels({ anchor: { col: 8, row: 0 }, target: { col: 15, row: 0 } }, { cols: 16, rows: 1 }, fullHD),
  { x: 960, y: 0, width: 960, height: 1080 },
  'right half of 1920px'
);

// With monitor offset (second monitor at x=1920)
const secondMon = { x: 1920, y: 0, width: 2560, height: 1440 };
assertRect(
  gridToPixels({ anchor: { col: 0, row: 0 }, target: { col: 7, row: 0 } }, { cols: 16, rows: 1 }, secondMon),
  { x: 1920, y: 0, width: 1280, height: 1440 },
  'left half on offset monitor'
);

// 2D grid: top-left quadrant of 4x4
assertRect(
  gridToPixels({ anchor: { col: 0, row: 0 }, target: { col: 1, row: 1 } }, { cols: 4, rows: 4 }, fullHD),
  { x: 0, y: 0, width: 960, height: 540 },
  'top-left quadrant on 4x4 grid'
);

// Reversed anchor/target (target before anchor)
assertRect(
  gridToPixels({ anchor: { col: 3, row: 0 }, target: { col: 0, row: 0 } }, { cols: 16, rows: 1 }, fullHD),
  { x: 0, y: 0, width: 480, height: 1080 },
  'reversed anchor/target'
);

// --- parsePositionPresets tests ---

// Single preset
const single = parsePositionPresets('16x1 1:1 4:1');
assert(single.length === 1, 'single preset: count');
assert(single[0].gridSize.cols === 16, 'single preset: cols');
assert(single[0].gridSize.rows === 1, 'single preset: rows');
assert(single[0].selection.anchor.col === 0, 'single preset: anchor col (0-indexed)');
assert(single[0].selection.target.col === 3, 'single preset: target col (0-indexed)');

// Multiple presets with inherited grid size
const multi = parsePositionPresets('16x1 1:1 4:1, 1:1 3:1');
assert(multi.length === 2, 'multi preset: count');
assert(multi[1].gridSize.cols === 16, 'multi preset: inherited grid cols');
assert(multi[1].selection.target.col === 2, 'multi preset: second target col');

// Different grid in second preset
const diffGrid = parsePositionPresets('16x1 1:1 8:1, 4x4 1:1 2:2');
assert(diffGrid.length === 2, 'diff grid: count');
assert(diffGrid[1].gridSize.cols === 4, 'diff grid: second preset cols');
assert(diffGrid[1].gridSize.rows === 4, 'diff grid: second preset rows');

// Empty/null input
assert(parsePositionPresets('').length === 0, 'empty string');
assert(parsePositionPresets(null).length === 0, 'null input');
assert(parsePositionPresets(undefined).length === 0, 'undefined input');

// User's actual presets
const preset1 = parsePositionPresets('16x1 1:1 4:1, 1:1 3:1');
assert(preset1[0].selection.anchor.col === 0 && preset1[0].selection.target.col === 3, 'user preset1 first');
assert(preset1[1].selection.anchor.col === 0 && preset1[1].selection.target.col === 2, 'user preset1 second');

const preset4 = parsePositionPresets('16x1 1:1 8:1, 1:1 12:1');
assert(preset4[0].selection.target.col === 7, 'user preset4 first: left half');
assert(preset4[1].selection.target.col === 11, 'user preset4 second: left 3/4');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  imports.system.exit(1);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `gjs -m test/test_positioning.js`
Expected: Error — `positioning.js` does not exist yet.

- [ ] **Step 3: Implement positioning module**

Create `positioning.js`:

```javascript
// positioning.js — Pure-function grid math. No gi:// imports.

/**
 * Convert a grid selection to pixel coordinates within a work area.
 * @param {{anchor: {col: number, row: number}, target: {col: number, row: number}}} selection - 0-indexed
 * @param {{cols: number, rows: number}} gridSize
 * @param {{x: number, y: number, width: number, height: number}} workArea
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function gridToPixels(selection, gridSize, workArea) {
  const { cols, rows } = gridSize;
  const col1 = Math.min(selection.anchor.col, selection.target.col);
  const row1 = Math.min(selection.anchor.row, selection.target.row);
  const col2 = Math.max(selection.anchor.col, selection.target.col);
  const row2 = Math.max(selection.anchor.row, selection.target.row);

  return {
    x: workArea.x + (col1 / cols) * workArea.width,
    y: workArea.y + (row1 / rows) * workArea.height,
    width: ((col2 - col1 + 1) / cols) * workArea.width,
    height: ((row2 - row1 + 1) / rows) * workArea.height,
  };
}

/**
 * Parse a position preset string into structured preset objects.
 * Format: "COLSxROWS C1:R1 C2:R2[, [COLSxROWS] C1:R1 C2:R2]..."
 * Coordinates in the string are 1-indexed; returned values are 0-indexed.
 * Subsequent presets inherit the grid size if not specified.
 *
 * @param {string|null|undefined} str
 * @returns {Array<{gridSize: {cols: number, rows: number}, selection: {anchor: {col: number, row: number}, target: {col: number, row: number}}}>}
 */
export function parsePositionPresets(str) {
  if (!str || !str.trim()) return [];

  const parts = str.split(',').map(s => s.trim());
  const result = [];
  let gridSize = null;

  for (const part of parts) {
    const tokens = part.split(/\s+/);
    let idx = 0;

    if (tokens[idx].includes('x')) {
      const [cols, rows] = tokens[idx].split('x').map(Number);
      gridSize = { cols, rows };
      idx++;
    }

    if (!gridSize || tokens.length < idx + 2) continue;

    const [c1, r1] = tokens[idx].split(':').map(Number);
    const [c2, r2] = tokens[idx + 1].split(':').map(Number);

    result.push({
      gridSize: { ...gridSize },
      selection: {
        anchor: { col: c1 - 1, row: r1 - 1 },
        target: { col: c2 - 1, row: r2 - 1 },
      },
    });
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `gjs -m test/test_positioning.js`
Expected: All tests pass, output like `18 passed, 0 failed`

- [ ] **Step 5: Lint**

Run: `npx eslint positioning.js`
Expected: No errors (warnings OK for now).

- [ ] **Step 6: Commit**

```bash
git add positioning.js test/test_positioning.js
git commit -m "feat: add positioning module with grid-to-pixel math and preset parser"
```

---

## Task 2: GSettings Schema + Metadata

**Files:**
- Create: `schemas/org.gnome.shell.extensions.gnome-magic-window.gschema.xml`
- Modify: `metadata.json`

- [ ] **Step 1: Create the GSettings schema**

Create `schemas/org.gnome.shell.extensions.gnome-magic-window.gschema.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<schemalist>
  <schema id="org.gnome.shell.extensions.gnome-magic-window"
          path="/org/gnome/shell/extensions/gnome-magic-window/">

    <key type="s" name="bindings">
      <default><![CDATA['[{"shortcut":"<Shift><Alt><Ctrl>x","wmClass":"TextEditor","command":"/usr/bin/gnome-text-editor","position":""},{"shortcut":"<Shift><Alt><Ctrl>c","wmClass":"Steam","command":"steam","position":""},{"shortcut":"<Shift><Alt><Ctrl>d","wmClass":"","command":"","position":""},{"shortcut":"<Shift><Alt><Ctrl>r","wmClass":"kitty","command":"/home/wilde/.local/kitty.app/bin/kitty","position":""},{"shortcut":"<Shift><Alt><Ctrl>s","wmClass":"Code","command":"code","position":""},{"shortcut":"<Shift><Alt><Ctrl>t","wmClass":"Chrome","command":"google-chrome","position":""},{"shortcut":"<Shift><Alt><Ctrl>w","wmClass":"FFPWA-01JX8K6PER4CNATQKDZEEK5XNH","command":"/usr/bin/firefoxpwa site launch 01JX8K6PER4CNATQKDZEEK5XNH","position":""},{"shortcut":"<Shift><Alt><Ctrl>f","wmClass":"","command":"","position":""},{"shortcut":"<Shift><Alt><Ctrl>p","wmClass":"Spotify","command":"spotify","position":""}]']]></default>
      <summary>Window binding configuration</summary>
      <description>JSON array of objects with: shortcut (accelerator string), wmClass (case-insensitive substring match), command (launch command), position (grid preset string, e.g. "16x1 1:1 8:1, 1:1 12:1")</description>
    </key>

  </schema>
</schemalist>
```

Note: The default matches the user's current hardcoded config with an added empty `position` field. The `wmClass` field replaces `title` for clarity.

- [ ] **Step 2: Compile the schema**

Run: `glib-compile-schemas schemas/`
Expected: No output (success). Creates `schemas/gschemas.compiled`.

- [ ] **Step 3: Update metadata.json**

Replace `metadata.json` contents with:

```json
{
  "name": "gnome-magic-window",
  "description": "Bind a key to a specific program in Gnome Shell, with window positioning",
  "uuid": "gnome-magic-window@adrienverge",
  "url": "https://github.com/adrienverge/gnome-magic-window",
  "shell-version": ["45", "46", "47", "48", "49"],
  "settings-schema": "org.gnome.shell.extensions.gnome-magic-window"
}
```

- [ ] **Step 4: Verify schema loads via dconf**

Run: `gnome-extensions disable gnome-magic-window@adrienverge && gnome-extensions enable gnome-magic-window@adrienverge`

Then: `dconf read /org/gnome/shell/extensions/gnome-magic-window/bindings`

Expected: The JSON default value is returned. If the extension fails to load, check `./dev.sh errors`.

Note: This step only verifies the schema is found — the extension still uses hardcoded bindings until Task 3.

- [ ] **Step 5: Commit**

```bash
git add schemas/ metadata.json
git commit -m "feat: add GSettings schema for binding configuration"
```

---

## Task 3: Rewrite extension.js to Use GSettings + Positioning

**Files:**
- Modify: `extension.js`

This is the core rewrite. The extension reads bindings from GSettings, registers accelerators, and applies window positions. It also re-registers bindings when settings change (live config reload without session restart for setting changes).

- [ ] **Step 1: Rewrite extension.js**

Replace `extension.js` with:

```javascript
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { gridToPixels, parsePositionPresets } from './positioning.js';

export default class GnomeMagicWindowExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._actions = [];
    this._lastNotMagic = null;
    this._launching = false;
    this._presetIndices = new Map(); // wmClass -> current preset index

    this._setupDbus();
    this._registerBindings();

    this._settingsChangedId = this._settings.connect('changed::bindings', () => {
      this._unregisterBindings();
      this._registerBindings();
    });
  }

  disable() {
    if (this._settingsChangedId) {
      this._settings.disconnect(this._settingsChangedId);
      this._settingsChangedId = null;
    }

    this._unregisterBindings();

    this._dbus.flush();
    this._dbus.unexport();
    this._dbus = null;
    this._settings = null;
    this._presetIndices = null;
  }

  _setupDbus() {
    this._dbus = Gio.DBusExportedObject.wrapJSObject(`
      <node>
        <interface name="org.gnome.Shell.Extensions.GnomeMagicWindow">
          <method name="magic_key_pressed">
            <arg type="s" direction="in" name="wmClass"/>
            <arg type="s" direction="in" name="command"/>
            <arg type="s" direction="in" name="position"/>
          </method>
          <method name="list_windows">
            <arg type="s" direction="out" name="json"/>
          </method>
        </interface>
      </node>`, this);
    this._dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/GnomeMagicWindow');
  }

  _getBindings() {
    try {
      return JSON.parse(this._settings.get_string('bindings'));
    } catch (e) {
      console.error(`gnome-magic-window: failed to parse bindings: ${e.message}`);
      return [];
    }
  }

  _registerBindings() {
    const bindings = this._getBindings();

    for (const binding of bindings) {
      if (!binding.wmClass || !binding.shortcut) continue;

      const action = global.display.grab_accelerator(binding.shortcut, 0);
      if (action === Meta.KeyBindingAction.NONE) continue;

      const handlerId = global.display.connect(
        'accelerator-activated',
        (_display, activatedAction, _deviceId, _timestamp) => {
          if (activatedAction === action) {
            this.magic_key_pressed(
              binding.wmClass,
              binding.command,
              binding.position || ''
            );
          }
        }
      );

      const name = Meta.external_binding_name_for_action(action);
      Main.wm.allowKeybinding(name, Shell.ActionMode.ALL);

      this._actions.push({ action, handlerId });
    }
  }

  _unregisterBindings() {
    for (const { action, handlerId } of this._actions) {
      global.display.disconnect(handlerId);
      global.display.ungrab_accelerator(action);
    }
    this._actions = [];
  }

  _getWindows() {
    return global.get_window_actors()
      .map(a => {
        const w = a.get_meta_window();
        return {
          id: a.toString(),
          actor: a,
          metaWindow: w,
          wmClass: w.get_wm_class() || '',
          windowTitle: w.get_title() || '',
          monitor: w.get_monitor(),
          stableSequence: w.get_stable_sequence(),
        };
      })
      .filter(w => w.wmClass && !w.wmClass.includes('Gnome-shell'));
  }

  _getActiveWindow() {
    const focused = global.display.focus_window;
    if (!focused) return null;
    const windows = this._getWindows();
    return windows.find(w => w.metaWindow === focused) || null;
  }

  _findWindows(wmClass) {
    return this._getWindows()
      .filter(w => w.wmClass.toLowerCase().includes(wmClass.toLowerCase()))
      .sort((a, b) => a.stableSequence - b.stableSequence);
  }

  _positionWindow(metaWindow, positionStr) {
    if (!positionStr) return;

    const presets = parsePositionPresets(positionStr);
    if (presets.length === 0) return;

    const wmClass = metaWindow.get_wm_class() || '';
    const lastIndex = this._presetIndices.get(wmClass) ?? -1;
    const nextIndex = (lastIndex + 1) % presets.length;
    this._presetIndices.set(wmClass, nextIndex);

    const { gridSize, selection } = presets[nextIndex];
    const monitorIdx = metaWindow.get_monitor();
    const workspace = global.workspace_manager.get_active_workspace();
    const workArea = workspace.get_work_area_for_monitor(monitorIdx);

    const rect = gridToPixels(selection, gridSize, {
      x: workArea.x,
      y: workArea.y,
      width: workArea.width,
      height: workArea.height,
    });

    metaWindow.unmaximize(Meta.MaximizeFlags.BOTH);
    metaWindow.move_resize_frame(
      false,
      Math.round(rect.x),
      Math.round(rect.y),
      Math.round(rect.width),
      Math.round(rect.height)
    );
  }

  magic_key_pressed(wmClass, command, position) {
    const current = this._getActiveWindow();
    const matches = this._findWindows(wmClass);

    if (matches.length === 0) {
      // No matching window — launch the application
      if (!this._launching && command) {
        this._launching = true;
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
          this._launching = false;
          return GLib.SOURCE_REMOVE;
        });
        try {
          GLib.spawn_command_line_async(command);
        } catch (e) {
          console.error(`gnome-magic-window: failed to launch '${command}': ${e.message}`);
        }
        this._lastNotMagic = current;
      }
    } else if (!current || !matches.some(w => w.metaWindow === current.metaWindow)) {
      // Matching window exists but isn't focused — activate first match
      Main.activateWindow(matches[0].metaWindow);
      if (position) this._positionWindow(matches[0].metaWindow, position);
      this._lastNotMagic = current;
    } else if (matches.length > 1) {
      // Current window IS a match and there are multiple — cycle to next
      const currentIdx = matches.findIndex(w => w.metaWindow === current.metaWindow);
      const nextIdx = (currentIdx + 1) % matches.length;
      Main.activateWindow(matches[nextIdx].metaWindow);
      if (position) this._positionWindow(matches[nextIdx].metaWindow, position);
    } else if (this._lastNotMagic) {
      // Only one match and it's focused — go back to previous window
      Main.activateWindow(this._lastNotMagic.metaWindow);
    }
  }

  list_windows() {
    const windows = this._getWindows().map(w => ({
      wmClass: w.wmClass,
      windowTitle: w.windowTitle,
      monitor: w.monitor,
    }));
    return JSON.stringify(windows);
  }
}
```

Key changes from original:
- Bindings read from GSettings instead of hardcoded `BINDINGS` array
- `changed::bindings` signal re-registers accelerators live
- `_findWindows` returns ALL matches sorted by stable sequence (for cycling)
- Multi-window cycling: pressing shortcut when a match is focused cycles to next match
- `_positionWindow` applies grid presets with cycling (press again to cycle sizes)
- `list_windows` D-Bus method for prefs auto-detect
- Replaced deprecated `Mainloop.timeout_add` with `GLib.timeout_add`
- Replaced `Util.spawnCommandLine` with `GLib.spawn_command_line_async`
- Stores `handlerId` for proper `disconnect()` on unbind
- Uses `global.display.focus_window` instead of window-actor stack order for active window

- [ ] **Step 2: Lint**

Run: `npx eslint extension.js`
Expected: No errors. Fix any issues.

- [ ] **Step 3: Restart shell and verify basic functionality**

Run: `./dev.sh restart-shell`

After login, test:
1. Press `Shift+Alt+Ctrl+R` — should focus/launch kitty
2. Press `Shift+Alt+Ctrl+T` — should focus/launch Chrome
3. Press `Shift+Alt+Ctrl+T` again — should toggle back to previous window

Run: `./dev.sh errors`
Expected: `as 0` (no errors)

- [ ] **Step 4: Verify live settings reload**

Change a binding via dconf without restarting:

```bash
# Read current bindings
dconf read /org/gnome/shell/extensions/gnome-magic-window/bindings

# Write modified bindings (change Ctrl+D to launch Files)
# Use jq or manual edit to modify the JSON, then:
dconf write /org/gnome/shell/extensions/gnome-magic-window/bindings \
  "'$(dconf read /org/gnome/shell/extensions/gnome-magic-window/bindings | \
  sed "s|<Shift><Alt><Ctrl>d\",\"wmClass\":\"\",\"command\":\"\"|<Shift><Alt><Ctrl>d\",\"wmClass\":\"Nautilus\",\"command\":\"nautilus\"|")'"
```

Then press `Shift+Alt+Ctrl+D` — should focus/launch Files.

Run: `./dev.sh errors`
Expected: `as 0`

- [ ] **Step 5: Verify window positioning**

Add a position to one binding:

```bash
# Read current, modify one entry to add position, write back
# Example: add "16x1 1:1 8:1" to kitty binding (left half)
python3 -c "
import json, subprocess
raw = subprocess.check_output(['dconf', 'read', '/org/gnome/shell/extensions/gnome-magic-window/bindings']).decode().strip()
# Strip outer quotes
s = raw[1:-1] if raw.startswith(\"'\") else raw
bindings = json.loads(s)
for b in bindings:
    if b['wmClass'] == 'kitty':
        b['position'] = '16x1 1:1 8:1'
out = json.dumps(bindings)
subprocess.run(['dconf', 'write', '/org/gnome/shell/extensions/gnome-magic-window/bindings', f\"'{out}'\"])
"
```

Press `Shift+Alt+Ctrl+R` — kitty should move to left half of screen.

- [ ] **Step 6: Verify multi-window cycling**

Open two Chrome windows. Press `Shift+Alt+Ctrl+T` repeatedly — should cycle between them in stable order (by creation time), not toggle back to previous non-Chrome window.

- [ ] **Step 7: Commit**

```bash
git add extension.js
git commit -m "feat: rewrite extension with GSettings bindings, positioning, and window cycling"
```

---

## Task 4: Preferences UI

**Files:**
- Create: `prefs.js`

The prefs UI provides an Adw-based editor for bindings. Each binding is a row with editable fields. A "Detect WM Class" button calls the extension's D-Bus `list_windows` method.

- [ ] **Step 1: Create prefs.js**

Create `prefs.js`:

```javascript
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class GnomeMagicWindowPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    this._settings = this.getSettings();
    this._window = window;
    window.set_default_size(700, 600);

    const page = new Adw.PreferencesPage({
      title: 'Bindings',
      icon_name: 'input-keyboard-symbolic',
    });
    window.add(page);

    this._bindingsGroup = new Adw.PreferencesGroup({
      title: 'Window Bindings',
      description: 'Each binding maps a keyboard shortcut to an application. ' +
        'Position uses grid format: "16x1 1:1 8:1" (cols x rows, start end). ' +
        'Separate multiple presets with commas to cycle between them.',
    });
    page.add(this._bindingsGroup);

    this._loadBindings();

    // Add binding button
    const addButton = new Gtk.Button({
      label: 'Add Binding',
      css_classes: ['suggested-action'],
      halign: Gtk.Align.CENTER,
      margin_top: 12,
    });
    addButton.connect('clicked', () => this._addBinding());
    this._bindingsGroup.add(addButton);

    this._settingsChangedId = this._settings.connect('changed::bindings', () => {
      // Only reload if change came from outside (dconf CLI, etc.)
      if (!this._writing) this._loadBindings();
    });

    window.connect('close-request', () => {
      if (this._settingsChangedId) {
        this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = null;
      }
    });
  }

  _getBindings() {
    try {
      return JSON.parse(this._settings.get_string('bindings'));
    } catch (e) {
      return [];
    }
  }

  _saveBindings(bindings) {
    this._writing = true;
    this._settings.set_string('bindings', JSON.stringify(bindings));
    this._writing = false;
  }

  _loadBindings() {
    // Remove all existing rows (except the add button)
    let child = this._bindingsGroup.get_first_child();
    const toRemove = [];
    while (child) {
      if (child instanceof Adw.ExpanderRow) toRemove.push(child);
      child = child.get_next_sibling();
    }
    toRemove.forEach(r => this._bindingsGroup.remove(r));

    const bindings = this._getBindings();
    bindings.forEach((binding, index) => {
      this._bindingsGroup.add(this._createBindingRow(binding, index));
    });
  }

  _createBindingRow(binding, index) {
    const row = new Adw.ExpanderRow({
      title: binding.wmClass || '(empty)',
      subtitle: binding.shortcut || 'No shortcut',
    });

    // Shortcut field
    const shortcutRow = new Adw.EntryRow({ title: 'Shortcut' });
    shortcutRow.set_text(binding.shortcut || '');
    shortcutRow.connect('changed', () => {
      this._updateBinding(index, 'shortcut', shortcutRow.get_text());
      row.set_subtitle(shortcutRow.get_text() || 'No shortcut');
    });
    row.add_row(shortcutRow);

    // WM Class field + detect button
    const wmClassRow = new Adw.EntryRow({ title: 'WM Class' });
    wmClassRow.set_text(binding.wmClass || '');
    wmClassRow.connect('changed', () => {
      this._updateBinding(index, 'wmClass', wmClassRow.get_text());
      row.set_title(wmClassRow.get_text() || '(empty)');
    });

    const detectButton = new Gtk.Button({
      icon_name: 'find-location-symbolic',
      valign: Gtk.Align.CENTER,
      tooltip_text: 'Detect from running windows',
      css_classes: ['flat'],
    });
    detectButton.connect('clicked', () => {
      this._showWindowPicker(wmClassRow);
    });
    wmClassRow.add_suffix(detectButton);
    row.add_row(wmClassRow);

    // Command field
    const commandRow = new Adw.EntryRow({ title: 'Launch Command' });
    commandRow.set_text(binding.command || '');
    commandRow.connect('changed', () => {
      this._updateBinding(index, 'command', commandRow.get_text());
    });
    row.add_row(commandRow);

    // Position field
    const positionRow = new Adw.EntryRow({ title: 'Position (e.g. 16x1 1:1 8:1)' });
    positionRow.set_text(binding.position || '');
    positionRow.connect('changed', () => {
      this._updateBinding(index, 'position', positionRow.get_text());
    });
    row.add_row(positionRow);

    // Delete button
    const deleteRow = new Adw.ActionRow();
    const deleteButton = new Gtk.Button({
      label: 'Remove Binding',
      css_classes: ['destructive-action'],
      halign: Gtk.Align.CENTER,
      margin_top: 6,
      margin_bottom: 6,
    });
    deleteButton.connect('clicked', () => {
      const bindings = this._getBindings();
      bindings.splice(index, 1);
      this._saveBindings(bindings);
      this._loadBindings();
    });
    deleteRow.set_child(deleteButton);
    row.add_row(deleteRow);

    return row;
  }

  _updateBinding(index, field, value) {
    const bindings = this._getBindings();
    if (index < bindings.length) {
      bindings[index][field] = value;
      this._saveBindings(bindings);
    }
  }

  _addBinding() {
    const bindings = this._getBindings();
    bindings.push({
      shortcut: '',
      wmClass: '',
      command: '',
      position: '',
    });
    this._saveBindings(bindings);
    this._loadBindings();
  }

  _showWindowPicker(targetEntry) {
    try {
      const connection = Gio.DBus.session;
      const result = connection.call_sync(
        'org.gnome.Shell',
        '/org/gnome/Shell/Extensions/GnomeMagicWindow',
        'org.gnome.Shell.Extensions.GnomeMagicWindow',
        'list_windows',
        null,
        new GLib.VariantType('(s)'),
        Gio.DBusCallFlags.NONE,
        -1,
        null
      );

      const json = result.get_child_value(0).get_string()[0];
      const windows = JSON.parse(json);

      // Deduplicate by wmClass
      const unique = [...new Map(windows.map(w => [w.wmClass, w])).values()];

      if (unique.length === 0) {
        this._showMessage('No windows detected');
        return;
      }

      // Show a dialog with window list
      const dialog = new Adw.AlertDialog({
        heading: 'Select Window',
        body: 'Choose a running application:',
      });

      // Add each WM class as a response
      unique.forEach((w, i) => {
        dialog.add_response(`win-${i}`, `${w.wmClass}  —  ${w.windowTitle}`);
      });
      dialog.add_response('cancel', 'Cancel');
      dialog.set_default_response('cancel');
      dialog.set_close_response('cancel');

      dialog.connect('response', (_dialog, response) => {
        if (response.startsWith('win-')) {
          const idx = parseInt(response.split('-')[1]);
          targetEntry.set_text(unique[idx].wmClass);
        }
      });

      dialog.present(this._window);
    } catch (e) {
      console.error(`gnome-magic-window: window detection failed: ${e.message}`);
      this._showMessage('Failed to detect windows. Is the extension running?');
    }
  }

  _showMessage(text) {
    const dialog = new Adw.AlertDialog({
      heading: 'Info',
      body: text,
    });
    dialog.add_response('ok', 'OK');
    dialog.present(this._window);
  }
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint prefs.js`
Expected: No errors.

- [ ] **Step 3: Restart shell and test prefs UI**

Run: `./dev.sh restart-shell`

After login, open preferences:
```bash
gnome-extensions prefs gnome-magic-window@adrienverge
```

Expected: Window opens with all 9 bindings as expandable rows. Each row shows WM class as title and shortcut as subtitle.

- [ ] **Step 4: Test editing a binding**

1. Expand the kitty row
2. Change the position field to `16x1 1:1 8:1`
3. Close prefs
4. Press `Shift+Alt+Ctrl+R` — kitty should move to left half

Run: `dconf read /org/gnome/shell/extensions/gnome-magic-window/bindings | python3 -c "import json,sys; [print(f'{b[\"wmClass\"]}: pos={b[\"position\"]}') for b in json.loads(sys.stdin.read().strip().strip(\"'\"))]"`

Expected: kitty binding shows `pos=16x1 1:1 8:1`

- [ ] **Step 5: Test WM class auto-detect**

1. Open prefs, click "Add Binding"
2. Expand the new empty row
3. Click the detect button (location icon) next to WM Class
4. A dialog should list running windows by WM class
5. Select one — the WM class field populates

- [ ] **Step 6: Test adding and removing bindings**

1. Add a new binding with shortcut `<Shift><Alt><Ctrl>g`, WM class `Nautilus`, command `nautilus`
2. Press `Shift+Alt+Ctrl+G` — Files should launch
3. Remove the binding via the "Remove Binding" button
4. Press `Shift+Alt+Ctrl+G` — nothing should happen

- [ ] **Step 7: Commit**

```bash
git add prefs.js
git commit -m "feat: add preferences UI with binding editor and WM class auto-detect"
```

---

## Task 5: Add .gitignore Entries and Update CLAUDE.md

**Files:**
- Modify: `.gitignore`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update .gitignore**

Add `schemas/gschemas.compiled` to `.gitignore`:

```
node_modules/
dist/
*.zip
schemas/gschemas.compiled
```

- [ ] **Step 2: Update CLAUDE.md**

Add to the "Extension Structure" section:

```markdown
- `positioning.js` — Pure-function grid math and preset parsing (no gi:// imports, testable standalone)
- `prefs.js` — Adw preferences UI with binding editor and WM class auto-detect
- `schemas/` — GSettings schema (compile with `glib-compile-schemas schemas/`)
- `test/test_positioning.js` — Unit tests (run with `gjs -m test/test_positioning.js`)
```

Add to the dev commands table:

```markdown
gjs -m test/test_positioning.js  # Run positioning unit tests
gnome-extensions prefs gnome-magic-window@adrienverge  # Open preferences UI
glib-compile-schemas schemas/    # Recompile after schema changes
```

Add a "Configuration" section:

```markdown
## Configuration

Bindings are stored as a JSON string in GSettings key `bindings` at path
`/org/gnome/shell/extensions/gnome-magic-window/bindings`.

Each binding object has: `shortcut`, `wmClass`, `command`, `position`.

Position format: `COLSxROWS START_COL:START_ROW END_COL:END_ROW` (1-indexed).
Multiple presets separated by commas cycle on repeated activation.
Example: `16x1 1:1 8:1, 1:1 12:1` — first press = left half, second press = left 3/4.

Config changes via prefs UI or dconf take effect immediately (bindings re-register on settings change).
Schema changes require `glib-compile-schemas schemas/` + session restart.
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore CLAUDE.md
git commit -m "docs: update gitignore and CLAUDE.md for new extension structure"
```

---

## Verification Checklist

After all tasks are complete, verify these end-to-end:

- [ ] `gjs -m test/test_positioning.js` — all positioning tests pass
- [ ] `npx eslint extension.js positioning.js prefs.js` — no errors
- [ ] `./dev.sh errors` — no extension errors (`as 0`)
- [ ] Shortcuts focus/launch apps (same behavior as before)
- [ ] Multi-window cycling works (multiple Chrome windows cycle in order)
- [ ] Pressing shortcut on only matching window toggles back to previous
- [ ] Position presets move windows to correct grid positions
- [ ] Position preset cycling works (press again to cycle sizes)
- [ ] Prefs UI opens, displays all bindings, edits save correctly
- [ ] WM class auto-detect dialog shows running windows
- [ ] Adding/removing bindings in prefs takes effect without session restart
- [ ] `dconf write` changes take effect without session restart
