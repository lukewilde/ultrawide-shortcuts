import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
export default class GnomeMagicWindowExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._actions = [];
    this._launching = false;

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
  }

  _setupDbus() {
    this._dbus = Gio.DBusExportedObject.wrapJSObject(`
      <node>
        <interface name="org.gnome.Shell.Extensions.GnomeMagicWindow">
          <method name="magic_key_pressed">
            <arg type="s" direction="in" name="wmClass"/>
            <arg type="s" direction="in" name="command"/>
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
          console.error(`gnome-magic-window: failed to launch '${command}': ${e.message}`);
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
