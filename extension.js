import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { gridToPixels, parsePositionPresets } from './positioning.js';

// Position presets for Alt+Super+1-9 (matches gTile config).
// Each entry: [shortcut, presetString]
// Preset strings use gTile format: "COLSxROWS COL:ROW COL:ROW, ..."
// Comma-separated presets cycle on repeated presses.
const POSITION_PRESETS = [
  ['<Alt><Super>1', '16x1 1:1 4:1, 1:1 3:1'],
  ['<Alt><Super>2', '16x1 4:1 8:1, 5:1 12:1'],
  ['<Alt><Super>3', '16x1 13:1 16:1, 14:1 16:1'],
  ['<Alt><Super>4', '16x1 1:1 8:1, 1:1 12:1'],
  ['<Alt><Super>5', '16x1 5:1 12:1, 4:1 13:1'],
  ['<Alt><Super>6', '16x1 9:1 16:1, 5:1 16:1'],
  ['<Alt><Super>7', '16x1 1:1 3:1'],
  ['<Alt><Super>8', '16x1 9:1 13:1, 5:1 12:1'],
  ['<Alt><Super>9', '16x1 14:1 16:1'],
];

export default class WindowSummonerExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._actions = [];
    this._positionActions = [];
    this._launching = false;
    this._presetCycleIndex = new Map(); // presetKey -> current cycle index

    this._setupDbus();
    this._registerBindings();
    this._registerPositionPresets();

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
    this._unregisterPositionPresets();

    this._dbus.flush();
    this._dbus.unexport();
    this._dbus = null;
    this._settings = null;
    this._presetCycleIndex = null;
  }

  _setupDbus() {
    this._dbus = Gio.DBusExportedObject.wrapJSObject(`
      <node>
        <interface name="org.gnome.Shell.Extensions.WindowSummoner">
          <method name="magic_key_pressed">
            <arg type="s" direction="in" name="wmClass"/>
            <arg type="s" direction="in" name="command"/>
          </method>
          <method name="list_windows">
            <arg type="s" direction="out" name="json"/>
          </method>
        </interface>
      </node>`, this);
    this._dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/WindowSummoner');
  }

  // --- App focus/launch bindings (from GSettings) ---

  _getBindings() {
    try {
      return JSON.parse(this._settings.get_string('bindings'));
    } catch (e) {
      console.error(`window-summoner: failed to parse bindings: ${e.message}`);
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
              binding.command
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

  // --- Position presets (snap focused window to grid) ---

  _registerPositionPresets() {
    for (const [shortcut, presetStr] of POSITION_PRESETS) {
      const action = global.display.grab_accelerator(shortcut, 0);
      if (action === Meta.KeyBindingAction.NONE) continue;

      const handlerId = global.display.connect(
        'accelerator-activated',
        (_display, activatedAction, _deviceId, _timestamp) => {
          if (activatedAction === action) {
            this._applyPositionPreset(shortcut, presetStr);
          }
        }
      );

      const name = Meta.external_binding_name_for_action(action);
      Main.wm.allowKeybinding(name, Shell.ActionMode.ALL);

      this._positionActions.push({ action, handlerId });
    }
  }

  _unregisterPositionPresets() {
    for (const { action, handlerId } of this._positionActions) {
      global.display.disconnect(handlerId);
      global.display.ungrab_accelerator(action);
    }
    this._positionActions = [];
  }

  _applyPositionPreset(presetKey, presetStr) {
    const focused = global.display.focus_window;
    if (!focused) return;

    const presets = parsePositionPresets(presetStr);
    if (presets.length === 0) return;

    // Reset cycle when window or shortcut changes
    const focusedId = focused.get_stable_sequence();
    const lastState = this._presetCycleIndex.get(presetKey);
    let lastIndex = -1;
    if (lastState && lastState.windowId === focusedId) {
      lastIndex = lastState.index;
    }
    const nextIndex = (lastIndex + 1) % presets.length;
    this._presetCycleIndex.set(presetKey, { index: nextIndex, windowId: focusedId });

    const { gridSize, selection } = presets[nextIndex];
    const monitorIdx = focused.get_monitor();
    const workspace = global.workspace_manager.get_active_workspace();
    const workArea = workspace.get_work_area_for_monitor(monitorIdx);

    const rect = gridToPixels(selection, gridSize, {
      x: workArea.x,
      y: workArea.y,
      width: workArea.width,
      height: workArea.height,
    });

    focused.unmaximize();
    focused.move_resize_frame(
      false,
      Math.round(rect.x),
      Math.round(rect.y),
      Math.round(rect.width),
      Math.round(rect.height)
    );
  }

  // --- Window helpers ---

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

  magic_key_pressed(wmClass, command) {
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
          console.error(`window-summoner: failed to launch '${command}': ${e.message}`);
          Main.notify('Window Summoner', `Failed to launch: ${command}\n${e.message}`);
        }
      }
    } else if (!current || !matches.some(w => w.metaWindow === current.metaWindow)) {
      // Matching window exists but isn't focused — activate first match
      Main.activateWindow(matches[0].metaWindow);
    } else if (matches.length > 1) {
      // Current window IS a match and there are multiple — cycle to next
      const currentIdx = matches.findIndex(w => w.metaWindow === current.metaWindow);
      const nextIdx = (currentIdx + 1) % matches.length;
      Main.activateWindow(matches[nextIdx].metaWindow);
    }
    // Single match already focused — do nothing
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
