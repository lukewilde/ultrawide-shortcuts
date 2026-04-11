import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { gridToPixels } from './positioning.js';

// Built-in fallback positions — mirrors the schema default.
// Used only when the 'positions' GSettings key is empty or unparseable.
const DEFAULT_POSITIONS = [
  {
    name: 'Columns',
    cols: 16, rows: 1, edgeMargin: 0, cellGap: 0,
    shortcuts: [
      { shortcut: '<Alt><Super>1', positions: [{ anchor: { col: 1, row: 1 }, target: { col: 4, row: 1 } }] },
      { shortcut: '<Alt><Super>2', positions: [{ anchor: { col: 4, row: 1 }, target: { col: 8, row: 1 } }, { anchor: { col: 5, row: 1 }, target: { col: 12, row: 2 } }] },
      { shortcut: '<Alt><Super>3', positions: [{ anchor: { col: 13, row: 1 }, target: { col: 16, row: 1 } }, { anchor: { col: 14, row: 1 }, target: { col: 16, row: 1 } }] },
      { shortcut: '<Alt><Super>4', positions: [{ anchor: { col: 1, row: 1 }, target: { col: 8, row: 1 } }, { anchor: { col: 1, row: 1 }, target: { col: 12, row: 1 } }] },
      { shortcut: '<Alt><Super>5', positions: [{ anchor: { col: 5, row: 1 }, target: { col: 12, row: 1 } }, { anchor: { col: 4, row: 1 }, target: { col: 13, row: 1 } }] },
      { shortcut: '<Alt><Super>6', positions: [{ anchor: { col: 9, row: 1 }, target: { col: 16, row: 1 } }, { anchor: { col: 5, row: 1 }, target: { col: 16, row: 1 } }] },
      { shortcut: '<Alt><Super>7', positions: [{ anchor: { col: 1, row: 1 }, target: { col: 3, row: 1 } }] },
      { shortcut: '<Alt><Super>8', positions: [{ anchor: { col: 9, row: 1 }, target: { col: 13, row: 1 } }, { anchor: { col: 5, row: 1 }, target: { col: 12, row: 1 } }] },
      { shortcut: '<Alt><Super>9', positions: [{ anchor: { col: 14, row: 1 }, target: { col: 16, row: 1 } }] },
    ],
  },
  {
    name: 'Floating Grid',
    cols: 8, rows: 4, edgeMargin: 24, cellGap: 24,
    shortcuts: [
      { shortcut: '<Shift><Alt><Super>1', positions: [{ anchor: { col: 1, row: 3 }, target: { col: 2, row: 4 } }] },
      { shortcut: '<Shift><Alt><Super>2', positions: [{ anchor: { col: 4, row: 3 }, target: { col: 5, row: 4 } }] },
      { shortcut: '<Shift><Alt><Super>3', positions: [{ anchor: { col: 7, row: 3 }, target: { col: 8, row: 4 } }] },
      { shortcut: '<Shift><Alt><Super>4', positions: [{ anchor: { col: 1, row: 2 }, target: { col: 2, row: 3 } }] },
      { shortcut: '<Shift><Alt><Super>5', positions: [{ anchor: { col: 4, row: 2 }, target: { col: 5, row: 3 } }] },
      { shortcut: '<Shift><Alt><Super>6', positions: [{ anchor: { col: 7, row: 2 }, target: { col: 8, row: 3 } }] },
      { shortcut: '<Shift><Alt><Super>7', positions: [{ anchor: { col: 1, row: 1 }, target: { col: 2, row: 2 } }] },
      { shortcut: '<Shift><Alt><Super>8', positions: [{ anchor: { col: 4, row: 1 }, target: { col: 5, row: 2 } }] },
      { shortcut: '<Shift><Alt><Super>9', positions: [{ anchor: { col: 7, row: 1 }, target: { col: 8, row: 2 } }] },
    ],
  },
];

