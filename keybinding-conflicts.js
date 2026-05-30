// keybinding-conflicts.js — Take over GNOME built-in window shortcuts that
// collide with our directional-nav accelerators, and restore them later.
import Gio from 'gi://Gio';

// GNOME built-in window keybindings that may collide with <prefix>+arrows.
const KNOWN = [
  {
    schema: 'org.gnome.desktop.wm.keybindings',
    keys: ['maximize', 'unmaximize', 'toggle-maximized',
      'maximize-horizontally', 'maximize-vertically'],
  },
  {
    schema: 'org.gnome.mutter.keybindings',
    keys: ['toggle-tiled-left', 'toggle-tiled-right'],
  },
];

/**
 * Normalize an accelerator string to a comparable form: sorted lowercase
 * modifier set + lowercase key name. `<Alt><Super>Left` and `<Super><Alt>Left`
 * compare equal. Pure — no Gtk dependency (unavailable in the shell process).
 * @param {string} accel
 * @returns {string}
 */
export function normalizeAccel(accel) {
  if (!accel) return '|';
  const mods = [];
  const re = /<([^>]+)>/g;
  let m;
  while ((m = re.exec(accel)) !== null) mods.push(m[1].toLowerCase());
  const key = accel.replace(/<[^>]+>/g, '').toLowerCase();
  mods.sort();
  return `${mods.join('+')}|${key}`;
}

export class KeybindingConflictManager {
  /** @param {Gio.Settings} extensionSettings - our settings (holds the backup key) */
  constructor(extensionSettings) {
    this._extSettings = extensionSettings;
    this._records = []; // [{ schema, key, original: string[] }]
  }

  // Restore a backup left by an unclean shutdown, then clear it. Idempotent.
  healStaleBackup() {
    let stale = [];
    try {
      stale = JSON.parse(this._extSettings.get_string('nav-keybinding-backup'));
    } catch {
      stale = [];
    }
    if (!Array.isArray(stale) || stale.length === 0) return;
    for (const { schema, key, original } of stale) {
      try {
        new Gio.Settings({ schema_id: schema }).set_strv(key, original);
      } catch (e) {
        console.error(`ultrawide-shortcuts: heal restore failed ${schema}/${key}: ${e.message}`);
      }
    }
    this._extSettings.set_string('nav-keybinding-backup', '[]');
  }

  // Remove any of `accels` from known GNOME keybindings, recording originals.
  takeOver(accels) {
    this._records = [];
    const wanted = new Set(accels.map(normalizeAccel));
    for (const { schema, keys } of KNOWN) {
      let settings;
      try {
        settings = new Gio.Settings({ schema_id: schema });
      } catch {
        continue; // schema not installed on this system
      }
      for (const key of keys) {
        const current = settings.get_strv(key);
        const filtered = current.filter(a => !wanted.has(normalizeAccel(a)));
        if (filtered.length !== current.length) {
          this._records.push({ schema, key, original: current });
          settings.set_strv(key, filtered);
        }
      }
    }
    this._extSettings.set_string('nav-keybinding-backup', JSON.stringify(this._records));
  }

  // Restore everything taken over and clear the backup.
  restore() {
    for (const { schema, key, original } of this._records) {
      try {
        new Gio.Settings({ schema_id: schema }).set_strv(key, original);
      } catch (e) {
        console.error(`ultrawide-shortcuts: restore failed ${schema}/${key}: ${e.message}`);
      }
    }
    this._records = [];
    this._extSettings.set_string('nav-keybinding-backup', '[]');
  }
}
