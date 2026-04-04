import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { gridToPixels } from './positioning.js';

// Built-in default ward — re-expresses the original 9 Alt+Super position presets.
// Used when the 'wards' GSettings key is empty.
const DEFAULT_WARD = {
  name: 'Default',
  cols: 16,
  rows: 1,
  edgeMargin: 0,
  cellGap: 0,
  shortcuts: [
    {
      shortcut: '<Alt><Super>1',
      positions: [
        { anchor: { col: 1, row: 1 }, target: { col: 4, row: 1 } },
        { anchor: { col: 1, row: 1 }, target: { col: 3, row: 1 } },
      ],
    },
    {
      shortcut: '<Alt><Super>2',
      positions: [
        { anchor: { col: 4, row: 1 }, target: { col: 8, row: 1 } },
        { anchor: { col: 5, row: 1 }, target: { col: 12, row: 1 } },
      ],
    },
    {
      shortcut: '<Alt><Super>3',
      positions: [
        { anchor: { col: 13, row: 1 }, target: { col: 16, row: 1 } },
        { anchor: { col: 14, row: 1 }, target: { col: 16, row: 1 } },
      ],
    },
    {
      shortcut: '<Alt><Super>4',
      positions: [
        { anchor: { col: 1, row: 1 }, target: { col: 8, row: 1 } },
        { anchor: { col: 1, row: 1 }, target: { col: 12, row: 1 } },
      ],
    },
    {
      shortcut: '<Alt><Super>5',
      positions: [
        { anchor: { col: 5, row: 1 }, target: { col: 12, row: 1 } },
        { anchor: { col: 4, row: 1 }, target: { col: 13, row: 1 } },
      ],
    },
    {
      shortcut: '<Alt><Super>6',
      positions: [
        { anchor: { col: 9, row: 1 }, target: { col: 16, row: 1 } },
        { anchor: { col: 5, row: 1 }, target: { col: 16, row: 1 } },
      ],
    },
    {
      shortcut: '<Alt><Super>7',
      positions: [
        { anchor: { col: 1, row: 1 }, target: { col: 3, row: 1 } },
      ],
    },
    {
      shortcut: '<Alt><Super>8',
      positions: [
        { anchor: { col: 9, row: 1 }, target: { col: 13, row: 1 } },
        { anchor: { col: 5, row: 1 }, target: { col: 12, row: 1 } },
      ],
    },
    {
      shortcut: '<Alt><Super>9',
      positions: [
        { anchor: { col: 14, row: 1 }, target: { col: 16, row: 1 } },
      ],
    },
  ],
};

export default class WindowSummonerExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._actions = [];
    this._positionActions = [];
    this._launching = false;
    this._lastPreset = null; // { key, windowId, index }
    this._presetTimerId = null;

    this._wardsChangedId = null;

    this._setupDbus();
    this._registerBindings();
    this._registerWards();

    this._settingsChangedId = this._settings.connect('changed::bindings', () => {
      this._unregisterBindings();
      this._registerBindings();
    });

    this._wardsChangedId = this._settings.connect('changed::wards', () => {
      this._unregisterWards();
      this._registerWards();
    });
  }

  disable() {
    if (this._settingsChangedId) {
      this._settings.disconnect(this._settingsChangedId);
      this._settingsChangedId = null;
    }

    this._unregisterBindings();
    this._unregisterWards();

    if (this._wardsChangedId) {
      this._settings.disconnect(this._wardsChangedId);
      this._wardsChangedId = null;
    }

    this._dbus.flush();
    this._dbus.unexport();
    if (this._presetTimerId) {
      GLib.source_remove(this._presetTimerId);
      this._presetTimerId = null;
    }

    this._dbus = null;
    this._settings = null;
    this._lastPreset = null;
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

  // --- Wards (snap focused window to grid) ---

  _getWards() {
    try {
      const parsed = JSON.parse(this._settings.get_string('wards'));
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : [DEFAULT_WARD];
    } catch (e) {
      console.error(`window-summoner: failed to parse wards: ${e.message}`);
      return [DEFAULT_WARD];
    }
  }

  _registerWards() {
    const wards = this._getWards();
    for (const ward of wards) {
      for (const shortcutConfig of ward.shortcuts) {
        if (!shortcutConfig.shortcut) continue;
        const action = global.display.grab_accelerator(shortcutConfig.shortcut, 0);
        if (action === Meta.KeyBindingAction.NONE) continue;

        const handlerId = global.display.connect(
          'accelerator-activated',
          (_display, activatedAction, _deviceId, _timestamp) => {
            if (activatedAction === action)
              this._applyWardShortcut(ward, shortcutConfig);
          }
        );

        const name = Meta.external_binding_name_for_action(action);
        Main.wm.allowKeybinding(name, Shell.ActionMode.ALL);
        this._positionActions.push({ action, handlerId });
      }
    }
  }

  _unregisterWards() {
    for (const { action, handlerId } of this._positionActions) {
      global.display.disconnect(handlerId);
      global.display.ungrab_accelerator(action);
    }
    this._positionActions = [];
  }

  _applyWardShortcut(ward, shortcutConfig) {
    const focused = global.display.focus_window;
    if (!focused || !shortcutConfig.positions.length) return;

    // Cycle: same shortcut + same window within 1s advances index
    const focusedId = focused.get_stable_sequence();
    let nextIndex = 0;
    if (this._lastPreset &&
        this._lastPreset.key === shortcutConfig.shortcut &&
        this._lastPreset.windowId === focusedId) {
      nextIndex = (this._lastPreset.index + 1) % shortcutConfig.positions.length;
    }
    this._lastPreset = { key: shortcutConfig.shortcut, windowId: focusedId, index: nextIndex };

    if (this._presetTimerId) GLib.source_remove(this._presetTimerId);
    this._presetTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      this._lastPreset = null;
      this._presetTimerId = null;
      return GLib.SOURCE_REMOVE;
    });

    // Convert 1-indexed storage coords to 0-indexed for gridToPixels
    const pos = shortcutConfig.positions[nextIndex];
    const selection = {
      anchor: { col: pos.anchor.col - 1, row: pos.anchor.row - 1 },
      target: { col: pos.target.col - 1, row: pos.target.row - 1 },
    };

    const monitorIdx = focused.get_monitor();
    const workspace = global.workspace_manager.get_active_workspace();
    const wa = workspace.get_work_area_for_monitor(monitorIdx);

    // Apply edgeMargin by shrinking the work area
    const workArea = {
      x: wa.x + ward.edgeMargin,
      y: wa.y + ward.edgeMargin,
      width: wa.width - 2 * ward.edgeMargin,
      height: wa.height - 2 * ward.edgeMargin,
    };

    const rect = gridToPixels(selection, { cols: ward.cols, rows: ward.rows }, workArea, ward.cellGap);

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