export default class UltrawideShortcutsExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._actions = [];
    this._positionActions = [];
    this._launching = false;
    this._launchingTimerId = null;
    this._lastPreset = null; // { key, windowId, index }
    this._presetTimerId = null;
    this._focusHistory = []; // stableSequence[], most-recently-focused first
    this._cycleSnapshot = null; // { wmClass, order: stableSequence[] } — stable order for active cycle
    this._focusChangedId = global.display.connect(
      'notify::focus-window', this._onFocusChanged.bind(this));

    this._positionsChangedId = null;

    this._setupDbus();
    this._registerBindings();
    this._registerPositions();

    this._settingsChangedId = this._settings.connect('changed::bindings', () => {
      this._unregisterBindings();
      this._registerBindings();
    });

    this._positionsChangedId = this._settings.connect('changed::positions', () => {
      this._unregisterPositions();
      this._registerPositions();
    });
  }

  disable() {
    if (this._settingsChangedId) {
      this._settings.disconnect(this._settingsChangedId);
      this._settingsChangedId = null;
    }
    if (this._positionsChangedId) {
      this._settings.disconnect(this._positionsChangedId);
      this._positionsChangedId = null;
    }

    this._unregisterBindings();
    this._unregisterPositions();

    this._dbus.flush();
    this._dbus.unexport();
    if (this._presetTimerId) {
      GLib.source_remove(this._presetTimerId);
      this._presetTimerId = null;
    }
    if (this._launchingTimerId) {
      GLib.source_remove(this._launchingTimerId);
      this._launchingTimerId = null;
    }

    this._dbus = null;
    this._settings = null;
    this._lastPreset = null;
    if (this._focusChangedId) {
      global.display.disconnect(this._focusChangedId);
      this._focusChangedId = null;
    }
    this._focusHistory = null;
    this._cycleSnapshot = null;
  }

  _setupDbus() {
    this._dbus = Gio.DBusExportedObject.wrapJSObject(`
      <node>
        <interface name="org.gnome.Shell.Extensions.UltrawideShortcuts">
          <method name="magic_key_pressed">
            <arg type="s" direction="in" name="wmClass"/>
            <arg type="s" direction="in" name="command"/>
          </method>
          <method name="list_windows">
            <arg type="s" direction="out" name="json"/>
          </method>
        </interface>
      </node>`, this);
    this._dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/UltrawideShortcuts');
  }

  // --- App focus/launch bindings (from GSettings) ---

  _getBindings() {
    try {
      return JSON.parse(this._settings.get_string('bindings'));
    } catch (e) {
      console.error(`ultrawide-shortcuts: failed to parse bindings: ${e.message}`);
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

  // --- Positions (snap focused window to grid) ---

  _getPositions() {
    try {
      const parsed = JSON.parse(this._settings.get_string('positions'));
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_POSITIONS;
    } catch (e) {
      console.error(`ultrawide-shortcuts: failed to parse positions: ${e.message}`);
      return DEFAULT_POSITIONS;
    }
  }

  _registerPositions() {
    const wards = this._getPositions();
    for (const ward of wards) {
      for (const shortcutConfig of ward.shortcuts) {
        if (!shortcutConfig.shortcut) continue;
        const action = global.display.grab_accelerator(shortcutConfig.shortcut, 0);
        if (action === Meta.KeyBindingAction.NONE) continue;

        const handlerId = global.display.connect(
          'accelerator-activated',
          (_display, activatedAction, _deviceId, _timestamp) => {
            if (activatedAction === action)
              this._applyPositionShortcut(ward, shortcutConfig);
          }
        );

        const name = Meta.external_binding_name_for_action(action);
        Main.wm.allowKeybinding(name, Shell.ActionMode.ALL);
        this._positionActions.push({ action, handlerId });
      }
    }
  }

  _unregisterPositions() {
    for (const { action, handlerId } of this._positionActions) {
      global.display.disconnect(handlerId);
      global.display.ungrab_accelerator(action);
    }
    this._positionActions = [];
  }

  _applyPositionShortcut(ward, shortcutConfig) {
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
    if (!pos?.anchor || !pos?.target) return;
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

  _onFocusChanged() {
    const w = global.display.focus_window;
    if (!w) return;
    // If focus moved to a window outside the active cycle's app, end the snapshot
    // so the next summon starts a fresh MRU sort.
    if (this._cycleSnapshot) {
      const wc = (w.get_wm_class() || '').toLowerCase();
      if (!wc.includes(this._cycleSnapshot.wmClass))
        this._cycleSnapshot = null;
    }
    const seq = w.get_stable_sequence();
    this._focusHistory = [seq, ...this._focusHistory.filter(s => s !== seq)];
    if (this._focusHistory.length > 200)
      this._focusHistory.length = 200;
  }

  _findWindows(wmClass) {
    const lc = wmClass.toLowerCase();
    const windows = this._getWindows()
      .filter(w => w.wmClass.toLowerCase().includes(lc));

    // During an active cycling session, sort by the snapshot taken at session start
    // so mid-cycle history updates can't scramble the order.
    if (this._cycleSnapshot && this._cycleSnapshot.wmClass === lc) {
      const order = this._cycleSnapshot.order;
      return windows.sort((a, b) => {
        const ai = order.indexOf(a.stableSequence);
        const bi = order.indexOf(b.stableSequence);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    }

    // Fresh sort: MRU order. Add any unvisited windows to the history tail so
    // they rank as least-recently-used rather than triggering special-case logic.
    for (const w of windows) {
      if (!this._focusHistory.includes(w.stableSequence))
        this._focusHistory.push(w.stableSequence);
    }
    const sorted = windows.sort((a, b) =>
      this._focusHistory.indexOf(a.stableSequence) -
      this._focusHistory.indexOf(b.stableSequence));

    // Pin this order as the snapshot for the upcoming cycle session.
    this._cycleSnapshot = { wmClass: lc, order: sorted.map(m => m.stableSequence) };
    return sorted;
  }

  magic_key_pressed(wmClass, command) {
    const current = this._getActiveWindow();
    const matches = this._findWindows(wmClass);

    if (matches.length === 0) {
      // No matching window — launch the application
      if (!this._launching && command) {
        this._launching = true;
        this._launchingTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
          this._launching = false;
          this._launchingTimerId = null;
          return GLib.SOURCE_REMOVE;
        });
        try {
          GLib.spawn_command_line_async(command);
        } catch (e) {
          console.error(`ultrawide-shortcuts: failed to launch '${command}': ${e.message}`);
          Main.notify('Ultrawide Shortcuts', `Failed to launch: ${command}\n${e.message}`);
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
